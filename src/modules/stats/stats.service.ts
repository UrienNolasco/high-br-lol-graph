import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import {
  ChampionStatsDto,
  PaginatedChampionStatsDto,
} from './dto/champion-stats.dto';
import { TierRankService, ChampionMetrics } from './tier-rank.service';

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataDragon: DataDragonService,
    private readonly tierRankService: TierRankService,
  ) {}

  private toChampionMetrics(stat: {
    winRate: number;
    banRate: number;
    pickRate: number;
    kda: number;
    dpm: number;
    gpm: number;
    cspm: number;
    gamesPlayed: number;
  }): ChampionMetrics {
    return {
      winRate: stat.winRate,
      banRate: stat.banRate,
      pickRate: stat.pickRate,
      kda: stat.kda,
      dpm: stat.dpm,
      gpm: stat.gpm,
      cspm: stat.cspm,
      gamesPlayed: stat.gamesPlayed,
    };
  }

  async getChampionStats(
    patch: string,
    page?: number,
    limit?: number,
    sortBy?: keyof ChampionStatsDto,
    order?: 'asc' | 'desc',
  ): Promise<PaginatedChampionStatsDto> {
    const currentPage = page ?? 1;
    const currentLimit = limit ?? 20;
    const currentSortBy = sortBy ?? 'winRate';
    const currentOrder = order ?? 'desc';

    const championStats = await this.prisma.championStats.findMany({
      where: { patch },
    });

    const previousPatch = this.tierRankService.getPreviousPatch(patch);
    const previousStatsMap = new Map<number, ChampionMetrics>();

    if (previousPatch) {
      const previousStats = await this.prisma.championStats.findMany({
        where: { patch: previousPatch },
      });
      for (const stat of previousStats) {
        previousStatsMap.set(stat.championId, this.toChampionMetrics(stat));
      }
    }

    const enrichedStatsPromises = championStats.map(async (stat) => {
      const championInfo = this.dataDragon.getChampionById(stat.championId);
      if (!championInfo) return null;

      const images = await this.dataDragon.getChampionImageUrls(
        championInfo.id,
      );

      const currentMetrics = this.toChampionMetrics(stat);
      const previousMetrics = previousStatsMap.get(stat.championId) || null;

      const scoreResult = this.tierRankService.calculateChampionScore(
        stat.championId,
        patch,
        currentMetrics,
        previousMetrics,
      );

      return {
        championId: stat.championId,
        championName: championInfo.name,
        winRate: parseFloat(stat.winRate.toFixed(2)),
        gamesPlayed: stat.gamesPlayed,
        wins: stat.wins,
        losses: stat.losses,
        images,
        kda: parseFloat(stat.kda.toFixed(2)),
        dpm: parseFloat(stat.dpm.toFixed(2)),
        cspm: parseFloat(stat.cspm.toFixed(2)),
        gpm: parseFloat(stat.gpm.toFixed(2)),
        banRate: parseFloat(stat.banRate.toFixed(2)),
        pickRate: parseFloat(stat.pickRate.toFixed(2)),
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

    const enrichedStats: ChampionStatsDto[] = validResults.map((c) => ({
      championId: c.championId,
      championName: c.championName,
      winRate: c.winRate,
      gamesPlayed: c.gamesPlayed,
      wins: c.wins,
      losses: c.losses,
      images: c.images,
      kda: c.kda,
      dpm: c.dpm,
      cspm: c.cspm,
      gpm: c.gpm,
      banRate: c.banRate,
      pickRate: c.pickRate,
      tier: c.tier,
      rank: c.rank,
    }));

    enrichedStats.sort((a, b) => {
      const aValue = a[currentSortBy];
      const bValue = b[currentSortBy];

      if (aValue === undefined || bValue === undefined) return 0;
      if (aValue === bValue) return 0;

      if (currentOrder === 'desc') {
        return (aValue ?? 0) > (bValue ?? 0) ? -1 : 1;
      } else {
        return (aValue ?? 0) < (bValue ?? 0) ? -1 : 1;
      }
    });

    const startIndex = (currentPage - 1) * currentLimit;
    const paginatedData = enrichedStats.slice(
      startIndex,
      startIndex + currentLimit,
    );

    return {
      data: paginatedData,
      total: enrichedStats.length,
      page: Number(currentPage),
      limit: Number(currentLimit),
    };
  }

  async getChampion(
    championName: string,
    patch: string,
  ): Promise<ChampionStatsDto> {
    const championInfo = this.dataDragon.getChampionByName(championName);
    if (!championInfo) {
      throw new NotFoundException(`Champion ${championName} not found`);
    }

    const championId = parseInt(championInfo.key, 10);
    const stats = await this.prisma.championStats.findFirst({
      where: { championId, patch },
    });

    if (!stats) {
      throw new NotFoundException(
        `Stats for champion ${championName} not found on patch ${patch}`,
      );
    }

    const images = await this.dataDragon.getChampionImageUrls(championInfo.id);

    const currentMetrics = this.toChampionMetrics(stats);

    const previousPatch = this.tierRankService.getPreviousPatch(patch);
    let previousMetrics: ChampionMetrics | null = null;
    if (previousPatch) {
      previousMetrics = await this.tierRankService.getChampionStats(
        championId,
        previousPatch,
        stats.queueId,
      );
    }

    const scoreResult = this.tierRankService.calculateChampionScore(
      championId,
      patch,
      currentMetrics,
      previousMetrics,
    );

    let rank: number | null = null;
    if (!scoreResult.hasInsufficientData) {
      const allStats = await this.prisma.championStats.findMany({
        where: { patch, gamesPlayed: { gte: 50 } },
      });

      const allPreviousMap = new Map<number, ChampionMetrics>();
      if (previousPatch) {
        const prevAll = await this.prisma.championStats.findMany({
          where: { patch: previousPatch, gamesPlayed: { gte: 50 } },
        });
        for (const p of prevAll) {
          allPreviousMap.set(p.championId, this.toChampionMetrics(p));
        }
      }

      const scores = allStats.map((s) => {
        const prev = allPreviousMap.get(s.championId) || null;
        const result = this.tierRankService.calculateChampionScore(
          s.championId,
          patch,
          this.toChampionMetrics(s),
          prev,
        );
        return {
          championId: s.championId,
          score: result.score,
          hasInsufficientData: result.hasInsufficientData,
        };
      });

      const validScores = scores
        .filter((s) => !s.hasInsufficientData)
        .sort((a, b) => b.score - a.score);

      const idx = validScores.findIndex((s) => s.championId === championId);
      if (idx !== -1) rank = idx + 1;
    }

    return {
      championId: stats.championId,
      championName: championInfo.name,
      winRate: parseFloat(stats.winRate.toFixed(2)),
      gamesPlayed: stats.gamesPlayed,
      wins: stats.wins,
      losses: stats.losses,
      images,
      kda: parseFloat(stats.kda.toFixed(2)),
      dpm: parseFloat(stats.dpm.toFixed(2)),
      cspm: parseFloat(stats.cspm.toFixed(2)),
      gpm: parseFloat(stats.gpm.toFixed(2)),
      banRate: parseFloat(stats.banRate.toFixed(2)),
      pickRate: parseFloat(stats.pickRate.toFixed(2)),
      tier: scoreResult.tier,
      rank,
    };
  }

  async getProcessedMatches(
    patch?: string,
  ): Promise<{ count: number; patch?: string; message?: string }> {
    if (patch) {
      const count = await this.prisma.match.count({
        where: {
          gameVersion: { startsWith: patch },
        },
      });
      if (count === 0) {
        return {
          count: 0,
          patch,
          message: `Não há dados para o patch ${patch}`,
        };
      }
      return { count, patch };
    }
    const totalCount = await this.prisma.match.count();
    return { count: totalCount };
  }
}
