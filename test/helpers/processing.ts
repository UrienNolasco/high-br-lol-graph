import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { DatasetPersistenceAdapter } from '../../src/modules/dataset/adapters/dataset-writer.adapter';
import { RiotMatchPreparer } from '../../src/modules/matches/adapters/riot/match-preparer';
import { TimelineParserService } from '../../src/modules/matches/adapters/riot/timeline-parser.service';
import { PlayerStatsAggregationService } from '../../src/modules/stats/adapters/persistence/player-stats-writer';
import { createProcessingComposition } from '../../src/composition/processing';
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
  return createProcessingComposition({
    prisma,
    source,
    logger,
    statsWriter,
    preparer,
    datasetWriter,
  }).processing;
}
