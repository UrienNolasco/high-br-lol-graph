import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { readSnapshotProjection } from '../contracts/snapshot-readers';
import type { MatchReviewReader } from '../ports/match-review-reader';
export const MATCH_REVIEW_READ_LIMITS = { events: 2000, frames: 300 } as const;

@Injectable()
export class MatchReviewRepository implements MatchReviewReader {
  constructor(private readonly prisma: PrismaService) {}
  async findReview(matchId: string, puuid: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const match = await tx.match.findUnique({
          where: { matchId },
          select: {
            matchId: true,
            gameDuration: true,
            gameVersion: true,
            queueId: true,
            mapId: true,
            timelineProjection: true,
            participants: {
              select: {
                puuid: true,
                teamId: true,
                role: true,
                championName: true,
                kills: true,
                deaths: true,
                assists: true,
                finalStats: true,
              },
              orderBy: { puuid: 'asc' },
            },
          },
        });
        if (!match || !match.participants.some((p) => p.puuid === puuid))
          return null;
        const [events, processing] = await Promise.all([
          tx.matchEventProjection.findMany({
            where: { matchId, type: { in: ['CHAMPION_KILL', 'GAME_END'] } },
            orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
            take: MATCH_REVIEW_READ_LIMITS.events + 1,
          }),
          tx.matchProcessing.findUnique({
            where: { matchId },
            select: {
              status: true,
              processingVersion: true,
              completedAt: true,
            },
          }),
        ]);
        const projection = readSnapshotProjection(match.timelineProjection);
        const framesTruncated =
          (projection?.frames.length ?? 0) > MATCH_REVIEW_READ_LIMITS.frames;
        return {
          ...match,
          projection: projection
            ? {
                ...projection,
                frames: projection.frames.slice(
                  0,
                  MATCH_REVIEW_READ_LIMITS.frames,
                ),
              }
            : null,
          processing,
          events: events.slice(0, MATCH_REVIEW_READ_LIMITS.events),
          readLimits: {
            eventsTruncated: events.length > MATCH_REVIEW_READ_LIMITS.events,
            framesTruncated,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
