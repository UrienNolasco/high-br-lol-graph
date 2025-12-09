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
    const { matchId, patch } = payload;
    const channel = context.getChannelRef() as Channel;
    const originalMsg = context.getMessage() as Message;

    this.logger.log(
      `Recebida mensagem para processar partida: ${matchId} (Patch: ${patch})`,
    );

    try {
      await this.workerService.processMatch({ matchId, patch });

      // ACK manual da mensagem
      channel.ack(originalMsg);

      this.logger.log(
        `Partida ${matchId} (Patch: ${patch}) processada com sucesso.`,
      );
    } catch (error) {
      this.logger.error(
        `Erro ao processar partida ${matchId} (Patch: ${patch}):`,
        error,
      );

      // NACK manual - rejeita a mensagem e NÃO recoloca na fila (false)
      // Se quiser recolocar na fila para retry, use: channel.nack(originalMsg, false, true);
      channel.nack(originalMsg, false, false);

      throw error;
    }
  }
}
