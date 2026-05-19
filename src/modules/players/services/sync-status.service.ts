import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SyncStatus, SyncStatusResponseDto } from '../dto/sync-response.dto';
import { MatchRepository } from '../repositories/match.repository';
import { SyncService } from './sync.service';
import { syncStatusKey, syncMatchIdsKey } from '../pure/sync-state';

@Injectable()
export class SyncStatusService {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly redis: SyncService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SyncStatusService.name);
  }

  async getStatus(puuid: string): Promise<SyncStatusResponseDto> {
    const statusKey = syncStatusKey(puuid);
    const matchIdsKey = syncMatchIdsKey(puuid);

    const statusHash = await this.redis.hgetall(statusKey);

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

    const trackedMatchIds = await this.redis.smembers(matchIdsKey);
    let matchesProcessed = 0;

    if (trackedMatchIds.length > 0) {
      matchesProcessed =
        await this.matchRepo.countMatchesByIds(trackedMatchIds);
    }

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
}
