import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PROGRESSION_EVENT_TYPES } from '../pure/progression/types';
@Injectable()
export class ProgressionRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findProgression(matchId: string, puuid: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const match = await tx.match.findUnique({
          where: { matchId },
          select: {
            matchId: true,
            gameVersion: true,
            gameDuration: true,
            queueId: true,
            mapId: true,
            participants: {
              where: { puuid },
              select: {
                puuid: true,
                championId: true,
                championName: true,
                finalInventory: true,
              },
            },
          },
        });
        if (!match || !match.participants.length) return null;
        const [events, processing, snapshotProjection] = await Promise.all([
          tx.matchEventProjection.findMany({
            where: {
              matchId,
              AND: [
                { OR: [{ actorPuuid: puuid }, { actorPuuid: null }] },
                {
                  OR: [
                    { type: { in: PROGRESSION_EVENT_TYPES } },
                    { quality: { path: ['unknownType'], equals: true } },
                  ],
                },
              ],
            },
            orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
          }),
          tx.matchProcessing.findUnique({
            where: { matchId },
            select: {
              status: true,
              processingVersion: true,
              completedAt: true,
            },
          }),
          tx.matchTimelineProjection.findUnique({ where: { matchId } }),
        ]);
        return {
          ...match,
          participant: match.participants[0],
          events,
          processing,
          snapshotProjection,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
