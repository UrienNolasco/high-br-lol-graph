import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchRepository } from '../repositories/match.repository';
import { mapParticipantBuild, BuildParticipant } from '../pure/builds.mapper';
import { MatchBuildsDto } from '../dto/match-deep-dive.dto';
import { DataDragonService } from '../../../core/data-dragon/data-dragon.service';

@Injectable()
export class MatchBuildsService {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly dataDragon: DataDragonService,
  ) {}

  async getBuilds(matchId: string): Promise<MatchBuildsDto> {
    const match = await this.matchRepo.findBuilds(matchId);

    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }

    const catalog = await this.dataDragon.getItemCatalogForGameVersion(
      match.gameVersion,
    );
    const builds = (match.participants as unknown as BuildParticipant[]).map(
      (p) => mapParticipantBuild(p, catalog),
    );

    const { gameVersion, version, locale, policy, reason } = catalog;
    return {
      matchId,
      builds,
      catalog: { gameVersion, version, locale, policy, reason },
    };
  }
}
