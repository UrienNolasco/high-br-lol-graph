import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DatasetFilters } from '../../core/dataset/dataset-query';
import { IndicatorCursor } from './pure/indicator-cursor';
import { IndicatorInput } from './pure/indicator.types';
const select = {
  puuid: true,
  championId: true,
  championName: true,
  role: true,
  finalStats: true,
  challenges: true,
  pings: true,
  match: {
    select: {
      matchId: true,
      gameCreation: true,
      gameDuration: true,
      gameVersion: true,
      mapId: true,
      queueId: true,
      populationEligible: true,
      populationExclusionReason: true,
    },
  },
} satisfies Prisma.MatchParticipantSelect;
export function indicatorWhere(
  filters: DatasetFilters,
): Prisma.MatchParticipantWhereInput {
  return {
    puuid: filters.playerId,
    ...(filters.championId ? { championId: filters.championId } : {}),
    ...(filters.role
      ? {
          role:
            filters.role === 'MIDDLE'
              ? { in: ['MID', 'MIDDLE'] }
              : filters.role,
        }
      : {}),
    match: {
      ...(filters.queueId ? { queueId: filters.queueId } : {}),
      ...(filters.mapId ? { mapId: filters.mapId } : {}),
      ...(filters.eligibleOnly ? { populationEligible: true } : {}),
      ...(filters.patch
        ? {
            OR: [
              { gameVersion: filters.patch },
              { gameVersion: { startsWith: `${filters.patch}.` } },
            ],
          }
        : {}),
      ...(filters.fromMs !== undefined || filters.toMs !== undefined
        ? {
            gameCreation: {
              ...(filters.fromMs !== undefined
                ? { gte: BigInt(filters.fromMs) }
                : {}),
              ...(filters.toMs !== undefined
                ? { lt: BigInt(filters.toMs) }
                : {}),
            },
          }
        : {}),
    },
  };
}
@Injectable()
export class IndicatorRepository {
  constructor(private readonly prisma: PrismaService) {}
  async match(matchId: string, puuid: string): Promise<IndicatorInput | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.matchParticipant.findUnique({
          where: { matchId_puuid: { matchId, puuid } },
          select,
        });
        if (!row) return null;
        const processing = await tx.matchProcessing.findUnique({
          where: { matchId },
          select: { status: true, processingVersion: true, completedAt: true },
        });
        const { match, ...participant } = row;
        return { match, participant, processing };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async history(
    filters: DatasetFilters,
    limit: number,
    after?: IndicatorCursor,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const where = indicatorWhere(filters);
        const pageWhere: Prisma.MatchParticipantWhereInput = after
          ? {
              AND: [
                where,
                {
                  OR: [
                    { match: { gameCreation: { lt: after.gameCreation } } },
                    {
                      match: { gameCreation: after.gameCreation },
                      matchId: { gt: after.matchId },
                    },
                  ],
                },
              ],
            }
          : where;
        const [total, selected] = await Promise.all([
          tx.matchParticipant.count({ where }),
          tx.matchParticipant.findMany({
            where: pageWhere,
            select,
            orderBy: [{ match: { gameCreation: 'desc' } }, { matchId: 'asc' }],
            take: limit + 1,
          }),
        ]);
        const rows = selected.slice(0, limit);
        const jobs = await tx.matchProcessing.findMany({
          where: { matchId: { in: rows.map((r) => r.match.matchId) } },
          select: {
            matchId: true,
            status: true,
            processingVersion: true,
            completedAt: true,
          },
        });
        const byId = new Map(jobs.map((j) => [j.matchId, j]));
        const inputs: IndicatorInput[] = rows.map(
          ({ match, ...participant }) => ({
            match,
            participant,
            processing: byId.get(match.matchId) ?? null,
          }),
        );
        return {
          inputs,
          total,
          truncated: total > rows.length,
          hasMore: selected.length > limit,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30000,
      },
    );
  }
}
