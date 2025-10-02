import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log(
        '✅ [DATABASE] - Conexão com o banco de dados estabelecida com sucesso!',
      );
    } catch (error) {
      this.logger.error(
        '❌ [DATABASE] - Falha ao conectar com o banco de dados',
        error,
      );
      process.exit(1);
    }
  }
}
