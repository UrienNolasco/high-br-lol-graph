import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { MATCH_SELECT_FIELDS } from '../pure/match.mapper';

@Injectable()
export class MatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findExistingMatchIds(matchIds: string[]) {
    const existing = await this.prisma.match.findMany({
      where: { matchId: { in: matchIds } },
      select: { matchId: true },
    });
    return new Set(existing.map((m) => m.matchId));
  }

  async findByMatchId(matchId: string) {
    return this.prisma.match.findUnique({
      where: { matchId },
      select: { gameCreation: true },
    });
  }

  async findCursorMatches(
    where: Prisma.MatchParticipantWhereInput,
    orderBy: Prisma.MatchParticipantOrderByWithRelationInput,
    limit: number,
  ) {
    return this.prisma.matchParticipant.findMany({
      where,
      select: MATCH_SELECT_FIELDS,
      orderBy,
      take: limit + 1,
    });
  }

  async findPagedMatches(
    where: Prisma.MatchParticipantWhereInput,
    orderBy: Prisma.MatchParticipantOrderByWithRelationInput,
    skip: number,
    limit: number,
  ) {
    return this.prisma.matchParticipant.findMany({
      where,
      select: MATCH_SELECT_FIELDS,
      orderBy,
      skip,
      take: limit + 1,
    });
  }

  async countMatches(where: Prisma.MatchParticipantWhereInput) {
    return this.prisma.matchParticipant.count({ where });
  }

  async countMatchesByIds(matchIds: string[]) {
    return this.prisma.match.count({
      where: { matchId: { in: matchIds } },
    });
  }
}
