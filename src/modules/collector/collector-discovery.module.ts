import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ProcessingModule } from '../../core/processing/processing.module';
import { OBSERVATION_READER } from '../../core/processing/ports/observation-reader';
import { DISCOVERY_RECORDER } from '../../core/processing/contracts/request-ingestion';
import { CollectorRepository } from './repositories/collector.repository';
import { OBSERVATION_WRITER } from './ports/observation-writer';
import { DiscoveryReportService } from './services/discovery-report.service';
import { DiscoveryService } from './services/discovery.service';

/** Side-effect-free discovery composition shared by players and collector. */
@Global()
@Module({
  imports: [PrismaModule, ProcessingModule],
  providers: [
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
  ],
})
export class CollectorDiscoveryModule {}
