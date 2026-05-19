import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DataDragonService } from '../../../core/data-dragon/data-dragon.service';
import { PlayerSummaryDto } from '../dto/player-summary.dto';
import { PlayerChampionsDto } from '../dto/player-champions.dto';
import { PlayerRoleDistributionDto } from '../dto/player-role-distribution.dto';
import { PlayerActivityDto } from '../dto/player-activity.dto';
import { PlayerStatsRepository } from '../repositories/player-stats.repository';
import { buildEmptyHeatmap, fillHeatmap } from '../pure/heatmap.builder';
import { calculateActivityInsights } from '../pure/insights.calculator';
import { enrichChampionStats } from '../pure/champion.enricher';

@Injectable()
export class PlayerStatsService {
  constructor(
    private readonly statsRepo: PlayerStatsRepository,
    private readonly dataDragon: DataDragonService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PlayerStatsService.name);
  }

  async getSummary(
    puuid: string,
    filters: { patch: string },
  ): Promise<PlayerSummaryDto> {
    const playerStats = await this.statsRepo.getAggregatedStats(
      puuid,
      filters.patch,
      420,
    );

    if (!playerStats) {
      throw new NotFoundException(`No stats found for player ${puuid}`);
    }

    const topChampions =
      (playerStats.topChampions as Array<{
        championId: number;
        games: number;
        winRate: number;
      }>) || [];

    const enrichedTopChampions = topChampions.map((champ) => {
      const championInfo = this.dataDragon.getChampionById(champ.championId);
      return {
        ...champ,
        championName: championInfo?.name || `Champion ${champ.championId}`,
      };
    });

    return {
      puuid: playerStats.puuid,
      patch: filters.patch,
      queueId: playerStats.queueId,
      gamesPlayed: playerStats.gamesPlayed,
      wins: playerStats.wins,
      losses: playerStats.losses,
      winRate: playerStats.winRate,
      avgKda: playerStats.avgKda,
      avgCspm: playerStats.avgCspm,
      avgDpm: playerStats.avgDpm,
      avgGpm: playerStats.avgGpm,
      avgVisionScore: playerStats.avgVisionScore,
      roleDistribution: playerStats.roleDistribution as Record<string, number>,
      topChampions: enrichedTopChampions,
      lastUpdated: playerStats.lastUpdated || null,
    };
  }

  async getChampions(
    puuid: string,
    filters: {
      patch: string;
      role?: string;
      limit?: number;
      sortBy?: string;
    },
  ): Promise<PlayerChampionsDto> {
    const limit = Math.min(filters.limit || 10, 50);
    const sortBy = filters.sortBy || 'games';

    let championStats = await this.statsRepo.getChampionStats(
      puuid,
      filters.patch,
      420,
    );

    if (filters.role) {
      championStats = championStats.filter((champ) => {
        const roleDistribution = champ.roleDistribution as Record<
          string,
          number
        >;
        return roleDistribution[filters.role!] > 0;
      });
    }

    championStats.sort((a, b) => {
      if (sortBy === 'winRate') return b.winRate - a.winRate;
      if (sortBy === 'kda') return b.avgKda - a.avgKda;
      return b.gamesPlayed - a.gamesPlayed;
    });

    championStats = championStats.slice(0, limit);

    const enrichedChampions = await Promise.all(
      championStats.map(async (champ) => {
        const championInfo = this.dataDragon.getChampionById(champ.championId);
        const images = championInfo
          ? await this.dataDragon.getChampionImageUrls(championInfo.id)
          : null;
        return enrichChampionStats(champ, championInfo, images);
      }),
    );

    return {
      puuid,
      patch: filters.patch,
      champions: enrichedChampions,
    };
  }

  async getRoleDistribution(
    puuid: string,
    filters: { patch: string },
  ): Promise<PlayerRoleDistributionDto> {
    const roleStats = await this.statsRepo.getRoleDistribution(
      puuid,
      filters.patch,
    );

    const totalGames = roleStats.reduce(
      (sum, role) => sum + Number(role.gamesplayed),
      0,
    );

    const r2 = (v: number): number => parseFloat(v.toFixed(2));

    const roles = roleStats.map((role) => ({
      role: role.role,
      gamesPlayed: Number(role.gamesplayed),
      percentage:
        totalGames > 0 ? r2((Number(role.gamesplayed) / totalGames) * 100) : 0,
      wins: Number(role.wins),
      losses: Number(role.losses),
      winRate: r2(role.winrate),
      avgKda: r2(role.avgkda),
    }));

    return {
      puuid,
      patch: filters.patch,
      roles,
      totalGames,
    };
  }

  async getActivity(
    puuid: string,
    filters: { patch: string },
  ): Promise<PlayerActivityDto> {
    const activityData = await this.statsRepo.getActivityData(
      puuid,
      filters.patch,
    );

    const heatmap = fillHeatmap(activityData, buildEmptyHeatmap());
    const insights = calculateActivityInsights(heatmap);

    return {
      puuid,
      patch: filters.patch,
      heatmap,
      insights,
    };
  }
}
