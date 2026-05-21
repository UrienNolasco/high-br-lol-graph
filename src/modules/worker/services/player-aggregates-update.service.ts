import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  PlayerStatsAggregationService,
  ParticipantData,
} from '../../../core/stats/player-stats-aggregation.service';
import { ProcessedMatchData } from '../pure/match.parser';
import { extractPatch } from '../pure/match.parser';
import { TimelineParserService } from '../../../core/riot/timeline-parser.service';
import { getErrorMessage } from '../../../core/logger/get-error-message';

@Injectable()
export class PlayerAggregatesUpdateService {
  constructor(
    private readonly playerStatsAggregation: PlayerStatsAggregationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PlayerAggregatesUpdateService.name);
  }

  async update(
    matchData: ProcessedMatchData,
    timelineData: ReturnType<TimelineParserService['parseTimeline']>,
  ): Promise<void> {
    const patch = extractPatch(matchData.match.gameVersion);
    const gameDurationMinutes = matchData.match.gameDuration / 60;

    for (const participant of matchData.participants) {
      try {
        const timelineParticipant = timelineData.participants.get(
          participant.puuid,
        );
        const participantData: ParticipantData = {
          ...participant,
          goldGraph: timelineParticipant?.goldGraph || [],
          xpGraph: timelineParticipant?.xpGraph || [],
          csGraph: timelineParticipant?.csGraph || [],
          damageGraph: timelineParticipant?.damageGraph || [],
        };

        const allParticipants: ParticipantData[] = matchData.participants.map(
          (p) => {
            const tp = timelineData.participants.get(p.puuid);
            return {
              ...p,
              goldGraph: tp?.goldGraph || [],
              xpGraph: tp?.xpGraph || [],
              csGraph: tp?.csGraph || [],
              damageGraph: tp?.damageGraph || [],
            };
          },
        );

        const opponent = this.playerStatsAggregation.findLaneOpponent(
          allParticipants,
          participantData,
        );
        await this.playerStatsAggregation.updatePlayerAggregates(
          participantData,
          opponent,
          patch,
          gameDurationMinutes,
        );
      } catch (error) {
        this.logger.warn(
          {
            puuid: participant.puuid,
            event: 'player_stats_error',
            error: getErrorMessage(error),
          },
          `Erro ao atualizar PlayerStats para ${participant.puuid}`,
        );
      }
    }
  }
}
