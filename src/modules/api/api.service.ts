import { Injectable, NotFoundException } from '@nestjs/common';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RiotService } from '../../core/riot/riot.service';
import {
  ChampionStatsDto,
  PaginatedChampionStatsDto,
} from './dto/champion-stats.dto';
import { ChampionListDto, ChampionListItemDto } from './dto/champion-list.dto';
import { TierRankService, ChampionMetrics } from './tier-rank.service';
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

@Injectable()
export class ApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataDragon: DataDragonService,
    private readonly tierRankService: TierRankService,
    private readonly riotService: RiotService,
  ) {}

  private toChampionMetrics(stat: {
    winRate: number;
    banRate: number;
    pickRate: number;
    kda: number;
    dpm: number;
    gpm: number;
    cspm: number;
    gamesPlayed: number;
  }): ChampionMetrics {
    return {
      winRate: stat.winRate,
      banRate: stat.banRate,
      pickRate: stat.pickRate,
      kda: stat.kda,
      dpm: stat.dpm,
      gpm: stat.gpm,
      cspm: stat.cspm,
      gamesPlayed: stat.gamesPlayed,
    };
  }

  async getChampionStats(
    patch: string,
    page?: number,
    limit?: number,
    sortBy?: keyof ChampionStatsDto,
    order?: 'asc' | 'desc',
  ): Promise<PaginatedChampionStatsDto> {
    const currentPage = page ?? 1;
    const currentLimit = limit ?? 20;
    const currentSortBy = sortBy ?? 'winRate';
    const currentOrder = order ?? 'desc';

    const championStats = await this.prisma.championStats.findMany({
      where: { patch },
    });

    // Previous patch for comparison
    const previousPatch = this.tierRankService.getPreviousPatch(patch);
    const previousStatsMap = new Map<number, ChampionMetrics>();

    if (previousPatch) {
      const previousStats = await this.prisma.championStats.findMany({
        where: { patch: previousPatch },
      });
      for (const stat of previousStats) {
        previousStatsMap.set(stat.championId, this.toChampionMetrics(stat));
      }
    }

    const enrichedStatsPromises = championStats.map(async (stat) => {
      const championInfo = this.dataDragon.getChampionById(stat.championId);
      if (!championInfo) return null;

      const images = await this.dataDragon.getChampionImageUrls(
        championInfo.id,
      );

      const currentMetrics = this.toChampionMetrics(stat);
      const previousMetrics =
        previousStatsMap.get(stat.championId) || null;

      const scoreResult = this.tierRankService.calculateChampionScore(
        stat.championId,
        patch,
        currentMetrics,
        previousMetrics,
      );

      return {
        championId: stat.championId,
        championName: championInfo.name,
        winRate: parseFloat(stat.winRate.toFixed(2)),
        gamesPlayed: stat.gamesPlayed,
        wins: stat.wins,
        losses: stat.losses,
        images,
        kda: parseFloat(stat.kda.toFixed(2)),
        dpm: parseFloat(stat.dpm.toFixed(2)),
        cspm: parseFloat(stat.cspm.toFixed(2)),
        gpm: parseFloat(stat.gpm.toFixed(2)),
        banRate: parseFloat(stat.banRate.toFixed(2)),
        pickRate: parseFloat(stat.pickRate.toFixed(2)),
        tier: scoreResult.tier,
        rank: null as number | null,
        score: scoreResult.score,
        hasInsufficientData: scoreResult.hasInsufficientData,
      };
    });

    const results = await Promise.all(enrichedStatsPromises);
    const validResults = results.filter(
      (r): r is NonNullable<typeof r> => r !== null,
    );

    // Rank champions by score (only those with sufficient data)
    const withData = validResults.filter((c) => !c.hasInsufficientData);
    withData.sort((a, b) => b.score - a.score);
    withData.forEach((c, i) => {
      c.rank = i + 1;
    });

    const enrichedStats: ChampionStatsDto[] = validResults.map((c) => ({
      championId: c.championId,
      championName: c.championName,
      winRate: c.winRate,
      gamesPlayed: c.gamesPlayed,
      wins: c.wins,
      losses: c.losses,
      images: c.images,
      kda: c.kda,
      dpm: c.dpm,
      cspm: c.cspm,
      gpm: c.gpm,
      banRate: c.banRate,
      pickRate: c.pickRate,
      tier: c.tier,
      rank: c.rank,
    }));

    enrichedStats.sort((a, b) => {
      const aValue = a[currentSortBy];
      const bValue = b[currentSortBy];

      if (aValue === undefined || bValue === undefined) return 0;
      if (aValue === bValue) return 0;

      if (currentOrder === 'desc') {
        return (aValue ?? 0) > (bValue ?? 0) ? -1 : 1;
      } else {
        return (aValue ?? 0) < (bValue ?? 0) ? -1 : 1;
      }
    });

    const startIndex = (currentPage - 1) * currentLimit;
    const paginatedData = enrichedStats.slice(
      startIndex,
      startIndex + currentLimit,
    );

    return {
      data: paginatedData,
      total: enrichedStats.length,
      page: Number(currentPage),
      limit: Number(currentLimit),
    };
  }

  async getChampion(
    championName: string,
    patch: string,
  ): Promise<ChampionStatsDto> {
    const championInfo = this.dataDragon.getChampionByName(championName);
    if (!championInfo) {
      throw new NotFoundException(`Champion ${championName} not found`);
    }

    const championId = parseInt(championInfo.key, 10);
    const stats = await this.prisma.championStats.findFirst({
      where: { championId, patch },
    });

    if (!stats) {
      throw new NotFoundException(
        `Stats for champion ${championName} not found on patch ${patch}`,
      );
    }

    const images = await this.dataDragon.getChampionImageUrls(championInfo.id);

    const currentMetrics = this.toChampionMetrics(stats);

    // Previous patch comparison
    const previousPatch = this.tierRankService.getPreviousPatch(patch);
    let previousMetrics: ChampionMetrics | null = null;
    if (previousPatch) {
      previousMetrics = await this.tierRankService.getChampionStats(
        championId,
        previousPatch,
        stats.queueId,
      );
    }

    const scoreResult = this.tierRankService.calculateChampionScore(
      championId,
      patch,
      currentMetrics,
      previousMetrics,
    );

    // Calculate rank among all champions with sufficient data
    let rank: number | null = null;
    if (!scoreResult.hasInsufficientData) {
      const allStats = await this.prisma.championStats.findMany({
        where: { patch, gamesPlayed: { gte: 50 } },
      });

      const allPreviousMap = new Map<number, ChampionMetrics>();
      if (previousPatch) {
        const prevAll = await this.prisma.championStats.findMany({
          where: { patch: previousPatch, gamesPlayed: { gte: 50 } },
        });
        for (const p of prevAll) {
          allPreviousMap.set(p.championId, this.toChampionMetrics(p));
        }
      }

      const scores = allStats.map((s) => {
        const prev = allPreviousMap.get(s.championId) || null;
        const result = this.tierRankService.calculateChampionScore(
          s.championId,
          patch,
          this.toChampionMetrics(s),
          prev,
        );
        return {
          championId: s.championId,
          score: result.score,
          hasInsufficientData: result.hasInsufficientData,
        };
      });

      const validScores = scores
        .filter((s) => !s.hasInsufficientData)
        .sort((a, b) => b.score - a.score);

      const idx = validScores.findIndex((s) => s.championId === championId);
      if (idx !== -1) rank = idx + 1;
    }

    return {
      championId: stats.championId,
      championName: championInfo.name,
      winRate: parseFloat(stats.winRate.toFixed(2)),
      gamesPlayed: stats.gamesPlayed,
      wins: stats.wins,
      losses: stats.losses,
      images,
      kda: parseFloat(stats.kda.toFixed(2)),
      dpm: parseFloat(stats.dpm.toFixed(2)),
      cspm: parseFloat(stats.cspm.toFixed(2)),
      gpm: parseFloat(stats.gpm.toFixed(2)),
      banRate: parseFloat(stats.banRate.toFixed(2)),
      pickRate: parseFloat(stats.pickRate.toFixed(2)),
      tier: scoreResult.tier,
      rank,
    };
  }

  async getAllChampions(): Promise<ChampionListDto> {
    const champions = this.dataDragon.getAllChampions();

    const championList: ChampionListItemDto[] = await Promise.all(
      champions.map(async (champion) => {
        const images = await this.dataDragon.getChampionImageUrls(champion.id);

        return {
          name: champion.name,
          id: champion.id,
          key: parseInt(champion.key, 10),
          title: champion.title,
          version: champion.version,
          images,
        };
      }),
    );

    return {
      champions: championList,
      total: championList.length,
    };
  }

  async getCurrentPatch() {
    const versions = await this.dataDragon.getVersions();

    const patches = versions.map((fullVersion) => {
      const patchParts = fullVersion.split('.');
      let patch: string;
      if (patchParts.length >= 2) {
        patch = `${patchParts[0]}.${patchParts[1]}`;
      } else {
        patch = fullVersion;
      }

      return {
        patch,
        fullVersion,
      };
    });

    return {
      patches,
      current: patches[0],
    };
  }

  async getProcessedMatches(
    patch?: string,
  ): Promise<{ count: number; patch?: string; message?: string }> {
    if (patch) {
      const count = await this.prisma.match.count({
        where: {
          gameVersion: { startsWith: patch },
        },
      });
      if (count === 0) {
        return {
          count: 0,
          patch,
          message: `Não há dados para o patch ${patch}`,
        };
      }
      return { count, patch };
    }
    const totalCount = await this.prisma.match.count();
    return { count: totalCount };
  }

  // ========== NOVOS MÉTODOS - Schema V2 ==========

  /**
   * Busca histórico de partidas de um jogador (LEVE - sem gráficos)
   * Otimizado para mobile: retorna apenas dados essenciais para lista
   * Suporta filtros avançados, cursor pagination e ordenação customizada
   */
  async getPlayerMatches(
    puuid: string,
    filters: PlayerMatchesQueryDto,
  ): Promise<PlayerMatchesDto> {
    const limit = filters.limit ?? 20;
    const where = this.buildMatchWhere(puuid, filters);

    // Cursor pagination via gameCreation
    if (filters.cursor) {
      const cursorMatch = await this.prisma.match.findUnique({
        where: { matchId: filters.cursor },
        select: { gameCreation: true },
      });
      if (cursorMatch) {
        where.match = {
          ...where.match,
          gameCreation: {
            ...(where.match?.gameCreation as object),
            lt: cursorMatch.gameCreation,
          },
        };
      }
    }

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

  /**
   * Busca partidas de um jogador por página (alternativa ao cursor)
   * Suporta os mesmos filtros avançados
   */
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

  // ========== Match History Helpers ==========

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
  ): any {
    const where: any = {
      puuid,
      match: {
        queueId: filters.queueId ?? 420,
      },
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

    if (filters.startDate) {
      where.match.gameCreation = {
        ...where.match.gameCreation,
        gte: BigInt(filters.startDate),
      };
    }

    if (filters.endDate) {
      where.match.gameCreation = {
        ...where.match.gameCreation,
        lte: BigInt(filters.endDate),
      };
    }

    return where;
  }

  private buildMatchOrderBy(sortBy?: string) {
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

  private toPlayerMatchDto(match: any): PlayerMatchDto {
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

  /**
   * Busca detalhes completos de uma partida (PESADO - com gráficos)
   * Retorna todos os dados incluindo séries temporais e posições
   */
  async getMatchDetails(matchId: string): Promise<any> {
    return this.prisma.match.findUnique({
      where: { matchId },
      include: {
        teams: true,
        participants: true,
      },
    });
  }

  /**
   * Retorna o perfil cacheado de um jogador (dados do banco, sem chamadas API)
   */
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

  /**
   * Retorna o status de processamento de partidas do jogador
   */
  async getPlayerUpdateStatus(
    puuid: string,
  ): Promise<PlayerUpdateStatusDto> {
    // Verificar se o jogador existe
    const user = await this.prisma.user.findUnique({
      where: { puuid },
    });

    if (!user) {
      throw new NotFoundException(`Player with PUUID ${puuid} not found`);
    }

    try {
      // Buscar últimas 20 partidas da API Riot
      const matchIds = await this.riotService.getMatchIdsByPuuid(puuid, 20);

      // Contar quantas existem no banco
      const matchesProcessed = await this.prisma.match.count({
        where: { matchId: { in: matchIds } },
      });

      const matchesTotal = matchIds.length;

      // Determinar status
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
    } catch (error) {
      return {
        status: UpdateStatus.ERROR,
        matchesProcessed: 0,
        matchesTotal: 0,
        message: 'Failed to fetch match status from Riot API',
      };
    }
  }

  // ========== MACRO ANALYSIS ENDPOINTS ==========

  async getPlayerSummary(
    puuid: string,
    filters: { patch?: string },
  ): Promise<PlayerSummaryDto> {
    const patch =
      filters.patch === 'lifetime' || !filters.patch ? null : filters.patch;

    const playerStats = await this.prisma.playerStats.findUnique({
      where: {
        puuid_patch_queueId: {
          puuid,
          patch: patch as string,
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
      patch: patch || 'lifetime',
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
      lastUpdated: playerStats.lastUpdated,
    };
  }

  async getPlayerChampions(
    puuid: string,
    filters: {
      patch?: string;
      role?: string;
      limit?: number;
      sortBy?: string;
    },
  ): Promise<PlayerChampionsDto> {
    const patch =
      filters.patch === 'lifetime' || !filters.patch ? null : filters.patch;
    const limit = Math.min(filters.limit || 10, 50);
    const sortBy = filters.sortBy || 'games';

    let championStats = await this.prisma.playerChampionStats.findMany({
      where: {
        puuid,
        patch,
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

    const enrichedChampions = championStats.map((champ) => {
      const championInfo = this.dataDragon.getChampionById(champ.championId);
      return {
        championId: champ.championId,
        championName: championInfo?.name || `Champion ${champ.championId}`,
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
    });

    return {
      puuid,
      patch: patch || 'lifetime',
      champions: enrichedChampions,
    };
  }

  async getPlayerRoleDistribution(
    puuid: string,
    filters: { patch?: string },
  ): Promise<PlayerRoleDistributionDto> {
    const patch = filters.patch;

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
        ${patch && patch !== 'lifetime' ? Prisma.sql`AND m."gameVersion" LIKE ${patch + '%'}` : Prisma.empty}
      GROUP BY mp.role
      ORDER BY gamesPlayed DESC
    `;

    const totalGames = roleStats.reduce(
      (sum, role) => sum + Number(role.gamesplayed),
      0,
    );

    const roles = roleStats.map((role) => ({
      role: role.role,
      gamesPlayed: Number(role.gamesplayed),
      percentage:
        totalGames > 0 ? (Number(role.gamesplayed) / totalGames) * 100 : 0,
      wins: Number(role.wins),
      losses: Number(role.losses),
      winRate: role.winrate,
      avgKda: role.avgkda,
    }));

    return {
      puuid,
      patch: patch || 'lifetime',
      roles,
      totalGames,
    };
  }

  async getPlayerActivity(
    puuid: string,
    filters: { patch?: string },
  ): Promise<PlayerActivityDto> {
    const patch = filters.patch;

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
        ${patch && patch !== 'lifetime' ? Prisma.sql`AND m."gameVersion" LIKE ${patch + '%'}` : Prisma.empty}
      GROUP BY dayOfWeek, hour
      ORDER BY dayOfWeek, hour
    `;

    // Build complete 7x24 matrix
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
      patch: patch || 'lifetime',
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

    // Aggregate by day
    const dayStats = new Array(7)
      .fill(0)
      .map(() => ({ games: 0, wins: 0 }));
    heatmap.forEach((entry) => {
      dayStats[entry.dayOfWeek].games += entry.games;
      dayStats[entry.dayOfWeek].wins += entry.wins;
    });
    const mostActiveDayIndex = dayStats.reduce(
      (maxIdx, day, idx, arr) =>
        day.games > arr[maxIdx].games ? idx : maxIdx,
      0,
    );

    // Most active hour
    const mostActiveHourEntry = heatmap.reduce((max, entry) =>
      entry.games > max.games ? entry : max,
    );

    // Best/worst winrate (minimum 5 games)
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
}
