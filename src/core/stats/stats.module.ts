import { Module } from '@nestjs/common';
import { PlayerStatsAggregationService } from './player-stats-aggregation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PlayerStatsAggregationService],
  exports: [PlayerStatsAggregationService],
})
export class StatsModule {}
