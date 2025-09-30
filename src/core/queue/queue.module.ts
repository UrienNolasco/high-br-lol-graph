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
        return ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls: [
              `amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@${configService.get('RABBITMQ_HOST')}`,
            ],
            queue: 'default_queue',
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
