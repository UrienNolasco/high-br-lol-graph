import { createHash } from 'node:crypto';
import type { DatasetQueryRow } from '../dataset/contracts/query';
type DatasetContribution = Omit<
  DatasetQueryRow,
  'gameCreation' | 'processedAt'
> & { gameCreation: bigint; processedAt: Date };
import { DATASET_DEFINITION_MAP } from '../dataset/contracts/definition';
import {
  empiricalDistribution,
  empiricalQuantile,
} from '../../lib/math/empirical-distribution';
import { requiredReferenceUnits } from '../references/contracts/statistics';
import {
  DEATH_PATTERN_DEFINITION,
  EVOLUTION_METHOD_VERSION,
  EvolutionQuery,
  EvolutionWindow,
} from './evolution-contract';
export type EvolutionRow = Pick<
  DatasetContribution,
  | 'id'
  | 'matchId'
  | 'subjectId'
  | 'gameCreation'
  | 'definitionId'
  | 'definitionVersion'
  | 'horizonKey'
  | 'patch'
  | 'queueId'
  | 'mapId'
  | 'championId'
  | 'role'
  | 'eligible'
  | 'exclusionReason'
  | 'value'
  | 'validCount'
  | 'reason'
  | 'numerator'
  | 'denominatorValue'
  | 'ratioScale'
  | 'quality'
  | 'processedAt'
  | 'processingVersion'
  | 'lineage'
>;
const object = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const count = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0;
const counts = (rows: readonly EvolutionRow[]) => ({
  rows: rows.length,
  matches: new Set(rows.map((r) => r.matchId)).size,
  players: new Set(rows.map((r) => r.subjectId)).size,
});
const reasons = (
  rows: readonly EvolutionRow[],
  field: 'reason' | 'exclusionReason',
) =>
  rows.reduce<Record<string, number>>((out, r) => {
    const key = r[field] ?? 'missing_value';
    out[key] = (out[key] ?? 0) + 1;
    return out;
  }, {});
/** Identity conflicts are unavailable, not whichever value arrived last. */
export function uniqueEvolutionRows(rows: readonly EvolutionRow[]) {
  const grouped = new Map<string, EvolutionRow[]>();
  for (const r of rows) {
    const key = JSON.stringify([
      r.matchId,
      r.subjectId,
      r.definitionId,
      r.definitionVersion,
      r.horizonKey,
    ]);
    grouped.set(key, [...(grouped.get(key) ?? []), r]);
  }
  const unique: EvolutionRow[] = [];
  let duplicateRows = 0,
    conflictingIdentities = 0;
  for (const group of grouped.values()) {
    duplicateRows += group.length - 1;
    const serialize = (r: EvolutionRow) =>
      JSON.stringify({ ...r, gameCreation: r.gameCreation.toString() });
    if (group.some((r) => serialize(r) !== serialize(group[0]))) {
      conflictingIdentities++;
      unique.push({
        ...group[0],
        value: null,
        validCount: 0,
        reason: 'conflicting_contribution',
        numerator: null,
        denominatorValue: null,
      });
    } else unique.push(group[0]);
  }
  return {
    rows: unique.sort((a, b) =>
      a.gameCreation < b.gameCreation
        ? -1
        : a.gameCreation > b.gameCreation
          ? 1
          : a.id.localeCompare(b.id),
    ),
    duplicateRows,
    conflictingIdentities,
  };
}
/** Ratio of sums. A zero-death match contributes known zero counts without inventing a per-match percentage. */
export function aggregateDeathPattern(rows: readonly EvolutionRow[]) {
  let numerator = 0,
    denominator = 0,
    censored = 0,
    recorded = 0,
    knownMatches = 0;
  const unknown: EvolutionRow[] = [];
  for (const row of rows.filter((r) => r.eligible)) {
    const quality = object(row.quality),
      n = row.numerator,
      d = row.denominatorValue;
    const known =
      row.definitionId === DEATH_PATTERN_DEFINITION &&
      row.definitionVersion === 1 &&
      row.ratioScale === 100 &&
      count(n) &&
      count(d) &&
      n <= d &&
      count(quality.totalSamples) &&
      quality.validSamples === d &&
      quality.totalSamples >= d &&
      ((d === 0 && n === 0 && row.reason === 'zero_denominator') ||
        (d > 0 &&
          row.reason === null &&
          row.validCount === 1 &&
          finite(row.value) &&
          Math.abs(row.value - (100 * n) / d) < 1e-7));
    if (!known) {
      unknown.push(row);
      continue;
    }
    numerator += n!;
    denominator += d!;
    recorded += quality.totalSamples as number;
    censored += (quality.totalSamples as number) - d!;
    knownMatches++;
  }
  return {
    metricId: 'C07',
    definitionId: DEATH_PATTERN_DEFINITION,
    windowMs: 60000,
    bounds: '(]',
    associatedEligibleDeaths: numerator,
    eligibleDeaths: denominator,
    recordedDeathsInKnownMatches: recorded,
    censoredDeathsInKnownMatches: censored,
    matchesWithKnownFollowup: knownMatches,
    matchesWithUnknownFollowup: unknown.length,
    unknownReasons: reasons(unknown, 'reason'),
    value: denominator ? (100 * numerator) / denominator : null,
    unit: 'percent',
    reason: denominator
      ? null
      : knownMatches
        ? 'zero_denominator'
        : 'missing_followup',
    method:
      '100*sum(eligible deaths with >=1 opposing capture within60s)/sum(deaths with complete60s follow-up); multiple captures do not multiply deaths',
    interval: null,
    intervalReason:
      'Deaths within matches and repeated player matches are dependent; no independent-binomial interval',
  };
}
const summary = (rows: readonly EvolutionRow[]) => {
  const eligible = rows.filter((r) => r.eligible),
    valid = eligible.filter((r) => r.validCount === 1 && finite(r.value)),
    values = valid.map((r) => r.value!),
    sorted = empiricalDistribution(values).sorted;
  // Incremental scaled mean avoids overflow when finite observations are very large.
  const mean = values.length
    ? values.reduce((sum, v) => sum + v / values.length, 0)
    : null;
  return {
    counts: {
      candidate: counts(rows),
      eligible: counts(eligible),
      valid: counts(valid),
    },
    coverage: {
      numerator: valid.length,
      denominator: eligible.length,
      value: eligible.length ? valid.length / eligible.length : null,
      missingReasons: reasons(
        eligible.filter((r) => r.validCount !== 1 || !finite(r.value)),
        'reason',
      ),
      exclusions: reasons(
        rows.filter((r) => !r.eligible),
        'exclusionReason',
      ),
    },
    observed: {
      mean: finite(mean) ? mean : null,
      median: empiricalQuantile(sorted, 0.5),
      p25: empiricalQuantile(sorted, 0.25),
      p75: empiricalQuantile(sorted, 0.75),
    },
    period: rows.length
      ? {
          firstGameCreationMs: rows[0].gameCreation.toString(),
          lastGameCreationMs: rows.at(-1)!.gameCreation.toString(),
        }
      : null,
  };
};
const subtract = (recent: number | null, baseline: number | null) =>
  recent !== null && baseline !== null && finite(recent - baseline)
    ? recent - baseline
    : null;
export function calculateEvolutionWindow(
  q: EvolutionQuery,
  window: EvolutionWindow,
  input: readonly EvolutionRow[],
  deathInput: readonly EvolutionRow[],
  unmaterializedMatches: number,
) {
  for (const [rows, isDeath] of [
    [input, false],
    [deathInput, true],
  ] as const)
    for (const r of rows) {
      if (
        r.subjectId !== q.puuid ||
        r.gameCreation < BigInt(window.fromMs) ||
        r.gameCreation >= BigInt(window.toMs)
      )
        throw new Error('Evolution subject/window mismatch');
      for (const key of ['championId', 'queueId', 'mapId', 'role'] as const)
        if (r[key] !== q.filters[key])
          throw new Error(`Evolution mixed context ${key}`);
      if (q.filters.patch !== undefined && r.patch !== q.filters.patch)
        throw new Error('Evolution mixed patch');
      const definitionId = isDeath ? DEATH_PATTERN_DEFINITION : q.definition.id;
      if (
        r.definitionId !== definitionId ||
        r.definitionVersion !==
          DATASET_DEFINITION_MAP.get(definitionId)!.version ||
        r.horizonKey !== (isDeath ? 'final' : q.filters.horizonKey)
      )
        throw new Error('Evolution mixed definition/horizon/version');
    }
  const dedup = uniqueEvolutionRows(input),
    deaths = uniqueEvolutionRows(deathInput),
    rows = dedup.rows;
  const stats = summary(rows),
    required = requiredReferenceUnits(q.nominalPrecision),
    patches = [...new Set([...rows, ...deaths.rows].map((r) => r.patch))].sort(
      (a, b) => String(a).localeCompare(String(b)),
    );
  return {
    requested: { ...window, bounds: '[)' },
    ...stats,
    unmaterializedMatches,
    duplicateRowsRemoved: dedup.duplicateRows,
    conflictingIdentities: dedup.conflictingIdentities,
    composition: patches.map((patch) => ({
      patch,
      championId: q.filters.championId,
      role: q.filters.role,
      queueId: q.filters.queueId,
      mapId: q.filters.mapId,
      ...summary(rows.filter((r) => r.patch === patch)),
      deathPattern: aggregateDeathPattern(
        deaths.rows.filter((r) => r.patch === patch),
      ),
    })),
    deathPattern: aggregateDeathPattern(deaths.rows),
    nominalIidDiagnostic: {
      ...q.nominalPrecision,
      requiredMatches: required,
      validMatches: stats.counts.valid.matches,
      meetsNominalCount: stats.counts.valid.matches >= required,
      appliesToPlayerPrecision: false,
    },
    precision: {
      status: 'unavailable',
      reason:
        stats.counts.valid.matches < required
          ? 'insufficient_sample_and_unmodelled_serial_dependence'
          : 'unmodelled_serial_dependence',
      interval: null,
    },
    observations: {
      total: rows.length,
      returned: Math.min(20, rows.length),
      truncated: rows.length > 20,
      items: rows.slice(0, 20).map((r) => ({
        contributionId: r.id,
        matchId: r.matchId,
        gameCreationMs: r.gameCreation.toString(),
        patch: r.patch,
        value: r.value,
        eligible: r.eligible,
        reason: r.reason,
        processedAt: r.processedAt.toISOString(),
      })),
    },
    provenance: {
      processedAt: rows.length
        ? {
            earliest: new Date(
              Math.min(...rows.map((r) => r.processedAt.getTime())),
            ).toISOString(),
            latest: new Date(
              Math.max(...rows.map((r) => r.processedAt.getTime())),
            ).toISOString(),
          }
        : null,
      lineageUnknownRows: rows.filter(
        (r) => object(r.lineage).status !== 'observed',
      ).length,
      fingerprint: createHash('sha256')
        .update(
          JSON.stringify(
            rows.map((r) => [r.id, r.value, r.processedAt.toISOString()]),
          ),
        )
        .digest('hex'),
    },
  };
}
export function calculateEvolution<
  T extends ReturnType<typeof calculateEvolutionWindow>,
>(q: EvolutionQuery, baseline: T, recent: T) {
  const delta = (a: typeof baseline, b: typeof baseline) => ({
    mean: subtract(b.observed.mean, a.observed.mean),
    median: subtract(b.observed.median, a.observed.median),
    deathFrequencyPercentagePoints: subtract(
      b.deathPattern.value,
      a.deathPattern.value,
    ),
  });
  const baselinePatches = baseline.composition.map((c) => c.patch),
    recentPatches = recent.composition.map((c) => c.patch);
  const common = baselinePatches.filter(
    (p) => p !== null && recentPatches.includes(p),
  );
  return {
    methodVersion: EVOLUTION_METHOD_VERSION,
    puuid: q.puuid,
    definition: q.definition,
    filters: q.filters,
    windows: { baseline, recent },
    comparison: {
      direction:
        'recent minus baseline; observed differences do not mean improvement',
      pooledObservedDelta: delta(baseline, recent),
      pooledContext:
        baselinePatches.length === 1 &&
        recentPatches.length === 1 &&
        baselinePatches[0] !== null &&
        baselinePatches[0] === recentPatches[0]
          ? 'same_patch'
          : 'patch_mixture_or_change',
      patchesOnlyInBaseline: baselinePatches.filter(
        (p) => !recentPatches.includes(p),
      ),
      patchesOnlyInRecent: recentPatches.filter(
        (p) => !baselinePatches.includes(p),
      ),
      matchedPatches: common.map((patch) => {
        const a = baseline.composition.find((c) => c.patch === patch)!,
          b = recent.composition.find((c) => c.patch === patch)!;
        return {
          patch,
          baseline: a,
          recent: b,
          delta: {
            mean: subtract(b.observed.mean, a.observed.mean),
            median: subtract(b.observed.median, a.observed.median),
            deathFrequencyPercentagePoints: subtract(
              b.deathPattern.value,
              a.deathPattern.value,
            ),
          },
        };
      }),
      trend: null,
      trendReason:
        'Repeated observations of one player are serially dependent; no validated temporal model or inferential trend',
      precision: null,
    },
    limitations: [
      'Descriptive comparisons only; no causal attribution or forecast',
      'Champion/role/queue/map fixed by filters; other champions/roles are outside this comparison',
      'Patches are stratified; pooled delta can reflect composition change',
      'Nominal iid minimum is a planning diagnostic, never a player-level confidence claim',
    ],
  };
}
