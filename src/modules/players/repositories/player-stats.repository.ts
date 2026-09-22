import {
  playerAverages,
  playerChampionAverages,
} from '../../../core/stats/aggregate.mapper';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PlayerStatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAggregatedStats(puuid: string, patch: string, queueId: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.playerStats.findUnique({
          where: { puuid_patch_queueId: { puuid, patch, queueId } },
        });
        if (!row) return null;
        const champions = await tx.playerChampionStats.findMany({
          where: { puuid, patch, queueId },
          orderBy: [{ gamesPlayed: 'desc' }, { championId: 'asc' }],
          take: 5,
        });
        return {
          ...playerAverages(row),
          topChampions: champions.map((champ) => ({
            championId: champ.championId,
            games: champ.gamesPlayed,
            winRate: playerChampionAverages(champ).winRate,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async getChampionStats(puuid: string, patch: string, queueId: number) {
    const rows = await this.prisma.playerChampionStats.findMany({
      where: { puuid, patch, queueId },
    });
    return rows.map(playerChampionAverages);
  }

  async getRoleDistribution(puuid: string, patch: string) {
    return this.prisma.$queryRaw<
      Array<{
        role: string;
        gamesplayed: bigint;
        wins: bigint;
        losses: bigint;
        winrate: number;
        avgkda: number;
      }>
    >`
      SELECT
        mp.role,
        COUNT(*) as gamesPlayed,
        SUM(CASE WHEN mp.win THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN NOT mp.win THEN 1 ELSE 0 END) as losses,
        (SUM(CASE WHEN mp.win THEN 1 ELSE 0 END)::float / COUNT(*)) * 100 as winRate,
        AVG(mp.kda) as avgKda
      FROM match_participants mp
      JOIN matches m ON mp."matchId" = m."matchId"
      WHERE mp.puuid = ${puuid}
        AND m."queueId" = 420
        ${patch !== 'ALL' ? Prisma.sql`AND split_part(m."gameVersion", '.', 1) || '.' || split_part(m."gameVersion", '.', 2) = ${patch}` : Prisma.empty}
      GROUP BY mp.role
      ORDER BY gamesPlayed DESC
    `;
  }

  async getActivityData(puuid: string, patch: string) {
    return this.prisma.$queryRaw<
      Array<{
        dayofweek: number;
        hour: number;
        games: bigint;
        wins: bigint;
        losses: bigint;
        winrate: number;
      }>
    >`
      SELECT
        EXTRACT(DOW FROM TO_TIMESTAMP(m."gameCreation" / 1000) AT TIME ZONE 'America/Sao_Paulo') as dayOfWeek,
        EXTRACT(HOUR FROM TO_TIMESTAMP(m."gameCreation" / 1000) AT TIME ZONE 'America/Sao_Paulo') as hour,
        COUNT(*) as games,
        SUM(CASE WHEN mp.win THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN NOT mp.win THEN 1 ELSE 0 END) as losses,
        (SUM(CASE WHEN mp.win THEN 1 ELSE 0 END)::float / COUNT(*)) * 100 as winRate
      FROM match_participants mp
      JOIN matches m ON mp."matchId" = m."matchId"
      WHERE mp.puuid = ${puuid}
        AND m."queueId" = 420
        ${patch !== 'ALL' ? Prisma.sql`AND split_part(m."gameVersion", '.', 1) || '.' || split_part(m."gameVersion", '.', 2) = ${patch}` : Prisma.empty}
      GROUP BY dayOfWeek, hour
      ORDER BY dayOfWeek, hour
    `;
  }
}
