import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { combatInput } from '../pure/combat-source';

/** Query only this metric family's projected events, never compressed MatchRaw. */
export const COMBAT_EVENT_FILTER: Prisma.MatchEventProjectionWhereInput = {
  OR: [
    { type: { in: ['CHAMPION_KILL', 'GAME_END'] } },
    { quality: { path: ['unknownType'], equals: true } },
  ],
};
@Injectable()
export class CombatRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findMatchCombat(matchId: string) {
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
            participants: {
              select: {
                puuid: true,
                teamId: true,
                kills: true,
                deaths: true,
                assists: true,
                kda: true,
              },
              orderBy: { puuid: 'asc' },
            },
          },
        });
        if (!match) return null;
        const [events, source] = await Promise.all([
          tx.matchEventProjection.findMany({
            where: { matchId, ...COMBAT_EVENT_FILTER },
            orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
          }),
          tx.matchProcessing.findUnique({
            where: { matchId },
            select: {
              matchId: true,
              status: true,
              processingVersion: true,
              completedAt: true,
            },
          }),
        ]);
        return {
          match,
          source,
          input: combatInput(match, events, source ?? undefined),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
