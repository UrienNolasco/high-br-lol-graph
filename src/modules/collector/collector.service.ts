import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Redis } from 'ioredis';
import { RiotService } from '../../core/riot/riot.service';
import { QueueService } from '../../core/queue/queue.service';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class CollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollectorService.name);
  private readonly redis: Redis;
  private isRunning = false;

  constructor(
    private readonly riotService: RiotService,
    private readonly queueService: QueueService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const redisHost = this.configService.get<string>('REDIS_HOST', 'redis');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    });

    this.redis.on('connect', () => {
      this.logger.log(
        `CollectorService conectado ao Redis em ${redisHost}:${redisPort}`,
      );
    });

    this.redis.on('error', (error) => {
      this.logger.error(
        'Erro na conexão do CollectorService com Redis:',
        error,
      );
    });
  }

  async onModuleInit(): Promise<void> {
    const enabled = await this.redis.get('collector:enabled');
    if (enabled === null) {
      const defaultEnabled =
        this.configService.get<string>('COLLECTOR_ENABLED', 'false');
      await this.redis.set('collector:enabled', defaultEnabled);
    }

    const startHour = await this.redis.get('collector:start_hour');
    if (startHour === null) {
      const defaultStart =
        this.configService.get<string>('COLLECTOR_START_HOUR', '1');
      await this.redis.set('collector:start_hour', defaultStart);
    }

    const endHour = await this.redis.get('collector:end_hour');
    if (endHour === null) {
      const defaultEnd =
        this.configService.get<string>('COLLECTOR_END_HOUR', '8');
      await this.redis.set('collector:end_hour', defaultEnd);
    }

    this.logger.log('CollectorService inicializado com valores do Redis');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Conexão do CollectorService com Redis fechada');
    }
  }

  @Cron('0 */30 * * *')
  async scheduledCollection(): Promise<void> {
    const enabled = await this.isEnabled();
    if (!enabled || this.isRunning) return;

    const { startHour, endHour } = await this.getWindow();
    const hour = new Date().getHours();
    if (hour < startHour || hour >= endHour) return;

    this.logger.log('⏰ [COLLECTOR] - Cron job disparado, iniciando coleta...');
    this.isRunning = true;
    try {
      await this.runCollection();
      await this.redis.set('collector:last_run', new Date().toISOString());
    } finally {
      this.isRunning = false;
    }
  }

  async triggerNow(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        '⚠️ [COLLECTOR] - Coleta já em andamento, ignorando trigger manual',
      );
      return;
    }

    this.logger.log('🔧 [COLLECTOR] - Trigger manual recebido');
    this.isRunning = true;
    try {
      await this.runCollection();
      await this.redis.set('collector:last_run', new Date().toISOString());
    } finally {
      this.isRunning = false;
    }
  }

  async isEnabled(): Promise<boolean> {
    const value = await this.redis.get('collector:enabled');
    return value === 'true';
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.redis.set('collector:enabled', String(enabled));
  }

  async getWindow(): Promise<{ startHour: number; endHour: number }> {
    const startHour = await this.redis.get('collector:start_hour');
    const endHour = await this.redis.get('collector:end_hour');
    return {
      startHour: parseInt(startHour ?? '1', 10),
      endHour: parseInt(endHour ?? '8', 10),
    };
  }

  async getStatus(): Promise<{
    enabled: boolean;
    isRunning: boolean;
    lastRun: string | null;
    startHour: number;
    endHour: number;
  }> {
    const enabled = await this.isEnabled();
    const { startHour, endHour } = await this.getWindow();
    const lastRun = await this.redis.get('collector:last_run');
    return {
      enabled,
      isRunning: this.isRunning,
      lastRun,
      startHour,
      endHour,
    };
  }

  async runCollection(): Promise<void> {
    this.logger.log('🚀 [COLLECTOR] - Iniciando processo de coleta...');

    try {
      const highEloPuids = await this.riotService.getHighEloPuids();
      this.logger.log(
        `📊 [COLLECTOR] - Encontrados ${highEloPuids.length} jogadores high-elo`,
      );

      let totalMatchesFound = 0;
      let newMatchesEnqueued = 0;

      for (const puuid of highEloPuids) {
        try {
          const matchIds = await this.riotService.getMatchIdsByPuuid(puuid, 20);
          totalMatchesFound += matchIds.length;

          for (const matchId of matchIds) {
            const isNewMatch = await this.checkIfMatchIsNew(matchId);

            if (isNewMatch) {
              this.enqueueMatch(matchId);
              newMatchesEnqueued++;
            }
          }
        } catch (error) {
          this.logger.warn(
            `⚠️ [COLLECTOR] - Erro ao processar PUUID ${puuid}:`,
            (error as Error).message,
          );
          continue;
        }
      }

      this.logger.log(`✅ [COLLECTOR] - Coleta finalizada!`);
      this.logger.log(
        `📈 [COLLECTOR] - Total de partidas encontradas: ${totalMatchesFound}`,
      );
      this.logger.log(
        `🆕 [COLLECTOR] - Novas partidas enfileiradas: ${newMatchesEnqueued}`,
      );
    } catch (error) {
      this.logger.error('❌ [COLLECTOR] - Erro durante a coleta:', error);
      throw error;
    }
  }

  private async checkIfMatchIsNew(matchId: string): Promise<boolean> {
    try {
      const match = await this.prisma.match.findUnique({
        where: { matchId },
        select: { matchId: true },
      });

      return !match;
    } catch (error) {
      this.logger.warn(
        `⚠️ [COLLECTOR] - Erro ao verificar duplicata para ${matchId}:`,
        (error as Error).message,
      );
      return true;
    }
  }

  private enqueueMatch(matchId: string): void {
    this.queueService.publishBackgroundMatch(matchId);

    this.logger.debug(
      `📤 [COLLECTOR] - Partida ${matchId} enfileirada para processamento (prioridade baixa)`,
    );
  }
}
