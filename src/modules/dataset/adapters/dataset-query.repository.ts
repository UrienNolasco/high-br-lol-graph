import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { DATASET_PROCESSING_VERSION } from '../contracts/processing';
import {
  DATASET_DEFINITION_MAP,
  DATASET_VERSION,
} from '../contracts/definition';
import type {
  DatasetAggregate,
  DatasetCounts,
  DatasetFilters,
  DatasetQueryResult,
} from '../contracts/query';
import type { DatasetReader } from '../ports/dataset-reader';
export function datasetWhere(
  f: DatasetFilters,
  includeExcluded = false,
): Prisma.HistoricalMetricContributionWhereInput {
  return {
    datasetVersion: DATASET_VERSION,
    processingVersion: DATASET_PROCESSING_VERSION,
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
    Prisma.sql`"processingVersion"=${DATASET_PROCESSING_VERSION}`,
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
        processingVersion: DATASET_PROCESSING_VERSION,
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

/** Repeatable-read adapter for the versioned dataset query contract. */
@Injectable()
export class DatasetQueryRepository implements DatasetReader {
  constructor(private readonly prisma: PrismaService) {}

  async query(filters: DatasetFilters, limit = 100, after?: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const summary = await queryDatasetSummary(tx, filters);
        const selected = await tx.historicalMetricContribution.findMany({
          where: {
            AND: [
              datasetWhere(filters),
              ...(after ? [{ id: { gt: after } }] : []),
            ],
          },
          orderBy: { id: 'asc' },
          take: limit + 1,
        });
        const rows = selected.slice(0, limit).map((row) => ({
          ...row,
          gameCreation: row.gameCreation.toString(),
          processedAt: row.processedAt.toISOString(),
        }));
        return {
          datasetVersion: DATASET_VERSION,
          processingVersion: DATASET_PROCESSING_VERSION,
          filters,
          summary,
          rows,
          nextAfter: selected.length > limit ? rows[rows.length - 1].id : null,
        } as DatasetQueryResult;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30000,
      },
    );
  }
}
