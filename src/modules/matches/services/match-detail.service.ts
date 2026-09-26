import { participantDisplayName } from '../contracts/participant-display';
import { Injectable } from '@nestjs/common';
import { MatchRepository } from '../repositories/match.repository';
import { MatchDetailDto } from '../dto/match-detail.dto';

@Injectable()
export class MatchDetailService {
  constructor(private readonly matchRepo: MatchRepository) {}

  async getMatchDetails(matchId: string): Promise<MatchDetailDto | null> {
    const match = await this.matchRepo.findMatchWithDetails(matchId);

    if (!match) return null;

    return {
      ...match,
      gameCreation: match.gameCreation.toString(),
      finalContext: match.finalContext ?? null,
      finalContextReason: match.finalContext ? null : 'not_calculated',
      teams: (match.teams ?? []).map((team) => ({
        ...team,
        finalObjectives: team.finalObjectives ?? null,
        finalObjectivesReason: team.finalObjectives ? null : 'not_calculated',
      })),
      participants: (match.participants ?? []).map((p) => ({
        ...p,
        ...participantDisplayName(p),
        riotIdGameName: p.riotIdGameName ?? null,
        riotIdTagline: p.riotIdTagline ?? null,
        riotIdReason:
          p.riotIdGameName && p.riotIdTagline ? null : 'missing_field',
        finalStats: p.finalStats ?? null,
        finalStatsReason: p.finalStats ? null : 'not_calculated',
      })),
    } as unknown as MatchDetailDto;
  }
}
