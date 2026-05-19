export interface ChampionInfo {
  id: string;
  name: string;
}

export interface ChampionImages {
  square: string;
}

export interface EnrichedChampionData {
  championId: number;
  championName: string;
  imageUrl: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgKda: number;
  avgCspm: number;
  avgDpm: number;
  avgGpm: number;
  avgVisionScore: number;
  avgCsd15: number;
  avgGd15: number;
  avgXpd15: number;
  roleDistribution: Record<string, number>;
  lastPlayedAt: Date;
}

export function enrichChampionStats(
  champ: {
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
    avgCsd15: number;
    avgGd15: number;
    avgXpd15: number;
  roleDistribution: unknown;
  lastPlayedAt: Date | null;
  },
  championInfo: ChampionInfo | undefined | null,
  images: ChampionImages | null,
): EnrichedChampionData {
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
}
