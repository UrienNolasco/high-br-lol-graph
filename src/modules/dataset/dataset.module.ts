import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { DatasetController } from './dataset.controller';
import { DatasetService } from './application/dataset.service';
import { DatasetQueryRepository } from './adapters/dataset-query.repository';
import { DATASET_READER } from './ports/dataset-reader';
import { DatasetPersistenceAdapter } from './adapters/dataset-writer.adapter';
import { DATASET_WRITER } from './ports/dataset-writer';
@Module({
  imports: [PrismaModule],
  controllers: [DatasetController],
  providers: [
    DatasetService,
    DatasetQueryRepository,
    DatasetPersistenceAdapter,
    { provide: DATASET_READER, useExisting: DatasetQueryRepository },
    { provide: DATASET_WRITER, useExisting: DatasetPersistenceAdapter },
  ],
  exports: [DatasetService, DATASET_READER, DATASET_WRITER],
})
export class DatasetModule {}
