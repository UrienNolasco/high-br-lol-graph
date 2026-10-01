import { BuildChoiceQueriesModule } from '../matches/build-choice-queries.module';
import { BuildChoicesController } from './build-choices.controller';
import { BuildChoicesService } from './services/build-choices.service';
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './services/analytics.service';
import { AnalyticsRepository } from './repositories/analytics.repository';
import { PrismaModule } from '../../core/prisma/prisma.module';

import { MatchQueriesModule } from '../matches/match-queries.module';

import { ChampionContextController } from './champion-context.controller';

@Module({
  imports: [PrismaModule, MatchQueriesModule, BuildChoiceQueriesModule],
  controllers: [AnalyticsController, ChampionContextController, BuildChoicesController],
  providers: [AnalyticsRepository, AnalyticsService, BuildChoicesService],
})
export class AnalyticsModule {}
