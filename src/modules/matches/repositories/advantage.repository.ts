import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AdvantageReader } from '../ports/advantage-reader';
import type { ChampionContextFilters } from '../ports/champion-context-reader';
import { readSnapshotProjection } from '../contracts/snapshot-readers';
@Injectable()
export class AdvantageRepository implements AdvantageReader {
  constructor(private readonly prisma: PrismaService) {}
  read(filters: ChampionContextFilters) {
    const where: Prisma.MatchWhereInput = {
      queueId: filters.queueId,
      mapId: 11,
      OR: [
        { gameVersion: filters.patch },
        { gameVersion: { startsWith: `${filters.patch}.` } },
      ],
      gameCreation: {
        ...(filters.fromMs !== undefined
          ? { gte: BigInt(filters.fromMs) }
          : {}),
        ...(filters.toMs !== undefined ? { lt: BigInt(filters.toMs) } : {}),
      },
    };
    return this.prisma.$transaction(
      async (tx) => {
        const availableMatches = await tx.match.count({ where });
        const matches = await tx.match.findMany({
          where,
          take: filters.limit,
          orderBy: [{ gameCreation: 'desc' }, { matchId: 'asc' }],
          select: {
            matchId: true,
            populationEligible: true,
            gameDuration: true,
            timelineProjection: true,
            events: {
              where: { type: 'BUILDING_KILL' },
              select: {
                metricVersion: true,
                processingVersion: true,
                timestampMs: true,
                beneficiaryTeamId: true,
                frameIndex: true,
                eventIndex: true,
              },
            },
            participants: {
              select: {
                puuid: true,
                championId: true,
                role: true,
                teamId: true,
                win: true,
              },
            },
          },
        });
        const jobs = await tx.matchProcessing.findMany({
          where: { matchId: { in: matches.map((m) => m.matchId) } },
          select: { matchId: true, status: true, processingVersion: true },
        });
        const processing = new Map(
          jobs.map((j) => [
            j.matchId,
            { status: j.status, processingVersion: j.processingVersion },
          ]),
        );
        return {
          matches: matches.map(
            ({ gameDuration, timelineProjection, events, ...match }) => ({
              ...match,
              processing: processing.get(match.matchId) ?? null,
              durationMs: gameDuration * 1000,
              projection: readSnapshotProjection(timelineProjection),
              structures: events,
            }),
          ),
          availableMatches,
          truncated: availableMatches > matches.length,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
