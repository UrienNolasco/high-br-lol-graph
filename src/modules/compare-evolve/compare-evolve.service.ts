import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  ComparePlayerStatsDto,
  LaningPhaseDto,
  ComparePlayerDto,
  TimelinePointDto,
  TimelineComparisonDto,
  CompareInsightsDto,
  PlayerComparisonDto,
} from './dto/compare-evolve.dto';

interface CompareFilters {
  role?: string;
  championId?: number;
  patch?: string | null;
}

@Injectable()
export class CompareEvolveService {
  constructor(private readonly prisma: PrismaService) {}

  async comparePlayerPerformance(
    heroPuuid: string,
    villainPuuid: string,
    filters: CompareFilters,
  ): Promise<PlayerComparisonDto> {
    const patch =
      filters.patch === 'lifetime' || !filters.patch ? 'ALL' : filters.patch;

    const [heroUser, villainUser] = await Promise.all([
      this.prisma.user.findUnique({ where: { puuid: heroPuuid } }),
      this.prisma.user.findUnique({ where: { puuid: villainPuuid } }),
    ]);

    if (!heroUser) {
      throw new NotFoundException(`Jogador herói ${heroPuuid} não encontrado`);
    }
    if (!villainUser) {
      throw new NotFoundException(
        `Jogador vilão ${villainPuuid} não encontrado`,
      );
    }

    let heroStats: ComparePlayerStatsDto;
    let villainStats: ComparePlayerStatsDto;

    if (filters.championId) {
      [heroStats, villainStats] = await Promise.all([
        this.getPlayerChampionStatsForComparison(
          heroPuuid,
          filters.championId,
          patch,
        ),
        this.getPlayerChampionStatsForComparison(
          villainPuuid,
          filters.championId,
          patch,
        ),
      ]);
    } else {
      [heroStats, villainStats] = await Promise.all([
        this.getPlayerStatsForComparison(heroPuuid, patch),
        this.getPlayerStatsForComparison(villainPuuid, patch),
      ]);
    }

    const filtersWithPatch = { ...filters, patch };

    const [timelineComparison, heroLaning, villainLaning] = await Promise.all([
      this.calculateTimelineComparison(
        heroPuuid,
        villainPuuid,
        filtersWithPatch,
      ),
      this.calculateLaningMetrics(heroPuuid, filters.championId, patch),
      this.calculateLaningMetrics(villainPuuid, filters.championId, patch),
    ]);

    const insights = this.generateInsights(
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

  private async getPlayerStatsForComparison(
    puuid: string,
    patch: string | null,
  ): Promise<ComparePlayerStatsDto> {
    // Prisma's composite unique type doesn't accept null for optional fields,
    // but the runtime behavior is correct. Cast to satisfy TypeScript.
    const patchValue = patch as string;

    const stats = await this.prisma.playerStats.findUnique({
      where: {
        puuid_patch_queueId: { puuid, patch: patchValue, queueId: 420 },
      },
      select: {
        gamesPlayed: true,
        winRate: true,
        avgKda: true,
        avgCspm: true,
        avgDpm: true,
        avgGpm: true,
        avgVisionScore: true,
      },
    });

    if (!stats) {
      throw new NotFoundException(
        `Estatísticas não encontradas para jogador ${puuid} (patch: ${patch ?? 'lifetime'})`,
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

  private async getPlayerChampionStatsForComparison(
    puuid: string,
    championId: number,
    patch: string | null,
  ): Promise<ComparePlayerStatsDto> {
    const patchValue = patch as string;

    const stats = await this.prisma.playerChampionStats.findUnique({
      where: {
        puuid_championId_patch_queueId: {
          puuid,
          championId,
          patch: patchValue,
          queueId: 420,
        },
      },
      select: {
        gamesPlayed: true,
        winRate: true,
        avgKda: true,
        avgCspm: true,
        avgDpm: true,
        avgGpm: true,
        avgVisionScore: true,
      },
    });

    if (!stats) {
      throw new NotFoundException(
        `Estatísticas de campeão ${championId} não encontradas para jogador ${puuid} (patch: ${patch ?? 'lifetime'})`,
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

  private async calculateTimelineComparison(
    heroPuuid: string,
    villainPuuid: string,
    filters: CompareFilters,
  ): Promise<TimelineComparisonDto> {
    const [heroMatches, villainMatches] = await Promise.all([
      this.getPlayerMatchesForTimeline(heroPuuid, filters),
      this.getPlayerMatchesForTimeline(villainPuuid, filters),
    ]);

    return {
      csGraph: {
        hero: this.calculateAverageTimeline(heroMatches, 'csGraph'),
        villain: this.calculateAverageTimeline(villainMatches, 'csGraph'),
      },
      goldGraph: {
        hero: this.calculateAverageTimeline(heroMatches, 'goldGraph'),
        villain: this.calculateAverageTimeline(villainMatches, 'goldGraph'),
      },
    };
  }

  private async getPlayerMatchesForTimeline(
    puuid: string,
    filters: CompareFilters,
  ): Promise<{ csGraph: number[]; goldGraph: number[] }[]> {
    const where: any = {
      puuid,
      match: { queueId: 420 },
    };

    if (filters.championId) {
      where.championId = filters.championId;
    }

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.patch) {
      where.match.gameVersion = { startsWith: filters.patch };
    }

    return this.prisma.matchParticipant.findMany({
      where,
      select: { csGraph: true, goldGraph: true },
      take: 100,
    });
  }

  private calculateAverageTimeline(
    matches: { csGraph: number[]; goldGraph: number[] }[],
    field: 'csGraph' | 'goldGraph',
  ): TimelinePointDto[] {
    if (matches.length === 0) {
      return [];
    }

    const maxMinutes = Math.max(...matches.map((m) => m[field].length));

    const result: TimelinePointDto[] = [];

    for (let minute = 0; minute < maxMinutes; minute++) {
      const values = matches
        .filter((m) => m[field].length > minute)
        .map((m) => m[field][minute]);

      if (values.length > 0) {
        const average = values.reduce((sum, v) => sum + v, 0) / values.length;
        result.push({ minute, value: Math.round(average) });
      }
    }

    return result;
  }

  private async calculateLaningMetrics(
    puuid: string,
    championId: number | undefined,
    patch: string | null,
  ): Promise<LaningPhaseDto> {
    if (championId) {
      const patchValue = patch as string;
      const stats = await this.prisma.playerChampionStats.findUnique({
        where: {
          puuid_championId_patch_queueId: {
            puuid,
            championId,
            patch: patchValue,
            queueId: 420,
          },
        },
        select: {
          avgCsd15: true,
          avgGd15: true,
          avgXpd15: true,
        },
      });

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

  private generateInsights(
    heroStats: ComparePlayerStatsDto,
    villainStats: ComparePlayerStatsDto,
    heroLaning: LaningPhaseDto,
    villainLaning: LaningPhaseDto,
  ): CompareInsightsDto {
    const advantages: string[] = [];
    const recommendations: string[] = [];

    // CS/min comparison (threshold: 10%)
    if (heroStats.avgCspm > 0 && villainStats.avgCspm > 0) {
      const csDiff =
        ((heroStats.avgCspm - villainStats.avgCspm) / villainStats.avgCspm) *
        100;
      if (csDiff > 10) {
        advantages.push(
          `Herói tem ${parseFloat(csDiff.toFixed(1))}% mais CS/min`,
        );
      } else if (csDiff < -10) {
        advantages.push(
          `Vilão tem ${parseFloat((-csDiff).toFixed(1))}% mais CS/min`,
        );
        recommendations.push('Herói deve melhorar farm e controle de wave');
      }
    }

    // CSD@15 comparison (threshold: 3 CS)
    const csd15Diff = heroLaning.avgCsd15 - villainLaning.avgCsd15;
    if (Math.abs(csd15Diff) > 3) {
      if (csd15Diff > 0) {
        advantages.push(
          `Herói tem +${parseFloat(csd15Diff.toFixed(1))} CSD@15`,
        );
      } else {
        advantages.push(
          `Vilão tem +${parseFloat((-csd15Diff).toFixed(1))} CSD@15`,
        );
        recommendations.push(
          'Herói deve focar em domínio de lane nos primeiros 15 min',
        );
      }
    }

    // Vision Score comparison (threshold: 5 points)
    const visionDiff = heroStats.avgVisionScore - villainStats.avgVisionScore;
    if (Math.abs(visionDiff) > 5) {
      if (visionDiff > 0) {
        advantages.push(
          `Herói tem +${parseFloat(visionDiff.toFixed(1))} vision score`,
        );
      } else {
        advantages.push(
          `Vilão tem +${parseFloat((-visionDiff).toFixed(1))} vision score`,
        );
        recommendations.push(
          'Herói deve comprar mais wards e melhorar vision control',
        );
      }
    }

    // DPM comparison (threshold: 10%)
    if (heroStats.avgDpm > 0 && villainStats.avgDpm > 0) {
      const dpmDiff =
        ((heroStats.avgDpm - villainStats.avgDpm) / villainStats.avgDpm) * 100;
      if (dpmDiff > 10) {
        advantages.push(
          `Herói tem ${parseFloat(dpmDiff.toFixed(1))}% mais DPM`,
        );
      } else if (dpmDiff < -10) {
        advantages.push(
          `Vilão tem ${parseFloat((-dpmDiff).toFixed(1))}% mais DPM`,
        );
        recommendations.push(
          'Herói deve participar mais de teamfights e buscar trades',
        );
      }
    }

    // KDA vs winrate paradox
    if (
      heroStats.avgKda > villainStats.avgKda &&
      heroStats.winRate < villainStats.winRate
    ) {
      recommendations.push(
        'Herói tem KDA superior mas winrate inferior — deve converter vantagens em objetivos',
      );
    } else if (
      villainStats.avgKda > heroStats.avgKda &&
      villainStats.winRate < heroStats.winRate
    ) {
      advantages.push(
        'Herói converte melhor suas vantagens em vitórias apesar de KDA inferior',
      );
    }

    // Winner by winRate
    const winner: 'hero' | 'villain' =
      heroStats.winRate >= villainStats.winRate ? 'hero' : 'villain';

    return { winner, advantages, recommendations };
  }
}
