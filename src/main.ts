import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { CollectorService } from './modules/collector/collector.service';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { BigIntInterceptor } from './core/interceptors/bigint.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'debug', 'verbose', 'log'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Interceptor global para converter BigInt em String
  // Necessário porque JSON.stringify não suporta BigInt
  app.useGlobalInterceptors(new BigIntInterceptor());

  const logger = new Logger('Bootstrap');

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const appMode = process.env.APP_MODE;

  if (appMode === 'API') {
    const config = new DocumentBuilder()
      .setTitle('High-BR LoL Graph API')
      .setDescription(
        'API para análise de estatísticas de partidas de League of Legends.',
      )
      .setVersion('1.0')
      .addTag('lol')
      .build();

    const document = SwaggerModule.createDocument(app, config);

    app.use(
      '/reference',
      apiReference({
        content: document,
        theme: 'purple',
      }),
    );

    const port = process.env.PORT ?? 3000;
    await app.listen(port, '0.0.0.0');
    logger.log(`🚀 [API] - Aplicação iniciada e ouvindo na porta ${port}`);
    logger.log(
      `📚 [API] - Documentação Scala  r disponível em http://localhost:${port}/reference`,
    );
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
        prefetchCount: 1,
        noAck: false,
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
    await app.listen(port, '0.0.0.0');
    logger.log(
      `[APP] - Nenhuma variável de ambiente APP_MODE definida, iniciando API por padrão na porta ${port}`,
    );
  }
}

bootstrap().catch((err) => {
  console.error('Erro fatal durante o bootstrap:', err);
  process.exit(1);
});
