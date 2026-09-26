import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MatchQueriesModule } from './match-queries.module';
import { COMPARISON_COHORT_READER } from './ports/comparison-cohort-reader';
import { ComparisonCohortRepository } from './repositories/comparison-cohort.repository';

it('publishes the cohort reader without the matches HTTP module', async () => {
  const module = await Test.createTestingModule({
    imports: [MatchQueriesModule],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();
  expect(module.get(COMPARISON_COHORT_READER)).toBeInstanceOf(
    ComparisonCohortRepository,
  );
  await module.close();
});
