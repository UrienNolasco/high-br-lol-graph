import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  BOUNTY_EVENT_TYPES,
  calculateBountiesSteals,
} from '../pure/bounties-steals-calculator';
@Injectable()
export class MatchBountiesStealsService {
  constructor(private readonly prisma: PrismaService) {}
  async getBountiesSteals(matchId: string) {
    const { match, processing } = await this.prisma.$transaction(
      async (tx) => {
        const match = await tx.match.findUnique({
          where: { matchId },
          select: {
            matchId: true,
            gameVersion: true,
            participants: {
              select: {
                puuid: true,
                teamId: true,
                championName: true,
                finalStats: true,
                challenges: true,
              },
              orderBy: { puuid: 'asc' },
            },
            events: {
              where: { type: { in: [...BOUNTY_EVENT_TYPES] } },
              orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
              select: {
                matchId: true,
                frameIndex: true,
                eventIndex: true,
                type: true,
                timestampMs: true,
                actorPuuid: true,
                sourceTeamId: true,
                ownerTeamId: true,
                beneficiaryTeamId: true,
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
    return calculateBountiesSteals({ ...match, processing });
  }
}
