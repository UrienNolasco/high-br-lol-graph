import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { WorkerService } from './worker.service';
import { ProcessMatchDto } from './dto/process-match.dto';
import { SemaphoreService } from '../../core/semaphore/semaphore.service';

@Controller()
export class WorkerController {
  private readonly logger = new Logger(WorkerController.name);
  private readonly SEMAPHORE_KEY = 'worker_processing';
  private readonly MAX_CONCURRENT_JOBS = 1; // Processar apenas 1 mensagem por vez

  constructor(
    private readonly workerService: WorkerService,
    private readonly semaphoreService: SemaphoreService,
  ) {}

  @MessagePattern('match.collect')
  async handleMatchCollect(@Payload() payload: ProcessMatchDto) {
    const { matchId, patch } = payload;

    // Usar semáforo para garantir que apenas MAX_CONCURRENT_JOBS sejam processados simultaneamente
    return this.semaphoreService.execute(
      this.SEMAPHORE_KEY,
      this.MAX_CONCURRENT_JOBS,
      async () => {
        const status = this.semaphoreService.getStatus(this.SEMAPHORE_KEY);
        this.logger.log(
          `[${status.running}/${this.MAX_CONCURRENT_JOBS}] Processando partida: ${matchId} (Patch: ${patch}). ` +
            `${status.queued > 0 ? `${status.queued} na fila.` : ''}`,
        );

        try {
          await this.workerService.processMatch({ matchId, patch });
          this.logger.log(
            `✅ Partida ${matchId} (Patch: ${patch}) processada com sucesso.`,
          );
        } catch (error) {
          this.logger.error(
            `❌ Erro ao processar partida ${matchId} (Patch: ${patch}):`,
            error,
          );
          // A confirmação da mensagem (ack/nack) deve ser tratada pela estratégia do transporter do NestJS
          // Lançar o erro garante que o NestJS (e RabbitMQ, se configurado) saiba que o processamento falhou.
          throw error;
        }
      },
    );
  }
}
