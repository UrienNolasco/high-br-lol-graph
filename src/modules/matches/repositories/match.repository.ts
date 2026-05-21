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

  async findParticipantsGold(matchId: string) {
    return this.prisma.matchParticipant.findMany({
      where: { matchId },
      select: { teamId: true, goldGraph: true },
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

  async findParticipantsBuilds(matchId: string) {
    return this.prisma.matchParticipant.findMany({
      where: { matchId },
      select: {
        puuid: true,
        championId: true,
        championName: true,
        itemTimeline: true,
      },
    });
  }

  async findParticipantsForPerformance(matchId: string) {
    return this.prisma.matchParticipant.findMany({
      where: { matchId },
      include: { match: { select: { gameDuration: true } } },
    });
  }
}
