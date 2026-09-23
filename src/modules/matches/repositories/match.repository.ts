import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class MatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMatchWithDetails(matchId: string) {
    return this.prisma.match.findUnique({
      where: { matchId },
      include: {
        teams: true,
        participants: true,
      },
    });
  }

  async findGoldTimeline(matchId: string) {
    return this.prisma.match.findUnique({
      where: { matchId },
      select: {
        mapId: true,
        gameVersion: true,
        teams: { select: { teamId: true, win: true } },
        participants: { select: { teamId: true, puuid: true } },
        timelineProjection: true,
      },
    });
  }

  async findParticipantsEvents(matchId: string) {
    return this.prisma.matchParticipant.findMany({
      where: { matchId },
      select: {
        puuid: true,
        championId: true,
        killPositions: true,
        deathPositions: true,
        wardPositions: true,
      },
    });
  }

  async findTeamsObjectives(matchId: string) {
    return this.prisma.matchTeam.findMany({
      where: { matchId },
      select: { teamId: true, objectivesTimeline: true },
    });
  }

  async findBuilds(matchId: string) {
    return this.prisma.match.findUnique({
      where: { matchId },
      select: {
        gameVersion: true,
        participants: {
          select: {
            puuid: true,
            championId: true,
            championName: true,
            itemTimeline: true,
            finalInventory: true,
          },
        },
      },
    });
  }

  async findContribution(matchId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const match = await tx.match.findUnique({
          where: { matchId },
          select: {
            matchId: true,
            mapId: true,
            participants: {
              select: {
                puuid: true,
                teamId: true,
                championId: true,
                championName: true,
                role: true,
                kills: true,
                assists: true,
                finalStats: true,
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
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async findParticipantsForPerformance(matchId: string) {
    return this.prisma.matchParticipant.findMany({
      where: { matchId },
      include: { match: { select: { gameDuration: true } } },
    });
  }
}
