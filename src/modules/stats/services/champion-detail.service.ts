import { Injectable, NotFoundException } from '@nestjs/common';
import { DataDragonService } from '../../../core/data-dragon/data-dragon.service';
import { ChampionStatsDto } from '../dto/champion-stats.dto';
import { ChampionStatsService } from './champion-stats.service';

@Injectable()
export class ChampionDetailService {
  constructor(
    private readonly stats: ChampionStatsService,
    private readonly dataDragon: DataDragonService,
  ) {}
  async getChampion(
    championName: string,
    patch: string,
    queueId = 420,
  ): Promise<ChampionStatsDto> {
    const id = /^\d+$/.test(championName)
      ? Number(championName)
      : Number(this.dataDragon.getChampionByName(championName)?.key);
    if (!Number.isInteger(id) || id <= 0)
      throw new NotFoundException(`Champion ${championName} not found`);
    // Same calculation/ranking as the list; numeric ID works without a catalog.
    const all = await this.stats.getChampionStats(
      patch,
      1,
      Number.MAX_SAFE_INTEGER,
      'championId',
      'asc',
      queueId,
    );
    const champion = all.data.find((c) => c.championId === id);
    if (!champion)
      throw new NotFoundException(
        `Stats for champion ${championName} not found on patch ${patch}`,
      );
    return champion;
  }
}
