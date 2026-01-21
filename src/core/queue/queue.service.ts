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

  public publish(pattern: string, payload: any) {
    this.client.emit(pattern, payload);
  }

  async onModuleDestroy() {
    await this.client.close();
  }
}
