import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @Inject('RABBITMQ_CLIENT') private readonly client: ClientProxy,
  ) {}

  async onModuleInit() {
    try {
      await this.client.connect();
      this.logger.log(
        '✅ [QUEUE] - Conexão com o RabbitMQ estabelecida com sucesso!',
      );
    } catch (error) {
      this.logger.error('❌ [QUEUE] - Falha ao conectar com o RabbitMQ', error);
    }
  }

  /**
   * Publica uma mensagem em uma fila específica.
   * @param queue O nome da fila de destino.
   * @param pattern O padrão do evento (usado para roteamento no NestJS).
   * @param payload O dado a ser enviado.
   */
  public publish(queue: string, pattern: string, payload: any) {
    // O método 'emit' envia uma mensagem do tipo "evento" (fire-and-forget).
    // O primeiro argumento é um objeto que pode especificar a fila,
    // e o segundo é o payload com o padrão e os dados.
    this.client.emit({ q: queue }, { pattern, data: payload });
  }

  async onModuleDestroy() {
    await this.client.close();
  }
}
