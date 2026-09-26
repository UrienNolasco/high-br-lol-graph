import type {
  CombatEvent,
  CombatParticipant,
} from '../contracts/calculations/combat';
import type { CombatSource } from '../contracts/calculations/combat-source';

export interface TimelineFilters {
  role?: string;
  championId?: number;
  patch?: string;
  queueId?: number;
  startDate?: number;
  endDate?: number;
  limit?: number;
}

export interface ComparisonCohortRow {
  matchId: string;
  puuid: string;
  role: string;
  teamId: number;
  win: boolean;
  kda: number;
  totalCs: number;
  totalDamage: number;
  goldEarned: number;
  visionScore: number;
  match: {
    gameDuration: number;
    participants: (CombatParticipant & { role: string })[];
  };
}

export interface ComparisonCohort {
  matches: ComparisonCohortRow[];
  projections: {
    matchId: string;
    projectionVersion: number;
    frames: unknown;
    observedEndMs: number | null;
  }[];
  events: CombatEvent[];
  eventSources: CombatSource[];
  eligibleN: number;
  returnedN: number;
  limit: number;
  truncated: boolean;
}

/** Stable cohort and its projections read from one database snapshot. */
export interface ComparisonCohortReader {
  findComparisonCohort(
    puuid: string,
    filters: TimelineFilters,
  ): Promise<ComparisonCohort>;
}
export const COMPARISON_COHORT_READER = Symbol('COMPARISON_COHORT_READER');
