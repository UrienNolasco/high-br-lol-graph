import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  BuildChoiceFilters,
  BuildChoiceReader,
  BuildChoiceCohort,
} from '../ports/build-choice-reader';
import type { ProgressionEvent } from '../contracts/calculations/item-ledger';
import { readSnapshotProjection } from '../contracts/snapshot-readers';

@Injectable()
export class BuildChoiceRepository implements BuildChoiceReader {
  constructor(private readonly prisma: PrismaService) {}
  async findBuildChoiceCohort(
    f: BuildChoiceFilters,
  ): Promise<BuildChoiceCohort> {
    const where: Prisma.MatchWhereInput = {
      queueId: f.queueId,
      mapId: 11,
      OR: [
        { gameVersion: f.patch },
        { gameVersion: { startsWith: `${f.patch}.` } },
      ],
      participants: {
        some: {
          championId: f.championId,
          role: f.role === 'MIDDLE' ? { in: ['MID', 'MIDDLE'] } : f.role,
        },
      },
      ...(f.fromMs !== undefined || f.toMs !== undefined
        ? {
            gameCreation: {
              ...(f.fromMs !== undefined ? { gte: BigInt(f.fromMs) } : {}),
              ...(f.toMs !== undefined ? { lt: BigInt(f.toMs) } : {}),
            },
          }
        : {}),
    };
    return this.prisma.$transaction(
      async (tx) => {
        const totalMatches = await tx.match.count({ where });
        const matches = await tx.match.findMany({
          where,
          orderBy: [{ gameCreation: 'desc' }, { matchId: 'asc' }],
          take: f.limit,
          select: {
            matchId: true,
            gameVersion: true,
            gameDuration: true,
            populationEligible: true,
            participants: {
              select: {
                puuid: true,
                championId: true,
                teamId: true,
                role: true,
                win: true,
                runes: true,
                spells: true,
              },
            },
            timelineProjection: true,
            events: {
              where: {
                OR: [
                  {
                    type: {
                      in: [
                        'ITEM_PURCHASED',
                        'ITEM_SOLD',
                        'ITEM_DESTROYED',
                        'ITEM_UNDO',
                        'GAME_END',
                      ],
                    },
                  },
                  { timestampMs: null },
                  { quality: { path: ['unknownType'], equals: true } },
                  { actorPuuid: null },
                ],
              },
              orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
            },
          },
        });
        const jobs = await tx.matchProcessing.findMany({
          where: { matchId: { in: matches.map((m) => m.matchId) } },
          select: {
            matchId: true,
            status: true,
            processingVersion: true,
            completedAt: true,
          },
        });
        const byMatch = new Map(jobs.map((j) => [j.matchId, j]));
        return {
          totalMatches,
          truncated: totalMatches > matches.length,
          matches: matches.map((m) => ({
            ...m,
            timelineProjection: readSnapshotProjection(m.timelineProjection),
            events: m.events as ProgressionEvent[],
            processing: byMatch.get(m.matchId) ?? null,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
