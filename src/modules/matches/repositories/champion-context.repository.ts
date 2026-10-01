import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  ChampionContextReader,
  ChampionContextFilters,
} from '../ports/champion-context-reader';
@Injectable()
export class ChampionContextRepository implements ChampionContextReader {
  constructor(private readonly prisma: PrismaService) {}
  read(filters: ChampionContextFilters) {
    const where: Prisma.MatchWhereInput = {
      queueId: filters.queueId,
      mapId: 11,
      OR: [
        { gameVersion: filters.patch },
        { gameVersion: { startsWith: `${filters.patch}.` } },
      ],
      gameCreation: {
        ...(filters.fromMs !== undefined
          ? { gte: BigInt(filters.fromMs) }
          : {}),
        ...(filters.toMs !== undefined ? { lt: BigInt(filters.toMs) } : {}),
      },
    };
    return this.prisma.$transaction(
      async (tx) => {
        const availableMatches = await tx.match.count({ where });
        const matches = await tx.match.findMany({
          where,
          take: filters.limit,
          orderBy: [{ gameCreation: 'desc' }, { matchId: 'asc' }],
          select: {
            matchId: true,
            populationEligible: true,
            participants: {
              select: {
                puuid: true,
                championId: true,
                role: true,
                teamId: true,
                win: true,
              },
            },
          },
        });
        return {
          matches,
          availableMatches,
          truncated: availableMatches > matches.length,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
