import type { DatasetFilters, DatasetQueryRow } from '../contracts/query';
export interface DatasetWindowReader {
  readWindow(
    filters: DatasetFilters,
    subjectId: string,
    limit: number,
  ): Promise<{ rows: DatasetQueryRow[]; publishedMatchIds: string[] }>;
}
export const DATASET_WINDOW_READER = Symbol('DATASET_WINDOW_READER');
