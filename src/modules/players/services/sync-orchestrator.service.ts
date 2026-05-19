import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { getErrorMessage } from '../../../core/logger/get-error-message';
import { RiotService } from '../../../core/riot/riot.service';
import { QueueService } from '../../../core/queue/queue.service';
import { SyncStatus, SyncTriggerResponseDto } from '../dto/sync-response.dto';
import { PlayerRepository } from '../repositories/player.repository';
import { MatchRepository } from '../repositories/match.repository';
import { SyncService } from './sync.service';
import {
  SYNC_TTL_SECONDS,
  syncStatusKey,
  syncMatchIdsKey,
} from '../pure/sync-state';

@Injectable()
export class SyncOrchestratorService {
  constructor(
    private readonly playerRepo: PlayerRepository,
    private readonly matchRepo: MatchRepository,
    private readonly riotService: RiotService,
    private readonly queueService: QueueService,
    private readonly redis: SyncService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SyncOrchestratorService.name);
  }

  async startDeepSync(puuid: string): Promise<SyncTriggerResponseDto> {
    const startTime = Date.now();
    try {
      return await this._startDeepSync(puuid, startTime);
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

  private async _startDeepSync(
    puuid: string,
    startTime: number,
  ): Promise<SyncTriggerResponseDto> {
    const player = await this.playerRepo.findByPuuid(puuid);
    if (!player) {
      throw new NotFoundException(
        `Player ${puuid} not found. Use /players/search first.`,
      );
    }

    const statusKey = syncStatusKey(puuid);
    const matchIdsKey = syncMatchIdsKey(puuid);

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

    const existingSet = await this.matchRepo.findExistingMatchIds(riotMatchIds);
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
}
