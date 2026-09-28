import { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../core/prisma/prisma.service';
import { CollectorRepository } from '../modules/collector/repositories/collector.repository';
import { DatasetPersistenceAdapter } from '../modules/dataset/adapters/dataset-writer.adapter';
import type { DatasetWriter } from '../modules/dataset/ports/dataset-writer';
import { MatchProjectionPersistenceAdapter } from '../modules/matches/adapters/persistence/match-projection-writer';
import { RiotMatchPreparer } from '../modules/matches/adapters/riot/match-preparer';
import { TimelineParserService } from '../modules/matches/adapters/riot/timeline-parser.service';
import type { MatchPreparer } from '../modules/matches/ports/match-preparer';
import { PlayerStatsAggregationService } from '../modules/stats/adapters/persistence/player-stats-writer';
import type { StatsWriter } from '../modules/stats/ports/stats-writer';
import type { ObservationReader } from '../modules/processing/ports/observation-reader';
import type { RawMatchSource } from '../modules/processing/ports/raw-match-source';
import { ProcessingService } from '../modules/processing/services/processing.service';
import { RebuildService } from '../modules/processing/services/rebuild.service';

export interface ProcessingComposition {
  processing: ProcessingService;
  rebuild: RebuildService;
}

export interface ProcessingCompositionOptions {
  prisma: PrismaService;
  source: RawMatchSource;
  logger: PinoLogger;
  statsWriter?: StatsWriter;
  datasetWriter?: DatasetWriter;
  preparer?: MatchPreparer;
  observationReader?: ObservationReader;
}

/** The single explicit graph for non-Nest processing entrypoints. */
export function createProcessingComposition(
  options: ProcessingCompositionOptions,
): ProcessingComposition {
  const preparer =
    options.preparer ?? new RiotMatchPreparer(new TimelineParserService());
  const processing = new ProcessingService(
    options.prisma,
    options.source,
    preparer,
    new MatchProjectionPersistenceAdapter(),
    options.datasetWriter ?? new DatasetPersistenceAdapter(),
    options.statsWriter ?? new PlayerStatsAggregationService(),
    options.observationReader ?? new CollectorRepository(options.prisma),
    options.logger,
  );
  return {
    processing,
    rebuild: new RebuildService(options.prisma, processing),
  };
}
