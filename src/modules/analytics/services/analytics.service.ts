import { Injectable, NotFoundException } from '@nestjs/common';
import { AnalyticsRepository } from '../repositories/analytics.repository';
import { calculateAverageTimeline } from '../pure/timeline-calculator';
import { generateInsights } from '../pure/insights-generator';
import {
  ComparePlayerStatsDto,
  LaningPhaseDto,
  PlayerComparisonDto,
} from '../dto/compare-evolve.dto';

interface CompareFilters {
  role?: string;
  championId?: number;
  patch?: string;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly analyticsRepo: AnalyticsRepository) {}

  async comparePlayerPerformance(
    heroPuuid: string,
    villainPuuid: string,
    filters: CompareFilters,
  ): Promise<PlayerComparisonDto> {
    const patch = filters.patch || 'ALL';

    const [heroUser, villainUser] = await Promise.all([
      this.analyticsRepo.findUserByPuuid(heroPuuid),
      this.analyticsRepo.findUserByPuuid(villainPuuid),
    ]);

    if (!heroUser) {
      throw new NotFoundException(`Jogador herói ${heroPuuid} não encontrado`);
    }
    if (!villainUser) {
      throw new NotFoundException(
        `Jogador vilão ${villainPuuid} não encontrado`,
      );
    }

    const [heroStats, villainStats] = await this.fetchStats(
      heroPuuid,
      villainPuuid,
      filters.championId,
      patch,
    );

    const filtersWithPatch = { ...filters, patch };

    const [timelineComparison, heroLaning, villainLaning] = await Promise.all([
      this.calculateTimeline(heroPuuid, villainPuuid, filtersWithPatch),
      this.calculateLaning(heroPuuid, filters.championId, patch),
      this.calculateLaning(villainPuuid, filters.championId, patch),
    ]);

    const insights = generateInsights(
      heroStats,
      villainStats,
      heroLaning,
      villainLaning,
    );

    return {
      hero: {
        puuid: heroPuuid,
        gameName: heroUser.gameName,
        stats: heroStats,
        laningPhase: heroLaning,
      },
      villain: {
        puuid: villainPuuid,
        gameName: villainUser.gameName,
        stats: villainStats,
        laningPhase: villainLaning,
      },
      timelineComparison,
      insights,
    };
  }

  private async fetchStats(
    heroPuuid: string,
    villainPuuid: string,
    championId: number | undefined,
    patch: string,
  ): Promise<[ComparePlayerStatsDto, ComparePlayerStatsDto]> {
    if (championId) {
      return Promise.all([
        this.getChampionStatsOrThrow(heroPuuid, championId, patch),
        this.getChampionStatsOrThrow(villainPuuid, championId, patch),
      ]);
    }
    return Promise.all([
      this.getGlobalStatsOrThrow(heroPuuid, patch),
      this.getGlobalStatsOrThrow(villainPuuid, patch),
    ]);
  }

  private async getGlobalStatsOrThrow(
    puuid: string,
    patch: string,
  ): Promise<ComparePlayerStatsDto> {
    const stats = await this.analyticsRepo.findPlayerStats(puuid, patch);
    if (!stats) {
      throw new NotFoundException(
        `Estatísticas não encontradas para jogador ${puuid} (patch: ${patch})`,
      );
    }
    return {
      gamesPlayed: stats.gamesPlayed,
      winRate: parseFloat(stats.winRate.toFixed(2)),
      avgKda: parseFloat(stats.avgKda.toFixed(2)),
      avgCspm: parseFloat(stats.avgCspm.toFixed(1)),
      avgDpm: parseFloat(stats.avgDpm.toFixed(1)),
      avgGpm: parseFloat(stats.avgGpm.toFixed(1)),
      avgVisionScore: parseFloat(stats.avgVisionScore.toFixed(1)),
    };
  }

  private async getChampionStatsOrThrow(
    puuid: string,
    championId: number,
    patch: string,
  ): Promise<ComparePlayerStatsDto> {
    const stats = await this.analyticsRepo.findPlayerChampionStats(
      puuid,
      championId,
      patch,
    );
    if (!stats) {
      throw new NotFoundException(
        `Estatísticas de campeão ${championId} não encontradas para jogador ${puuid} (patch: ${patch})`,
      );
    }
    return {
      gamesPlayed: stats.gamesPlayed,
      winRate: parseFloat(stats.winRate.toFixed(2)),
      avgKda: parseFloat(stats.avgKda.toFixed(2)),
      avgCspm: parseFloat(stats.avgCspm.toFixed(1)),
      avgDpm: parseFloat(stats.avgDpm.toFixed(1)),
      avgGpm: parseFloat(stats.avgGpm.toFixed(1)),
      avgVisionScore: parseFloat(stats.avgVisionScore.toFixed(1)),
    };
  }

  private async calculateTimeline(
    heroPuuid: string,
    villainPuuid: string,
    filters: CompareFilters,
  ) {
    const [heroMatches, villainMatches] = await Promise.all([
      this.analyticsRepo.findMatchesForTimeline(heroPuuid, filters),
      this.analyticsRepo.findMatchesForTimeline(villainPuuid, filters),
    ]);

    return {
      csGraph: {
        hero: calculateAverageTimeline(heroMatches, 'csGraph'),
        villain: calculateAverageTimeline(villainMatches, 'csGraph'),
      },
      goldGraph: {
        hero: calculateAverageTimeline(heroMatches, 'goldGraph'),
        villain: calculateAverageTimeline(villainMatches, 'goldGraph'),
      },
    };
  }

  private async calculateLaning(
    puuid: string,
    championId: number | undefined,
    patch: string,
  ): Promise<LaningPhaseDto> {
    if (championId) {
      const stats = await this.analyticsRepo.findPlayerLaningMetrics(
        puuid,
        championId,
        patch,
      );
      if (stats) {
        return {
          avgCsd15: parseFloat(stats.avgCsd15.toFixed(1)),
          avgGd15: parseFloat(stats.avgGd15.toFixed(1)),
          avgXpd15: parseFloat(stats.avgXpd15.toFixed(1)),
          soloKills15: 0,
          soloDeaths15: 0,
        };
      }
    }
    return {
      avgCsd15: 0,
      avgGd15: 0,
      avgXpd15: 0,
      soloKills15: 0,
      soloDeaths15: 0,
    };
  }
}
