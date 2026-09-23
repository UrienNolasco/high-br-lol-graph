import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { readSnapshotProjection } from '../../../core/riot/timeline-snapshots';
import { calculateMapPresence } from '../pure/map-presence-calculator';

@Injectable()
export class MatchMapPresenceService {
  constructor(private readonly prisma: PrismaService) {}
  async getPresence(matchId: string, puuid: string) {
    const [match, processing] = await this.prisma.$transaction(
      [
        this.prisma.match.findUnique({
          where: { matchId },
          select: {
            matchId: true,
            mapId: true,
            gameVersion: true,
            gameDuration: true,
            participants: { select: { puuid: true, teamId: true } },
            timelineProjection: true,
          },
        }),
        this.prisma.matchProcessing.findUnique({
          where: { matchId },
          select: { status: true, completedAt: true, processingVersion: true },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    if (!match || !match.participants.some((p) => p.puuid === puuid))
      throw new NotFoundException('Match or participant not found');
    return calculateMapPresence(
      {
        ...match,
        processing,
        projection: readSnapshotProjection(match.timelineProjection),
      },
      puuid,
    );
  }
}
