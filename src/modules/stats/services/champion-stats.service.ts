import { Injectable } from '@nestjs/common';
import { DataDragonService } from '../../../core/data-dragon/data-dragon.service';
import { TierRankService } from './tier-rank.service';
import {
  PaginatedChampionStatsDto,
  ChampionStatsDto,
} from '../dto/champion-stats.dto';
import { ChampionStatsRepository } from '../repositories/champion-stats.repository';
import {
  toChampionMetrics,
  toChampionDto,
  r2,
  EnrichedChampion,
} from '../pure/champion.enricher';
import { sortChampions } from '../pure/champion.sorter';

@Injectable()
export class ChampionStatsService {
  constructor(
    private readonly repo: ChampionStatsRepository,
    private readonly dataDragon: DataDragonService,
    private readonly tierRank: TierRankService,
  ) {}

  async getChampionStats(
    patch: string,
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'winRate',
    order: 'asc' | 'desc' = 'desc',
  ): Promise<PaginatedChampionStatsDto> {
    const championStats = await this.repo.findManyByPatch(patch);

    const previousPatch = this.tierRank.getPreviousPatch(patch);
    const previousStatsMap = new Map<
      number,
      ReturnType<typeof toChampionMetrics>
    >();

    if (previousPatch) {
      const previousStats = await this.repo.findManyByPatch(previousPatch);
      for (const stat of previousStats) {
        previousStatsMap.set(stat.championId, toChampionMetrics(stat));
      }
    }

    const enrichedStatsPromises = championStats.map(async (stat) => {
      const championInfo = this.dataDragon.getChampionById(stat.championId);
      if (!championInfo) return null;

      const images = await this.dataDragon.getChampionImageUrls(
        championInfo.id,
      );

      const currentMetrics = toChampionMetrics(stat);
      const previousMetrics = previousStatsMap.get(stat.championId) || null;

      const scoreResult = this.tierRank.calculateChampionScore(
        stat.championId,
        patch,
        currentMetrics,
        previousMetrics,
      );

      return {
        championId: stat.championId,
        championName: championInfo.name,
        winRate: r2(stat.winRate),
        gamesPlayed: stat.gamesPlayed,
        wins: stat.wins,
        losses: stat.losses,
        images,
        kda: r2(stat.kda),
        dpm: r2(stat.dpm),
        cspm: r2(stat.cspm),
        gpm: r2(stat.gpm),
        banRate: r2(stat.banRate),
        pickRate: r2(stat.pickRate),
        tier: scoreResult.tier,
        rank: null as number | null,
        score: scoreResult.score,
        hasInsufficientData: scoreResult.hasInsufficientData,
      };
    });

    const results = await Promise.all(enrichedStatsPromises);
    const validResults = results.filter(
      (r): r is NonNullable<typeof r> => r !== null,
    );

    const withData = validResults.filter((c) => !c.hasInsufficientData);
    withData.sort((a, b) => b.score - a.score);
    withData.forEach((c, i) => {
      c.rank = i + 1;
    });

    const enrichedStats: ChampionStatsDto[] = validResults.map((c) =>
      toChampionDto(c as EnrichedChampion),
    );
    const sorted = sortChampions(enrichedStats, sortBy, order);

    const startIndex = (page - 1) * limit;
    const paginatedData = sorted.slice(startIndex, startIndex + limit);

    return {
      data: paginatedData,
      total: enrichedStats.length,
      page,
      limit,
    };
  }
}
