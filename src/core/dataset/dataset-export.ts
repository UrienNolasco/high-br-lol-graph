import { createHash } from 'node:crypto';
import { mkdir, writeFile, rename, rm, lstat } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import {
  HistoricalMetricContribution,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { PROCESSING_VERSION } from '../processing/processing.constants';
import { DATASET_DEFINITIONS, DATASET_VERSION } from './dataset-registry';
import {
  DatasetFilters,
  datasetWhere,
  queryDatasetSummary,
} from './dataset-query';

export interface TemporalSplit {
  trainBeforeMs: number;
  validationBeforeMs: number;
}
export function validateTemporalSplit(split: TemporalSplit) {
  if (
    !Number.isSafeInteger(split.trainBeforeMs) ||
    !Number.isSafeInteger(split.validationBeforeMs) ||
    split.trainBeforeMs < 0 ||
    split.trainBeforeMs >= split.validationBeforeMs
  )
    throw new Error(
      'Temporal split requires 0 <= trainBeforeMs < validationBeforeMs',
    );
  return split;
}
export function splitForMatch(
  gameCreation: bigint | number,
  split: TemporalSplit,
): 'train' | 'validation' | 'test' {
  return BigInt(gameCreation) < BigInt(split.trainBeforeMs)
    ? 'train'
    : BigInt(gameCreation) < BigInt(split.validationBeforeMs)
      ? 'validation'
      : 'test';
}
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return typeof value === 'bigint'
      ? JSON.stringify(String(value))
      : JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value)
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`,
    )
    .join(',')}}`;
}
export const datasetDigest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
/** Deliberately explicit allowlist: no outcome, final counters, retrospective role or exclusion flags in feature files. */
export function exportDatasetValue(
  row: HistoricalMetricContribution,
  split: TemporalSplit,
) {
  if (
    row.usage === 'predictive' &&
    (row.horizonMs === null ||
      (row.value !== null &&
        (row.sourceMaxTimestampMs === null ||
          row.sourceMaxTimestampMs > row.horizonMs)))
  )
    throw new Error(`Invalid predictive horizon for ${row.id}`);
  return {
    id: row.id,
    matchId: row.matchId,
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    definitionId: row.definitionId,
    definitionVersion: row.definitionVersion,
    horizonMs: row.horizonMs,
    sourceMaxTimestampMs: row.sourceMaxTimestampMs,
    value: row.value,
    validCount: row.validCount,
    reason: row.reason,
    numerator: row.numerator,
    denominatorValue: row.denominatorValue,
    ratioScale: row.ratioScale,
    split: splitForMatch(row.gameCreation, split),
  };
}
export const FEATURE_VALUE_COLUMNS = [
  'id',
  'matchId',
  'subjectKind',
  'subjectId',
  'definitionId',
  'definitionVersion',
  'horizonMs',
  'sourceMaxTimestampMs',
  'value',
  'validCount',
  'reason',
  'numerator',
  'denominatorValue',
  'ratioScale',
  'split',
];
export interface DatasetExportOptions {
  filters: DatasetFilters;
  split: TemporalSplit;
  out: string;
  maxRows?: number;
}
/** Offline bounded export. Fails explicitly rather than publishing a partial dataset. Repeatable-read snapshot spans summary, rows and lineage. */
export async function exportHistoricalDataset(
  prisma: PrismaClient,
  options: DatasetExportOptions,
) {
  validateTemporalSplit(options.split);
  const maxRows = options.maxRows ?? 100000;
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 100000)
    throw new Error(
      'maxRows must be 1..100000; partition larger exports with the common period filters',
    );
  const data = await prisma.$transaction(
    async (tx) => {
      const summary = await queryDatasetSummary(tx, options.filters);
      if (summary.counts.rows > maxRows)
        throw new Error(
          `Export has ${summary.counts.rows} rows, exceeds explicit bound ${maxRows}; narrow filters`,
        );
      const rows = await tx.historicalMetricContribution.findMany({
        where: datasetWhere(options.filters),
        orderBy: { id: 'asc' },
      });
      const ids = [
        ...new Set(
          rows.flatMap((row) => {
            const lineage = row.lineage as { observationIds?: unknown };
            return Array.isArray(lineage?.observationIds)
              ? lineage.observationIds.filter(
                  (id): id is string => typeof id === 'string',
                )
              : [];
          }),
        ),
      ].sort();
      const observations = await tx.discoveryObservation.findMany({
        where: { id: { in: ids } },
        orderBy: { id: 'asc' },
      });
      return { summary, rows, observations };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 60000,
    },
  );
  const files: Record<string, string[]> = {
    'features.jsonl': [],
    'descriptive.jsonl': [],
    'labels.jsonl': [],
    'metadata.jsonl': [],
  };
  const matches = new Map<string, { creation: bigint; split: string }>();
  for (const row of data.rows) {
    const partition = splitForMatch(row.gameCreation, options.split);
    const previous = matches.get(row.matchId);
    if (previous && previous.creation !== row.gameCreation)
      throw new Error(`Inconsistent match creation: ${row.matchId}`);
    matches.set(row.matchId, { creation: row.gameCreation, split: partition });
    const file =
      row.usage === 'predictive'
        ? 'features.jsonl'
        : row.usage === 'label'
          ? 'labels.jsonl'
          : 'descriptive.jsonl';
    files[file].push(stableJson(exportDatasetValue(row, options.split)));
    files['metadata.jsonl'].push(
      stableJson({
        id: row.id,
        matchId: row.matchId,
        usage: row.usage,
        patch: row.patch,
        queueId: row.queueId,
        mapId: row.mapId,
        championId: row.championId,
        role: row.role,
        teamId: row.teamId,
        playerIds: row.playerIds,
        gameCreation: row.gameCreation,
        eligible: row.eligible,
        exclusionReason: row.exclusionReason,
        horizonComplete: row.horizonComplete,
        origin: row.origin,
        method: row.method,
        unit: row.unit,
        quality: row.quality,
        evidence: row.evidence,
        denominator: row.denominator,
        lineage: row.lineage,
        processingVersion: row.processingVersion,
        processedAt: row.processedAt,
      }),
    );
  }
  files['observations.jsonl'] = data.observations.map(stableJson);
  const contents = Object.fromEntries(
    Object.entries(files).map(([name, lines]) => [
      name,
      lines.length ? `${lines.join('\n')}\n` : '',
    ]),
  );
  const manifest = {
    datasetVersion: DATASET_VERSION,
    processingVersion: PROCESSING_VERSION,
    definitions: DATASET_DEFINITIONS,
    registrySha256: datasetDigest(stableJson(DATASET_DEFINITIONS)),
    filters: options.filters,
    summary: data.summary,
    temporalSplit: {
      ...options.split,
      rule: 'gameCreation: train < trainBeforeMs; validation [trainBeforeMs,validationBeforeMs); test >= validationBeforeMs. Entire match stays together.',
    },
    splitMatches: Object.fromEntries(
      ['train', 'validation', 'test'].map((split) => [
        split,
        [...matches.values()].filter((m) => m.split === split).length,
      ]),
    ),
    featureValueColumns: FEATURE_VALUE_COLUMNS,
    metadataPolicy:
      'metadata.jsonl is for provenance and cohort auditing, not a feature allowlist. Final role, horizonComplete, eligibility and discovery rank are retrospective. Labels/descriptive must never be joined as features at an earlier horizon.',
    lineage: {
      observations: data.observations.length,
      requestedObservationIds: [
        ...new Set(
          data.rows.flatMap(
            (r) =>
              (r.lineage as { observationIds?: string[] }).observationIds ?? [],
          ),
        ),
      ].length,
      unknownRows: data.rows.filter(
        (r) => (r.lineage as { status?: string }).status !== 'observed',
      ).length,
      rankMeaning:
        'Rank/tier belongs to discovery observation time; match-time rank is unknown.',
    },
    files: Object.fromEntries(
      Object.entries(contents).map(([name, content]) => [
        name,
        {
          rows: files[name].length,
          bytes: Buffer.byteLength(content),
          sha256: datasetDigest(content),
        },
      ]),
    ),
  };
  // Same persisted rows/filter/split yield byte-identical files and manifest; no wall-clock export timestamp.
  const manifestText = `${stableJson(manifest)}\n`;
  const stage = join(
    dirname(options.out),
    `.${basename(options.out)}.building-${process.pid}-${Date.now()}`,
  );
  await mkdir(stage, { recursive: false });
  try {
    await Promise.all(
      Object.entries(contents).map(([name, content]) =>
        writeFile(join(stage, name), content, { flag: 'wx' }),
      ),
    );
    await writeFile(join(stage, 'manifest.json'), manifestText, { flag: 'wx' });
    // Destination must not exist, including an empty directory: never overwrite another export.
    try {
      await lstat(options.out);
      throw new Error('Export destination already exists');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await rename(stage, options.out);
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
  return {
    out: options.out,
    manifestSha256: datasetDigest(manifestText),
    ...manifest,
  };
}
