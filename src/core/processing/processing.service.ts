import { Injectable } from '@nestjs/common';
import { Prisma, ProcessingStatus, MatchProcessing } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { PrismaService } from '../prisma/prisma.service';
import {
  LEASE_MS,
  LeaseLostError,
  MAX_ATTEMPTS,
  PROCESSING_GATE,
} from './processing.constants';
import { failureDelay, isPermanentFailure } from './failure-policy';

export type ProcessingLease = {
  matchId: string;
  leaseToken: string;
  attempts: number;
};

@Injectable()
export class ProcessingService {
  constructor(private readonly prisma: PrismaService) {}

  async gate(tx: Prisma.TransactionClient, offline = false): Promise<boolean> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(${PROCESSING_GATE})::text`;
    const maintenance = await tx.processingMaintenance.findUnique({
      where: { id: 1 },
    });
    return offline || !maintenance?.rebuilding;
  }

  async enqueue(matchId: string, priority = 1, traceId?: string) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.gate(tx)))
        throw new Error('Rebuild in progress; ingestion is paused');
      const [job] = await tx.$queryRaw<MatchProcessing[]>`
        INSERT INTO match_processing ("matchId", priority, "traceId", "updatedAt")
        VALUES (${matchId}, ${priority}, ${traceId ?? null}, CURRENT_TIMESTAMP)
        ON CONFLICT ("matchId") DO UPDATE SET priority = GREATEST(match_processing.priority, EXCLUDED.priority),
          "traceId" = COALESCE(match_processing."traceId", EXCLUDED."traceId") RETURNING *`;
      return job;
    });
  }

  async claim(
    matchId: string,
    offline = false,
  ): Promise<ProcessingLease | null> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.gate(tx, offline))) return null;
      const now = new Date();
      const token = randomUUID();
      const claimed = await tx.matchProcessing.updateMany({
        where: {
          matchId,
          attempts: { lt: MAX_ATTEMPTS },
          OR: [
            {
              status: { in: ['PENDING', 'RETRY_WAIT'] },
              nextAttemptAt: { lte: now },
            },
            { status: 'PROCESSING', leaseUntil: { lte: now } },
          ],
        },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
          leaseToken: token,
          leaseUntil: new Date(now.getTime() + LEASE_MS),
        },
      });
      if (!claimed.count) return null;
      const job = await tx.matchProcessing.findUniqueOrThrow({
        where: { matchId },
      });
      return { matchId, leaseToken: token, attempts: job.attempts };
    });
  }

  async lockLease(tx: Prisma.TransactionClient, lease: ProcessingLease) {
    const rows = await tx.$queryRaw<Array<{ matchId: string }>>`
      SELECT "matchId" FROM match_processing WHERE "matchId" = ${lease.matchId}
      AND status = 'PROCESSING' AND "leaseToken" = ${lease.leaseToken}
      AND "leaseUntil" > clock_timestamp() FOR UPDATE`;
    if (!rows.length)
      throw new LeaseLostError('Processing lease expired or replaced');
  }

  async renew(lease: ProcessingLease) {
    const result = await this.prisma.matchProcessing.updateMany({
      where: {
        matchId: lease.matchId,
        leaseToken: lease.leaseToken,
        status: 'PROCESSING',
        leaseUntil: { gt: new Date() },
      },
      data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
    });
    if (!result.count) throw new LeaseLostError('Processing lease lost');
  }

  async readRaw<T>(
    matchId: string,
    field: 'summary' | 'timeline',
  ): Promise<T | null> {
    const raw = await this.prisma.matchRaw.findUnique({
      where: { matchId },
      select: { [field]: true },
    });
    const bytes = raw?.[field] as Uint8Array | null | undefined;
    return bytes ? (JSON.parse(gunzipSync(bytes).toString('utf8')) as T) : null;
  }

  async saveRaw(
    lease: ProcessingLease,
    field: 'summary' | 'timeline',
    value: unknown,
  ) {
    const bytes = gzipSync(Buffer.from(JSON.stringify(value)));
    await this.prisma.$transaction(async (tx) => {
      await this.lockLease(tx, lease);
      await tx.matchRaw.upsert({
        where: { matchId: lease.matchId },
        create: { matchId: lease.matchId, [field]: bytes },
        update: { [field]: bytes },
      });
    });
  }

  async recordFailure(lease: ProcessingLease, error: unknown) {
    const terminal =
      isPermanentFailure(error) || lease.attempts >= MAX_ATTEMPTS;
    const status: ProcessingStatus = terminal ? 'FAILED' : 'RETRY_WAIT';
    await this.prisma.matchProcessing.updateMany({
      where: {
        matchId: lease.matchId,
        status: 'PROCESSING',
        leaseToken: lease.leaseToken,
      },
      data: {
        status,
        lastError: (error instanceof Error
          ? error.message
          : String(error)
        ).slice(0, 2000),
        nextAttemptAt: new Date(
          Date.now() + failureDelay(lease.attempts, error),
        ),
        leaseToken: null,
        leaseUntil: null,
        publishedAt: null,
      },
    });
  }

  async retryFailed(matchId?: string) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.gate(tx))) throw new Error('Resume the rebuild first');
      return tx.matchProcessing.updateMany({
        where: { status: 'FAILED', ...(matchId ? { matchId } : {}) },
        data: {
          status: 'PENDING',
          attempts: 0,
          nextAttemptAt: new Date(),
          publishedAt: null,
          leaseToken: null,
          leaseUntil: null,
        },
      });
    });
  }
}
