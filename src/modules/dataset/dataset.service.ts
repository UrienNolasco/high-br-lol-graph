import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DATASET_PROCESSING_VERSION } from './contracts/processing';
import { DATASET_VERSION } from '../../core/dataset/dataset-registry';
import {
  DatasetFilters,
  datasetWhere,
  queryDatasetSummary,
} from '../../core/dataset/dataset-query';
@Injectable()
export class DatasetService {
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
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30000,
      },
    );
  }
}
