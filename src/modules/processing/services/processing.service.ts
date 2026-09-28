import { Inject, Injectable } from '@nestjs/common';
import { Prisma, ProcessingStatus, MatchProcessing } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  LEASE_MS,
  LeaseLostError,
  MAX_ATTEMPTS,
  REPUBLISH_MS,
  PROCESSING_GATE,
  CONTROL_TRANSACTION_OPTIONS,
} from '../contracts/processing.constants';
import { failureDelay, isPermanentFailure } from './failure-policy';
import { bindPrismaTransaction } from '../../../core/prisma/transaction-context';
import type { TransactionContext } from '../../../lib/transaction-context';
import type { ProcessingJobs } from '../../../core/queue/processing-jobs';
import { MATCH_PREPARER } from '../../../modules/matches/ports/match-preparer';
import type { MatchPreparer } from '../../../modules/matches/ports/match-preparer';
import { DATASET_WRITER } from '../../../modules/dataset/ports/dataset-writer';
import type { DatasetWriter } from '../../../modules/dataset/ports/dataset-writer';
import { MATCH_PROJECTION_WRITER } from '../../../modules/matches/ports/match-projection-writer';
import type { MatchProjectionWriter } from '../../../modules/matches/ports/match-projection-writer';
import { STATS_WRITER } from '../../../modules/stats/ports/stats-writer';
import type { StatsWriter } from '../../../modules/stats/ports/stats-writer';
import { OBSERVATION_READER } from '../ports/observation-reader';
import type { ObservationReader } from '../ports/observation-reader';
import type {
  ProcessMatchRequest,
  ProcessMatchUseCase,
} from '../contracts/process-match';
import { RAW_MATCH_SOURCE } from '../ports/raw-match-source';
import type { RawMatchSource } from '../ports/raw-match-source';
import {
  InvalidMatchError,
  MissingTimelineError,
  PROCESSING_VERSION,
} from '../contracts/processing.constants';

export type ProcessingLease = {
  matchId: string;
  leaseToken: string;
  attempts: number;
};

@Injectable()
export class ProcessingService implements ProcessMatchUseCase, ProcessingJobs {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RAW_MATCH_SOURCE)
    private readonly source: RawMatchSource,
    @Inject(MATCH_PREPARER)
    private readonly preparer: MatchPreparer,
    @Inject(MATCH_PROJECTION_WRITER)
    private readonly matchWriter: MatchProjectionWriter,
    @Inject(DATASET_WRITER)
    private readonly datasetWriter: DatasetWriter,
    @Inject(STATS_WRITER)
    private readonly statsWriter: StatsWriter,
    @Inject(OBSERVATION_READER)
    private readonly observationReader: ObservationReader,
    private readonly logger: PinoLogger,
  ) {}

  async processMatch(
    request: ProcessMatchRequest,
    offline = false,
  ): Promise<void> {
    const { matchId } = request;
    if (!offline) await this.enqueue(matchId, 1, request.traceId);
    const lease = await this.claim(matchId, offline);
    if (!lease) return;
    const start = Date.now();
    let renewal = Promise.resolve();
    const heartbeat = setInterval(() => {
      renewal = renewal
        .then(() => this.renew(lease))
        .catch((error) =>
          this.logger.warn({
            matchId,
            event: 'lease_renewal_failed',
            error: String(error),
          }),
        );
    }, 20_000);
    heartbeat.unref();
    try {
      let summary = await this.readRaw<unknown>(matchId, 'summary');
      if (!summary) {
        if (offline) throw new InvalidMatchError('Raw summary is missing');
        summary = await this.source.getMatchById(matchId);
        await this.saveRaw(lease, 'summary', summary);
      }
      let timeline = await this.readRaw<unknown>(matchId, 'timeline');
      if (!timeline) {
        if (offline) throw new MissingTimelineError('Raw timeline is missing');
        timeline = await this.source.getTimeline(matchId);
        if (!timeline)
          throw new MissingTimelineError(
            'Timeline unavailable; summary retained',
          );
        await this.saveRaw(lease, 'timeline', timeline);
      }
      const prepared = this.preparer.prepare(
        matchId,
        summary,
        timeline,
        PROCESSING_VERSION,
      );
      await this.publish(lease, prepared.matchData, prepared.timeline, offline);
      this.logger.info({
        matchId,
        event: 'match_processing_completed',
        duration: Date.now() - start,
        attempts: lease.attempts,
      });
    } catch (error) {
      await this.recordFailure(lease, error);
      this.logger.error({
        matchId,
        event: 'match_processing_failed',
        duration: Date.now() - start,
        error: String(error),
        attempts: lease.attempts,
      });
      if (offline) throw error;
    } finally {
      clearInterval(heartbeat);
      await renewal;
    }
  }

  private async publish(
    lease: ProcessingLease,
    matchData: import('../../../modules/matches/contracts/normalized-match').ProcessedMatchData,
    timeline: import('../../../modules/matches/contracts/normalized-timeline').ParsedTimelineData,
    offline: boolean,
  ) {
    const datasetInput = {
      ...matchData,
      projection: timeline.snapshotProjection,
      events: timeline.normalizedEvents,
      processingVersion: PROCESSING_VERSION,
      processedAt: new Date(),
    };
    const preparedDataset = this.datasetWriter.prepare(datasetInput);
    await this.prisma.$transaction(
      async (tx) => {
        if (!(await this.gate(tx, offline)))
          throw new Error('Rebuild in progress');
        await this.lockLease(tx, lease);
        const completedAt = new Date();
        await this.matchWriter.write(bindPrismaTransaction(tx), {
          matchData,
          timeline,
          completedAt,
        });
        const observedLineage = await this.observationReader.readLineage(
          lease.matchId,
          bindPrismaTransaction(tx),
        );
        // The legacy dataset identity is deterministic by observation ID;
        // preserve that order even though the collector reader orders by time.
        const lineage = {
          ...observedLineage,
          observationIds: [...observedLineage.observationIds].sort(),
          sources: [...observedLineage.sources].sort(),
        };
        await this.datasetWriter.write(
          bindPrismaTransaction(tx),
          { ...datasetInput, processedAt: completedAt, lineage },
          preparedDataset,
        );
        await this.statsWriter.update(bindPrismaTransaction(tx), {
          matchData,
          timeline,
        });
        await tx.matchProcessing.update({
          where: { matchId: lease.matchId },
          data: {
            status: 'COMPLETED',
            completedAt,
            processingVersion: PROCESSING_VERSION,
            lastError: null,
            leaseToken: null,
            leaseUntil: null,
          },
        });
      },
      { timeout: 30_000 },
    );
  }

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
    }, CONTROL_TRANSACTION_OPTIONS);
  }

  /** Runs collector observation writes under the same maintenance gate. */
  async withIngestionTransaction<T>(
    callback: (transaction: TransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.gate(tx)))
        throw new Error('Rebuild in progress; ingestion is paused');
      return callback(bindPrismaTransaction(tx));
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
    }, CONTROL_TRANSACTION_OPTIONS);
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

  async recoverExpired(now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.gate(tx))) return;
      await tx.matchProcessing.updateMany({
        where: {
          status: 'PROCESSING',
          leaseUntil: { lte: now },
          attempts: { gte: MAX_ATTEMPTS },
        },
        data: {
          status: 'FAILED',
          lastError: 'Worker lease expired after maximum attempts',
          leaseToken: null,
          leaseUntil: null,
        },
      });
    }, CONTROL_TRANSACTION_OPTIONS);
  }

  async duePublications(
    now: Date,
    limit: number,
  ): Promise<import('../../../core/queue/processing-jobs').ProcessingJob[]> {
    return this.prisma.matchProcessing.findMany({
      where: {
        OR: [
          {
            status: { in: ['PENDING', 'RETRY_WAIT'] },
            nextAttemptAt: { lte: now },
            OR: [
              { publishedAt: null },
              { publishedAt: { lte: new Date(now.getTime() - REPUBLISH_MS) } },
            ],
          },
          {
            status: 'PROCESSING',
            leaseUntil: { lte: now },
            attempts: { lt: MAX_ATTEMPTS },
          },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      select: { matchId: true, priority: true, traceId: true },
    });
  }

  async markPublished(matchId: string, publishedAt: Date): Promise<void> {
    await this.prisma.matchProcessing.updateMany({
      where: { matchId, status: { in: ['PENDING', 'RETRY_WAIT'] } },
      data: { publishedAt },
    });
  }

  async oldestPendingAgeMs(now: Date): Promise<number> {
    const oldest = await this.prisma.matchProcessing.findFirst({
      where: { status: { in: ['PENDING', 'RETRY_WAIT', 'PROCESSING'] } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    return oldest ? now.getTime() - oldest.createdAt.getTime() : 0;
  }
}
