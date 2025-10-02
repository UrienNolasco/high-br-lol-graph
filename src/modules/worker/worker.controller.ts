import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { WorkerService } from './worker.service';
import { ProcessMatchDto } from './dto/process-match.dto';

@Controller()
export class WorkerController {
  private readonly logger = new Logger(WorkerController.name);

  constructor(private readonly workerService: WorkerService) {}

  @MessagePattern('match.collect')
  async handleMatchCollect(
    @Payload() payload: { data: { data: ProcessMatchDto } },
  ) {
    const { matchId, patch } = payload.data.data;
    this.logger.log(
      `Recebida mensagem para processar partida: ${matchId} (Patch: ${patch})`,
    );

    try {
      await this.workerService.processMatch({ matchId, patch });
      this.logger.log(
        `Partida ${matchId} (Patch: ${patch}) processada com sucesso.`,
      );
    } catch (error) {
      this.logger.error(
        `Erro ao processar partida ${matchId} (Patch: ${patch}):`,
        error,
      );
      // A confirmação da mensagem (ack/nack) deve ser tratada pela estratégia do transporter do NestJS
      // Lançar o erro garante que o NestJS (e RabbitMQ, se configurado) saiba que o processamento falhou.
      throw error;
    }
  }
}
