import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type { Channel, Message } from 'amqplib';
import { WorkerService } from './worker.service';
import { ProcessMatchDto } from './dto/process-match.dto';

@Controller()
export class WorkerController {
  private readonly logger = new Logger(WorkerController.name);

  constructor(private readonly workerService: WorkerService) {}

  @EventPattern('match.collect')
  async handleMatchCollect(
    @Payload() payload: ProcessMatchDto,
    @Ctx() context: RmqContext,
  ) {
    const { matchId } = payload;
    const channel = context.getChannelRef() as Channel;
    const originalMsg = context.getMessage() as Message;

    this.logger.log(`Recebida mensagem para processar partida: ${matchId}`);

    try {
      await this.workerService.processMatch({ matchId });

      channel.ack(originalMsg);

      this.logger.log(`Partida ${matchId} processada com sucesso.`);
    } catch (error) {
      this.logger.error(`Erro ao processar partida ${matchId}:`, error);

      channel.nack(originalMsg, false, false);

      throw error;
    }
  }

  @EventPattern('user.update')
  async handleUserUpdate(
    @Payload() payload: ProcessMatchDto,
    @Ctx() context: RmqContext,
  ) {
    const { matchId } = payload;
    const channel = context.getChannelRef() as Channel;
    const originalMsg = context.getMessage() as Message;

    this.logger.log(`[USER UPDATE] Processando partida: ${matchId}`);

    try {
      await this.workerService.processMatch({ matchId });
      channel.ack(originalMsg);
      this.logger.log(`[USER UPDATE] Partida ${matchId} processada.`);
    } catch (error) {
      this.logger.error(`[USER UPDATE] Erro ao processar ${matchId}:`, error);
      channel.nack(originalMsg, false, false);
      throw error;
    }
  }
}
