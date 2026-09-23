import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { readSnapshotProjection } from '../../../core/riot/timeline-snapshots';
import {
  calculateSequences,
  SEQUENCE_EVENT_TYPES,
} from '../pure/sequences-calculator';
@Injectable()
export class MatchSequencesService {
  constructor(private readonly prisma: PrismaService) {}
  async getSequences(matchId: string) {
    const { match, processing } = await this.prisma.$transaction(
      async (tx) => {
        const match = await tx.match.findUnique({
          where: { matchId },
          select: {
            matchId: true,
            gameVersion: true,
            mapId: true,
            timelineProjection: true,
            participants: { select: { puuid: true, teamId: true } },
            teams: { select: { teamId: true, win: true } },
            events: {
              where: { type: { in: SEQUENCE_EVENT_TYPES } },
              orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
              select: {
                matchId: true,
                frameIndex: true,
                eventIndex: true,
                type: true,
                timestampMs: true,
                actorPuuid: true,
                victimPuuid: true,
                sourceTeamId: true,
                beneficiaryTeamId: true,
                lane: true,
                payload: true,
                metricVersion: true,
                processingVersion: true,
              },
            },
          },
        });
        const processing = await tx.matchProcessing.findUnique({
          where: { matchId },
          select: { status: true, processingVersion: true, completedAt: true },
        });
        return { match, processing };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    if (!match) throw new NotFoundException(`Match ${matchId} not found`);
    return calculateSequences({
      ...match,
      projection: readSnapshotProjection(match.timelineProjection),
      processing,
    });
  }
}
