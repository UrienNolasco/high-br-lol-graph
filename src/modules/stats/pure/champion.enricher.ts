import { ChampionMetrics } from '../services/tier-rank.service';

export function toChampionMetrics(stat: {
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

export interface EnrichedChampion {
  championId: number;
  championName: string;
  winRate: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  images: { square: string; loading: string; splash: string } | null;
  kda: number;
  dpm: number;
  cspm: number;
  gpm: number;
  banRate: number;
  pickRate: number;
  tier: string;
  rank: number | null;
  score: number;
  hasInsufficientData: boolean;
}

export function toChampionDto(c: EnrichedChampion) {
  return {
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
  };
}

export function r2(v: number): number {
  return parseFloat(v.toFixed(2));
}
