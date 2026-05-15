import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { BigIntInterceptor } from './core/interceptors/bigint.interceptor';
import { Logger, PinoLogger } from 'nestjs-pino';
import pino from 'pino';
import { TraceIdMiddleware, SERVICE_NAMES } from './core/logger';
import { getErrorMessage } from './core/logger/get-error-message';

const bootLogger = pino({
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

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

  app.useGlobalInterceptors(new BigIntInterceptor());

  const traceIdMiddleware = new TraceIdMiddleware();
  app.use(traceIdMiddleware.use.bind(traceIdMiddleware));

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const appMode = process.env.APP_MODE || 'DEFAULT';
  const serviceName = SERVICE_NAMES[appMode] || appMode.toLowerCase();
  const pinoLogger = app.get(PinoLogger);

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
    pinoLogger.info(
      { event: 'app_started', service: serviceName, port },
      `API iniciada na porta ${port}`,
    );
    pinoLogger.info(
      { event: 'docs_available', service: serviceName, port },
      `Documentação disponível em http://localhost:${port}/reference`,
    );
  } else if (appMode === 'WORKER') {
    const rabbitUrl = process.env.RABBITMQ_URL;
    const rabbitQueue = process.env.RABBITMQ_QUEUE;

    if (!rabbitUrl || !rabbitQueue) {
      pinoLogger.fatal(
        { event: 'bootstrap_failed', service: serviceName },
        'RABBITMQ_URL e RABBITMQ_QUEUE são obrigatórios para o modo WORKER',
      );
      process.exitCode = 1;
      setTimeout(() => process.exit(1), 100);
    }

    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [rabbitUrl!],
        queue: rabbitQueue!,
        queueOptions: {
          durable: true,
          arguments: {
            'x-max-priority': 10,
          },
        },
        prefetchCount: 1,
        noAck: false,
      },
    });

    await app.startAllMicroservices();
    pinoLogger.info(
      { event: 'app_started', service: serviceName, queue: rabbitQueue },
      `Worker iniciado ouvindo fila: ${rabbitQueue}`,
    );
  } else if (appMode === 'COLLECTOR') {
    const port = process.env.COLLECTOR_PORT ?? 3001;
    await app.listen(port, '0.0.0.0');
    pinoLogger.info(
      { event: 'app_started', service: serviceName, port },
      `Collector persistente iniciado na porta ${port}`,
    );
    pinoLogger.info(
      { event: 'cron_active', service: serviceName },
      'Cron job ativo, verificando a cada 30 minutos',
    );
  } else {
    const port = process.env.PORT ?? 3000;
    await app.listen(port, '0.0.0.0');
    pinoLogger.info(
      { event: 'app_started', service: serviceName, port },
      `APP_MODE não definido, iniciando API por padrão na porta ${port}`,
    );
  }
}

bootstrap().catch((err: unknown) => {
  bootLogger.fatal(
    { event: 'bootstrap_fatal', error: getErrorMessage(err) },
    'Erro fatal durante o bootstrap',
  );
  process.exit(1);
});
