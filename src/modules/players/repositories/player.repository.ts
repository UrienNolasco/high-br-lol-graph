import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class PlayerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPuuid(puuid: string) {
    return this.prisma.user.findUnique({ where: { puuid } });
  }

  async upsert(
    puuid: string,
    data: {
      gameName: string;
      tagLine: string;
      region: string;
      profileIconId: number;
      summonerLevel: number;
      summonerId: string | null;
      tier: string | null;
      rank: string | null;
      leaguePoints: number | null;
      rankedWins: number | null;
      rankedLosses: number | null;
    },
  ) {
    return this.prisma.user.upsert({
      where: { puuid },
      update: {
        gameName: data.gameName,
        tagLine: data.tagLine,
        profileIconId: data.profileIconId,
        summonerLevel: data.summonerLevel,
        summonerId: data.summonerId,
        tier: data.tier,
        rank: data.rank,
        leaguePoints: data.leaguePoints,
        rankedWins: data.rankedWins,
        rankedLosses: data.rankedLosses,
        lastUpdated: new Date(),
      },
      create: {
        puuid,
        gameName: data.gameName,
        tagLine: data.tagLine,
        region: data.region,
        profileIconId: data.profileIconId,
        summonerLevel: data.summonerLevel,
        summonerId: data.summonerId,
        tier: data.tier,
        rank: data.rank,
        leaguePoints: data.leaguePoints,
        rankedWins: data.rankedWins,
        rankedLosses: data.rankedLosses,
      },
    });
  }
}
