import { Controller, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type { Channel, Message } from 'amqplib';
import { PinoLogger } from 'nestjs-pino';
import { WorkerService } from './services/worker.service';
import { DeliveryGate } from './delivery-gate';
import { workerConcurrency } from '../../core/config/worker-concurrency';
import { ProcessMatchDto } from './dto/process-match.dto';
import { traceIdStore } from '../../core/logger';
import { getErrorMessage } from '../../core/logger/get-error-message';

@Controller()
export class WorkerController implements OnModuleDestroy {
  private readonly deliveries = new DeliveryGate(workerConcurrency());
  private readonly consumers = new Map<Channel, Set<string>>();

  async onModuleDestroy() {
    const drained = this.deliveries.close();
    // Cancel consumption before draining. Keep the channel open for ACKs of
    // accepted work; Nest closes RMQ and dependency providers afterwards.
    await Promise.allSettled(
      [...this.consumers].flatMap(([channel, tags]) =>
        [...tags].map(async (tag) => channel.cancel(tag)),
      ),
    );
    await drained;
  }

  constructor(
    private readonly workerService: WorkerService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WorkerController.name);
  }

  @EventPattern('match.collect')
  handleMatchCollect(
    @Payload() payload: ProcessMatchDto,
    @Ctx() context: RmqContext,
  ) {
    return this.handle(payload, context, 'match.collect');
  }

  @EventPattern('user.update')
  handleUserUpdate(
    @Payload() payload: ProcessMatchDto,
    @Ctx() context: RmqContext,
  ) {
    return this.handle(payload, context, 'user.update');
  }

  private async handle(
    payload: ProcessMatchDto,
    context: RmqContext,
    pattern: string,
  ) {
    const { matchId } = payload;
    const channel = context.getChannelRef() as Channel;
    const message = context.getMessage() as Message;
    const tag = message.fields.consumerTag;
    if (tag) {
      if (!this.consumers.has(channel))
        channel.once('close', () => this.consumers.delete(channel));
      const tags = this.consumers.get(channel) ?? new Set<string>();
      tags.add(tag);
      this.consumers.set(channel, tags);
    }
    const traceId = payload.traceId || randomUUID();
    await traceIdStore.run({ traceId }, async () => {
      try {
        await this.deliveries.run(async () => {
          this.logger.info(
            { matchId, pattern, event: 'match_received' },
            `Recebida mensagem para processar partida: ${matchId}`,
          );
          await this.workerService.processMatch({ matchId, traceId });
          channel.ack(message);
          this.logger.info(
            { matchId, pattern, event: 'match_delivery_handled' },
            `Entrega da partida ${matchId} tratada e confirmada.`,
          );
        });
      } catch (error) {
        this.logger.error(
          {
            matchId,
            pattern,
            event: 'match_failed',
            error: getErrorMessage(error),
          },
          `Erro ao processar ${matchId}`,
        );
        channel.nack(message, false, true);
        throw error;
      }
    });
  }
}
