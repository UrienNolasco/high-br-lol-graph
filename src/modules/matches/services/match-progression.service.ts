import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProgressionRepository } from '../repositories/progression.repository';
import { calculateProgression } from '../pure/progression/progression-calculator';
import type { CatalogReader } from '../ports/catalog-reader';
import { MATCH_CATALOGS } from '../ports/catalog-reader';
@Injectable()
export class MatchProgressionService {
  constructor(
    private readonly repository: ProgressionRepository,
    @Inject(MATCH_CATALOGS) private readonly catalogs: CatalogReader,
  ) {}
  async getProgression(matchId: string, puuid: string) {
    const input = await this.repository.findProgression(matchId, puuid);
    if (!input) throw new NotFoundException('Match or participant not found');
    return calculateProgression(
      input,
      this.catalogs.getCachedItemCatalog(input.gameVersion),
      this.catalogs.getCachedSkillCatalog(
        input.gameVersion,
        input.participant.championId,
      ),
    );
  }
}
