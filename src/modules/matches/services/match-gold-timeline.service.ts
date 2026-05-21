import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchRepository } from '../repositories/match.repository';
import {
  computeGoldTimeline,
  determineWinner,
  findMaxAdvantage,
  findThrowPoint,
} from '../pure/gold-calculator';
import { MatchGoldTimelineDto } from '../dto/match-deep-dive.dto';

@Injectable()
export class MatchGoldTimelineService {
  constructor(private readonly matchRepo: MatchRepository) {}

  async getGoldTimeline(matchId: string): Promise<MatchGoldTimelineDto> {
    const participants = await this.matchRepo.findParticipantsGold(matchId);

    if (participants.length === 0) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }

    const goldDifference = computeGoldTimeline(participants);

    return {
      matchId,
      goldDifference,
      winner: determineWinner(goldDifference),
      maxAdvantage: findMaxAdvantage(goldDifference),
      throwPoint: findThrowPoint(goldDifference),
    };
  }
}
