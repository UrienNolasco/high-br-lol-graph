export interface PlayerStatsSummary {
  puuid: string;
  patch: string;
  queueId: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgKda: number;
  avgCspm: number;
  avgDpm: number;
  avgGpm: number;
  avgVisionScore: number;
  roleDistribution: unknown;
  topChampions: Array<{
    championId: number;
    games: number;
    winRate: number;
  }>;
  lastUpdated: Date;
}

export interface PlayerChampionStat {
  championId: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgKda: number;
  avgCspm: number;
  avgDpm: number;
  avgGpm: number;
  avgVisionScore: number;
  avgCsd15: number | null;
  avgGd15: number | null;
  avgXpd15: number | null;
  roleDistribution: unknown;
  lastPlayedAt: Date | null;
}

export interface PlayerRoleStat {
  role: string;
  gamesplayed: bigint;
  wins: bigint;
  losses: bigint;
  winrate: number;
  avgkda: number;
}

export interface PlayerActivityStat {
  dayofweek: number;
  hour: number;
  games: bigint;
  wins: bigint;
  losses: bigint;
  winrate: number;
}

/** Read-only stats surface consumed by players and other modules. */
export interface StatsReader {
  getAggregatedStats(
    puuid: string,
    patch: string,
    queueId: number,
  ): Promise<PlayerStatsSummary | null>;
  getChampionStats(
    puuid: string,
    patch: string,
    queueId: number,
  ): Promise<PlayerChampionStat[]>;
  getRoleDistribution(puuid: string, patch: string): Promise<PlayerRoleStat[]>;
  getActivityData(puuid: string, patch: string): Promise<PlayerActivityStat[]>;
}

export const STATS_READER = Symbol('STATS_READER');
