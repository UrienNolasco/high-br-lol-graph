import { Injectable } from '@nestjs/common';
import { ReadSnapshot } from '../../../core/prisma/read-snapshot';
import { datasetWhere } from './dataset-query.repository';
import { DATASET_DEFINITION_MAP } from '../contracts/definition';
import type { DatasetWindowReader } from '../ports/window-reader';
import type { DatasetFilters, DatasetQueryRow } from '../contracts/query';
@Injectable()
export class DatasetWindowAdapter implements DatasetWindowReader {
  constructor(private readonly snapshot: ReadSnapshot) {}
  async readWindow(filters: DatasetFilters, subjectId: string, limit: number) {
    const tx = this.snapshot.client();
    const rows = await tx.historicalMetricContribution.findMany({
      where: {
        ...datasetWhere(filters),
        subjectId,
        definitionVersion: DATASET_DEFINITION_MAP.get(filters.definitionId!)!
          .version,
      },
      orderBy: [{ gameCreation: 'asc' }, { matchId: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    // Publication membership is independent of the chosen definition and its missingness.
    const { definitionId, horizonKey, usage, ...context } = filters;
    const published = await tx.historicalMetricContribution.findMany({
      where: { ...datasetWhere(context), subjectId },
      select: { matchId: true },
      distinct: ['matchId'],
    });
    return {
      rows: rows.map((r) => ({
        ...r,
        gameCreation: r.gameCreation.toString(),
        processedAt: r.processedAt.toISOString(),
      })) as DatasetQueryRow[],
      publishedMatchIds: published.map((r) => r.matchId),
    };
  }
}
