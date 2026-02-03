import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { QueueService } from './queue.service';
import { RABBITMQ_CHANNEL } from './queue.constants';

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
  maxRetries: number = 10,
  retryDelayMs: number = 3000,
) {
  const logger = new Logger('RabbitMQConnection');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.log(
        `[RabbitMQ] - Tentativa ${attempt}/${maxRetries} de conexão...`,
      );
      const connection = await amqp.connect(url);
      logger.log('[RabbitMQ] - Conexão estabelecida com sucesso!');
      return connection;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;

      if (isLastAttempt) {
        logger.error(
          `[RabbitMQ] - Falha após ${maxRetries} tentativas. Desistindo.`,
        );
        throw error;
      }

      logger.warn(
        `[RabbitMQ] - Falha na tentativa ${attempt}: ${(error as Error).message}`,
      );
      logger.log(
        `[RabbitMQ] - Aguardando ${retryDelayMs / 1000}s antes da próxima tentativa...`,
      );

      await sleep(retryDelayMs);
    }
  }

  throw new Error('Falha ao conectar ao RabbitMQ após todas as tentativas.');
}

@Module({
  providers: [
    QueueService,
    {
      provide: RABBITMQ_CHANNEL,
      useFactory: async (configService: ConfigService) => {
        const rabbitUrl = configService.get<string>('RABBITMQ_URL');
        const user = configService.get<string>('RABBITMQ_DEFAULT_USER');
        const pass = configService.get<string>('RABBITMQ_DEFAULT_PASS');
        const host = configService.get<string>('RABBITMQ_HOST');
        const queueName =
          configService.get<string>('RABBITMQ_QUEUE') || 'default_queue';

        const url = rabbitUrl || `amqp://${user}:${pass}@${host}`;

        const connection = await connectWithRetry(url);
        const channel = await connection.createChannel();

        await channel.assertQueue(queueName, {
          durable: true,
          arguments: {
            'x-max-priority': 10,
          },
        });

        console.log(
          `[RabbitMQ] - Fila '${queueName}' declarada com prioridade máxima de 10`,
        );

        // Fechar conexão gracefulmente
        process.on('SIGINT', async () => {
          await channel.close();
          await connection.close();
          process.exit(0);
        });

        return channel;
      },
      inject: [ConfigService],
    },
  ],
  exports: [QueueService, RABBITMQ_CHANNEL],
})
export class QueueModule {}