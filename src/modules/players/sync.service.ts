import { Injectable, Logger, OnModuleDestroy, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RiotService } from '../../core/riot/riot.service';
import { QueueService } from '../../core/queue/queue.service';
import {
  SyncStatus,
  SyncTriggerResponseDto,
  SyncStatusResponseDto,
} from './dto/sync-response.dto';

const SYNC_TTL_SECONDS = 1800; // 30 minutos

@Injectable()
export class SyncService implements OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);
  private readonly redis: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly riotService: RiotService,
    private readonly queueService: QueueService,
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
      this.logger.log(`SyncService conectado ao Redis em ${redisHost}:${redisPort}`);
    });

    this.redis.on('error', (error) => {
      this.logger.error('Erro na conexão do SyncService com Redis:', error);
    });
  }

  async triggerDeepSync(puuid: string): Promise<SyncTriggerResponseDto> {
    // 1. Verifica se player existe no DB
    const player = await this.prisma.user.findUnique({ where: { puuid } });
    if (!player) {
      throw new NotFoundException(
        `Player ${puuid} não encontrado. Use /players/search primeiro.`,
      );
    }

    const statusKey = `sync:${puuid}:status`;
    const matchIdsKey = `sync:${puuid}:matchIds`;

    // 2. Checa idempotência — se já está SYNCING, retorna status existente
    const existingState = await this.redis.hget(statusKey, 'state');
    if (existingState === SyncStatus.SYNCING) {
      const existing = await this.redis.hgetall(statusKey);
      return {
        puuid,
        status: SyncStatus.SYNCING,
        matchesEnqueued: 0,
        matchesTotal: Number(existing.matchesTotal || 0),
        matchesAlreadyInDb: 0,
        message: 'Sync já em andamento',
      };
    }

    // 3. Busca 100 matches ranqueados via Riot API
    const riotMatchIds = await this.riotService.getMatchIdsByPuuid(puuid, 100, {
      start: 0,
      queue: 420,
    });

    // Se 0 matches retornados, retorna sem criar estado no Redis
    if (riotMatchIds.length === 0) {
      return {
        puuid,
        status: SyncStatus.DONE,
        matchesEnqueued: 0,
        matchesTotal: 0,
        matchesAlreadyInDb: 0,
        message: 'Nenhuma partida ranqueada encontrada na Riot API',
      };
    }

    // 4. Diff contra DB — quais matches já existem
    const existingMatches = await this.prisma.match.findMany({
      where: { matchId: { in: riotMatchIds } },
      select: { matchId: true },
    });
    const existingSet = new Set(existingMatches.map((m) => m.matchId));
    const newMatchIds = riotMatchIds.filter((id) => !existingSet.has(id));

    const matchesTotal = riotMatchIds.length;
    const matchesAlreadyInDb = existingSet.size;
    const matchesEnqueued = newMatchIds.length;

    // 5. Salva estado no Redis
    const pipeline = this.redis.pipeline();
    pipeline.hset(statusKey, {
      state: SyncStatus.SYNCING,
      startedAt: new Date().toISOString(),
      matchesTotal: String(matchesTotal),
    });
    pipeline.expire(statusKey, SYNC_TTL_SECONDS);

    if (riotMatchIds.length > 0) {
      pipeline.sadd(matchIdsKey, ...riotMatchIds);
      pipeline.expire(matchIdsKey, SYNC_TTL_SECONDS);
    }
    await pipeline.exec();

    // 6. Enfileira novos matches
    for (const matchId of newMatchIds) {
      this.queueService.publishDeepSyncMatch(matchId);
    }

    this.logger.log(
      `Deep sync para ${puuid}: ${matchesEnqueued} enfileiradas, ${matchesAlreadyInDb} já no DB, ${matchesTotal} total`,
    );

    // Se todos já estão no DB, marca como DONE
    if (matchesEnqueued === 0) {
      await this.redis.hset(statusKey, 'state', SyncStatus.DONE);
    }

    return {
      puuid,
      status: matchesEnqueued === 0 ? SyncStatus.DONE : SyncStatus.SYNCING,
      matchesEnqueued,
      matchesTotal,
      matchesAlreadyInDb,
      message:
        matchesEnqueued === 0
          ? 'Todas as partidas já estão no banco de dados'
          : `Deep sync iniciado: ${matchesEnqueued} partidas enfileiradas`,
    };
  }

  async getSyncStatus(puuid: string): Promise<SyncStatusResponseDto> {
    const statusKey = `sync:${puuid}:status`;
    const matchIdsKey = `sync:${puuid}:matchIds`;

    // 1. Lê estado do Redis
    const statusHash = await this.redis.hgetall(statusKey);

    // Se não há estado, retorna IDLE
    if (!statusHash || !statusHash.state) {
      return {
        puuid,
        status: SyncStatus.IDLE,
        matchesProcessed: 0,
        matchesTotal: 0,
        startedAt: null,
        message: 'Nenhum sync em andamento',
      };
    }

    const matchesTotal = Number(statusHash.matchesTotal || 0);
    const startedAt = statusHash.startedAt || null;

    // 2. Lê matchIds rastreados e conta quantos existem no DB
    const trackedMatchIds = await this.redis.smembers(matchIdsKey);
    let matchesProcessed = 0;

    if (trackedMatchIds.length > 0) {
      matchesProcessed = await this.prisma.match.count({
        where: { matchId: { in: trackedMatchIds } },
      });
    }

    // 3. Se processados >= total, marca como DONE
    let state = statusHash.state as SyncStatus;
    if (state === SyncStatus.SYNCING && matchesProcessed >= matchesTotal) {
      await this.redis.hset(statusKey, 'state', SyncStatus.DONE);
      state = SyncStatus.DONE;
    }

    const message =
      state === SyncStatus.DONE
        ? `Sync concluído: ${matchesProcessed}/${matchesTotal} partidas processadas`
        : state === SyncStatus.SYNCING
          ? `Sync em andamento: ${matchesProcessed}/${matchesTotal} partidas processadas`
          : 'Nenhum sync em andamento';

    return {
      puuid,
      status: state,
      matchesProcessed,
      matchesTotal,
      startedAt,
      message,
    };
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Conexão do SyncService com Redis fechada');
    }
  }
}
