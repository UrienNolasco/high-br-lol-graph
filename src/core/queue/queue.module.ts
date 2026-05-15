import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import * as amqp from 'amqplib';
import { QueueService } from './queue.service';
import { RABBITMQ_CHANNEL } from './queue.constants';
import { getErrorMessage } from '../logger/get-error-message';

/**
 * Função auxiliar para dormir por um tempo determinado
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tenta conectar ao RabbitMQ com retry automático.
 *
 * RabbitMQ demora 7-10 segundos para iniciar completamente no Docker,
 * então precisamos de retry para evitar ECONNREFUSED durante o bootstrap.
 */
async function connectWithRetry(
  url: string,
  logger: PinoLogger,
  maxRetries: number = 10,
  retryDelayMs: number = 3000,
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        { operation: 'queue_connect', attempt, maxRetries },
        `Connection attempt ${attempt}/${maxRetries}`,
      );
      const connection = await amqp.connect(url);
      logger.info(
        { operation: 'queue_connect', event: 'rabbitmq_connected', url },
        'Connection established',
      );
      return connection;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;

      if (isLastAttempt) {
        logger.error(
          {
            operation: 'queue_connect',
            event: 'rabbitmq_connection_failed',
            attempt,
            maxRetries,
            error: getErrorMessage(error),
          },
          `Failed after ${maxRetries} attempts`,
        );
        throw error;
      }

      logger.warn(
        {
          operation: 'queue_connect',
          attempt,
          maxRetries,
          error: getErrorMessage(error),
        },
        `Connection attempt ${attempt} failed, retrying in ${retryDelayMs / 1000}s`,
      );

      await sleep(retryDelayMs);
    }
  }

  throw new Error('Failed to connect to RabbitMQ after all attempts.');
}

@Module({
  providers: [
    QueueService,
    {
      provide: RABBITMQ_CHANNEL,
      useFactory: async (configService: ConfigService, logger: PinoLogger) => {
        logger.setContext('RabbitMQConnection');

        const rabbitUrl = configService.get<string>('RABBITMQ_URL');
        const user = configService.get<string>('RABBITMQ_DEFAULT_USER');
        const pass = configService.get<string>('RABBITMQ_DEFAULT_PASS');
        const host = configService.get<string>('RABBITMQ_HOST');
        const queueName =
          configService.get<string>('RABBITMQ_QUEUE') || 'default_queue';

        const url = rabbitUrl || `amqp://${user}:${pass}@${host}`;

        const connection = await connectWithRetry(url, logger);
        const channel = await connection.createChannel();

        await channel.assertQueue(queueName, {
          durable: true,
          arguments: {
            'x-max-priority': 10,
          },
        });

        logger.info(
          {
            operation: 'queue_setup',
            event: 'rabbitmq_queue_declared',
            queue: queueName,
          },
          `Queue '${queueName}' declared with max priority 10`,
        );

        // Fechar conexão gracefulmente
        process.on('SIGINT', () => {
          void (async () => {
            await channel.close();
            await connection.close();
            process.exit(0);
          })();
        });

        return channel;
      },
      inject: [ConfigService, PinoLogger],
    },
  ],
  exports: [QueueService, RABBITMQ_CHANNEL],
})
export class QueueModule {}
