import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { getErrorMessage } from '../../../core/logger/get-error-message';
import { RiotService } from '../../../core/riot/riot.service';
import { QueueService } from '../../../core/queue/queue.service';
import { PlayerSearchDto } from '../dto/player-search.dto';
import { PlayerResponseDto } from '../dto/player-response.dto';
import { PlayerRepository } from '../repositories/player.repository';
import { MatchRepository } from '../repositories/match.repository';

@Injectable()
export class PlayerSearchService {
  constructor(
    private readonly riotService: RiotService,
    private readonly playerRepo: PlayerRepository,
    private readonly matchRepo: MatchRepository,
    private readonly queueService: QueueService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PlayerSearchService.name);
  }

  async search(dto: PlayerSearchDto): Promise<PlayerResponseDto> {
    const startTime = Date.now();
    this.logger.info(
      {
        operation: 'player_search',
        gameName: dto.gameName,
        tagLine: dto.tagLine,
      },
      'Starting player search',
    );

    const REGION = 'br1';

    try {
      const account = await this.riotService.getAccountByRiotId(
        dto.gameName,
        dto.tagLine,
      );
      const summoner = await this.riotService.getSummonerByPuuid(
        account.puuid,
        REGION,
      );
      const leagueEntries = await this.riotService.getRankedStatsByPuuid(
        account.puuid,
        REGION,
      );
      const rankObservedAt = new Date();
      const rankedSolo = leagueEntries.find(
        (e) => e.queueType === 'RANKED_SOLO_5x5',
      );

      const matchIds = await this.riotService.getMatchIdsByPuuid(
        account.puuid,
        20,
      );
      await this.queueService.recordDiscovery(matchIds, {
        observationId: randomUUID(),
        source: 'search',
        observedAt: new Date(),
        region: REGION,
        queriedPuuid: account.puuid,
        queueFilter: null,
        requestedCount: 20,
        startIndex: 0,
        rank: rankedSolo?.tier
          ? {
              tier: rankedSolo.tier,
              division: rankedSolo.rank ?? null,
              leaguePoints: rankedSolo.leaguePoints ?? null,
              queue: rankedSolo.queueType,
              observedAt: rankObservedAt,
            }
          : null,
      });
      const existingSet = await this.matchRepo.findExistingMatchIds(matchIds);
      const newMatchIds = matchIds.filter((id) => !existingSet.has(id));

      for (const matchId of newMatchIds) {
        await this.queueService.publishUserRequestedMatch(matchId);
      }

      await this.playerRepo.upsert(account.puuid, {
        gameName: dto.gameName,
        tagLine: dto.tagLine,
        region: REGION,
        profileIconId: summoner.profileIconId,
        summonerLevel: summoner.summonerLevel,
        summonerId: summoner.id ?? null,
        tier: rankedSolo?.tier || null,
        rank: rankedSolo?.rank || null,
        leaguePoints: rankedSolo?.leaguePoints || null,
        rankedWins: rankedSolo?.wins || null,
        rankedLosses: rankedSolo?.losses || null,
      });

      const duration = Date.now() - startTime;
      this.logger.info(
        {
          operation: 'player_search',
          puuid: account.puuid,
          gameName: dto.gameName,
          tagLine: dto.tagLine,
          matchesFound: matchIds.length,
          matchesEnqueued: newMatchIds.length,
          alreadyInDb: existingSet.size,
          duration,
        },
        'Player search completed',
      );

      return {
        puuid: account.puuid,
        gameName: dto.gameName,
        tagLine: dto.tagLine,
        profileIconId: summoner.profileIconId,
        summonerLevel: summoner.summonerLevel,
        matchesEnqueued: newMatchIds.length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        {
          operation: 'player_search',
          gameName: dto.gameName,
          tagLine: dto.tagLine,
          duration,
          error: getErrorMessage(error),
        },
        'Error searching player',
      );

      const axiosError = error as { response?: { status?: number } };
      if (axiosError?.response?.status === 404) {
        throw new NotFoundException(
          `Player ${dto.gameName}#${dto.tagLine} not found`,
        );
      }

      throw error;
    }
  }
}
