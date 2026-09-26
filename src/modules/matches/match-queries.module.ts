import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ComparisonCohortRepository } from './repositories/comparison-cohort.repository';
import { COMPARISON_COHORT_READER } from './ports/comparison-cohort-reader';

@Module({
  imports: [PrismaModule],
  providers: [
    { provide: COMPARISON_COHORT_READER, useClass: ComparisonCohortRepository },
  ],
  exports: [COMPARISON_COHORT_READER],
})
export class MatchQueriesModule {}
