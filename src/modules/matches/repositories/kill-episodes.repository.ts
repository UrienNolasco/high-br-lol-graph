import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { COMBAT_EVENT_FILTER } from './combat.repository';
import { combatInput } from '../pure/combat-source';
@Injectable()
export class KillEpisodesRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findKillEpisodes(matchId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const match = await tx.match.findUnique({
          where: { matchId },
          select: {
            matchId: true,
            gameDuration: true,
            gameVersion: true,
            mapId: true,
            participants: {
              select: {
                puuid: true,
                teamId: true,
                kills: true,
                deaths: true,
                assists: true,
              },
              orderBy: { puuid: 'asc' },
            },
            timelineProjection: {
              select: {
                projectionVersion: true,
                frameIntervalMs: true,
                observedEndMs: true,
                frames: true,
              },
            },
          },
        });
        if (!match) return null;
        const [events, source] = await Promise.all([
          tx.matchEventProjection.findMany({
            where: { matchId, ...COMBAT_EVENT_FILTER },
            select: {
              matchId: true,
              frameIndex: true,
              eventIndex: true,
              type: true,
              timestampMs: true,
              actorParticipantId: true,
              actorPuuid: true,
              victimPuuid: true,
              assistingParticipantIds: true,
              assistingPuuids: true,
              sourceTeamId: true,
              payload: true,
              quality: true,
              metricVersion: true,
              processingVersion: true,
              positionX: true,
              positionY: true,
            },
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
        const combat = combatInput(match, events, source ?? undefined);
        return {
          match,
          source,
          input: combat
            ? {
                ...combat,
                events,
                snapshotProjection: match.timelineProjection,
                mapId: match.mapId,
                gameVersion: match.gameVersion,
              }
            : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
