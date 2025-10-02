import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CollectorService } from './modules/collector/collector.service';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'debug', 'verbose', 'log'],
  });
  const logger = new Logger('Bootstrap');

  try {
    const dataSource = app.get(DataSource);
    if (dataSource.isInitialized) {
      logger.log(
        '✅ [DATABASE] - Conexão com o banco de dados estabelecida com sucesso!',
      );
    }
  } catch (error) {
    logger.error(
      '❌ [DATABASE] - Falha ao conectar com o banco de dados',
      error,
    );
    await app.close();
    process.exit(1);
  }

  const appMode = process.env.APP_MODE;

  if (appMode === 'API') {
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    logger.log(`🚀 [API] - Aplicação iniciada e ouvindo na porta ${port}`);
  } else if (appMode === 'WORKER') {
    const rabbitUrl = process.env.RABBITMQ_URL;
    const rabbitQueue = process.env.RABBITMQ_QUEUE;

    if (!rabbitUrl || !rabbitQueue) {
      logger.error(
        '❌ [WORKER] - As variáveis de ambiente RABBITMQ_URL e RABBITMQ_QUEUE são obrigatórias.',
      );
      process.exit(1);
    }

    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [rabbitUrl],
        queue: rabbitQueue,
        queueOptions: {
          durable: true,
        },
      },
    });

    await app.startAllMicroservices();
    logger.log(
      `🚀 [WORKER] - Worker iniciado e ouvindo a fila: ${rabbitQueue}`,
    );
  } else if (appMode === 'COLLECTOR') {
    logger.log('🚀 [COLLECTOR] - Collector iniciado');

    try {
      const collectorService = app.get(CollectorService);
      await collectorService.runCollection();
      logger.log('✅ [COLLECTOR] - Coleta executada com sucesso!');
      await app.close();
      process.exit(0);
    } catch (error) {
      logger.error(
        '❌ [COLLECTOR] - Erro durante a execução da coleta:',
        error,
      );
      await app.close();
      process.exit(1);
    }
  } else {
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    logger.log(
      `[APP] - Nenhuma variável de ambiente APP_MODE definida, iniciando API por padrão na porta ${port}`,
    );
  }
}

bootstrap();
