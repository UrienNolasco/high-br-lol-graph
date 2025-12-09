import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { QueueService } from './queue.service';

@Module({
  providers: [
    QueueService,
    {
      provide: 'RABBITMQ_CLIENT',
      useFactory: (configService: ConfigService) => {
        const rabbitUrl = configService.get<string>('RABBITMQ_URL');
        const user = configService.get<string>('RABBITMQ_DEFAULT_USER');
        const pass = configService.get<string>('RABBITMQ_DEFAULT_PASS');
        const host = configService.get<string>('RABBITMQ_HOST');

        const urls = rabbitUrl
          ? [rabbitUrl]
          : [`amqp://${user}:${pass}@${host}`];

        return ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls,
            queue:
              configService.get<string>('RABBITMQ_QUEUE') || 'default_queue',
            queueOptions: {
              durable: true,
            },
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [QueueService],
})
export class QueueModule {}
