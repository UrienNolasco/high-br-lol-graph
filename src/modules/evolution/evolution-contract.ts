import {
  DatasetFilters,
  normalizeDatasetFilters,
} from '../dataset/contracts/query';
import {
  DATASET_DEFINITION_MAP,
  DatasetDefinition,
} from '../dataset/contracts/definition';
import {
  PrecisionPolicy,
  precisionPolicy,
} from '../references/contracts/statistics';
export const EVOLUTION_METHOD_VERSION = 1;
export const DEATH_PATTERN_DEFINITION = 'final.deathsNearObjectives';
export const EVOLUTION_MAX_ROWS_PER_WINDOW = 1000;
export const EVOLUTION_MAX_EXAMPLE_MATCHES_PER_WINDOW = 5;
export const EVOLUTION_MAX_EXAMPLE_EVENTS = 10000;
export const EVOLUTION_MAX_EXAMPLE_EPISODES = 20;
export interface EvolutionWindow {
  fromMs: number;
  toMs: number;
}
export interface EvolutionQuery {
  puuid: string;
  definition: DatasetDefinition;
  filters: DatasetFilters;
  baseline: EvolutionWindow;
  recent: EvolutionWindow;
  nominalPrecision: PrecisionPolicy;
}
export function normalizeEvolutionQuery(
  puuid: string,
  raw: Record<string, unknown>,
): EvolutionQuery {
  if (!puuid || puuid.length > 128 || /[\u0000-\u0020]/.test(puuid))
    throw new Error('Invalid puuid');
  const {
    baselineFromMs,
    baselineToMs,
    recentFromMs,
    recentToMs,
    confidence,
    cdfHalfWidth,
    minimumUnits,
    ...cohort
  } = raw;
  const definition =
    typeof cohort.definitionId === 'string'
      ? DATASET_DEFINITION_MAP.get(cohort.definitionId)
      : undefined;
  if (
    !definition ||
    !definition.subjectKinds.includes('participant') ||
    definition.usage === 'label'
  )
    throw new Error('Unknown participant evolution definition');
  for (const key of ['championId', 'role', 'queueId', 'mapId', 'horizonKey'])
    if (cohort[key] === undefined) throw new Error(`Evolution requires ${key}`);
  for (const key of [
    'playerId',
    'subjectKind',
    'eligibleOnly',
    'usage',
    'fromMs',
    'toMs',
  ])
    if (cohort[key] !== undefined) throw new Error(`Evolution controls ${key}`);
  const filters = normalizeDatasetFilters({
    ...cohort,
    subjectKind: 'participant',
    usage: definition.usage,
    playerId: puuid,
    eligibleOnly: false,
  });
  for (const key of ['championId', 'queueId', 'mapId'] as const)
    if (filters[key]! > 2147483647)
      throw new Error(`${key} exceeds Int32 range`);
  if ((definition.usage === 'predictive') === (filters.horizonKey === 'final'))
    throw new Error('Definition and horizon are incompatible');
  const window = (from: unknown, to: unknown): EvolutionWindow => {
    if (from === undefined || to === undefined)
      throw new Error('Both windows require from/to');
    const f = normalizeDatasetFilters({ fromMs: from, toMs: to });
    return { fromMs: f.fromMs!, toMs: f.toMs! };
  };
  const baseline = window(baselineFromMs, baselineToMs),
    recent = window(recentFromMs, recentToMs);
  if (baseline.toMs > recent.fromMs)
    throw new Error(
      'Baseline must end before recent starts; windows cannot overlap',
    );
  const numeric = (v: unknown, fallback: number) =>
    v === undefined
      ? fallback
      : typeof v === 'number'
        ? v
        : typeof v === 'string' && v.trim()
          ? Number(v)
          : NaN;
  return {
    puuid,
    definition,
    filters,
    baseline,
    recent,
    nominalPrecision: precisionPolicy({
      confidence: numeric(confidence, 0.95),
      cdfHalfWidth: numeric(cdfHalfWidth, 0.15),
      minimumUnits: numeric(minimumUnits, 0),
    }),
  };
}
export const evolutionWindowFilters = (
  q: EvolutionQuery,
  w: EvolutionWindow,
  deathPattern = false,
): DatasetFilters => ({
  ...q.filters,
  fromMs: w.fromMs,
  toMs: w.toMs,
  ...(deathPattern
    ? {
        definitionId: DEATH_PATTERN_DEFINITION,
        usage: 'descriptive',
        horizonKey: 'final',
      }
    : {}),
});
