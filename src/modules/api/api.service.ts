import { Injectable, NotFoundException } from '@nestjs/common';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  ChampionStatsDto,
  PaginatedChampionStatsDto,
} from './dto/champion-stats.dto';
import { ChampionListDto, ChampionListItemDto } from './dto/champion-list.dto';
import { MatchupStatsDto } from './dto/matchup-stats.dto';

@Injectable()
export class ApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataDragon: DataDragonService,
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

    // 1. Buscar todos os campeões do patch no banco de dados.
    const championStats = await this.prisma.championStats.findMany({
      where: { patch },
    });

    // 2. Calcular a winRate para cada um e enriquecer com dados do DataDragon.
    const enrichedStatsPromises = championStats.map(async (stat) => {
      const championInfo = this.dataDragon.getChampionById(stat.championId);
      if (!championInfo) {
        return null;
      }

      const winRate =
        stat.gamesPlayed > 0 ? (stat.wins / stat.gamesPlayed) * 100 : 0;

      // getChampionImageUrls usa a versão completa (fullVersion) por padrão
      const images = await this.dataDragon.getChampionImageUrls(
        championInfo.id,
      );

      // Calcular novas métricas
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
      };
    });

    const enrichedStatsResults = await Promise.all(enrichedStatsPromises);
    const enrichedStats: ChampionStatsDto[] = enrichedStatsResults.filter(
      (stat): stat is ChampionStatsDto => stat !== null,
    );

    // 4. Ordenar o array resultante em memória.
    enrichedStats.sort((a, b) => {
      const aValue = a[currentSortBy];
      const bValue = b[currentSortBy];

      if (aValue === undefined || bValue === undefined) return 0;
      if (aValue === bValue) return 0;

      if (currentOrder === 'desc') {
        return aValue > bValue ? -1 : 1;
      } else {
        return aValue < bValue ? -1 : 1;
      }
    });

    // 5. Aplicar a paginação.
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

    const championStats = await this.prisma.championStats.findFirst({
      where: {
        championId: parseInt(championInfo.key, 10),
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

    // getChampionImageUrls usa a versão completa (fullVersion) por padrão
    const images = await this.dataDragon.getChampionImageUrls(championInfo.id);

    // Calcular novas métricas
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
        // getChampionImageUrls usa a versão completa (fullVersion) por padrão
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
}
