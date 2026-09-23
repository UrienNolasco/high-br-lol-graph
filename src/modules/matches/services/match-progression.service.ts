import { Injectable, NotFoundException } from '@nestjs/common';
import { DataDragonService } from '../../../core/data-dragon/data-dragon.service';
import { ProgressionRepository } from '../repositories/progression.repository';
import { calculateProgression } from '../pure/progression/progression-calculator';
@Injectable()
export class MatchProgressionService {
  constructor(
    private readonly repository: ProgressionRepository,
    private readonly catalogs: DataDragonService,
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
