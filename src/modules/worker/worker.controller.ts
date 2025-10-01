import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { WorkerService } from './worker.service';

@Controller('worker')
export class WorkerController {
  private readonly logger = new Logger(WorkerController.name);

  constructor(private readonly workerService: WorkerService) {}

  @EventPattern('match.to.process')
  async handleMatchToProcess(@Payload() data: { matchId: string }) {
    try {
      this.logger.log(
        `Recebida mensagem para processar partida: ${data.matchId}`,
      );
      await this.workerService.processMatch(data.matchId);
      this.logger.log(`Partida ${data.matchId} processada com sucesso`);
    } catch (error) {
      this.logger.error(`Erro ao processar partida ${data.matchId}:`, error);
      // Aqui você pode implementar lógica de retry ou dead letter queue se necessário
      throw error;
    }
  }

  @EventPattern('health.check')
  async handleHealthCheck() {
    this.logger.log('Health check recebido - Worker está funcionando');
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
