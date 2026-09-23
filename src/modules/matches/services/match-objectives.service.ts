import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  calculateObjectives,
  OBJECTIVE_EVENT_TYPES,
} from '../pure/objectives-calculator';
@Injectable()
export class MatchObjectivesService {
  constructor(private readonly prisma: PrismaService) {}
  async getObjectives(matchId: string) {
    const { match, processing } = await this.prisma.$transaction(
      async (tx) => {
        const match = await tx.match.findUnique({
          where: { matchId },
          select: {
            matchId: true,
            gameVersion: true,
            mapId: true,
            teams: { select: { teamId: true, finalObjectives: true } },
            participants: {
              select: {
                puuid: true,
                teamId: true,
                championName: true,
                finalStats: true,
              },
            },
            events: {
              where: { type: { in: [...OBJECTIVE_EVENT_TYPES] } },
              orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
              select: {
                matchId: true,
                frameIndex: true,
                eventIndex: true,
                type: true,
                timestampMs: true,
                actorParticipantId: true,
                actorPuuid: true,
                assistingParticipantIds: true,
                assistingPuuids: true,
                sourceTeamId: true,
                ownerTeamId: true,
                beneficiaryTeamId: true,
                positionX: true,
                positionY: true,
                lane: true,
                tier: true,
                payload: true,
                quality: true,
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
    return calculateObjectives({ ...match, processing });
  }
}
