import type { DatasetFilters, DatasetQueryResult } from '../contracts/query';

export interface DatasetReader {
  query(
    filters: DatasetFilters,
    limit?: number,
    after?: string,
  ): Promise<DatasetQueryResult>;
}

export const DATASET_READER = Symbol('DATASET_READER');
