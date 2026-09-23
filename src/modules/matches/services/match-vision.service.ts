import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { calculateVision } from '../pure/vision-calculator';
@Injectable()
export class MatchVisionService {
  constructor(private readonly prisma: PrismaService) {}
  async getVision(matchId: string, puuid: string) {
    const match = await this.prisma.match.findUnique({
      where: { matchId },
      select: {
        matchId: true,
        gameVersion: true,
        gameDuration: true,
        participants: {
          select: { puuid: true, teamId: true, finalStats: true },
        },
        events: {
          where: {
            type: {
              in: [
                'WARD_PLACED',
                'WARD_KILL',
                'ELITE_MONSTER_KILL',
                'GAME_END',
              ],
            },
          },
          select: {
            matchId: true,
            frameIndex: true,
            eventIndex: true,
            type: true,
            timestampMs: true,
            actorPuuid: true,
            beneficiaryTeamId: true,
            payload: true,
            metricVersion: true,
            processingVersion: true,
          },
          orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
        },
      },
    });
    if (!match || !match.participants.some((p) => p.puuid === puuid))
      throw new NotFoundException('Match or participant not found');
    const processing = await this.prisma.matchProcessing.findUnique({
      where: { matchId },
      select: { status: true, processingVersion: true, completedAt: true },
    });
    return calculateVision({ ...match, processing }, puuid);
  }
}
