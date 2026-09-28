import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { OBSERVATION_READER } from '../processing/ports/observation-reader';
import {
  DISCOVERY_RECORDER,
  INGESTION_TRANSACTION_COORDINATOR,
} from '../processing/contracts/request-ingestion';
import { IngestionTransactionService } from './services/ingestion-transaction.service';
import { CollectorRepository } from './repositories/collector.repository';
import { OBSERVATION_WRITER } from './ports/observation-writer';
import { DiscoveryReportService } from './services/discovery-report.service';
import { DiscoveryService } from './services/discovery.service';

/** Side-effect-free discovery composition shared by players and collector. */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    IngestionTransactionService,
    {
      provide: INGESTION_TRANSACTION_COORDINATOR,
      useExisting: IngestionTransactionService,
    },
    CollectorRepository,
    DiscoveryReportService,
    DiscoveryService,
    { provide: OBSERVATION_WRITER, useExisting: CollectorRepository },
    { provide: OBSERVATION_READER, useExisting: CollectorRepository },
    { provide: DISCOVERY_RECORDER, useExisting: DiscoveryService },
  ],
  exports: [
    CollectorRepository,
    DiscoveryReportService,
    DiscoveryService,
    OBSERVATION_WRITER,
    OBSERVATION_READER,
    DISCOVERY_RECORDER,
    INGESTION_TRANSACTION_COORDINATOR,
  ],
})
export class CollectorDiscoveryModule {}
