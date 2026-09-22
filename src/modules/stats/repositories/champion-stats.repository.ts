import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { championAverages } from '../../../core/stats/aggregate.mapper';
@Injectable()
export class ChampionStatsRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findManyByPatch(patch: string) {
    return (
      await this.prisma.championStats.findMany({
        where: { patch, queueId: 420 },
      })
    ).map(championAverages);
  }
  async findByChampionIdAndPatch(championId: number, patch: string) {
    return this.findUnique(championId, patch, 420);
  }
  async findUnique(championId: number, patch: string, queueId: number) {
    const row = await this.prisma.championStats.findUnique({
      where: { championId_patch_queueId: { championId, patch, queueId } },
    });
    return row ? championAverages(row) : null;
  }
  async findQualifiedStats(patch: string, minGames: number) {
    return (
      await this.prisma.championStats.findMany({
        where: { patch, queueId: 420, gamesPlayed: { gte: minGames } },
      })
    ).map(championAverages);
  }
}
