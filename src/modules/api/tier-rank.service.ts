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

    if (minor > 1) {
      minor -= 1;
    } else {
      major -= 1;
      minor = 24; // Assumindo que patches vão até 24
    }

    return `${major}.${minor}`;
  }

  /**
   * Infere a role primária de um campeão baseado em matchup_stats
   * Retorna a role com maior número de jogos no patch
   */
  async inferPrimaryRole(
    championId: number,
    patch: string,
  ): Promise<string | null> {
    const matchups = await this.prisma.matchupStats.findMany({
      where: {
        patch,
        OR: [{ championId1: championId }, { championId2: championId }],
      },
    });

    if (matchups.length === 0) {
      return null;
    }

    // Agrupar por role e somar gamesPlayed
    const roleGames = new Map<string, number>();
    for (const matchup of matchups) {
      const games = matchup.gamesPlayed;
      const current = roleGames.get(matchup.role) || 0;
      roleGames.set(matchup.role, current + games);
    }

    // Encontrar role com mais jogos
    let maxGames = 0;
    let primaryRole: string | null = null;
    for (const [role, games] of roleGames.entries()) {
      if (games > maxGames) {
        maxGames = games;
        primaryRole = role;
      }
    }

    return primaryRole;
  }

  /**
   * Calcula o total de jogos de uma role no patch usando matchup_stats
   */
  async getTotalGamesForRole(role: string, patch: string): Promise<number> {
    const matchups = await this.prisma.matchupStats.findMany({
      where: {
        patch,
        role,
      },
    });

    return matchups.reduce((sum, matchup) => sum + matchup.gamesPlayed, 0);
  }

  /**
   * Calcula o número de jogos de um campeão em uma role específica
   */
  async getChampionGamesInRole(
    championId: number,
    role: string,
    patch: string,
  ): Promise<number> {
    const matchups = await this.prisma.matchupStats.findMany({
      where: {
        patch,
        role,
        OR: [{ championId1: championId }, { championId2: championId }],
      },
    });

    return matchups.reduce((sum, matchup) => sum + matchup.gamesPlayed, 0);
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
    // WR: (winRate - 45) × 10
    const wrScore = Math.max(0, Math.min(100, (winRate - 45) * 10));

    // BR: banRate × 10
    const brScore = Math.max(0, Math.min(100, banRate * 10));

    // PR: já vem normalizado (0-100)
    const prScore = Math.max(0, Math.min(100, pickRate));

    // KDA: min((kda / 3.0) × 100, 100)
    const kdaScore = Math.min(100, (kda / 3.0) * 100);

    // DPM: (dpm / 1200) × 100
    const dpmScore = Math.max(0, Math.min(100, (dpm / 1200) * 100));

    // GPM: (gpm / 600) × 100
    const gpmScore = Math.max(0, Math.min(100, (gpm / 600) * 100));

    // CSPM: (cspm / 8.5) × 100
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
    // S+ Tier requer score >= 80 E winRate > 51% E banRate > 5%
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
    // Verificar dados insuficientes
    if (currentStats.gamesPlayed < 50) {
      return {
        score: 0,
        tier: 'Dados Insuficientes',
        hasInsufficientData: true,
      };
    }

    // Normalizar métricas do patch atual
    const currentNormalized = this.normalizeMetrics(
      currentStats.winRate,
      currentStats.banRate,
      currentStats.pickRate,
      currentStats.kda,
      currentStats.dpm,
      currentStats.gpm,
      currentStats.cspm,
    );

    // Calcular score base do patch atual
    const currentBaseScore = this.calculateBaseScore(
      currentNormalized.wrScore,
      currentNormalized.brScore,
      currentNormalized.prScore,
      currentNormalized.kdaScore,
      currentNormalized.dpmScore,
      currentNormalized.gpmScore,
      currentNormalized.cspmScore,
    );

    // Aplicar multiplicador de confiança
    const confidenceMultiplier = this.getConfidenceMultiplier(
      currentStats.gamesPlayed,
    );
    const currentAdjustedScore = currentBaseScore * confidenceMultiplier;

    // Se não há dados do patch anterior, usar apenas o atual
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

    // Normalizar métricas do patch anterior
    const previousNormalized = this.normalizeMetrics(
      previousStats.winRate,
      previousStats.banRate,
      previousStats.pickRate,
      previousStats.kda,
      previousStats.dpm,
      previousStats.gpm,
      previousStats.cspm,
    );

    // Calcular score base do patch anterior
    const previousBaseScore = this.calculateBaseScore(
      previousNormalized.wrScore,
      previousNormalized.brScore,
      previousNormalized.prScore,
      previousNormalized.kdaScore,
      previousNormalized.dpmScore,
      previousNormalized.gpmScore,
      previousNormalized.cspmScore,
    );

    // Aplicar multiplicador de confiança ao patch anterior
    const previousConfidenceMultiplier = this.getConfidenceMultiplier(
      previousStats.gamesPlayed,
    );
    const previousAdjustedScore =
      previousBaseScore * previousConfidenceMultiplier;

    // Média ponderada: 70% atual + 30% anterior
    let finalScore = currentAdjustedScore * 0.7 + previousAdjustedScore * 0.3;

    // Bônus/Penalidade de tendência
    const deltaWR = currentStats.winRate - previousStats.winRate;
    const deltaBR = currentStats.banRate - previousStats.banRate;

    if (deltaWR > 2 && deltaBR > 1) {
      finalScore += 5; // Campeão em ascensão
    } else if (deltaWR < -2 && deltaBR < -1) {
      finalScore -= 5; // Campeão em queda
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
}
