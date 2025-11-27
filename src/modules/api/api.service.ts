import { Injectable, NotFoundException } from '@nestjs/common';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  ChampionStatsDto,
  PaginatedChampionStatsDto,
} from './dto/champion-stats.dto';
import { ChampionListDto, ChampionListItemDto } from './dto/champion-list.dto';

@Injectable()
export class ApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataDragon: DataDragonService,
  ) {}

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
    const enrichedStats: ChampionStatsDto[] = championStats
      .map((stat) => {
        const championInfo = this.dataDragon.getChampionById(stat.championId);
        const winRate =
          stat.gamesPlayed > 0 ? (stat.wins / stat.gamesPlayed) * 100 : 0;

        return {
          championId: stat.championId,
          championName: championInfo ? championInfo.name : 'Unknown',
          winRate: parseFloat(winRate.toFixed(2)),
          gamesPlayed: stat.gamesPlayed,
          wins: stat.wins,
          losses: stat.gamesPlayed - stat.wins,
        };
      })
      .filter((stat) => stat.championName !== 'Unknown');

    // 3. Ordenar o array resultante em memória.
    enrichedStats.sort((a, b) => {
      const aValue = a[currentSortBy];
      const bValue = b[currentSortBy];

      if (aValue === bValue) return 0;

      if (currentOrder === 'desc') {
        return aValue > bValue ? -1 : 1;
      } else {
        return aValue < bValue ? -1 : 1;
      }
    });

    // 4. Aplicar a paginação.
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

    return {
      championId: championStats.championId,
      championName: championInfo.name,
      winRate: parseFloat(winRate.toFixed(2)),
      gamesPlayed: championStats.gamesPlayed,
      wins: championStats.wins,
      losses: championStats.gamesPlayed - championStats.wins,
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

    return {
      championA: {
        name: championAInfo.name,
        wins: championAWins,
        winRate: parseFloat(championAWinRate.toFixed(2)),
      },
      championB: {
        name: championBInfo.name,
        wins: matchup.gamesPlayed - championAWins,
        winRate: parseFloat(championBWinRate.toFixed(2)),
      },
      gamesPlayed: matchup.gamesPlayed,
      patch: matchup.patch,
      role: matchup.role,
    };
  }

  getAllChampions(): ChampionListDto {
    const champions = this.dataDragon.getAllChampions();

    const championList: ChampionListItemDto[] = champions.map((champion) => ({
      name: champion.name,
      id: champion.id,
      key: parseInt(champion.key, 10),
      title: champion.title,
      version: champion.version,
    }));

    return {
      champions: championList,
      total: championList.length,
    };
  }

  async getCurrentPatch() {
    const versions = await this.dataDragon.getVersions();
    const latestVersion = versions[0];
    const patch = await this.dataDragon.getCurrentPatch();

    return {
      patch,
      fullVersion: latestVersion,
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
