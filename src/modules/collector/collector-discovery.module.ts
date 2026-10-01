import { ReadSnapshotModule } from '../../core/prisma/read-snapshot.module';
import { DISCOVERY_READER } from './contracts/discovery-reader';
import { DiscoveryPersistenceReader } from './adapters/discovery-reader';
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
  imports: [ReadSnapshotModule, PrismaModule],
  providers: [
    { provide: DISCOVERY_READER, useClass: DiscoveryPersistenceReader },
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
    DISCOVERY_READER,
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
