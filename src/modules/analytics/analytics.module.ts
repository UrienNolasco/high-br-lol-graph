import { BuildChoiceQueriesModule } from '../matches/build-choice-queries.module';
import { BuildChoicesController } from './build-choices.controller';
import { BuildChoicesService } from './services/build-choices.service';
import { DatasetModule } from '../dataset/dataset.module';
import { PatchComparisonController } from './patch-comparison.controller';
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './services/analytics.service';
import { AnalyticsRepository } from './repositories/analytics.repository';
import { PrismaModule } from '../../core/prisma/prisma.module';

import { MatchQueriesModule } from '../matches/match-queries.module';

import { ChampionContextController } from './champion-context.controller';

import { AdvantageController } from './advantage.controller';

@Module({
  imports: [PrismaModule, MatchQueriesModule, BuildChoiceQueriesModule, DatasetModule],
  controllers: [
    AdvantageController,
    AnalyticsController,
    ChampionContextController,
    BuildChoicesController,
    PatchComparisonController,
  ],
  providers: [AnalyticsRepository, AnalyticsService, BuildChoicesService],
})
export class AnalyticsModule {}
