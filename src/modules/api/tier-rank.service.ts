import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface ChampionMetrics {
  winRate: number;
  banRate: number;
  pickRate: number;
  kda: number;
  dpm: number;
  gpm: number;
  cspm: number;
  gamesPlayed: number;
}

export interface ScoreResult {
  score: number;
  tier: string;
  hasInsufficientData: boolean;
}

/**
 * Service simplificado para cálculo de Tier List
 *
 * Agora o Worker popula a tabela ChampionStats incrementalmente.
 * Este service apenas lê os dados e calcula tiers/scores.
 */
@Injectable()
export class TierRankService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcula o patch anterior baseado no patch atual
   * Ex: 15.24 -> 15.23, 15.1 -> 14.24
   */
  getPreviousPatch(currentPatch: string): string | null {
    const parts = currentPatch.split('.');
    if (parts.length < 2) {
      return null;
    }

    let major = parseInt(parts[0], 10);
    let minor = parseInt(parts[1], 10);

    if (major <= 1 && minor <= 1) {
      return null;
    }

    if (minor > 1) {
      minor -= 1;
    } else {
      major -= 1;
      minor = 23;
    }

    return `${major}.${minor.toString().padStart(2, '0')}`;
  }

  /**
   * Normaliza métricas para escala 0-100 conforme especificação
   */
  private normalizeMetrics(
    winRate: number,
    banRate: number,
    pickRate: number,
    kda: number,
    dpm: number,
    gpm: number,
    cspm: number,
  ): {
    wrScore: number;
    brScore: number;
    prScore: number;
    kdaScore: number;
    dpmScore: number;
    gpmScore: number;
    cspmScore: number;
  } {
    const wrScore = Math.max(0, Math.min(100, (winRate - 45) * 10));
    const brScore = Math.max(0, Math.min(100, banRate * 10));
    const prScore = Math.max(0, Math.min(100, pickRate));
    const kdaScore = Math.min(100, (kda / 3.0) * 100);
    const dpmScore = Math.max(0, Math.min(100, (dpm / 1200) * 100));
    const gpmScore = Math.max(0, Math.min(100, (gpm / 600) * 100));
    const cspmScore = Math.max(0, Math.min(100, (cspm / 8.5) * 100));

    return {
      wrScore,
      brScore,
      prScore,
      kdaScore,
      dpmScore,
      gpmScore,
      cspmScore,
    };
  }

  /**
   * Calcula multiplicador de confiança baseado em sample size
   */
  private getConfidenceMultiplier(gamesPlayed: number): number {
    if (gamesPlayed >= 500) return 1.0;
    if (gamesPlayed >= 200) return 0.97;
    if (gamesPlayed >= 100) return 0.94;
    if (gamesPlayed >= 50) return 0.9;
    return 0; // Dados insuficientes
  }

  /**
   * Calcula score base usando pesos das métricas
   */
  private calculateBaseScore(
    wrScore: number,
    brScore: number,
    prScore: number,
    kdaScore: number,
    dpmScore: number,
    gpmScore: number,
    cspmScore: number,
  ): number {
    return (
      wrScore * 0.35 +
      brScore * 0.25 +
      prScore * 0.15 +
      kdaScore * 0.1 +
      dpmScore * 0.08 +
      gpmScore * 0.04 +
      cspmScore * 0.03
    );
  }

  /**
   * Converte score final em tier
   */
  private scoreToTier(score: number, winRate: number, banRate: number): string {
    if (score >= 80 && winRate > 51 && banRate > 5) {
      return 'S+';
    }
    if (score >= 70) return 'S';
    if (score >= 55) return 'A';
    if (score >= 40) return 'B';
    if (score >= 30) return 'C';
    return 'D';
  }

  /**
   * Calcula score final para um campeão considerando patch atual e anterior
   */
  calculateChampionScore(
    championId: number,
    currentPatch: string,
    currentStats: ChampionMetrics,
    previousStats: ChampionMetrics | null,
  ): ScoreResult {
    if (currentStats.gamesPlayed < 50) {
      return {
        score: 0,
        tier: 'Dados Insuficientes',
        hasInsufficientData: true,
      };
    }

    const currentNormalized = this.normalizeMetrics(
      currentStats.winRate,
      currentStats.banRate,
      currentStats.pickRate,
      currentStats.kda,
      currentStats.dpm,
      currentStats.gpm,
      currentStats.cspm,
    );

    const currentBaseScore = this.calculateBaseScore(
      currentNormalized.wrScore,
      currentNormalized.brScore,
      currentNormalized.prScore,
      currentNormalized.kdaScore,
      currentNormalized.dpmScore,
      currentNormalized.gpmScore,
      currentNormalized.cspmScore,
    );

    const confidenceMultiplier = this.getConfidenceMultiplier(
      currentStats.gamesPlayed,
    );
    const currentAdjustedScore = currentBaseScore * confidenceMultiplier;

    if (!previousStats || previousStats.gamesPlayed < 50) {
      const tier = this.scoreToTier(
        currentAdjustedScore,
        currentStats.winRate,
        currentStats.banRate,
      );
      return {
        score: currentAdjustedScore,
        tier,
        hasInsufficientData: false,
      };
    }

    const previousNormalized = this.normalizeMetrics(
      previousStats.winRate,
      previousStats.banRate,
      previousStats.pickRate,
      previousStats.kda,
      previousStats.dpm,
      previousStats.gpm,
      previousStats.cspm,
    );

    const previousBaseScore = this.calculateBaseScore(
      previousNormalized.wrScore,
      previousNormalized.brScore,
      previousNormalized.prScore,
      previousNormalized.kdaScore,
      previousNormalized.dpmScore,
      previousNormalized.gpmScore,
      previousNormalized.cspmScore,
    );

    const previousConfidenceMultiplier = this.getConfidenceMultiplier(
      previousStats.gamesPlayed,
    );
    const previousAdjustedScore =
      previousBaseScore * previousConfidenceMultiplier;

    let finalScore = currentAdjustedScore * 0.7 + previousAdjustedScore * 0.3;

    const deltaWR = currentStats.winRate - previousStats.winRate;
    const deltaBR = currentStats.banRate - previousStats.banRate;

    if (deltaWR > 2 && deltaBR > 1) {
      finalScore += 5;
    } else if (deltaWR < -2 && deltaBR < -1) {
      finalScore -= 5;
    }

    const tier = this.scoreToTier(
      finalScore,
      currentStats.winRate,
      currentStats.banRate,
    );

    return {
      score: finalScore,
      tier,
      hasInsufficientData: false,
    };
  }

  /**
   * Busca estatísticas do campeão para um patch específico
   * Agora lê da tabela ChampionStats populada pelo Worker
   */
  async getChampionStats(
    championId: number,
    patch: string,
    queueId: number,
  ): Promise<ChampionMetrics | null> {
    const stats = await this.prisma.championStats.findUnique({
      where: {
        championId_patch_queueId: {
          championId,
          patch,
          queueId,
        },
      },
    });

    if (!stats) {
      return null;
    }

    return {
      winRate: stats.winRate,
      banRate: stats.banRate,
      pickRate: stats.pickRate,
      kda: stats.kda,
      dpm: stats.dpm,
      gpm: stats.gpm,
      cspm: stats.cspm,
      gamesPlayed: stats.gamesPlayed,
    };
  }

  /**
   * Busca todas as estatísticas de campeões para um patch
   */
  async getAllChampionStats(patch: string, queueId?: number) {
    return this.prisma.championStats.findMany({
      where: {
        patch,
        ...(queueId && { queueId }),
      },
    });
  }
}
