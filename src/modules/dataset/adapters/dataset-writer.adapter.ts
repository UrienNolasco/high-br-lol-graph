import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TransactionContext } from '../../../lib/transaction-context';
import {
  buildHistoricalDataset,
  DatasetContribution,
  DatasetInput,
} from '../pure/dataset-builder';
import type { DatasetWriter } from '../ports/dataset-writer';

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export type PreparedDatasetRow = Omit<
  Prisma.HistoricalMetricContributionCreateManyInput,
  'processedAt' | 'lineage'
>;
/** Expensive pure calculations and JSON conversion happen before opening the publication transaction. */
export function prepareDatasetContributions(
  input: Omit<DatasetInput, 'lineage'>,
): DatasetContribution[] {
  return buildHistoricalDataset({
    ...input,
    lineage: {
      observationIds: [],
      sources: [],
      status: 'unknown',
      reason: 'not_yet_attached',
    },
  }).map((row) => ({
    ...row,
    // JSON conversion is intentionally part of preparation, before the
    // coordinator opens its publication transaction.
    quality: JSON.parse(JSON.stringify(row.quality)),
    evidence: JSON.parse(JSON.stringify(row.evidence)),
    denominator:
      row.denominator === null
        ? null
        : JSON.parse(JSON.stringify(row.denominator)),
  }));
}
/** Compatibility adapter for offline callers that need Prisma createMany rows. */
export function prepareHistoricalDataset(
  input: Omit<DatasetInput, 'lineage'>,
): PreparedDatasetRow[] {
  return prepareDatasetContributions(input).map(
    (row) =>
      ({
        ...row,
        quality: row.quality as Prisma.InputJsonValue,
        evidence: row.evidence as Prisma.InputJsonValue,
        denominator:
          row.denominator === null
            ? Prisma.DbNull
            : (row.denominator as Prisma.InputJsonValue),
        processedAt: undefined,
        lineage: undefined,
      }) as PreparedDatasetRow,
  );
}
/** Converts domain rows and publishes them inside the coordinator-owned transaction. */
@Injectable()
export class DatasetPersistenceAdapter implements DatasetWriter {
  prepare(input: Omit<DatasetInput, 'lineage'>) {
    return prepareDatasetContributions(input);
  }

  async write(
    transaction: TransactionContext,
    input: DatasetInput,
    prepared: readonly DatasetContribution[],
  ) {
    // The cast is intentionally confined to this persistence adapter. Ports
    // and application code only carry the opaque TransactionContext.
    const tx = transaction as unknown as Prisma.TransactionClient;
    const rows: readonly PreparedDatasetRow[] = prepared.map((row) => ({
      ...row,
      quality: row.quality as Prisma.InputJsonValue,
      evidence: row.evidence as Prisma.InputJsonValue,
      denominator:
        row.denominator === null
          ? Prisma.DbNull
          : (row.denominator as Prisma.InputJsonValue),
    }));
    return publishPreparedDataset(tx, input, rows);
  }
}

/** Writer port implementation: lineage is supplied by the coordinator. */
export async function publishPreparedDataset(
  tx: Prisma.TransactionClient,
  input: DatasetInput,
  prepared: readonly PreparedDatasetRow[],
) {
  if (
    prepared.some(
      (row) =>
        row.matchId !== input.match.matchId ||
        row.processingVersion !== input.processingVersion,
    )
  )
    throw new Error('Prepared dataset does not belong to this publication');
  return persistPreparedDataset(tx, input, prepared, json(input.lineage));
}

/**
 * Legacy worker bridge. ARQ-10 replaces this call with the processing-owned
 * ObservationReader and publishPreparedDataset; ordering is retained here.
 */
export async function replaceHistoricalDataset(
  tx: Prisma.TransactionClient,
  input: Omit<DatasetInput, 'lineage'>,
  prepared: readonly PreparedDatasetRow[] = prepareHistoricalDataset(input),
) {
  if (
    prepared.some(
      (row) =>
        row.matchId !== input.match.matchId ||
        row.processingVersion !== input.processingVersion,
    )
  )
    throw new Error('Prepared dataset does not belong to this publication');
  // Temporary ARQ-07 bridge. ARQ-10 will pass the consumer-owned
  // ObservationReader context here; until then lineage remains read from the
  // same coordinator transaction and retains the baseline ordering.
  const observations = await tx.matchDiscovery.findMany({
    where: { matchId: input.match.matchId },
    include: { observation: { select: { id: true, source: true } } },
    orderBy: { observationId: 'asc' },
  });
  const resolvedLineage = json({
    observationIds: observations.map((row) => row.observationId),
    sources: [
      ...new Set(observations.map((row) => row.observation.source)),
    ].sort(),
    status: observations.length ? 'observed' : 'unknown',
    reason: observations.length ? null : 'missing_discovery_observation',
  });
  return persistPreparedDataset(tx, input, prepared, resolvedLineage);
}

async function persistPreparedDataset(
  tx: Prisma.TransactionClient,
  input: Omit<DatasetInput, 'lineage'> | DatasetInput,
  prepared: readonly PreparedDatasetRow[],
  resolvedLineage: Prisma.InputJsonValue,
) {
  await tx.historicalMetricContribution.deleteMany({
    where: { matchId: input.match.matchId },
  });
  for (let offset = 0; offset < prepared.length; offset += 500)
    await tx.historicalMetricContribution.createMany({
      data: prepared.slice(offset, offset + 500).map((row) => ({
        ...row,
        lineage: resolvedLineage,
        processedAt: input.processedAt,
      })),
    });
  return prepared.length;
}
