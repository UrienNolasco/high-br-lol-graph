import { ReadSnapshotModule } from '../../core/prisma/read-snapshot.module';
import { PLAYER_OUTCOME_READER } from './ports/player-outcome-reader';
import { PlayerOutcomePersistenceReader } from './adapters/player-outcome-reader';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { DatasetController } from './dataset.controller';
import { DatasetService } from './application/dataset.service';
import { DatasetQueryRepository } from './adapters/dataset-query.repository';
import { DATASET_READER } from './ports/dataset-reader';
import { DatasetPersistenceAdapter } from './adapters/dataset-writer.adapter';
import { DATASET_WRITER } from './ports/dataset-writer';
@Module({
  imports: [ReadSnapshotModule, PrismaModule],
  controllers: [DatasetController],
  providers: [
    {
      provide: PLAYER_OUTCOME_READER,
      useClass: PlayerOutcomePersistenceReader,
    },
    DatasetService,
    DatasetQueryRepository,
    DatasetPersistenceAdapter,
    { provide: DATASET_READER, useExisting: DatasetQueryRepository },
    { provide: DATASET_WRITER, useExisting: DatasetPersistenceAdapter },
  ],
  exports: [
    PLAYER_OUTCOME_READER,
    DatasetService,
    DATASET_READER,
    DATASET_WRITER,
  ],
})
export class DatasetModule {}
