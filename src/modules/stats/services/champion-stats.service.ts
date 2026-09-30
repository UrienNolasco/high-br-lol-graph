import { Injectable } from '@nestjs/common';
import { DataDragonService } from '../../../core/data-dragon/data-dragon.service';
import { TierRankService, TIER_METHOD } from './tier-rank.service';
import {
  PaginatedChampionStatsDto,
  ChampionStatsDto,
} from '../dto/champion-stats.dto';
import { ChampionStatsRepository } from '../repositories/champion-stats.repository';
import { toChampionMetrics, championDto } from './champion.enricher';
import { sortChampions } from './champion.sorter';

@Injectable()
export class ChampionStatsService {
  constructor(
    private readonly repo: ChampionStatsRepository,
    private readonly dataDragon: DataDragonService,
    private readonly tierRank: TierRankService,
  ) {}

  async getChampionStats(
    patch: string,
    page = 1,
    limit = 20,
    sortBy = 'winRate',
    order: 'asc' | 'desc' = 'desc',
    queueId = 420,
  ): Promise<PaginatedChampionStatsDto> {
    const population = await this.repo.findPopulation(patch, queueId);
    const previousPatch = await this.tierRank.getPreviousPatch(patch, queueId);
    const previous = previousPatch
      ? await this.repo.findManyByPatch(previousPatch, queueId)
      : [];
    const previousMap = new Map(
      previous.map((row) => [row.championId, toChampionMetrics(row)]),
    );
    const champions = await Promise.all(
      population.champions.map(async (stat) => {
        const info = this.dataDragon.getChampionById(stat.championId);
        let images: ChampionStatsDto['images'] = null;
        // Only use a catalog whose internal major.minor matches the requested patch.
        const compatible =
          !!info?.version &&
          info.version.split('.').slice(0, 2).join('.') === patch;
        if (compatible) {
          try {
            images = await this.dataDragon.getChampionImageUrls(
              info.id,
              info.version,
            );
          } catch {
            images = null;
          }
        }
        const score = this.tierRank.calculateChampionScore(
          stat.championId,
          patch,
          toChampionMetrics(stat),
          previousMap.get(stat.championId) ?? null,
        );
        return championDto(
          stat,
          score,
          images,
          compatible ? info.name : null,
          compatible,
          previousPatch,
        );
      }),
    );
    champions
      .filter((c) => c.score !== null && !c.hasInsufficientData)
      .sort((a, b) => b.score! - a.score! || a.championId - b.championId)
      .forEach((c, index) => (c.rank = index + 1));
    const sorted = sortChampions(champions, sortBy, order);
    return {
      data: sorted.slice((page - 1) * limit, page * limit),
      total: champions.length,
      page,
      limit,
      cohort: population.cohort,
      tierMethod: { ...TIER_METHOD, previousPatch },
    };
  }
}
