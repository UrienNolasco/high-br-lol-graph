import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { Channel } from 'amqplib';
import { RABBITMQ_CHANNEL } from './queue.constants';
import { traceIdStore, getErrorMessage } from '../../core/logger';

export interface MatchPublishOptions {
  priority?: number;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queueName: string;

  constructor(
    @Inject(RABBITMQ_CHANNEL) private readonly channel: Channel,
    private readonly logger: PinoLogger,
  ) {
    this.queueName = process.env.RABBITMQ_QUEUE || 'default_queue';
    this.logger.setContext(QueueService.name);
  }

  publish(
    pattern: string,
    matchId: string,
    options?: MatchPublishOptions,
  ): void {
    const priority = options?.priority ?? 1;
    const traceId = traceIdStore.getStore()?.traceId;

    const message = {
      pattern,
      data: {
        matchId,
        ...(traceId ? { traceId } : {}),
      },
    };

    const buffer = Buffer.from(JSON.stringify(message));

    this.channel.sendToQueue(this.queueName, buffer, {
      persistent: true,
      priority,
    });

    const logPayload = { matchId, priority, pattern, event: 'queue_published' };
    const logMsg = `Publicado ${pattern} com prioridade ${priority}: ${matchId}`;

    if (priority >= 10) {
      this.logger.info(logPayload, logMsg);
    } else {
      this.logger.debug(logPayload, logMsg);
    }
  }

  publishUserRequestedMatch(matchId: string): void {
    this.publish('match.collect', matchId, { priority: 10 });
  }

  publishBackgroundMatch(matchId: string): void {
    this.publish('match.collect', matchId, { priority: 1 });
  }

  publishDeepSyncMatch(matchId: string): void {
    this.publish('match.collect', matchId, { priority: 5 });
  }

  async onModuleDestroy() {
    try {
      await this.channel.close();
    } catch (error) {
      this.logger.error({ event: 'queue_close_error', error: getErrorMessage(error) }, 'Erro ao fechar canal do RabbitMQ');
    }
  }
}