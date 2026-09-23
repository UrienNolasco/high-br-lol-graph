import { Prisma } from '@prisma/client';
import { buildHistoricalDataset, DatasetInput } from './dataset-builder';

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export type PreparedDatasetRow = Omit<
  Prisma.HistoricalMetricContributionCreateManyInput,
  'processedAt' | 'lineage'
>;
/** Expensive pure calculations and JSON conversion happen before opening the publication transaction. */
export function prepareHistoricalDataset(
  input: Omit<DatasetInput, 'lineage'>,
): PreparedDatasetRow[] {
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
    quality: json(row.quality),
    evidence: json(row.evidence),
    denominator:
      row.denominator === null ? Prisma.DbNull : json(row.denominator),
    // Only publication-time lineage/provenance is allowed into persisted rows.
    processedAt: undefined,
    lineage: undefined,
  }));
}
/** Called inside the worker's publication transaction; removes obsolete definitions as well as stale values. */
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
  const observations = await tx.matchDiscovery.findMany({
    where: { matchId: input.match.matchId },
    include: { observation: { select: { id: true, source: true } } },
    orderBy: { observationId: 'asc' },
  });
  const lineage = json({
    observationIds: observations.map((o) => o.observationId),
    sources: [...new Set(observations.map((o) => o.observation.source))].sort(),
    status: observations.length ? 'observed' : 'unknown',
    reason: observations.length ? null : 'missing_discovery_observation',
  });
  await tx.historicalMetricContribution.deleteMany({
    where: { matchId: input.match.matchId },
  });
  for (let offset = 0; offset < prepared.length; offset += 500)
    await tx.historicalMetricContribution.createMany({
      data: prepared
        .slice(offset, offset + 500)
        .map((row) => ({ ...row, lineage, processedAt: input.processedAt })),
    });
  return prepared.length;
}
