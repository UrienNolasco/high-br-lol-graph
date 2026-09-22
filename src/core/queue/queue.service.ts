import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import type { ChannelWrapper } from 'amqp-connection-manager';
import { RABBITMQ_CHANNEL } from './queue.constants';
import { traceIdStore } from '../logger';
import { ProcessingService } from '../processing/processing.service';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_ATTEMPTS, REPUBLISH_MS } from '../processing/processing.constants';
export interface MatchPublishOptions {
  priority?: number;
}
@Injectable()
export class QueueService {
  private readonly queueName = process.env.RABBITMQ_QUEUE || 'default_queue';
  private recovering = false;
  constructor(
    @Inject(RABBITMQ_CHANNEL) private readonly channel: ChannelWrapper,
    private readonly logger: PinoLogger,
    private readonly processing: ProcessingService,
    private readonly prisma: PrismaService,
  ) {
    this.logger.setContext(QueueService.name);
  }
  async publish(
    pattern: string,
    matchId: string,
    options?: MatchPublishOptions,
  ): Promise<void> {
    const job = await this.processing.enqueue(
      matchId,
      options?.priority ?? 1,
      traceIdStore.getStore()?.traceId,
    );
    if (
      job.status === 'PENDING' &&
      (!job.publishedAt ||
        job.publishedAt.getTime() <= Date.now() - REPUBLISH_MS)
    ) {
      await this.deliver(job, pattern);
    }
  }
  publishUserRequestedMatch(matchId: string) {
    return this.publish('match.collect', matchId, { priority: 10 });
  }
  publishBackgroundMatch(matchId: string) {
    return this.publish('match.collect', matchId, { priority: 1 });
  }
  publishDeepSyncMatch(matchId: string) {
    return this.publish('match.collect', matchId, { priority: 5 });
  }
  private async deliver(
    job: { matchId: string; priority: number; traceId: string | null },
    pattern = 'match.collect',
  ) {
    const publishedAt = new Date();
    try {
      await this.channel.sendToQueue(
        this.queueName,
        Buffer.from(
          JSON.stringify({
            pattern,
            data: {
              matchId: job.matchId,
              ...(job.traceId ? { traceId: job.traceId } : {}),
            },
          }),
        ),
        { persistent: true, priority: job.priority },
      );
      await this.prisma.matchProcessing.updateMany({
        where: {
          matchId: job.matchId,
          status: { in: ['PENDING', 'RETRY_WAIT'] },
        },
        data: { publishedAt },
      });
      this.logger.debug({ matchId: job.matchId, event: 'queue_published' });
    } catch (error) {
      // Accepted work already lives in PostgreSQL. Recovery will retry publication.
      this.logger.warn({
        matchId: job.matchId,
        event: 'queue_publish_deferred',
        error: String(error),
      });
    }
  }
  @Interval(10_000)
  async recover(): Promise<void> {
    if (process.env.APP_MODE !== 'WORKER' || this.recovering) return;
    this.recovering = true;
    try {
      if (
        (
          await this.prisma.processingMaintenance.findUnique({
            where: { id: 1 },
          })
        )?.rebuilding
      )
        return;
      const now = new Date();
      await this.prisma.matchProcessing.updateMany({
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
      const jobs = await this.prisma.matchProcessing.findMany({
        where: {
          OR: [
            {
              status: { in: ['PENDING', 'RETRY_WAIT'] },
              nextAttemptAt: { lte: now },
              OR: [
                { publishedAt: null },
                { publishedAt: { lte: new Date(Date.now() - REPUBLISH_MS) } },
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
        take: 50,
      });
      for (const job of jobs) await this.deliver(job);
      const oldest = await this.prisma.matchProcessing.findFirst({
        where: { status: { in: ['PENDING', 'RETRY_WAIT', 'PROCESSING'] } },
        orderBy: { createdAt: 'asc' },
      });
      this.logger.info({
        event: 'processing_recovery',
        attemptedPublications: jobs.length,
        oldestPendingAgeMs: oldest
          ? Date.now() - oldest.createdAt.getTime()
          : 0,
      });
    } catch (error) {
      this.logger.error({
        event: 'processing_recovery_failed',
        error: String(error),
      });
    } finally {
      this.recovering = false;
    }
  }
}
