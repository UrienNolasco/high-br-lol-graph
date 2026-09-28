import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProcessingService } from './processing.service';
import { INGESTION_TRANSACTION_COORDINATOR } from './contracts/request-ingestion';

@Module({
  imports: [PrismaModule],
  providers: [
    ProcessingService,
    {
      provide: INGESTION_TRANSACTION_COORDINATOR,
      useExisting: ProcessingService,
    },
  ],
  exports: [ProcessingService, INGESTION_TRANSACTION_COORDINATOR],
})
export class ProcessingModule {}
