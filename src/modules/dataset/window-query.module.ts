import { Module } from '@nestjs/common';
import { ReadSnapshotModule } from '../../core/prisma/read-snapshot.module';
import { DatasetWindowAdapter } from './adapters/window-reader';
import { DATASET_WINDOW_READER } from './ports/window-reader';
@Module({
  imports: [ReadSnapshotModule],
  providers: [
    DatasetWindowAdapter,
    { provide: DATASET_WINDOW_READER, useExisting: DatasetWindowAdapter },
  ],
  exports: [DATASET_WINDOW_READER],
})
export class DatasetWindowQueryModule {}
