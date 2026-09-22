import type { ConfirmChannel } from 'amqplib';
import { Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import {
  connect,
  AmqpConnectionManager,
  ChannelWrapper,
} from 'amqp-connection-manager';
import { QueueService } from './queue.service';
import { RABBITMQ_CHANNEL } from './queue.constants';
import { ProcessingModule } from '../processing/processing.module';
import { PrismaModule } from '../prisma/prisma.module';
@Injectable()
class QueueConnection implements OnModuleDestroy {
  readonly channel: ChannelWrapper;
  private readonly connection: AmqpConnectionManager;
  constructor(config: ConfigService, logger: PinoLogger) {
    const url =
      config.get<string>('RABBITMQ_URL') ||
      `amqp://${config.get('RABBITMQ_DEFAULT_USER')}:${config.get('RABBITMQ_DEFAULT_PASS')}@${config.get('RABBITMQ_HOST')}`;
    const queue = config.get<string>('RABBITMQ_QUEUE') || 'default_queue';
    this.connection = connect([url], { reconnectTimeInSeconds: 5 });
    this.connection.on('disconnect', () =>
      logger.warn({ event: 'rabbitmq_disconnected' }),
    );
    this.channel = this.connection.createChannel({
      confirm: true,
      publishTimeout: 5000,
      setup: async (channel: ConfirmChannel) => {
        await channel.assertQueue(queue, {
          durable: true,
          arguments: { 'x-max-priority': 10 },
        });
      },
    });
    this.channel.on('error', (error) =>
      logger.error({ event: 'rabbitmq_channel_error', error: String(error) }),
    );
  }
  async onModuleDestroy() {
    await this.connection.close();
  }
}
@Module({
  imports: [ProcessingModule, PrismaModule],
  providers: [
    QueueConnection,
    QueueService,
    {
      provide: RABBITMQ_CHANNEL,
      useFactory: (connection: QueueConnection) => connection.channel,
      inject: [QueueConnection],
    },
  ],
  exports: [QueueService, RABBITMQ_CHANNEL],
})
export class QueueModule {}
