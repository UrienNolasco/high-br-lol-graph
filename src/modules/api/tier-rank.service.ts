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

    const roleGames = new Map<string, number>();
    for (const matchup of matchups) {
      const games = matchup.gamesPlayed;
      const current = roleGames.get(matchup.role) || 0;
      roleGames.set(matchup.role, current + games);
    }

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
   * Processa todos os matchups de um patch e retorna estruturas de dados otimizadas
   * para cálculo de roles primárias, games por role, etc.
   */
  processMatchupsForPatch(
    matchups: Array<{
      championId1: number;
      championId2: number;
      role: string;
      gamesPlayed: number;
    }>,
  ): {
    primaryRolesByChampion: Map<number, string>;
    gamesByChampionAndRole: Map<number, Map<string, number>>;
    totalGamesByRole: Map<string, number>;
  } {
    const gamesByChampionAndRole = new Map<number, Map<string, number>>();
    const totalGamesByRole = new Map<string, number>();

    for (const matchup of matchups) {
      const currentTotal = totalGamesByRole.get(matchup.role) || 0;
      totalGamesByRole.set(matchup.role, currentTotal + matchup.gamesPlayed);

      if (!gamesByChampionAndRole.has(matchup.championId1)) {
        gamesByChampionAndRole.set(matchup.championId1, new Map());
      }
      const champ1RoleMap = gamesByChampionAndRole.get(matchup.championId1)!;
      const champ1Current = champ1RoleMap.get(matchup.role) || 0;
      champ1RoleMap.set(matchup.role, champ1Current + matchup.gamesPlayed);

      if (!gamesByChampionAndRole.has(matchup.championId2)) {
        gamesByChampionAndRole.set(matchup.championId2, new Map());
      }
      const champ2RoleMap = gamesByChampionAndRole.get(matchup.championId2)!;
      const champ2Current = champ2RoleMap.get(matchup.role) || 0;
      champ2RoleMap.set(matchup.role, champ2Current + matchup.gamesPlayed);
    }

    const primaryRolesByChampion = new Map<number, string>();
    for (const [championId, roleMap] of gamesByChampionAndRole.entries()) {
      let maxGames = 0;
      let primaryRole: string | null = null;
      for (const [role, games] of roleMap.entries()) {
        if (games > maxGames) {
          maxGames = games;
          primaryRole = role;
        }
      }
      if (primaryRole) {
        primaryRolesByChampion.set(championId, primaryRole);
      }
    }

    return {
      primaryRolesByChampion,
      gamesByChampionAndRole,
      totalGamesByRole,
    };
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
}
