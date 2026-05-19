import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class ChampionStatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findManyByPatch(patch: string) {
    return this.prisma.championStats.findMany({ where: { patch } });
  }

  async findByChampionIdAndPatch(championId: number, patch: string) {
    return this.prisma.championStats.findFirst({
      where: { championId, patch },
    });
  }

  async findUnique(championId: number, patch: string, queueId: number) {
    return this.prisma.championStats.findUnique({
      where: { championId_patch_queueId: { championId, patch, queueId } },
    });
  }

  async findQualifiedStats(patch: string, minGames: number) {
    return this.prisma.championStats.findMany({
      where: { patch, gamesPlayed: { gte: minGames } },
    });
  }
}
