import {
  playerAverages,
  playerChampionAverages,
} from '../../../core/stats/aggregate.mapper';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface TimelineFilters {
  role?: string;
  championId?: number;
  patch?: string;
}

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByPuuid(puuid: string) {
    return this.prisma.user.findUnique({ where: { puuid } });
  }

  async findPlayerStats(puuid: string, patch: string) {
    const row = await this.prisma.playerStats.findUnique({
      where: { puuid_patch_queueId: { puuid, patch, queueId: 420 } },
    });
    return row ? playerAverages(row) : null;
  }
  async findPlayerChampionStats(
    puuid: string,
    championId: number,
    patch: string,
  ) {
    const row = await this.prisma.playerChampionStats.findUnique({
      where: {
        puuid_championId_patch_queueId: {
          puuid,
          championId,
          patch,
          queueId: 420,
        },
      },
    });
    return row ? playerChampionAverages(row) : null;
  }
  async findPlayerLaningMetrics(
    puuid: string,
    championId: number,
    patch: string,
  ) {
    return this.findPlayerChampionStats(puuid, championId, patch);
  }

  async findMatchesForTimeline(puuid: string, filters: TimelineFilters) {
    const matchConditions: Prisma.MatchWhereInput = { queueId: 420 };

    if (filters.patch && filters.patch !== 'ALL') {
      matchConditions.gameVersion = { startsWith: `${filters.patch}.` };
    }

    const where: Prisma.MatchParticipantWhereInput = {
      puuid,
      match: matchConditions,
    };

    if (filters.championId) {
      where.championId = filters.championId;
    }

    if (filters.role) {
      where.role = filters.role;
    }

    return this.prisma.matchParticipant.findMany({
      where,
      select: { csGraph: true, goldGraph: true },
      take: 100,
    });
  }
}
