import { selectUniqueOpponent } from '../contracts/eligibility';
import { perMinute } from '../../../lib/math/per-minute';

export interface MatchParticipant {
  puuid: string;
  championId: number;
  championName: string;
  role: string;
  teamId: number;
  totalDamage: number;
  goldEarned: number;
  csGraph: number[];
  totalCs?: number;
  visionScore: number;
  damageTaken: number;
  kda: number;
  match?: { gameDuration: number };
}

export interface PerformanceMetrics {
  championId: number;
  championName: string;
  role: string;
  dpm: number | null;
  gpm: number | null;
  cspm: number | null;
  visionScorePerMin: number | null;
  damageTakenPerMin: number | null;
  kda: number;
  reasons?: Record<string, string>;
}

export interface OpponentMetrics extends PerformanceMetrics {
  puuid: string;
}

export interface Comparison {
  dpmAdvantage: number | null;
  dpmAdvantagePercent: number | null;
  gpmAdvantage: number | null;
  gpmAdvantagePercent: number | null;
  cspmAdvantage: number | null;
  cspmAdvantagePercent: number | null;
  visionAdvantage: number | null;
  /** Deprecated: damage received cannot establish survivability. */
  survivability: null;
  survivabilityReason: 'not_a_survivability_measure';
  damageTakenPerMinDifference: number | null;
  reasons: Record<string, string>;
}

export function computePlayerMetrics(
  player: MatchParticipant,
  gameDurationMinutes: number,
): PerformanceMetrics {
  const rates = {
    dpm: perMinute(player.totalDamage, gameDurationMinutes * 60),
    gpm: perMinute(player.goldEarned, gameDurationMinutes * 60),
    cspm: perMinute(player.totalCs, gameDurationMinutes * 60),
    visionScorePerMin: perMinute(player.visionScore, gameDurationMinutes * 60),
    damageTakenPerMin: perMinute(player.damageTaken, gameDurationMinutes * 60),
  };
  return {
    championId: player.championId,
    championName: player.championName,
    role: player.role,
    ...rates,
    kda: player.kda,
    reasons: Object.fromEntries(
      Object.entries(rates)
        .filter(([, v]) => v === null)
        .map(([k]) => [
          k,
          gameDurationMinutes <= 0
            ? 'zero_denominator'
            : 'missing_or_invalid_field',
        ]),
    ),
  };
}

export function findLaneOpponent(
  participants: MatchParticipant[],
  player: MatchParticipant,
): MatchParticipant | undefined {
  return selectUniqueOpponent(player, participants).opponent ?? undefined;
}

export function computeComparison(
  player: PerformanceMetrics,
  opponent: OpponentMetrics,
): Comparison {
  const difference = (a: number | null, b: number | null) =>
    a !== null && b !== null ? a - b : null;
  const reasons: Record<string, string> = {};
  const percent = (name: string, a: number | null, b: number | null) => {
    if (a === null || b === null || b === 0) {
      reasons[name] = b === 0 ? 'zero_denominator' : 'missing_or_invalid_field';
      return null;
    }
    return ((a - b) / b) * 100;
  };
  return {
    dpmAdvantage: difference(player.dpm, opponent.dpm),
    dpmAdvantagePercent: percent(
      'dpmAdvantagePercent',
      player.dpm,
      opponent.dpm,
    ),
    gpmAdvantage: difference(player.gpm, opponent.gpm),
    gpmAdvantagePercent: percent(
      'gpmAdvantagePercent',
      player.gpm,
      opponent.gpm,
    ),
    cspmAdvantage: difference(player.cspm, opponent.cspm),
    cspmAdvantagePercent: percent(
      'cspmAdvantagePercent',
      player.cspm,
      opponent.cspm,
    ),
    visionAdvantage: difference(
      player.visionScorePerMin,
      opponent.visionScorePerMin,
    ),
    damageTakenPerMinDifference: difference(
      player.damageTakenPerMin,
      opponent.damageTakenPerMin,
    ),
    survivability: null,
    survivabilityReason: 'not_a_survivability_measure',
    reasons,
  };
}
