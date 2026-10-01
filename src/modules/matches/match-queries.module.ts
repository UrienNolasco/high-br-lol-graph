import { ReadSnapshotModule } from '../../core/prisma/read-snapshot.module';
import { PLAYER_HISTORY_COVERAGE_READER } from './ports/player-history-coverage-reader';
import { PlayerHistoryCoveragePersistenceReader } from './repositories/player-history-coverage.reader';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ComparisonCohortRepository } from './repositories/comparison-cohort.repository';
import { COMPARISON_COHORT_READER } from './ports/comparison-cohort-reader';

import { CHAMPION_CONTEXT_READER } from './ports/champion-context-reader';
import { ChampionContextRepository } from './repositories/champion-context.repository';

@Module({
  imports: [ReadSnapshotModule, PrismaModule],
  providers: [
    {
      provide: PLAYER_HISTORY_COVERAGE_READER,
      useClass: PlayerHistoryCoveragePersistenceReader,
    },
    { provide: CHAMPION_CONTEXT_READER, useClass: ChampionContextRepository },
    { provide: COMPARISON_COHORT_READER, useClass: ComparisonCohortRepository },
  ],
  exports: [
    PLAYER_HISTORY_COVERAGE_READER,
    COMPARISON_COHORT_READER,
    CHAMPION_CONTEXT_READER,
  ],
})
export class MatchQueriesModule {}
