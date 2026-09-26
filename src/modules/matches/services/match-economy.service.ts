import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { CheckpointMode } from '../contracts/temporal';
import { readSnapshotProjection } from '../contracts/snapshot-readers';
import { calculateEconomy } from '../pure/economy-calculator';

@Injectable()
export class MatchEconomyService {
  constructor(private readonly prisma: PrismaService) {}

  async getEconomy(
    matchId: string,
    puuid: string,
    mode: CheckpointMode = 'nearest',
  ) {
    // A rebuild cannot combine provenance from one committed generation with another generation's frames.
    const [match, processing] = await this.prisma.$transaction(
      [
        this.prisma.match.findUnique({
          where: { matchId },
          select: {
            matchId: true,
            gameVersion: true,
            queueId: true,
            mapId: true,
            gameDuration: true,
            timelineProjection: true,
            participants: {
              select: {
                puuid: true,
                teamId: true,
                role: true,
                finalStats: true,
              },
            },
          },
        }),
        this.prisma.matchProcessing.findUnique({
          where: { matchId },
          select: { status: true, processingVersion: true, completedAt: true },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    if (!match) throw new NotFoundException(`Match ${matchId} not found`);
    if (!match.participants.some((p) => p.puuid === puuid))
      throw new NotFoundException(`Participant ${puuid} not found in match`);
    return calculateEconomy(
      {
        ...match,
        projection: readSnapshotProjection(match.timelineProjection),
        processing,
      },
      puuid,
      mode,
    );
  }
}
