import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ComparisonCohortRepository } from './repositories/comparison-cohort.repository';
import { COMPARISON_COHORT_READER } from './ports/comparison-cohort-reader';

import { CHAMPION_CONTEXT_READER } from './ports/champion-context-reader';
import { ChampionContextRepository } from './repositories/champion-context.repository';

@Module({
  imports: [PrismaModule],
  providers: [
    { provide: CHAMPION_CONTEXT_READER, useClass: ChampionContextRepository },
    { provide: COMPARISON_COHORT_READER, useClass: ComparisonCohortRepository },
  ],
  exports: [COMPARISON_COHORT_READER, CHAMPION_CONTEXT_READER],
})
export class MatchQueriesModule {}
