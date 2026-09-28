import type { PrismaClient } from '@prisma/client';
import {
  exportHistoricalDataset,
  type DatasetExportOptions,
} from '../adapters/dataset-export.adapter';

/** Dataset CLI composition: Prisma plus the pure offline exporter only. */
export function createOfflineDatasetExport(
  prisma: PrismaClient,
  options: DatasetExportOptions,
) {
  return exportHistoricalDataset(prisma, options);
}
