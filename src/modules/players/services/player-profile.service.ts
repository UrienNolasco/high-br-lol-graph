import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RiotService } from '../../../core/riot/riot.service';
import { PlayerProfileDto } from '../dto/player-profile.dto';
import {
  PlayerUpdateStatusDto,
  UpdateStatus,
} from '../dto/player-update-status.dto';
import { PlayerRepository } from '../repositories/player.repository';
import { MatchRepository } from '../repositories/match.repository';

@Injectable()
export class PlayerProfileService {
  constructor(
    private readonly playerRepo: PlayerRepository,
    private readonly matchRepo: MatchRepository,
    private readonly riotService: RiotService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PlayerProfileService.name);
  }

  async getProfile(puuid: string): Promise<PlayerProfileDto> {
    const user = await this.playerRepo.findByPuuid(puuid);

    if (!user) {
      throw new NotFoundException(`Player with PUUID ${puuid} not found`);
    }

    return {
      puuid: user.puuid,
      gameName: user.gameName,
      tagLine: user.tagLine,
      region: user.region,
      profileIconId: user.profileIconId ?? undefined,
      summonerLevel: user.summonerLevel ?? undefined,
      tier: user.tier ?? undefined,
      rank: user.rank ?? undefined,
      leaguePoints: user.leaguePoints ?? undefined,
      rankedWins: user.rankedWins ?? undefined,
      rankedLosses: user.rankedLosses ?? undefined,
      lastUpdated: user.lastUpdated,
      createdAt: user.createdAt,
    };
  }

  async getUpdateStatus(puuid: string): Promise<PlayerUpdateStatusDto> {
    const user = await this.playerRepo.findByPuuid(puuid);

    if (!user) {
      throw new NotFoundException(`Player with PUUID ${puuid} not found`);
    }

    try {
      const matchIds = await this.riotService.getMatchIdsByPuuid(puuid, 20);
      const matchesProcessed = await this.matchRepo.countMatchesByIds(matchIds);
      const matchesTotal = matchIds.length;

      let status: UpdateStatus;
      let message: string;

      if (matchesProcessed === matchesTotal) {
        status = UpdateStatus.IDLE;
        message = 'All matches processed';
      } else {
        status = UpdateStatus.UPDATING;
        message = `Processing matches: ${matchesProcessed}/${matchesTotal}`;
      }

      return { status, matchesProcessed, matchesTotal, message };
    } catch {
      return {
        status: UpdateStatus.ERROR,
        matchesProcessed: 0,
        matchesTotal: 0,
        message: 'Failed to fetch match status from Riot API',
      };
    }
  }
}
