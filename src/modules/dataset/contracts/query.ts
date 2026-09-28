import { normalizeRole } from '../../matches/contracts/eligibility';
import {
  DATASET_DEFINITION_MAP,
  DATASET_HORIZONS,
  DatasetSubject,
  DatasetUsage,
} from './definition';

/** Stable cohort filters shared by HTTP, offline exports and consumers. */
export interface DatasetFilters {
  patch?: string;
  queueId?: number;
  mapId?: number;
  championId?: number;
  role?: string;
  fromMs?: number;
  toMs?: number;
  playerId?: string;
  subjectKind?: DatasetSubject;
  definitionId?: string;
  horizonKey?: string;
  usage?: DatasetUsage;
  eligibleOnly: boolean;
}

const ALLOWED = new Set([
  'patch',
  'queueId',
  'mapId',
  'championId',
  'role',
  'fromMs',
  'toMs',
  'playerId',
  'subjectKind',
  'definitionId',
  'horizonKey',
  'usage',
  'eligibleOnly',
]);

/** Shared by HTTP, exports and research consumers. Period is [fromMs,toMs). */
export function normalizeDatasetFilters(
  raw: Record<string, unknown> = {},
): DatasetFilters {
  for (const key of Object.keys(raw))
    if (!ALLOWED.has(key)) throw new Error(`Unknown dataset filter: ${key}`);
  const f: DatasetFilters = { eligibleOnly: true };
  for (const name of [
    'queueId',
    'mapId',
    'championId',
    'fromMs',
    'toMs',
  ] as const)
    if (raw[name] !== undefined) {
      const value =
        typeof raw[name] === 'number'
          ? raw[name]
          : typeof raw[name] === 'string' && /^\d+$/.test(raw[name])
            ? Number(raw[name])
            : NaN;
      if (
        !Number.isSafeInteger(value) ||
        value < (['fromMs', 'toMs'].includes(name) ? 0 : 1)
      )
        throw new Error(`Invalid ${name}`);
      f[name] = value;
    }
  if (f.fromMs !== undefined && f.toMs !== undefined && f.fromMs >= f.toMs)
    throw new Error('Period must satisfy fromMs < toMs');
  for (const name of [
    'patch',
    'playerId',
    'definitionId',
    'horizonKey',
    'subjectKind',
    'usage',
  ] as const)
    if (raw[name] !== undefined) {
      if (typeof raw[name] !== 'string' || !raw[name].length)
        throw new Error(`Invalid ${name}`);
      (f as unknown as Record<string, unknown>)[name] = raw[name];
    }
  if (f.patch && !/^\d+\.\d+$/.test(f.patch))
    throw new Error('Patch must be exact major.minor');
  if (f.patch) f.patch = f.patch.split('.').map(Number).join('.');
  if (raw.role !== undefined) {
    if (typeof raw.role !== 'string') throw new Error('Invalid role');
    const role = normalizeRole(raw.role);
    if (!role) throw new Error('Invalid role');
    f.role = role;
  }
  if (
    f.subjectKind &&
    !['participant', 'team', 'match'].includes(f.subjectKind)
  )
    throw new Error('Invalid subjectKind');
  if (f.usage && !['predictive', 'descriptive', 'label'].includes(f.usage))
    throw new Error('Invalid usage');
  if (f.definitionId && !DATASET_DEFINITION_MAP.has(f.definitionId))
    throw new Error('Unknown definitionId');
  if (
    f.horizonKey &&
    f.horizonKey !== 'final' &&
    !DATASET_HORIZONS.some((h) => `t:${h}` === f.horizonKey)
  )
    throw new Error('Unknown horizonKey');
  if (raw.eligibleOnly !== undefined) {
    if (
      ![true, false, 'true', 'false'].includes(
        raw.eligibleOnly as boolean | string,
      )
    )
      throw new Error('Invalid eligibleOnly');
    f.eligibleOnly = raw.eligibleOnly === true || raw.eligibleOnly === 'true';
  }
  return f;
}

export interface DatasetCounts {
  rows: number;
  matches: number;
  players: number;
  validRows: number;
}

export interface DatasetAggregate {
  definitionId: string;
  definitionVersion: number;
  subjectKind: string;
  horizonKey: string;
  usage: string;
  unit: string;
  rows: number;
  matches: number;
  players: number;
  validRows: number;
  sumValue: number;
  mean: number | null;
  numeratorSum: number | null;
  denominatorSum: number | null;
  ratioOfSums: number | null;
  ratioRows: number;
}

export interface DatasetQueryRow {
  id: string;
  matchId: string;
  subjectKind: DatasetSubject;
  subjectId: string;
  definitionId: string;
  definitionVersion: number;
  usage: DatasetUsage;
  horizonKey: string;
  horizonMs: number | null;
  sourceMaxTimestampMs: number | null;
  value: number | null;
  sumValue: number;
  validCount: number;
  sampleCount: number;
  numerator: number | null;
  denominatorValue: number | null;
  ratioScale: number;
  reason: string | null;
  eligible: boolean;
  processedAt: string;
  datasetVersion: number;
  metricId: string;
  unit: string;
  origin: string;
  method: string | null;
  exclusionReason: string | null;
  horizonComplete: boolean;
  patch: string | null;
  queueId: number;
  mapId: number;
  championId: number | null;
  role: string | null;
  teamId: number | null;
  playerIds: string[];
  gameCreation: string;
  quality: unknown;
  denominator: unknown;
  processingVersion: number;
  evidence: unknown;
  lineage: unknown;
}

export interface DatasetSummary {
  counts: DatasetCounts;
  groups: DatasetAggregate[];
  exclusions: Array<{ reason: string | null; rows: number; matches: number }>;
  missingness: Array<{ reason: string | null; rows: number; matches: number }>;
  unmaterializedMatches: number;
  cohortCaveat: string;
}

export interface DatasetQueryResult {
  datasetVersion: number;
  processingVersion: number;
  filters: DatasetFilters;
  summary: DatasetSummary;
  rows: DatasetQueryRow[];
  nextAfter: string | null;
}
