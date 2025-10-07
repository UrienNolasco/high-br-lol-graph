import { Injectable } from '@nestjs/common';
import { DataDragonService } from 'src/core/data-dragon/data-dragon.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import {
  ChampionStatsDto,
  PaginatedChampionStatsDto,
} from './dto/champion-stats.dto';

@Injectable()
export class ApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataDragon: DataDragonService,
  ) {}

  async getChampionStats(
    patch: string,
    page: number,
    limit: number,
    sortBy: keyof ChampionStatsDto = 'winRate',
    order: 'asc' | 'desc' = 'desc',
  ): Promise<PaginatedChampionStatsDto> {
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
      const aValue = a[sortBy];
      const bValue = b[sortBy];

      if (aValue === bValue) return 0;

      if (order === 'desc') {
        return aValue > bValue ? -1 : 1;
      } else {
        return aValue < bValue ? -1 : 1;
      }
    });

    // 4. Aplicar a paginação.
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedData = enrichedStats.slice(startIndex, endIndex);

    return {
      data: paginatedData,
      total: enrichedStats.length,
      page: Number(page),
      limit: Number(limit),
    };
  }

  getChampion(championName: string, patch: string) {
    console.log({ championName, patch });
    return 'getChampion not implemented';
  }

  getMatchupStats(
    championA: string,
    championB: string,
    patch: string,
    role: string,
  ) {
    console.log({ championA, championB, patch, role });
    return 'getMatchupStats not implemented';
  }
}
