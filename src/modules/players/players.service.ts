import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { getErrorMessage } from '../../core/logger/get-error-message';
import { RiotService } from '../../core/riot/riot.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { QueueService } from '../../core/queue/queue.service';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { PlayerSearchDto } from './dto/player-search.dto';
import { PlayerResponseDto } from './dto/player-response.dto';
import { PlayerProfileDto } from './dto/player-profile.dto';
import {
  PlayerUpdateStatusDto,
  UpdateStatus,
} from './dto/player-update-status.dto';
import { PlayerSummaryDto } from './dto/player-summary.dto';
import { PlayerChampionsDto } from './dto/player-champions.dto';
import { PlayerRoleDistributionDto } from './dto/player-role-distribution.dto';
import { PlayerActivityDto, HeatmapEntryDto } from './dto/player-activity.dto';
import {
  PlayerMatchDto,
  PlayerMatchesDto,
  PlayerMatchesQueryDto,
  PlayerMatchesPageQueryDto,
} from './dto/player-match.dto';
import { Prisma } from '@prisma/client';

type MatchRow = {
  matchId: string;
  championId: number;
  championName: string;
  role: string;
  lane: string;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  goldEarned: number;
  totalDamage: number;
  visionScore: number;
  win: boolean;
  csGraph: number[];
  match: {
    gameCreation: bigint;
    gameDuration: number;
    queueId: number;
  };
};

@Injectable()
export class PlayersService {
  constructor(
    private readonly riotService: RiotService,
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly dataDragon: DataDragonService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PlayersService.name);
  }

  // ========== Player Search ==========

  async searchPlayer(dto: PlayerSearchDto): Promise<PlayerResponseDto> {
    const startTime = Date.now();
    this.logger.info(
      {
        operation: 'player_search',
        gameName: dto.gameName,
        tagLine: dto.tagLine,
      },
      'Starting player search',
    );

    const REGION = 'br1';

    try {
      const account = await this.riotService.getAccountByRiotId(
        dto.gameName,
        dto.tagLine,
      );

      const summoner = await this.riotService.getSummonerByPuuid(
        account.puuid,
        REGION,
      );

      const leagueEntries = await this.riotService.getRankedStatsByPuuid(
        account.puuid,
        REGION,
      );
      const rankedSolo = leagueEntries.find(
        (e) => e.queueType === 'RANKED_SOLO_5x5',
      );

      const matchIds = await this.riotService.getMatchIdsByPuuid(
        account.puuid,
        20,
      );

      const existingMatches = await this.prisma.match.findMany({
        where: { matchId: { in: matchIds } },
        select: { matchId: true },
      });

      const existingIds = new Set(existingMatches.map((m) => m.matchId));
      const newMatchIds = matchIds.filter((id) => !existingIds.has(id));

      for (const matchId of newMatchIds) {
        this.queueService.publishUserRequestedMatch(matchId);
      }

      await this.prisma.user.upsert({
        where: { puuid: account.puuid },
        update: {
          gameName: dto.gameName,
          tagLine: dto.tagLine,
          profileIconId: summoner.profileIconId,
          summonerLevel: summoner.summonerLevel,
          summonerId: summoner.id ?? null,
          tier: rankedSolo?.tier || null,
          rank: rankedSolo?.rank || null,
          leaguePoints: rankedSolo?.leaguePoints || null,
          rankedWins: rankedSolo?.wins || null,
          rankedLosses: rankedSolo?.losses || null,
          lastUpdated: new Date(),
        },
        create: {
          puuid: account.puuid,
          gameName: dto.gameName,
          tagLine: dto.tagLine,
          region: REGION,
          profileIconId: summoner.profileIconId,
          summonerLevel: summoner.summonerLevel,
          summonerId: summoner.id ?? null,
          tier: rankedSolo?.tier || null,
          rank: rankedSolo?.rank || null,
          leaguePoints: rankedSolo?.leaguePoints || null,
          rankedWins: rankedSolo?.wins || null,
          rankedLosses: rankedSolo?.losses || null,
        },
      });

      const duration = Date.now() - startTime;
      this.logger.info(
        {
          operation: 'player_search',
          puuid: account.puuid,
          gameName: dto.gameName,
          tagLine: dto.tagLine,
          matchesFound: matchIds.length,
          matchesEnqueued: newMatchIds.length,
          alreadyInDb: existingIds.size,
          duration,
        },
        'Player search completed',
      );

      return {
        puuid: account.puuid,
        gameName: dto.gameName,
        tagLine: dto.tagLine,
        profileIconId: summoner.profileIconId,
        summonerLevel: summoner.summonerLevel,
        matchesEnqueued: newMatchIds.length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        {
          operation: 'player_search',
          gameName: dto.gameName,
          tagLine: dto.tagLine,
          duration,
          error: getErrorMessage(error),
        },
        'Error searching player',
      );

      const axiosError = error as { response?: { status?: number } };
      if (axiosError?.response?.status === 404) {
        throw new NotFoundException(
          `Player ${dto.gameName}#${dto.tagLine} not found`,
        );
      }

      throw error;
    }
  }

  // ========== Player Profile ==========

  async getPlayerProfile(puuid: string): Promise<PlayerProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { puuid },
    });

    if (!user) {
      throw new NotFoundException(`Player with PUUID ${puuid} not found`);
    }

    return {
      puuid: user.puuid,
      gameName: user.gameName,
      tagLine: user.tagLine,
      region: user.region,
      profileIconId: user.profileIconId ?? undefined,
      summonerLevel: user.summonerLevel ?? undefined,
      tier: user.tier ?? undefined,
      rank: user.rank ?? undefined,
      leaguePoints: user.leaguePoints ?? undefined,
      rankedWins: user.rankedWins ?? undefined,
      rankedLosses: user.rankedLosses ?? undefined,
      lastUpdated: user.lastUpdated,
      createdAt: user.createdAt,
    };
  }

  async getPlayerUpdateStatus(puuid: string): Promise<PlayerUpdateStatusDto> {
    const user = await this.prisma.user.findUnique({
      where: { puuid },
    });

    if (!user) {
      throw new NotFoundException(`Player with PUUID ${puuid} not found`);
    }

    try {
      const matchIds = await this.riotService.getMatchIdsByPuuid(puuid, 20);

      const matchesProcessed = await this.prisma.match.count({
        where: { matchId: { in: matchIds } },
      });

      const matchesTotal = matchIds.length;

      let status: UpdateStatus;
      let message: string;

      if (matchesProcessed === matchesTotal) {
        status = UpdateStatus.IDLE;
        message = 'All matches processed';
      } else {
        status = UpdateStatus.UPDATING;
        message = `Processing matches: ${matchesProcessed}/${matchesTotal}`;
      }

      return {
        status,
        matchesProcessed,
        matchesTotal,
        message,
      };
    } catch {
      return {
        status: UpdateStatus.ERROR,
        matchesProcessed: 0,
        matchesTotal: 0,
        message: 'Failed to fetch match status from Riot API',
      };
    }
  }

  // ========== Player Summary ==========

  async getPlayerSummary(
    puuid: string,
    filters: { patch: string },
  ): Promise<PlayerSummaryDto> {
    const playerStats = await this.prisma.playerStats.findUnique({
      where: {
        puuid_patch_queueId: {
          puuid,
          patch: filters.patch,
          queueId: 420,
        },
      },
    });

    if (!playerStats) {
      throw new NotFoundException(`No stats found for player ${puuid}`);
    }

    const topChampions =
      (playerStats.topChampions as Array<{
        championId: number;
        games: number;
        winRate: number;
      }>) || [];

    const enrichedTopChampions = topChampions.map((champ) => {
      const championInfo = this.dataDragon.getChampionById(champ.championId);
      return {
        ...champ,
        championName: championInfo?.name || `Champion ${champ.championId}`,
      };
    });

    return {
      puuid: playerStats.puuid,
      patch: filters.patch,
      queueId: playerStats.queueId,
      gamesPlayed: playerStats.gamesPlayed,
      wins: playerStats.wins,
      losses: playerStats.losses,
      winRate: playerStats.winRate,
      avgKda: playerStats.avgKda,
      avgCspm: playerStats.avgCspm,
      avgDpm: playerStats.avgDpm,
      avgGpm: playerStats.avgGpm,
      avgVisionScore: playerStats.avgVisionScore,
      roleDistribution: playerStats.roleDistribution as Record<string, number>,
      topChampions: enrichedTopChampions,
      lastUpdated: playerStats.lastUpdated || null,
    };
  }

  async getPlayerChampions(
    puuid: string,
    filters: {
      patch: string;
      role?: string;
      limit?: number;
      sortBy?: string;
    },
  ): Promise<PlayerChampionsDto> {
    const limit = Math.min(filters.limit || 10, 50);
    const sortBy = filters.sortBy || 'games';

    let championStats = await this.prisma.playerChampionStats.findMany({
      where: {
        puuid,
        patch: filters.patch,
        queueId: 420,
      },
    });

    if (filters.role) {
      championStats = championStats.filter((champ) => {
        const roleDistribution = champ.roleDistribution as Record<
          string,
          number
        >;
        return roleDistribution[filters.role!] > 0;
      });
    }

    championStats.sort((a, b) => {
      if (sortBy === 'winRate') return b.winRate - a.winRate;
      if (sortBy === 'kda') return b.avgKda - a.avgKda;
      return b.gamesPlayed - a.gamesPlayed;
    });

    championStats = championStats.slice(0, limit);

    const enrichedChampions = await Promise.all(
      championStats.map(async (champ) => {
        const championInfo = this.dataDragon.getChampionById(champ.championId);
        const images = championInfo
          ? await this.dataDragon.getChampionImageUrls(championInfo.id)
          : null;
        return {
          championId: champ.championId,
          championName: championInfo?.name || `Champion ${champ.championId}`,
          imageUrl: images?.square || '',
          gamesPlayed: champ.gamesPlayed,
          wins: champ.wins,
          losses: champ.losses,
          winRate: champ.winRate,
          avgKda: champ.avgKda,
          avgCspm: champ.avgCspm,
          avgDpm: champ.avgDpm,
          avgGpm: champ.avgGpm,
          avgVisionScore: champ.avgVisionScore,
          avgCsd15: champ.avgCsd15,
          avgGd15: champ.avgGd15,
          avgXpd15: champ.avgXpd15,
          roleDistribution: champ.roleDistribution as Record<string, number>,
          lastPlayedAt: champ.lastPlayedAt,
        };
      }),
    );

    return {
      puuid,
      patch: filters.patch,
      champions: enrichedChampions,
    };
  }

  async getPlayerRoleDistribution(
    puuid: string,
    filters: { patch: string },
  ): Promise<PlayerRoleDistributionDto> {
    const roleStats = await this.prisma.$queryRaw<
      Array<{
        role: string;
        gamesplayed: bigint;
        wins: bigint;
        losses: bigint;
        winrate: number;
        avgkda: number;
      }>
    >`
      SELECT
        mp.role,
        COUNT(*) as gamesPlayed,
        SUM(CASE WHEN mp.win THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN NOT mp.win THEN 1 ELSE 0 END) as losses,
        (SUM(CASE WHEN mp.win THEN 1 ELSE 0 END)::float / COUNT(*)) * 100 as winRate,
        AVG(mp.kda) as avgKda
      FROM match_participants mp
      JOIN matches m ON mp."matchId" = m."matchId"
      WHERE mp.puuid = ${puuid}
        AND m."queueId" = 420
        ${filters.patch !== 'ALL' ? Prisma.sql`AND m."gameVersion" LIKE ${filters.patch + '%'}` : Prisma.empty}
      GROUP BY mp.role
      ORDER BY gamesPlayed DESC
    `;

    const totalGames = roleStats.reduce(
      (sum, role) => sum + Number(role.gamesplayed),
      0,
    );

    const r2 = (v: number): number => parseFloat(v.toFixed(2));

    const roles = roleStats.map((role) => ({
      role: role.role,
      gamesPlayed: Number(role.gamesplayed),
      percentage:
        totalGames > 0 ? r2((Number(role.gamesplayed) / totalGames) * 100) : 0,
      wins: Number(role.wins),
      losses: Number(role.losses),
      winRate: r2(role.winrate),
      avgKda: r2(role.avgkda),
    }));

    return {
      puuid,
      patch: filters.patch,
      roles,
      totalGames,
    };
  }

  async getPlayerActivity(
    puuid: string,
    filters: { patch: string },
  ): Promise<PlayerActivityDto> {
    const activityData = await this.prisma.$queryRaw<
      Array<{
        dayofweek: number;
        hour: number;
        games: bigint;
        wins: bigint;
        losses: bigint;
        winrate: number;
      }>
    >`
      SELECT
        EXTRACT(DOW FROM TO_TIMESTAMP(m."gameCreation" / 1000) AT TIME ZONE 'America/Sao_Paulo') as dayOfWeek,
        EXTRACT(HOUR FROM TO_TIMESTAMP(m."gameCreation" / 1000) AT TIME ZONE 'America/Sao_Paulo') as hour,
        COUNT(*) as games,
        SUM(CASE WHEN mp.win THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN NOT mp.win THEN 1 ELSE 0 END) as losses,
        (SUM(CASE WHEN mp.win THEN 1 ELSE 0 END)::float / COUNT(*)) * 100 as winRate
      FROM match_participants mp
      JOIN matches m ON mp."matchId" = m."matchId"
      WHERE mp.puuid = ${puuid}
        AND m."queueId" = 420
        ${filters.patch !== 'ALL' ? Prisma.sql`AND m."gameVersion" LIKE ${filters.patch + '%'}` : Prisma.empty}
      GROUP BY dayOfWeek, hour
      ORDER BY dayOfWeek, hour
    `;

    const heatmap: HeatmapEntryDto[] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        heatmap.push({
          dayOfWeek: day,
          hour,
          games: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
        });
      }
    }

    activityData.forEach((entry) => {
      const index = Number(entry.dayofweek) * 24 + Number(entry.hour);
      heatmap[index] = {
        dayOfWeek: Number(entry.dayofweek),
        hour: Number(entry.hour),
        games: Number(entry.games),
        wins: Number(entry.wins),
        losses: Number(entry.losses),
        winRate: entry.winrate,
      };
    });

    const insights = this.calculateActivityInsights(heatmap);

    return {
      puuid,
      patch: filters.patch,
      heatmap,
      insights,
    };
  }

  private calculateActivityInsights(heatmap: HeatmapEntryDto[]) {
    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    const dayStats = new Array(7).fill(0).map(() => ({ games: 0, wins: 0 }));
    heatmap.forEach((entry) => {
      dayStats[entry.dayOfWeek].games += entry.games;
      dayStats[entry.dayOfWeek].wins += entry.wins;
    });
    const mostActiveDayIndex = dayStats.reduce(
      (maxIdx, day, idx, arr) => (day.games > arr[maxIdx].games ? idx : maxIdx),
      0,
    );

    const mostActiveHourEntry = heatmap.reduce((max, entry) =>
      entry.games > max.games ? entry : max,
    );

    const qualifiedEntries = heatmap.filter((e) => e.games >= 5);
    const peakWinRateEntry =
      qualifiedEntries.length > 0
        ? qualifiedEntries.reduce((max, entry) =>
            entry.winRate > max.winRate ? entry : max,
          )
        : null;
    const worstWinRateEntry =
      qualifiedEntries.length > 0
        ? qualifiedEntries.reduce((min, entry) =>
            entry.winRate < min.winRate ? entry : min,
          )
        : null;

    return {
      mostActiveDay: dayNames[mostActiveDayIndex],
      mostActiveDayGames: dayStats[mostActiveDayIndex].games,
      mostActiveHour: mostActiveHourEntry.hour,
      mostActiveHourGames: mostActiveHourEntry.games,
      peakWinRate: peakWinRateEntry?.winRate || 0,
      peakWinRateTime: peakWinRateEntry
        ? `${dayNames[peakWinRateEntry.dayOfWeek]} ${peakWinRateEntry.hour}h`
        : 'N/A',
      worstWinRate: worstWinRateEntry?.winRate || 0,
      worstWinRateTime: worstWinRateEntry
        ? `${dayNames[worstWinRateEntry.dayOfWeek]} ${worstWinRateEntry.hour}h`
        : 'N/A',
    };
  }

  // ========== Player Match History ==========

  private readonly matchListSelect = {
    matchId: true,
    championId: true,
    championName: true,
    role: true,
    lane: true,
    kills: true,
    deaths: true,
    assists: true,
    kda: true,
    goldEarned: true,
    totalDamage: true,
    visionScore: true,
    win: true,
    csGraph: true,
    match: {
      select: {
        gameCreation: true,
        gameDuration: true,
        queueId: true,
      },
    },
  } as const;

  private buildMatchWhere(
    puuid: string,
    filters: PlayerMatchesQueryDto,
    cursorGameCreation?: bigint,
  ): Prisma.MatchParticipantWhereInput {
    const matchConditions: Prisma.MatchWhereInput = {
      queueId: filters.queueId ?? 420,
    };

    if (
      filters.startDate ||
      filters.endDate ||
      cursorGameCreation !== undefined
    ) {
      matchConditions.gameCreation = {};
      if (filters.startDate)
        matchConditions.gameCreation.gte = BigInt(filters.startDate);
      if (filters.endDate)
        matchConditions.gameCreation.lte = BigInt(filters.endDate);
      if (cursorGameCreation !== undefined)
        matchConditions.gameCreation.lt = cursorGameCreation;
    }

    const where: Prisma.MatchParticipantWhereInput = {
      puuid,
      match: matchConditions,
    };

    if (filters.championId) {
      where.championId = filters.championId;
    }

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.result) {
      where.win = filters.result === 'win';
    }

    return where;
  }

  private buildMatchOrderBy(
    sortBy?: string,
  ): Prisma.MatchParticipantOrderByWithRelationInput {
    switch (sortBy) {
      case 'kda':
        return { kda: 'desc' as const };
      case 'kills':
        return { kills: 'desc' as const };
      case 'damage':
        return { totalDamage: 'desc' as const };
      default:
        return { match: { gameCreation: 'desc' as const } };
    }
  }

  private toPlayerMatchDto(match: MatchRow): PlayerMatchDto {
    const gameDurationMinutes = match.match.gameDuration / 60;
    const cspm =
      match.csGraph.length > 0
        ? match.csGraph[match.csGraph.length - 1] / gameDurationMinutes
        : 0;

    return {
      matchId: match.matchId,
      championId: match.championId,
      championName: match.championName,
      role: match.role,
      lane: match.lane,
      kills: match.kills,
      deaths: match.deaths,
      assists: match.assists,
      kda: match.kda,
      goldEarned: match.goldEarned,
      totalDamage: match.totalDamage,
      visionScore: match.visionScore,
      cspm: parseFloat(cspm.toFixed(2)),
      win: match.win,
      gameCreation: Number(match.match.gameCreation),
      gameDuration: match.match.gameDuration,
      queueId: match.match.queueId,
    };
  }

  async getPlayerMatches(
    puuid: string,
    filters: PlayerMatchesQueryDto,
  ): Promise<PlayerMatchesDto> {
    const limit = filters.limit ?? 20;

    let cursorGameCreation: bigint | undefined;
    if (filters.cursor) {
      const cursorMatch = await this.prisma.match.findUnique({
        where: { matchId: filters.cursor },
        select: { gameCreation: true },
      });
      cursorGameCreation = cursorMatch?.gameCreation;
    }

    const where = this.buildMatchWhere(puuid, filters, cursorGameCreation);

    const orderBy = this.buildMatchOrderBy(filters.sortBy);

    const matches = await this.prisma.matchParticipant.findMany({
      where,
      select: this.matchListSelect,
      orderBy,
      take: limit + 1,
    });

    const hasMore = matches.length > limit;
    const resultMatches = matches.slice(0, limit);
    const enriched = resultMatches.map((m) => this.toPlayerMatchDto(m));

    return {
      puuid,
      matches: enriched,
      nextCursor: hasMore ? enriched[enriched.length - 1].matchId : null,
      hasMore,
    };
  }

  async getPlayerMatchesByPage(
    puuid: string,
    filters: PlayerMatchesPageQueryDto,
  ): Promise<PlayerMatchesDto> {
    const limit = filters.limit ?? 20;
    const page = filters.page ?? 1;
    const skip = (page - 1) * limit;
    const where = this.buildMatchWhere(puuid, filters);
    const orderBy = this.buildMatchOrderBy(filters.sortBy);

    const matches = await this.prisma.matchParticipant.findMany({
      where,
      select: this.matchListSelect,
      orderBy,
      skip,
      take: limit + 1,
    });

    const hasMore = matches.length > limit;
    const resultMatches = matches.slice(0, limit);
    const enriched = resultMatches.map((m) => this.toPlayerMatchDto(m));

    return {
      puuid,
      matches: enriched,
      nextCursor: hasMore ? enriched[enriched.length - 1].matchId : null,
      hasMore,
    };
  }
}
