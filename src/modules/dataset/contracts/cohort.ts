import {
  CanonicalRole,
  normalizeRole,
} from '../../matches/contracts/eligibility';

export interface Cohort {
  region: string | null;
  queueId: number | null;
  mapId: number | null;
  gameVersion: string | null;
  patch: string | null;
  championId: number | null;
  role: CanonicalRole | null;
  collectionSource: string | null;
}
export interface CohortMatch extends Cohort {
  matchId: string;
  gameCreation: number;
}
export interface CohortFilter {
  /** Omitted keys allow all values; explicit null selects unknown values. */
  dimensions: Partial<Cohort>;
  fromMs: number | null;
  toMs: number | null;
}
export const INITIAL_COHORT: CohortFilter = {
  dimensions: { region: 'BR', queueId: 420, mapId: 11 },
  fromMs: null,
  toMs: null,
};
export function matchesCohort(
  match: CohortMatch,
  filter: CohortFilter,
): boolean {
  return (
    Number.isFinite(match.gameCreation) &&
    Object.entries(filter.dimensions).every(([key, value]) => {
      if (key === 'role')
        return (
          normalizeRole(match.role) === normalizeRole(value as string | null)
        );
      return match[key as keyof Cohort] === value;
    }) &&
    (filter.fromMs === null || match.gameCreation >= filter.fromMs) &&
    (filter.toMs === null || match.gameCreation < filter.toMs)
  );
}
export function selectCohort<T extends CohortMatch>(
  matches: readonly T[],
  filter: CohortFilter,
  limit: number,
) {
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError('Invalid cohort limit');
  if (
    filter.fromMs !== null &&
    filter.toMs !== null &&
    filter.fromMs > filter.toMs
  )
    throw new RangeError('Invalid cohort period');
  const ordered = matches
    .filter((m) => matchesCohort(m, filter))
    .sort(
      (a, b) =>
        b.gameCreation - a.gameCreation || a.matchId.localeCompare(b.matchId),
    );
  const unique = ordered.filter(
    (m, index) =>
      ordered.findIndex((other) => other.matchId === m.matchId) === index,
  );
  return {
    matches: unique.slice(0, limit),
    eligibleN: unique.length,
    returnedN: Math.min(limit, unique.length),
    truncated: unique.length > limit,
    filter,
    order: 'gameCreation DESC, matchId ASC' as const,
  };
}
