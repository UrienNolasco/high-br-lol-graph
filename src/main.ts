import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'debug', 'verbose'],
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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`🚀 [APP] - Aplicação iniciada e ouvindo na porta ${port}`);
}
bootstrap();
