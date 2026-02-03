// @ts-nocheck - TODO: TEMPORARIAMENTE DESABILITADO - Este arquivo usa modelos antigos do Prisma (championStats, processedMatch, matchupStats)
// que foram substituídos pelo novo schema (Match, MatchParticipant, MatchTeam).
// Aguardando atualização para usar o novo schema.

import { Injectable, NotFoundException } from '@nestjs/common';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  ChampionStatsDto,
  PaginatedChampionStatsDto,
} from './dto/champion-stats.dto';
import { ChampionListDto, ChampionListItemDto } from './dto/champion-list.dto';
import { MatchupStatsDto } from './dto/matchup-stats.dto';
import { TierRankService, ChampionMetrics } from './tier-rank.service';

@Injectable()
export class ApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataDragon: DataDragonService,
    private readonly tierRankService: TierRankService,
  ) {}

  /**
   * Calcula KDA (Kills + Assists) / Deaths
   * Se totalDeaths for 0, retorna totalKills + totalAssists
   */
  private calculateKDA(
    totalKills: number,
    totalDeaths: number,
    totalAssists: number,
  ): number {
    if (totalDeaths === 0) {
      return totalKills + totalAssists;
    }
    return (totalKills + totalAssists) / totalDeaths;
  }

  /**
   * Calcula DPM (Dano por Minuto)
   * totalDamageDealt / (totalDuration / 60)
   */
  private calculateDPM(
    totalDamageDealt: bigint,
    totalDuration: number,
  ): number {
    if (totalDuration === 0) {
      return 0;
    }
    const minutes = totalDuration / 60;
    return Number(totalDamageDealt) / minutes;
  }

  /**
   * Calcula CSPM (Farm por Minuto)
   * totalCreepScore / (totalDuration / 60)
   */
  private calculateCSPM(
    totalCreepScore: number,
    totalDuration: number,
  ): number {
    if (totalDuration === 0) {
      return 0;
    }
    const minutes = totalDuration / 60;
    return totalCreepScore / minutes;
  }

  /**
   * Calcula GPM (Ouro por Minuto)
   * totalGoldEarned / (totalDuration / 60)
   */
  private calculateGPM(totalGoldEarned: bigint, totalDuration: number): number {
    if (totalDuration === 0) {
      return 0;
    }
    const minutes = totalDuration / 60;
    return Number(totalGoldEarned) / minutes;
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

    const [championStats, totalMatches, allMatchups, previousPatch] =
      await Promise.all([
        this.prisma.championStats.findMany({ where: { patch } }),
        this.prisma.processedMatch.count({ where: { patch } }),
        this.prisma.matchupStats.findMany({ where: { patch } }),
        Promise.resolve(this.tierRankService.getPreviousPatch(patch)),
      ]);

    const [previousChampionStats, previousTotalMatches, previousMatchups] =
      await Promise.all([
        previousPatch
          ? this.prisma.championStats.findMany({
              where: { patch: previousPatch },
            })
          : Promise.resolve([]),
        previousPatch
          ? this.prisma.processedMatch.count({
              where: { patch: previousPatch },
            })
          : Promise.resolve(0),
        previousPatch
          ? this.prisma.matchupStats.findMany({
              where: { patch: previousPatch },
            })
          : Promise.resolve([]),
      ]);

    const matchupData =
      this.tierRankService.processMatchupsForPatch(allMatchups);
    const primaryRolesByChampion = matchupData.primaryRolesByChampion;
    const gamesByChampionAndRole = matchupData.gamesByChampionAndRole;
    const totalGamesByRole = matchupData.totalGamesByRole;

    const previousMatchupData = previousPatch
      ? this.tierRankService.processMatchupsForPatch(previousMatchups)
      : null;

    const previousChampionStatsMap = new Map<
      number,
      (typeof championStats)[0]
    >();
    for (const stat of previousChampionStats) {
      previousChampionStatsMap.set(stat.championId, stat);
    }

    const totalBanSlots = totalMatches * 10;
    const previousTotalBanSlots = previousTotalMatches * 10;

    const enrichedStatsPromises = championStats.map(async (stat) => {
      const championInfo = this.dataDragon.getChampionById(stat.championId);
      if (!championInfo) {
        return null;
      }

      const winRate =
        stat.gamesPlayed > 0 ? (stat.wins / stat.gamesPlayed) * 100 : 0;

      const images = await this.dataDragon.getChampionImageUrls(
        championInfo.id,
      );

      const kda = this.calculateKDA(
        stat.totalKills ?? 0,
        stat.totalDeaths ?? 0,
        stat.totalAssists ?? 0,
      );
      const dpm = this.calculateDPM(
        stat.totalDamageDealt ?? BigInt(0),
        stat.totalDuration ?? 0,
      );
      const cspm = this.calculateCSPM(
        stat.totalCreepScore ?? 0,
        stat.totalDuration ?? 0,
      );
      const gpm = this.calculateGPM(
        stat.totalGoldEarned ?? BigInt(0),
        stat.totalDuration ?? 0,
      );

      const banRate =
        totalBanSlots > 0 ? ((stat.bans ?? 0) / totalBanSlots) * 100 : 0;

      const primaryRole: string | null =
        primaryRolesByChampion.get(stat.championId) ?? null;

      let pickRate = 0;
      if (primaryRole) {
        const championRoleMap = gamesByChampionAndRole.get(stat.championId);
        const championGamesInRole = championRoleMap?.get(primaryRole) ?? 0;
        const totalGamesInRole = totalGamesByRole.get(primaryRole) ?? 0;
        if (totalGamesInRole > 0) {
          pickRate = (championGamesInRole / totalGamesInRole) * 100;
        }
      }

      const previousStat = previousChampionStatsMap.get(stat.championId);
      let previousStats: ChampionMetrics | null = null;
      if (previousStat && previousMatchupData) {
        const previousWinRate =
          previousStat.gamesPlayed > 0
            ? (previousStat.wins / previousStat.gamesPlayed) * 100
            : 0;
        const previousBanRate =
          previousTotalBanSlots > 0
            ? ((previousStat.bans ?? 0) / previousTotalBanSlots) * 100
            : 0;

        const previousKda = this.calculateKDA(
          previousStat.totalKills ?? 0,
          previousStat.totalDeaths ?? 0,
          previousStat.totalAssists ?? 0,
        );
        const previousDpm = this.calculateDPM(
          previousStat.totalDamageDealt ?? BigInt(0),
          previousStat.totalDuration ?? 0,
        );
        const previousCspm = this.calculateCSPM(
          previousStat.totalCreepScore ?? 0,
          previousStat.totalDuration ?? 0,
        );
        const previousGpm = this.calculateGPM(
          previousStat.totalGoldEarned ?? BigInt(0),
          previousStat.totalDuration ?? 0,
        );

        let previousPickRate = 0;
        if (primaryRole && previousMatchupData) {
          const previousChampionRoleMap =
            previousMatchupData.gamesByChampionAndRole.get(stat.championId);
          const previousChampionGamesInRole =
            previousChampionRoleMap?.get(primaryRole) ?? 0;
          const previousTotalGamesInRole =
            previousMatchupData.totalGamesByRole.get(primaryRole) ?? 0;
          if (previousTotalGamesInRole > 0) {
            previousPickRate =
              (previousChampionGamesInRole / previousTotalGamesInRole) * 100;
          }
        }

        previousStats = {
          winRate: previousWinRate,
          banRate: previousBanRate,
          pickRate: previousPickRate,
          kda: previousKda,
          dpm: previousDpm,
          gpm: previousGpm,
          cspm: previousCspm,
          gamesPlayed: previousStat.gamesPlayed,
        };
      }

      const scoreResult = this.tierRankService.calculateChampionScore(
        stat.championId,
        patch,
        {
          winRate,
          banRate,
          pickRate,
          kda,
          dpm,
          gpm,
          cspm,
          gamesPlayed: stat.gamesPlayed,
        },
        previousStats,
      );

      return {
        championId: stat.championId,
        championName: championInfo.name,
        winRate: parseFloat(winRate.toFixed(2)),
        gamesPlayed: stat.gamesPlayed,
        wins: stat.wins,
        losses: stat.gamesPlayed - stat.wins,
        images,
        kda: parseFloat(kda.toFixed(2)),
        dpm: parseFloat(dpm.toFixed(2)),
        cspm: parseFloat(cspm.toFixed(2)),
        gpm: parseFloat(gpm.toFixed(2)),
        banRate: parseFloat(banRate.toFixed(2)),
        pickRate: parseFloat(pickRate.toFixed(2)),
        tier: scoreResult.tier,
        rank: null as number | null,
        score: scoreResult.score,
        primaryRole: primaryRole ?? undefined,
        hasInsufficientData: scoreResult.hasInsufficientData,
      };
    });

    const enrichedStatsResults = await Promise.all(enrichedStatsPromises);
    const enrichedStatsWithScore = enrichedStatsResults.filter(
      (stat): stat is (typeof enrichedStatsResults)[0] & { score: number } =>
        stat !== null,
    );

    const championsByRole = new Map<string, typeof enrichedStatsWithScore>();
    for (const champion of enrichedStatsWithScore) {
      const role = champion.primaryRole ?? 'UNKNOWN';
      if (!championsByRole.has(role)) {
        championsByRole.set(role, []);
      }
      const roleChampions = championsByRole.get(role);
      if (roleChampions) {
        roleChampions.push(champion);
      }
    }

    for (const [, champions] of championsByRole.entries()) {
      const validChampions = champions.filter((c) => !c.hasInsufficientData);
      const insufficientChampions = champions.filter(
        (c) => c.hasInsufficientData,
      );

      validChampions.sort((a, b) => b.score - a.score);

      validChampions.forEach((champion, index) => {
        champion.rank = index + 1;
      });

      insufficientChampions.forEach((champion) => {
        champion.rank = null;
      });
    }

    const enrichedStats: ChampionStatsDto[] = enrichedStatsWithScore.map(
      (champion) => ({
        championId: champion.championId,
        championName: champion.championName,
        winRate: champion.winRate,
        gamesPlayed: champion.gamesPlayed,
        wins: champion.wins,
        losses: champion.losses,
        images: champion.images,
        kda: champion.kda,
        dpm: champion.dpm,
        cspm: champion.cspm,
        gpm: champion.gpm,
        banRate: champion.banRate,
        pickRate: champion.pickRate,
        tier: champion.tier,
        rank: champion.rank,
        primaryRole: champion.primaryRole,
      }),
    );

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
    const endIndex = currentPage * currentLimit;
    const paginatedData = enrichedStats.slice(startIndex, endIndex);

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
    const championStats = await this.prisma.championStats.findFirst({
      where: {
        championId,
        patch: patch,
      },
    });

    if (!championStats) {
      throw new NotFoundException(
        `Stats for champion ${championName} not found on patch ${patch}`,
      );
    }

    const winRate =
      championStats.gamesPlayed > 0
        ? (championStats.wins / championStats.gamesPlayed) * 100
        : 0;

    const images = await this.dataDragon.getChampionImageUrls(championInfo.id);

    const kda = this.calculateKDA(
      championStats.totalKills ?? 0,
      championStats.totalDeaths ?? 0,
      championStats.totalAssists ?? 0,
    );
    const dpm = this.calculateDPM(
      championStats.totalDamageDealt ?? BigInt(0),
      championStats.totalDuration ?? 0,
    );
    const cspm = this.calculateCSPM(
      championStats.totalCreepScore ?? 0,
      championStats.totalDuration ?? 0,
    );
    const gpm = this.calculateGPM(
      championStats.totalGoldEarned ?? BigInt(0),
      championStats.totalDuration ?? 0,
    );

    const totalMatches = await this.prisma.processedMatch.count({
      where: { patch },
    });
    const totalBanSlots = totalMatches * 10;
    const banRate =
      totalBanSlots > 0 ? ((championStats.bans ?? 0) / totalBanSlots) * 100 : 0;

    // Inferir role primária
    const primaryRole = await this.tierRankService.inferPrimaryRole(
      championId,
      patch,
    );

    let allMatchupsInRole: Array<{
      championId1: number;
      championId2: number;
      gamesPlayed: number;
    }> = [];
    let totalGamesInRole = 0;
    let championGamesInRole = 0;

    if (primaryRole) {
      allMatchupsInRole = await this.prisma.matchupStats.findMany({
        where: {
          patch,
          role: primaryRole,
        },
      });

      totalGamesInRole = allMatchupsInRole.reduce(
        (sum, matchup) => sum + matchup.gamesPlayed,
        0,
      );

      for (const matchup of allMatchupsInRole) {
        if (
          matchup.championId1 === championId ||
          matchup.championId2 === championId
        ) {
          championGamesInRole += matchup.gamesPlayed;
        }
      }
    }

    let pickRate = 0;
    if (totalGamesInRole > 0) {
      pickRate = (championGamesInRole / totalGamesInRole) * 100;
    }

    const previousPatch = this.tierRankService.getPreviousPatch(patch);
    let previousStats: ChampionMetrics | null = null;
    let previousMatchupsInRole: typeof allMatchupsInRole = [];
    let previousTotalGamesInRole = 0;
    let previousChampionGamesInRole = 0;

    if (previousPatch) {
      const previousStat = await this.prisma.championStats.findFirst({
        where: {
          championId,
          patch: previousPatch,
        },
      });

      if (primaryRole) {
        previousMatchupsInRole = await this.prisma.matchupStats.findMany({
          where: {
            patch: previousPatch,
            role: primaryRole,
          },
        });

        previousTotalGamesInRole = previousMatchupsInRole.reduce(
          (sum, matchup) => sum + matchup.gamesPlayed,
          0,
        );

        for (const matchup of previousMatchupsInRole) {
          if (
            matchup.championId1 === championId ||
            matchup.championId2 === championId
          ) {
            previousChampionGamesInRole += matchup.gamesPlayed;
          }
        }
      }

      if (previousStat) {
        const previousWinRate =
          previousStat.gamesPlayed > 0
            ? (previousStat.wins / previousStat.gamesPlayed) * 100
            : 0;
        const previousTotalMatches = await this.prisma.processedMatch.count({
          where: { patch: previousPatch },
        });
        const previousTotalBanSlots = previousTotalMatches * 10;
        const previousBanRate =
          previousTotalBanSlots > 0
            ? ((previousStat.bans ?? 0) / previousTotalBanSlots) * 100
            : 0;

        const previousKda = this.calculateKDA(
          previousStat.totalKills ?? 0,
          previousStat.totalDeaths ?? 0,
          previousStat.totalAssists ?? 0,
        );
        const previousDpm = this.calculateDPM(
          previousStat.totalDamageDealt ?? BigInt(0),
          previousStat.totalDuration ?? 0,
        );
        const previousCspm = this.calculateCSPM(
          previousStat.totalCreepScore ?? 0,
          previousStat.totalDuration ?? 0,
        );
        const previousGpm = this.calculateGPM(
          previousStat.totalGoldEarned ?? BigInt(0),
          previousStat.totalDuration ?? 0,
        );

        let previousPickRate = 0;
        if (previousTotalGamesInRole > 0) {
          previousPickRate =
            (previousChampionGamesInRole / previousTotalGamesInRole) * 100;
        }

        previousStats = {
          winRate: previousWinRate,
          banRate: previousBanRate,
          pickRate: previousPickRate,
          kda: previousKda,
          dpm: previousDpm,
          gpm: previousGpm,
          cspm: previousCspm,
          gamesPlayed: previousStat.gamesPlayed,
        };
      }
    }

    const scoreResult = this.tierRankService.calculateChampionScore(
      championId,
      patch,
      {
        winRate,
        banRate,
        pickRate,
        kda,
        dpm,
        gpm,
        cspm,
        gamesPlayed: championStats.gamesPlayed,
      },
      previousStats,
    );

    let rank: number | null = null;
    if (
      !scoreResult.hasInsufficientData &&
      primaryRole &&
      allMatchupsInRole.length > 0
    ) {
      const championIdsInRole = new Set<number>();
      for (const matchup of allMatchupsInRole) {
        championIdsInRole.add(matchup.championId1);
        championIdsInRole.add(matchup.championId2);
      }

      const roleChampionStats = await this.prisma.championStats.findMany({
        where: {
          patch,
          championId: { in: Array.from(championIdsInRole) },
          gamesPlayed: { gte: 50 },
        },
      });

      const previousRoleStatsMap = new Map<
        number,
        (typeof roleChampionStats)[0]
      >();
      if (previousPatch) {
        const previousRoleStats = await this.prisma.championStats.findMany({
          where: {
            patch: previousPatch,
            championId: { in: Array.from(championIdsInRole) },
            gamesPlayed: { gte: 50 },
          },
        });
        for (const stat of previousRoleStats) {
          previousRoleStatsMap.set(stat.championId, stat);
        }
      }

      const previousTotalMatches = previousPatch
        ? await this.prisma.processedMatch.count({
            where: { patch: previousPatch },
          })
        : 0;
      const previousTotalBanSlots = previousTotalMatches * 10;

      const championGamesInRoleMap = new Map<number, number>();
      for (const matchup of allMatchupsInRole) {
        const current1 = championGamesInRoleMap.get(matchup.championId1) || 0;
        championGamesInRoleMap.set(
          matchup.championId1,
          current1 + matchup.gamesPlayed,
        );
        const current2 = championGamesInRoleMap.get(matchup.championId2) || 0;
        championGamesInRoleMap.set(
          matchup.championId2,
          current2 + matchup.gamesPlayed,
        );
      }

      // Reutilizar matchups do patch anterior já carregados anteriormente
      // previousMatchupsInRole e previousTotalGamesInRole já foram calculados acima
      const previousChampionGamesInRoleMap = new Map<number, number>();
      if (previousPatch && previousMatchupsInRole.length > 0) {
        for (const matchup of previousMatchupsInRole) {
          const current1 =
            previousChampionGamesInRoleMap.get(matchup.championId1) || 0;
          previousChampionGamesInRoleMap.set(
            matchup.championId1,
            current1 + matchup.gamesPlayed,
          );
          const current2 =
            previousChampionGamesInRoleMap.get(matchup.championId2) || 0;
          previousChampionGamesInRoleMap.set(
            matchup.championId2,
            current2 + matchup.gamesPlayed,
          );
        }
      }

      const roleChampionsScores = roleChampionStats.map((stat) => {
        const wr =
          stat.gamesPlayed > 0 ? (stat.wins / stat.gamesPlayed) * 100 : 0;
        const br =
          totalBanSlots > 0 ? ((stat.bans ?? 0) / totalBanSlots) * 100 : 0;

        const kdaValue = this.calculateKDA(
          stat.totalKills ?? 0,
          stat.totalDeaths ?? 0,
          stat.totalAssists ?? 0,
        );
        const dpmValue = this.calculateDPM(
          stat.totalDamageDealt ?? BigInt(0),
          stat.totalDuration ?? 0,
        );
        const cspmValue = this.calculateCSPM(
          stat.totalCreepScore ?? 0,
          stat.totalDuration ?? 0,
        );
        const gpmValue = this.calculateGPM(
          stat.totalGoldEarned ?? BigInt(0),
          stat.totalDuration ?? 0,
        );

        const champGamesInRole =
          championGamesInRoleMap.get(stat.championId) || 0;
        const pr =
          totalGamesInRole > 0
            ? (champGamesInRole / totalGamesInRole) * 100
            : 0;

        let prevStats: ChampionMetrics | null = null;
        const prevStat = previousRoleStatsMap.get(stat.championId);
        if (prevStat) {
          const prevWR =
            prevStat.gamesPlayed > 0
              ? (prevStat.wins / prevStat.gamesPlayed) * 100
              : 0;
          const prevBR =
            previousTotalBanSlots > 0
              ? ((prevStat.bans ?? 0) / previousTotalBanSlots) * 100
              : 0;

          const prevKda = this.calculateKDA(
            prevStat.totalKills ?? 0,
            prevStat.totalDeaths ?? 0,
            prevStat.totalAssists ?? 0,
          );
          const prevDpm = this.calculateDPM(
            prevStat.totalDamageDealt ?? BigInt(0),
            prevStat.totalDuration ?? 0,
          );
          const prevCspm = this.calculateCSPM(
            prevStat.totalCreepScore ?? 0,
            prevStat.totalDuration ?? 0,
          );
          const prevGpm = this.calculateGPM(
            prevStat.totalGoldEarned ?? BigInt(0),
            prevStat.totalDuration ?? 0,
          );

          const prevChampGamesInRole =
            previousChampionGamesInRoleMap.get(stat.championId) || 0;
          const prevPR =
            previousTotalGamesInRole > 0
              ? (prevChampGamesInRole / previousTotalGamesInRole) * 100
              : 0;

          prevStats = {
            winRate: prevWR,
            banRate: prevBR,
            pickRate: prevPR,
            kda: prevKda,
            dpm: prevDpm,
            gpm: prevGpm,
            cspm: prevCspm,
            gamesPlayed: prevStat.gamesPlayed,
          };
        }

        const result = this.tierRankService.calculateChampionScore(
          stat.championId,
          patch,
          {
            winRate: wr,
            banRate: br,
            pickRate: pr,
            kda: kdaValue,
            dpm: dpmValue,
            gpm: gpmValue,
            cspm: cspmValue,
            gamesPlayed: stat.gamesPlayed,
          },
          prevStats,
        );

        return {
          championId: stat.championId,
          score: result.score,
          hasInsufficientData: result.hasInsufficientData,
        };
      });

      const validScores = roleChampionsScores
        .filter((s) => !s.hasInsufficientData)
        .sort((a, b) => b.score - a.score);

      const championIndex = validScores.findIndex(
        (s) => s.championId === championId,
      );
      if (championIndex !== -1) {
        rank = championIndex + 1;
      }
    }

    return {
      championId: championStats.championId,
      championName: championInfo.name,
      winRate: parseFloat(winRate.toFixed(2)),
      gamesPlayed: championStats.gamesPlayed,
      wins: championStats.wins,
      losses: championStats.gamesPlayed - championStats.wins,
      images,
      kda: parseFloat(kda.toFixed(2)),
      dpm: parseFloat(dpm.toFixed(2)),
      cspm: parseFloat(cspm.toFixed(2)),
      gpm: parseFloat(gpm.toFixed(2)),
      banRate: parseFloat(banRate.toFixed(2)),
      pickRate: parseFloat(pickRate.toFixed(2)),
      tier: scoreResult.tier,
      rank,
      primaryRole: primaryRole ?? undefined,
    };
  }

  async getMatchupStats(
    championA: string,
    championB: string,
    patch: string,
    role: string,
  ) {
    const championAInfo = this.dataDragon.getChampionByName(championA);
    const championBInfo = this.dataDragon.getChampionByName(championB);

    if (!championAInfo) {
      throw new NotFoundException(`Champion ${championA} not found`);
    }

    if (!championBInfo) {
      throw new NotFoundException(`Champion ${championB} not found`);
    }

    const championAId = parseInt(championAInfo.key, 10);
    const championBId = parseInt(championBInfo.key, 10);

    const matchup = await this.prisma.matchupStats.findFirst({
      where: {
        patch,
        role,
        OR: [
          {
            championId1: championAId,
            championId2: championBId,
          },
          {
            championId1: championBId,
            championId2: championAId,
          },
        ],
      },
    });

    if (!matchup) {
      throw new NotFoundException(
        `Matchup stats for ${championA} vs ${championB} in role ${role} on patch ${patch} not found`,
      );
    }

    let championAWins = 0;
    if (matchup.championId1 === championAId) {
      championAWins = matchup.champion1Wins;
    } else {
      championAWins = matchup.gamesPlayed - matchup.champion1Wins;
    }

    const championAWinRate = (championAWins / matchup.gamesPlayed) * 100;
    const championBWinRate = 100 - championAWinRate;

    // getChampionImageUrls usa a versão completa (fullVersion) por padrão
    const championAImages = await this.dataDragon.getChampionImageUrls(
      championAInfo.id,
    );
    const championBImages = await this.dataDragon.getChampionImageUrls(
      championBInfo.id,
    );

    const result: MatchupStatsDto = {
      championA: {
        name: championAInfo.name,
        images: championAImages,
        wins: championAWins,
        winRate: parseFloat(championAWinRate.toFixed(2)),
      },
      championB: {
        name: championBInfo.name,
        images: championBImages,
        wins: matchup.gamesPlayed - championAWins,
        winRate: parseFloat(championBWinRate.toFixed(2)),
      },
      gamesPlayed: matchup.gamesPlayed,
      patch: matchup.patch,
      role: matchup.role,
    };

    return result;
  }

  async getAllChampions(): Promise<ChampionListDto> {
    const champions = this.dataDragon.getAllChampions();

    const championList: ChampionListItemDto[] = await Promise.all(
      champions.map(async (champion) => {
        const images = await this.dataDragon.getChampionImageUrls(champion.id);

        return {
          name: champion.name,
          id: champion.id,
          key: parseInt(champion.key, 10),
          title: champion.title,
          version: champion.version,
          images,
        };
      }),
    );

    return {
      champions: championList,
      total: championList.length,
    };
  }

  async getCurrentPatch() {
    const versions = await this.dataDragon.getVersions();

    const patches = versions.map((fullVersion) => {
      const patchParts = fullVersion.split('.');
      let patch: string;
      if (patchParts.length >= 2) {
        patch = `${patchParts[0]}.${patchParts[1]}`;
      } else {
        patch = fullVersion;
      }

      return {
        patch,
        fullVersion,
      };
    });

    return {
      patches,
      current: patches[0],
    };
  }

  async getProcessedMatches(
    patch?: string,
  ): Promise<{ count: number; patch?: string; message?: string }> {
    if (patch) {
      const count = await this.prisma.processedMatch.count({
        where: {
          patch: patch,
        },
      });
      if (count === 0) {
        return {
          count: 0,
          patch: patch,
          message: `Não há dados para o patch ${patch}`,
        };
      }
      return {
        count,
        patch: patch,
      };
    }
    const totalCount = await this.prisma.processedMatch.count();
    return {
      count: totalCount,
    };
  }

  // ========== NOVOS MÉTODOS - Schema V2 ==========

  /**
   * Busca histórico de partidas de um jogador (LEVE - sem gráficos)
   * Otimizado para mobile: retorna apenas dados essenciais para lista
   */
  async getPlayerMatches(
    puuid: string,
    take: number,
    cursor?: string,
  ): Promise<any[]> {
    return this.prisma.matchParticipant.findMany({
      where: {
        puuid,
        ...(cursor ? { matchId: { lt: cursor } } : {}),
      },
      select: {
        matchId: true,
        match: {
          select: {
            gameCreation: true,
            gameDuration: true,
            queueId: true,
          },
        },
        championName: true,
        championId: true,
        win: true,
        kills: true,
        deaths: true,
        assists: true,
        kda: true,
      },
      orderBy: { matchId: 'desc' },
      take,
    });
  }

  /**
   * Busca partidas de um jogador por página (alternativa ao cursor)
   */
  async getPlayerMatchesByPage(
    puuid: string,
    page: number,
    limit: number,
  ): Promise<any[]> {
    const skip = (page - 1) * limit;

    return this.prisma.matchParticipant.findMany({
      where: { puuid },
      select: {
        matchId: true,
        match: {
          select: {
            gameCreation: true,
            gameDuration: true,
            queueId: true,
          },
        },
        championName: true,
        championId: true,
        win: true,
        kills: true,
        deaths: true,
        assists: true,
        kda: true,
      },
      orderBy: { matchId: 'desc' },
      skip,
      take: limit,
    });
  }

  /**
   * Busca detalhes completos de uma partida (PESADO - com gráficos)
   * Retorna todos os dados incluindo séries temporais e posições
   */
  async getMatchDetails(matchId: string): Promise<any> {
    return this.prisma.match.findUnique({
      where: { matchId },
      include: {
        teams: true,
        participants: true,
      },
    });
  }
}
