import {
  ChampionMetrics,
  ScoreResult,
  TIER_METHOD,
} from '../services/tier-rank.service';
import { ChampionPopulationRow } from '../repositories/champion-stats.repository';
import { ChampionStatsDto } from '../dto/champion-stats.dto';

export function toChampionMetrics(
  stat: ChampionMetrics & { performanceN?: number },
): ChampionMetrics {
  return {
    winRate: stat.winRate,
    banRate: stat.banRate,
    pickRate: stat.pickRate,
    kda: stat.kda,
    dpm: stat.dpm,
    gpm: stat.gpm,
    cspm: stat.cspm,
    gamesPlayed: stat.performanceN ?? stat.gamesPlayed,
  };
}
export type EnrichedChampion = ChampionStatsDto & ScoreResult;
export function toChampionDto(c: EnrichedChampion) {
  return { ...c };
}
export function r2(v: number | null): number | null {
  return v === null ? null : parseFloat(v.toFixed(2));
}

export function championDto(
  stat: ChampionPopulationRow,
  score: ScoreResult,
  images: ChampionStatsDto['images'],
  name: string | null,
  catalogAvailable: boolean,
  previousPatch: string | null,
): ChampionStatsDto {
  return {
    championId: stat.championId,
    championName: name ?? stat.championName,
    images,
    winRate: stat.winRate,
    gamesPlayed: stat.gamesPlayed,
    wins: stat.wins,
    losses: stat.losses,
    kda: stat.kda,
    dpm: stat.dpm,
    cspm: stat.cspm,
    gpm: stat.gpm,
    banRate: stat.banRate,
    pickRate: stat.pickRate,
    tier: score.tier,
    rank: null,
    score: score.score,
    hasInsufficientData: score.hasInsufficientData,
    metricId: 'H07',
    metricVersion: 1,
    availability: {
      performance: stat.performanceN
        ? null
        : stat.pickedMatches
          ? 'ambiguous_selection'
          : 'no_picks',
      banRate:
        stat.banRate === null
          ? stat.eligibleN
            ? 'missing_bans'
            : 'zero_denominator'
          : null,
      pickRate: stat.pickRate === null ? 'zero_denominator' : null,
      catalog: catalogAvailable ? null : 'missing_catalog',
      tier: score.reason ?? null,
    },
    population: {
      eligibleN: stat.eligibleN,
      selectedN: stat.selectedN,
      excludedN: stat.excludedN,
      excludedReasons: stat.excludedReasons,
      pickedMatches: stat.pickedMatches,
      bannedMatches: stat.bannedMatches,
      bansObservedN: stat.bansObservedN,
      performanceN: stat.performanceN,
      banCoverage: stat.eligibleN ? stat.bansObservedN / stat.eligibleN : null,
      patch: stat.patch,
      queueId: stat.queueId,
      mapId: 11,
    },
    tierMethod: { ...TIER_METHOD, previousPatch },
  };
}
