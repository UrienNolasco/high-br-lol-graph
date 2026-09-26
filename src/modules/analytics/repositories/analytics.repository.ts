import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  COMPARISON_COHORT_READER,
  type ComparisonCohortReader,
  type TimelineFilters,
} from '../../matches/ports/comparison-cohort-reader';

@Injectable()
export class AnalyticsRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(COMPARISON_COHORT_READER)
    private readonly cohorts: ComparisonCohortReader,
  ) {}

  async findUserByPuuid(puuid: string) {
    return this.prisma.user.findUnique({ where: { puuid } });
  }

  findComparisonCohort(puuid: string, filters: TimelineFilters) {
    return this.cohorts.findComparisonCohort(puuid, filters);
  }
}
