import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchRepository } from '../repositories/match.repository';
import {
  flattenKills,
  flattenDeaths,
  flattenWards,
  flattenObjectives,
} from '../pure/timeline-events.mapper';
import { MatchTimelineEventsDto } from '../dto/match-deep-dive.dto';

@Injectable()
export class MatchTimelineEventsService {
  constructor(private readonly matchRepo: MatchRepository) {}

  async getTimelineEvents(matchId: string): Promise<MatchTimelineEventsDto> {
    const participants = await this.matchRepo.findParticipantsEvents(matchId);

    if (participants.length === 0) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }

    const teams = await this.matchRepo.findTeamsObjectives(matchId);

    const typedParticipants = participants as Parameters<
      typeof flattenKills
    >[0];
    const typedTeams = teams as Parameters<typeof flattenObjectives>[0];

    return {
      matchId,
      events: {
        kills: flattenKills(typedParticipants),
        deaths: flattenDeaths(typedParticipants),
        wards: flattenWards(typedParticipants),
        objectives: flattenObjectives(typedTeams),
      },
    };
  }
}
