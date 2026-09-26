import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './services/analytics.service';
import { AnalyticsRepository } from './repositories/analytics.repository';
import { PrismaModule } from '../../core/prisma/prisma.module';

import { MatchQueriesModule } from '../matches/match-queries.module';

@Module({
  imports: [PrismaModule, MatchQueriesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsRepository, AnalyticsService],
})
export class AnalyticsModule {}
