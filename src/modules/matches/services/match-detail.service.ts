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
    } as MatchDetailDto;
  }
}
