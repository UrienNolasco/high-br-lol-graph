import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ProcessingService } from './services/processing.service';
import { RiotModule } from '../../core/riot/riot.module';
import { MatchNormalizationModule } from '../matches/match-normalization.module';
import { MatchesModule } from '../matches/matches.module';
import { DatasetModule } from '../dataset/dataset.module';
import { StatsModule } from '../stats/stats.module';
import { PROCESS_MATCH } from './contracts/process-match';
import { REBUILD_USE_CASE } from './contracts/rebuild';
import { RebuildService } from './services/rebuild.service';
import { RAW_MATCH_SOURCE } from './ports/raw-match-source';
import { RiotService } from '../../core/riot/riot.service';
import { PROCESSING_JOBS } from '../../core/queue/processing-jobs';

@Global()
@Module({
  imports: [
    PrismaModule,
    RiotModule,
    MatchNormalizationModule,
    MatchesModule,
    DatasetModule,
    StatsModule,
  ],
  providers: [
    ProcessingService,
    { provide: RAW_MATCH_SOURCE, useExisting: RiotService },
    { provide: PROCESS_MATCH, useExisting: ProcessingService },
    { provide: PROCESSING_JOBS, useExisting: ProcessingService },
    RebuildService,
    { provide: REBUILD_USE_CASE, useExisting: RebuildService },
  ],
  exports: [
    ProcessingService,
    PROCESS_MATCH,
    PROCESSING_JOBS,
    REBUILD_USE_CASE,
  ],
})
export class ProcessingModule {}
