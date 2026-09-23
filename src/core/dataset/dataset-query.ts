import { Prisma } from '@prisma/client';
import { normalizeRole } from '../metrics';
import { PROCESSING_VERSION } from '../processing/processing.constants';
import {
  DATASET_DEFINITION_MAP,
  DATASET_HORIZONS,
  DATASET_VERSION,
  DatasetSubject,
  DatasetUsage,
} from './dataset-registry';

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
export function datasetWhere(
  f: DatasetFilters,
  includeExcluded = false,
): Prisma.HistoricalMetricContributionWhereInput {
  return {
    datasetVersion: DATASET_VERSION,
    processingVersion: PROCESSING_VERSION,
    ...(f.eligibleOnly && !includeExcluded ? { eligible: true } : {}),
    ...Object.fromEntries(
      (
        [
          'patch',
          'queueId',
          'mapId',
          'championId',
          'role',
          'subjectKind',
          'definitionId',
          'horizonKey',
          'usage',
        ] as const
      )
        .filter((k) => f[k] !== undefined)
        .map((k) => [k, f[k]]),
    ),
    ...(f.playerId ? { playerIds: { has: f.playerId } } : {}),
    ...(f.fromMs !== undefined || f.toMs !== undefined
      ? {
          gameCreation: {
            ...(f.fromMs !== undefined ? { gte: BigInt(f.fromMs) } : {}),
            ...(f.toMs !== undefined ? { lt: BigInt(f.toMs) } : {}),
          },
        }
      : {}),
  };
}
/** Bound values only. Column names are hardcoded in this allowlist. */
export function datasetSqlWhere(
  f: DatasetFilters,
  includeExcluded = false,
): Prisma.Sql {
  const clauses = [
    Prisma.sql`"datasetVersion"=${DATASET_VERSION}`,
    Prisma.sql`"processingVersion"=${PROCESSING_VERSION}`,
  ];
  if (f.eligibleOnly && !includeExcluded)
    clauses.push(Prisma.sql`eligible=true`);
  if (f.patch !== undefined) clauses.push(Prisma.sql`patch=${f.patch}`);
  if (f.queueId !== undefined) clauses.push(Prisma.sql`"queueId"=${f.queueId}`);
  if (f.mapId !== undefined) clauses.push(Prisma.sql`"mapId"=${f.mapId}`);
  if (f.championId !== undefined)
    clauses.push(Prisma.sql`"championId"=${f.championId}`);
  if (f.role !== undefined) clauses.push(Prisma.sql`role=${f.role}`);
  if (f.subjectKind !== undefined)
    clauses.push(Prisma.sql`"subjectKind"=${f.subjectKind}`);
  if (f.definitionId !== undefined)
    clauses.push(Prisma.sql`"definitionId"=${f.definitionId}`);
  if (f.horizonKey !== undefined)
    clauses.push(Prisma.sql`"horizonKey"=${f.horizonKey}`);
  if (f.usage !== undefined) clauses.push(Prisma.sql`usage=${f.usage}`);
  if (f.playerId !== undefined)
    clauses.push(Prisma.sql`${f.playerId}=ANY("playerIds")`);
  if (f.fromMs !== undefined)
    clauses.push(Prisma.sql`"gameCreation">=${BigInt(f.fromMs)}`);
  if (f.toMs !== undefined)
    clauses.push(Prisma.sql`"gameCreation"<${BigInt(f.toMs)}`);
  return Prisma.join(clauses, ' AND ');
}
export function unmaterializedMatchWhere(
  f: DatasetFilters,
): Prisma.MatchWhereInput {
  return {
    historicalMetrics: {
      none: {
        datasetVersion: DATASET_VERSION,
        processingVersion: PROCESSING_VERSION,
      },
    },
    ...(f.patch
      ? {
          OR: [
            { gameVersion: f.patch },
            { gameVersion: { startsWith: `${f.patch}.` } },
          ],
        }
      : {}),
    ...(f.queueId ? { queueId: f.queueId } : {}),
    ...(f.mapId ? { mapId: f.mapId } : {}),
    ...(f.fromMs !== undefined || f.toMs !== undefined
      ? {
          gameCreation: {
            ...(f.fromMs !== undefined ? { gte: BigInt(f.fromMs) } : {}),
            ...(f.toMs !== undefined ? { lt: BigInt(f.toMs) } : {}),
          },
        }
      : {}),
    ...(f.championId || f.role || f.playerId
      ? {
          participants: {
            some: {
              ...(f.championId ? { championId: f.championId } : {}),
              ...(f.role ? { role: f.role } : {}),
              ...(f.playerId ? { puuid: f.playerId } : {}),
            },
          },
        }
      : {}),
  };
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
export async function queryDatasetSummary(
  tx: Prisma.TransactionClient,
  filters: DatasetFilters,
) {
  const where = datasetSqlWhere(filters);
  const [counts] = await tx.$queryRaw<DatasetCounts[]>(
    Prisma.sql`WITH selected AS (SELECT * FROM historical_metric_contributions WHERE ${where}) SELECT count(*)::int AS rows,count(DISTINCT "matchId")::int AS matches,(SELECT count(DISTINCT p)::int FROM selected,unnest("playerIds") p) AS players,coalesce(sum("validCount"),0)::int AS "validRows" FROM selected`,
  );
  const groups = await tx.$queryRaw<DatasetAggregate[]>(
    Prisma.sql`WITH selected AS (SELECT * FROM historical_metric_contributions WHERE ${where}) SELECT "definitionId","definitionVersion","subjectKind","horizonKey",usage,unit,count(*)::int AS rows,count(DISTINCT "matchId")::int AS matches,(SELECT count(DISTINCT p)::int FROM selected s2,unnest(s2."playerIds") p WHERE s2."definitionId"=s."definitionId" AND s2."definitionVersion"=s."definitionVersion" AND s2."subjectKind"=s."subjectKind" AND s2."horizonKey"=s."horizonKey") AS players,sum("validCount")::int AS "validRows",sum("sumValue") AS "sumValue",sum("sumValue")/nullif(sum("validCount"),0) AS mean,sum(numerator) FILTER(WHERE "validCount"=1 AND "denominatorValue">0 AND numerator IS NOT NULL) AS "numeratorSum",sum("denominatorValue") FILTER(WHERE "validCount"=1 AND "denominatorValue">0 AND numerator IS NOT NULL) AS "denominatorSum",sum(numerator) FILTER(WHERE "validCount"=1 AND "denominatorValue">0 AND numerator IS NOT NULL)/nullif(sum("denominatorValue") FILTER(WHERE "validCount"=1 AND "denominatorValue">0 AND numerator IS NOT NULL),0)*min("ratioScale") AS "ratioOfSums",count(*) FILTER(WHERE "validCount"=1 AND "denominatorValue">0 AND numerator IS NOT NULL)::int AS "ratioRows" FROM selected s GROUP BY "definitionId","definitionVersion","subjectKind","horizonKey",usage,unit ORDER BY "definitionId","subjectKind","horizonKey"`,
  );
  const exclusions = await tx.$queryRaw<
    Array<{ reason: string; rows: number; matches: number }>
  >(
    Prisma.sql`SELECT "exclusionReason" AS reason,count(*)::int AS rows,count(DISTINCT "matchId")::int AS matches FROM historical_metric_contributions WHERE ${datasetSqlWhere(filters, true)} AND NOT eligible GROUP BY "exclusionReason" ORDER BY "exclusionReason"`,
  );
  const missingness = await tx.$queryRaw<
    Array<{ reason: string; rows: number; matches: number }>
  >(
    Prisma.sql`SELECT reason,count(*)::int AS rows,count(DISTINCT "matchId")::int AS matches FROM historical_metric_contributions WHERE ${where} AND "validCount"=0 GROUP BY reason ORDER BY reason`,
  );
  return {
    counts,
    groups,
    exclusions,
    missingness,
    unmaterializedMatches: await tx.match.count({
      where: unmaterializedMatchWhere(filters),
    }),
    cohortCaveat:
      'Collection lineage/rank is observed at discovery, not rank at match time. Role and eligibility are retrospective metadata, not predictive features.',
  };
}
