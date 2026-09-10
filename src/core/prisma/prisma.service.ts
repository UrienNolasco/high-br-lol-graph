import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { getErrorMessage } from '../logger';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private readonly logger: PinoLogger) {
    super();
    this.logger.setContext(PrismaService.name);
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.info(
        '[DATABASE] - Conexão com o banco de dados estabelecida com sucesso!',
      );
    } catch (error) {
      this.logger.error(
        { err: getErrorMessage(error) },
        '[DATABASE] - Falha ao conectar com o banco de dados',
      );
      process.exit(1);
    }
  }
}
