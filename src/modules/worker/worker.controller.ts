import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type { Channel, Message } from 'amqplib';
import { PinoLogger } from 'nestjs-pino';
import { WorkerService } from './services/worker.service';
import { ProcessMatchDto } from './dto/process-match.dto';
import { traceIdStore } from '../../core/logger';
import { getErrorMessage } from '../../core/logger/get-error-message';

@Controller()
export class WorkerController {
  constructor(
    private readonly workerService: WorkerService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WorkerController.name);
  }

  @EventPattern('match.collect')
  async handleMatchCollect(
    @Payload() payload: ProcessMatchDto,
    @Ctx() context: RmqContext,
  ) {
    const { matchId } = payload;
    const channel = context.getChannelRef() as Channel;
    const originalMsg = context.getMessage() as Message;

    const traceId = payload.traceId || crypto.randomUUID();

    await traceIdStore.run({ traceId }, async () => {
      this.logger.info(
        { matchId, event: 'match_received' },
        `Recebida mensagem para processar partida: ${matchId}`,
      );

      try {
        await this.workerService.processMatch({ matchId });

        channel.ack(originalMsg);

        this.logger.info(
          { matchId, event: 'match_processed' },
          `Partida ${matchId} processada com sucesso.`,
        );
      } catch (error) {
        this.logger.error(
          { matchId, event: 'match_failed', error: getErrorMessage(error) },
          `Erro ao processar partida ${matchId}`,
        );

        channel.nack(originalMsg, false, false);

        throw error;
      }
    });
  }

  @EventPattern('user.update')
  async handleUserUpdate(
    @Payload() payload: ProcessMatchDto,
    @Ctx() context: RmqContext,
  ) {
    const { matchId } = payload;
    const channel = context.getChannelRef() as Channel;
    const originalMsg = context.getMessage() as Message;

    const traceId = payload.traceId || crypto.randomUUID();

    await traceIdStore.run({ traceId }, async () => {
      this.logger.info(
        { matchId, event: 'match_received', pattern: 'user.update' },
        `[USER UPDATE] Processando partida: ${matchId}`,
      );

      try {
        await this.workerService.processMatch({ matchId });
        channel.ack(originalMsg);
        this.logger.info(
          { matchId, event: 'match_processed', pattern: 'user.update' },
          `[USER UPDATE] Partida ${matchId} processada.`,
        );
      } catch (error) {
        this.logger.error(
          {
            matchId,
            event: 'match_failed',
            pattern: 'user.update',
            error: getErrorMessage(error),
          },
          `[USER UPDATE] Erro ao processar ${matchId}`,
        );
        channel.nack(originalMsg, false, false);
        throw error;
      }
    });
  }
}
