import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { DatasetController } from './dataset.controller';
import { DatasetService } from './application/dataset.service';
import { DatasetQueryRepository } from './adapters/dataset-query.repository';
import { DATASET_READER } from './ports/dataset-reader';
@Module({
  imports: [PrismaModule],
  controllers: [DatasetController],
  providers: [
    DatasetService,
    DatasetQueryRepository,
    { provide: DATASET_READER, useExisting: DatasetQueryRepository },
  ],
  exports: [DatasetService, DATASET_READER],
})
export class DatasetModule {}
