import { selectUniqueOpponent } from '../../../core/metrics';
import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchRepository } from '../repositories/match.repository';
import {
  computePlayerMetrics,
  computeComparison,
  OpponentMetrics,
  Comparison,
  MatchParticipant,
} from '../pure/performance-calculator';
import { MatchPerformanceComparisonDto } from '../dto/match-deep-dive.dto';

@Injectable()
export class MatchPerformanceService {
  constructor(private readonly matchRepo: MatchRepository) {}

  async getPerformanceComparison(
    matchId: string,
    puuid: string,
  ): Promise<MatchPerformanceComparisonDto> {
    const participants =
      await this.matchRepo.findParticipantsForPerformance(matchId);

    if (participants.length === 0) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }

    const typedParticipants = participants as unknown as MatchParticipant[];
    const player = typedParticipants.find((p) => p.puuid === puuid);
    if (!player) {
      throw new NotFoundException(
        `Player ${puuid} not found in match ${matchId}`,
      );
    }

    const gameDurationMinutes =
      (player.match as { gameDuration: number }).gameDuration / 60;
    const playerMetrics = computePlayerMetrics(player, gameDurationMinutes);

    const { opponent, reason: opponentReason } = selectUniqueOpponent(
      player,
      typedParticipants,
    );

    let opponentMetrics: OpponentMetrics | null = null;
    let comparison: Comparison | null = null;

    if (opponent) {
      opponentMetrics = {
        puuid: opponent.puuid,
        ...computePlayerMetrics(opponent, gameDurationMinutes),
      };

      comparison = computeComparison(playerMetrics, opponentMetrics);
    }

    return {
      matchId,
      puuid,
      metricVersion: 1,
      opponentReason,
      player: playerMetrics,
      opponent: opponentMetrics,
      comparison,
    };
  }
}
