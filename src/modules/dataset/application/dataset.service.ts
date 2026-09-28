import { Inject, Injectable } from '@nestjs/common';
import type { DatasetFilters } from '../contracts/query';
import { DATASET_READER } from '../ports/dataset-reader';
import type { DatasetReader } from '../ports/dataset-reader';
@Injectable()
export class DatasetService {
  constructor(@Inject(DATASET_READER) private readonly reader: DatasetReader) {}

  query(filters: DatasetFilters, limit = 100, after?: string) {
    return this.reader.query(filters, limit, after);
  }
}
