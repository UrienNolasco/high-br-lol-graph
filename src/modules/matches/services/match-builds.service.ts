import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchRepository } from '../repositories/match.repository';
import { mapParticipantBuild, BuildParticipant } from '../pure/builds.mapper';
import { MatchBuildsDto } from '../dto/match-deep-dive.dto';

@Injectable()
export class MatchBuildsService {
  constructor(private readonly matchRepo: MatchRepository) {}

  async getBuilds(matchId: string): Promise<MatchBuildsDto> {
    const participants = await this.matchRepo.findParticipantsBuilds(matchId);

    if (participants.length === 0) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }

    const builds = (participants as unknown as BuildParticipant[]).map(
      mapParticipantBuild,
    );

    return { matchId, builds };
  }
}
