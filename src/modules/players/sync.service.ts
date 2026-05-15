import { Injectable, OnModuleDestroy, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { getErrorMessage } from '../../core/logger/get-error-message';
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
  private readonly redis: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly riotService: RiotService,
    private readonly queueService: QueueService,
    private readonly logger: PinoLogger,
  ) {
    const redisHost = this.configService.get<string>('REDIS_HOST', 'redis');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    });

    this.logger.setContext(SyncService.name);

    this.redis.on('connect', () => {
      this.logger.info(
        { operation: 'redis_connect', host: redisHost, port: redisPort },
        'Connected to Redis',
      );
    });

    this.redis.on('error', (error) => {
      this.logger.error(
        { operation: 'redis_error', error: error.message },
        'Redis connection error',
      );
    });
  }

  async triggerDeepSync(puuid: string): Promise<SyncTriggerResponseDto> {
    const startTime = Date.now();
    try {
      return await this._triggerDeepSync(puuid, startTime);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        {
          operation: 'sync_failed',
          puuid,
          duration: Date.now() - startTime,
          error: getErrorMessage(error),
        },
        'Deep sync failed unexpectedly',
      );
      throw error;
    }
  }

  private async _triggerDeepSync(
    puuid: string,
    startTime: number,
  ): Promise<SyncTriggerResponseDto> {
    const player = await this.prisma.user.findUnique({ where: { puuid } });
    if (!player) {
      throw new NotFoundException(
        `Player ${puuid} not found. Use /players/search first.`,
      );
    }

    const statusKey = `sync:${puuid}:status`;
    const matchIdsKey = `sync:${puuid}:matchIds`;

    const existingState = await this.redis.hget(statusKey, 'state');
    if (existingState === SyncStatus.SYNCING) {
      const existing = await this.redis.hgetall(statusKey);
      return {
        puuid,
        status: SyncStatus.SYNCING,
        matchesEnqueued: 0,
        matchesTotal: Number(existing.matchesTotal || 0),
        matchesAlreadyInDb: 0,
        message: 'Sync already in progress',
      };
    }

    const riotMatchIds = await this.riotService.getMatchIdsByPuuid(puuid, 100, {
      start: 0,
      queue: 420,
    });

    if (riotMatchIds.length === 0) {
      this.logger.info(
        {
          operation: 'sync_completed',
          puuid,
          status: 'no_matches',
          duration: Date.now() - startTime,
        },
        'No ranked matches found',
      );
      return {
        puuid,
        status: SyncStatus.DONE,
        matchesEnqueued: 0,
        matchesTotal: 0,
        matchesAlreadyInDb: 0,
        message: 'No ranked matches found in Riot API',
      };
    }

    const existingMatches = await this.prisma.match.findMany({
      where: { matchId: { in: riotMatchIds } },
      select: { matchId: true },
    });
    const existingSet = new Set(existingMatches.map((m) => m.matchId));
    const newMatchIds = riotMatchIds.filter((id) => !existingSet.has(id));

    const matchesTotal = riotMatchIds.length;
    const matchesAlreadyInDb = existingSet.size;
    const matchesEnqueued = newMatchIds.length;

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

    for (const matchId of newMatchIds) {
      this.queueService.publishDeepSyncMatch(matchId);
    }

    const duration = Date.now() - startTime;
    this.logger.info(
      {
        operation: 'sync_started',
        puuid,
        matchesTotal,
        matchesEnqueued,
        matchesAlreadyInDb,
        status: matchesEnqueued === 0 ? 'done' : 'syncing',
        duration,
      },
      `Deep sync: ${matchesEnqueued} enqueued, ${matchesAlreadyInDb} already in DB, ${matchesTotal} total`,
    );

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
          ? 'All matches already in database'
          : `Deep sync started: ${matchesEnqueued} matches enqueued`,
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
      this.logger.info('Redis connection closed');
    }
  }
}
