/** MET20 method1: empirical inverse CDF plus a DKW-Massart simultaneous band. */
export const REFERENCE_METHOD_VERSION = 1;
export interface PrecisionPolicy {
  confidence: number;
  cdfHalfWidth: number;
  minimumUnits: number;
}
export const DEFAULT_PRECISION: PrecisionPolicy = {
  confidence: 0.95,
  cdfHalfWidth: 0.15,
  minimumUnits: 0,
};
export function precisionPolicy(
  raw: Partial<PrecisionPolicy> = {},
): PrecisionPolicy {
  const p = { ...DEFAULT_PRECISION, ...raw };
  if (
    !Number.isFinite(p.confidence) ||
    p.confidence < 0.8 ||
    p.confidence > 0.999 ||
    !Number.isFinite(p.cdfHalfWidth) ||
    p.cdfHalfWidth < 0.01 ||
    p.cdfHalfWidth > 0.25 ||
    !Number.isSafeInteger(p.minimumUnits) ||
    p.minimumUnits < 0 ||
    p.minimumUnits > 100000
  )
    throw new Error(
      'Precision requires confidence0.8..0.999, cdfHalfWidth0.01..0.25, minimumUnits0..100000',
    );
  return p;
}
export function requiredReferenceUnits(policy: PrecisionPolicy): number {
  const p = precisionPolicy(policy);
  return Math.max(
    p.minimumUnits,
    Math.ceil(Math.log(2 / (1 - p.confidence)) / (2 * p.cdfHalfWidth ** 2)),
  );
}
export function dkwHalfWidth(n: number, confidence: number): number | null {
  if (
    !Number.isSafeInteger(n) ||
    n < 0 ||
    !Number.isFinite(confidence) ||
    confidence <= 0 ||
    confidence >= 1
  )
    throw new Error('Invalid confidence/sample count');
  return n === 0
    ? null
    : Math.min(1, Math.sqrt(Math.log(2 / (1 - confidence)) / (2 * n)));
}
/** Type1 (inverse empirical CDF); even-N median is the lower central order statistic. */
export function empiricalQuantile(
  sorted: readonly number[],
  probability: number,
): number | null {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1)
    throw new Error('Invalid quantile probability');
  if (
    sorted.some((v, i) => !Number.isFinite(v) || (i > 0 && v < sorted[i - 1]))
  )
    throw new Error('Quantile input must be finite and sorted');
  return sorted.length
    ? sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)]
    : null;
}
export function empiricalDistribution(values: readonly number[]) {
  if (values.some((v) => !Number.isFinite(v)))
    throw new Error('Nonfinite observations cannot enter a reference');
  const sorted = [...values].sort((a, b) => a - b);
  const groups: Array<{ value: number; count: number; cdf: number }> = [];
  for (const value of sorted) {
    const last = groups.at(-1);
    if (last?.value === value) last.count++;
    else groups.push({ value, count: 1, cdf: 0 });
  }
  let count = 0;
  for (const group of groups) {
    count += group.count;
    group.cdf = count / sorted.length;
  }
  return { sorted, groups };
}
export function referenceStatistics(
  values: readonly number[],
  policy: PrecisionPolicy,
  individualValue: number | null = null,
) {
  const { sorted, groups } = empiricalDistribution(values);
  const n = sorted.length,
    requiredUnits = requiredReferenceUnits(policy),
    epsilon = dkwHalfWidth(n, policy.confidence);
  const sufficient = n >= requiredUnits;
  const precision = {
    ...policy,
    requiredUnits,
    observedUnits: n,
    achievedCdfHalfWidth: epsilon,
    sufficient,
  };
  if (!sufficient)
    return {
      precision,
      distribution: null,
      median: null,
      quantiles: null,
      individualPercentile: null,
    };
  const quantiles = [0.1, 0.25, 0.5, 0.75, 0.9].map((probability) => ({
    probability,
    value: empiricalQuantile(sorted, probability),
    interval: {
      lower:
        probability - epsilon! <= 0
          ? null
          : empiricalQuantile(sorted, probability - epsilon!),
      upper:
        probability + epsilon! >= 1
          ? null
          : empiricalQuantile(sorted, probability + epsilon!),
      lowerUnbounded: probability - epsilon! <= 0,
      upperUnbounded: probability + epsilon! >= 1,
      confidence: policy.confidence,
      method:
        'inverse DKW simultaneous CDF band; null endpoint means unbounded',
    },
  }));
  let percentile: {
    value: number;
    lower: number;
    upper: number;
    ties: number;
    method: string;
  } | null = null;
  if (individualValue !== null && Number.isFinite(individualValue)) {
    const less = sorted.filter((v) => v < individualValue).length,
      ties = sorted.filter((v) => v === individualValue).length;
    const rank = (less + ties / 2) / n;
    percentile = {
      value: 100 * rank,
      lower: 100 * Math.max(0, rank - epsilon!),
      upper: 100 * Math.min(1, rank + epsilon!),
      ties,
      method:
        '100*(strictly smaller + half ties)/n; conditional DKW band; not a competitive rank',
    };
  }
  return {
    precision,
    distribution: groups.map((group) => ({
      ...group,
      lower: Math.max(0, group.cdf - epsilon!),
      upper: Math.min(1, group.cdf + epsilon!),
    })),
    median: empiricalQuantile(sorted, 0.5),
    quantiles,
    individualPercentile: percentile,
  };
}
export interface ReferenceObservation {
  id: string;
  matchId: string;
  subjectId: string;
  gameCreation: bigint;
  value: number | null;
  roster: string[];
  eligible: boolean;
  reason: string | null;
}
/** Deterministic roster-disjoint selection reduces direct player/match reuse. It does NOT prove residual independence or representativeness. */
export function selectRosterDisjoint<T extends ReferenceObservation>(
  observations: readonly T[],
  excludePlayers: readonly string[] = [],
) {
  const used = new Set(excludePlayers),
    matches = new Set<string>(),
    ids = new Set<string>();
  const signatures = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const row of observations) {
    const signature = JSON.stringify([
      row.matchId,
      row.subjectId,
      row.gameCreation.toString(),
      row.value,
      row.eligible,
      row.reason,
      [...row.roster].sort(),
    ]);
    if (signatures.has(row.id) && signatures.get(row.id) !== signature)
      conflicts.add(row.id);
    signatures.set(row.id, signature);
  }
  const selected: T[] = [],
    excluded: Array<{ id: string; matchId: string; reason: string }> = [];
  for (const row of [...observations].sort((a, b) =>
    a.gameCreation < b.gameCreation
      ? -1
      : a.gameCreation > b.gameCreation
        ? 1
        : a.matchId.localeCompare(b.matchId) || a.id.localeCompare(b.id),
  )) {
    let reason: string | null = null;
    if (conflicts.has(row.id)) reason = 'conflicting_contribution';
    else if (ids.has(row.id)) reason = 'duplicate_contribution';
    else if (!row.eligible) reason = row.reason ?? 'ineligible';
    else if (row.value === null || !Number.isFinite(row.value))
      reason = row.reason ?? 'missing_value';
    else if (
      row.roster.length !== 10 ||
      new Set(row.roster).size !== 10 ||
      !row.roster.includes(row.subjectId)
    )
      reason = 'incomplete_roster';
    else if (matches.has(row.matchId)) reason = 'same_match';
    else if (row.roster.some((p) => used.has(p))) reason = 'overlapping_player';
    ids.add(row.id);
    if (reason) {
      excluded.push({ id: row.id, matchId: row.matchId, reason });
      continue;
    }
    selected.push(row);
    matches.add(row.matchId);
    row.roster.forEach((p) => used.add(p));
  }
  return {
    selected,
    excluded,
    policy:
      'chronological greedy selection, then matchId/id; full ten-player rosters disjoint; selection never sorts by metric value',
    assumptions:
      'Conditional bands assume remaining units are independent and share a distribution. Removing direct roster reuse does not establish this; selection may favor less frequent players and earlier matches.',
  };
}
