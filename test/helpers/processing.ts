import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { CollectorRepository } from '../../src/modules/collector/repositories/collector.repository';
import { DatasetPersistenceAdapter } from '../../src/modules/dataset/adapters/dataset-writer.adapter';
import { MatchProjectionPersistenceAdapter } from '../../src/modules/matches/adapters/persistence/match-projection-writer';
import { RiotMatchPreparer } from '../../src/modules/matches/adapters/riot/match-preparer';
import { TimelineParserService } from '../../src/modules/matches/adapters/riot/timeline-parser.service';
import { PlayerStatsAggregationService } from '../../src/modules/stats/adapters/persistence/player-stats-writer';
import { ProcessingService } from '../../src/modules/processing/services/processing.service';
import type { RawMatchSource } from '../../src/modules/processing/ports/raw-match-source';
import type { StatsWriter } from '../../src/modules/stats/ports/stats-writer';
import type { MatchPreparer } from '../../src/modules/matches/ports/match-preparer';
import type { DatasetWriter } from '../../src/modules/dataset/ports/dataset-writer';

export function createProcessingService(
  prisma: PrismaService,
  source: RawMatchSource,
  logger = new PinoLogger({ pinoHttp: { level: 'silent' } }),
  statsWriter: StatsWriter = new PlayerStatsAggregationService(),
  preparer: MatchPreparer = new RiotMatchPreparer(new TimelineParserService()),
  datasetWriter: DatasetWriter = new DatasetPersistenceAdapter(),
) {
  return new ProcessingService(
    prisma,
    source,
    preparer,
    new MatchProjectionPersistenceAdapter(),
    datasetWriter,
    statsWriter,
    new CollectorRepository(prisma),
    logger,
  );
}
