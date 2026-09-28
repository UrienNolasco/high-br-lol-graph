import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import type { ChannelWrapper } from 'amqp-connection-manager';
import { RABBITMQ_CHANNEL } from './queue.constants';
import { traceIdStore } from '../logger';
import { PROCESSING_JOBS } from './processing-jobs';
import type { ProcessingJobs } from './processing-jobs';
import { REPUBLISH_MS } from '../../lib/processing-policy';
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
    @Inject(PROCESSING_JOBS) private readonly processing: ProcessingJobs,
  ) {
    this.logger.setContext(QueueService.name);
  }
  async publish(
    pattern: string,
    matchId: string,
    options?: MatchPublishOptions,
    traceId?: string,
  ): Promise<void> {
    const job = await this.processing.enqueue(
      matchId,
      options?.priority ?? 1,
      traceId ?? traceIdStore.getStore()?.traceId,
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
      await this.processing.markPublished(job.matchId, publishedAt);
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
      const now = new Date();
      await this.processing.recoverExpired(now);
      const jobs = await this.processing.duePublications(now, 50);
      for (const job of jobs) await this.deliver(job);
      this.logger.info({
        event: 'processing_recovery',
        attemptedPublications: jobs.length,
        oldestPendingAgeMs: await this.processing.oldestPendingAgeMs(now),
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
