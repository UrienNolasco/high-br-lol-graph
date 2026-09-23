import { COMBAT_EVENT_FILTER } from '../../matches/repositories/combat.repository';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { normalizeRole } from '../../../core/metrics';

export interface TimelineFilters {
  role?: string;
  championId?: number;
  patch?: string;
  queueId?: number;
  startDate?: number;
  endDate?: number;
  limit?: number;
}

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByPuuid(puuid: string) {
    return this.prisma.user.findUnique({ where: { puuid } });
  }

  async findComparisonCohort(puuid: string, filters: TimelineFilters) {
    const limit = filters.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new RangeError('Comparison limit must be between 1 and 100');
    const role = normalizeRole(filters.role);
    const match: Prisma.MatchWhereInput = {
      queueId: filters.queueId ?? 420,
      mapId: 11,
    };
    if (filters.patch && filters.patch !== 'ALL') {
      match.OR = [
        { gameVersion: filters.patch },
        { gameVersion: { startsWith: `${filters.patch}.` } },
      ];
    }
    if (filters.startDate !== undefined || filters.endDate !== undefined) {
      match.gameCreation = {
        ...(filters.startDate !== undefined
          ? { gte: BigInt(filters.startDate) }
          : {}),
        ...(filters.endDate !== undefined
          ? { lt: BigInt(filters.endDate) }
          : {}),
      };
    }
    const where: Prisma.MatchParticipantWhereInput = {
      puuid,
      match,
      ...(filters.championId !== undefined
        ? { championId: filters.championId }
        : {}),
      ...(filters.role
        ? {
            role:
              role === 'MIDDLE'
                ? { in: ['MID', 'MIDDLE'] }
                : (role ?? '__UNKNOWN_ROLE__'),
          }
        : {}),
    };
    // Count and rows share a snapshot, so concurrent ingestion cannot change N mid-response.
    return this.prisma.$transaction(
      async (tx) => {
        const eligibleN = await tx.matchParticipant.count({ where });
        const matches = await tx.matchParticipant.findMany({
          where,
          orderBy: [{ match: { gameCreation: 'desc' } }, { matchId: 'asc' }],
          take: limit,
          include: { match: { include: { participants: true } } },
        });
        const projections = await tx.matchTimelineProjection.findMany({
          where: { matchId: { in: matches.map((m) => m.matchId) } },
        });
        const ids = matches.map((m) => m.matchId);
        const [events, eventSources] = await Promise.all([
          tx.matchEventProjection.findMany({
            where: { matchId: { in: ids }, ...COMBAT_EVENT_FILTER },
            orderBy: [
              { matchId: 'asc' },
              { frameIndex: 'asc' },
              { eventIndex: 'asc' },
            ],
          }),
          tx.matchProcessing.findMany({
            where: { matchId: { in: ids } },
            select: {
              matchId: true,
              status: true,
              processingVersion: true,
              completedAt: true,
            },
          }),
        ]);
        return {
          matches,
          projections,
          events,
          eventSources,
          eligibleN,
          returnedN: matches.length,
          limit,
          truncated: eligibleN > matches.length,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
