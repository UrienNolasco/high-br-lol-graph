import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RiotService } from '../../../core/riot/riot.service';
import { getErrorMessage } from '../../../core/logger/get-error-message';
import { QueueService } from '../../../core/queue/queue.service';
import { CollectorRepository } from '../repositories/collector.repository';

interface CollectionWindow {
  startHour: number;
  endHour: number;
}

@Injectable()
export class CollectorPipelineService {
  constructor(
    private readonly riotService: RiotService,
    private readonly queueService: QueueService,
    private readonly collectorRepo: CollectorRepository,
    private readonly logger: PinoLogger,
  ) {}

  async runCollection(window: CollectionWindow): Promise<void> {
    const startTime = Date.now();

    try {
      const highEloAccounts = await this.riotService.getHighEloAccounts();
      this.logger.info(
        {
          event: 'collection_progress',
          playersFound: highEloAccounts.length,
          step: 'high_elo_fetched',
        },
        'High-elo players fetched',
      );

      let totalMatchesFound = 0;
      let newMatchesEnqueued = 0;

      for (const { puuid, rank } of highEloAccounts) {
        try {
          const matchIds = await this.riotService.getMatchIdsByPuuid(puuid, 20);
          await this.queueService.recordDiscovery(matchIds, {
            observationId: randomUUID(),
            source: 'collector',
            observedAt: new Date(),
            region: 'br1',
            queriedPuuid: puuid,
            queueFilter: null,
            requestedCount: 20,
            startIndex: 0,
            rank,
          });
          totalMatchesFound += matchIds.length;

          for (const matchId of matchIds) {
            const isNew = await this.isNewMatch(matchId);

            if (isNew) {
              await this.enqueueMatch(matchId);
              newMatchesEnqueued++;
            }
          }
        } catch (error) {
          this.logger.warn(
            {
              event: 'collection_player_error',
              puuid,
              error: getErrorMessage(error),
            },
            'Error processing player PUUID',
          );
          continue;
        }
      }

      const duration = Date.now() - startTime;
      const duplicatesSkipped = totalMatchesFound - newMatchesEnqueued;

      this.logger.info(
        {
          event: 'collection_completed',
          playersFound: highEloAccounts.length,
          matchesFound: totalMatchesFound,
          matchesEnqueued: newMatchesEnqueued,
          duplicatesSkipped,
          duration,
          startHour: window.startHour,
          endHour: window.endHour,
        },
        'Collection completed',
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        {
          event: 'collection_failed',
          duration,
          error: getErrorMessage(error),
        },
        'Collection failed',
      );
      throw error;
    }
  }

  private async isNewMatch(matchId: string): Promise<boolean> {
    try {
      const exists = await this.collectorRepo.matchExists(matchId);
      return !exists;
    } catch (error) {
      this.logger.warn(
        {
          event: 'duplicate_check_error',
          matchId,
          error: getErrorMessage(error),
        },
        'Error checking duplicate',
      );
      return true;
    }
  }

  private async enqueueMatch(matchId: string): Promise<void> {
    await this.queueService.publishBackgroundMatch(matchId);

    this.logger.debug(
      { event: 'match_enqueued', matchId, priority: 'background' },
      'Match enqueued for processing',
    );
  }
}
