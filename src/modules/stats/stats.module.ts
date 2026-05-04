import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { TierRankService } from './tier-rank.service';
import { DataDragonModule } from '../../core/data-dragon/data-dragon.module';
import { PrismaModule } from '../../core/prisma/prisma.module';

@Module({
  imports: [DataDragonModule, PrismaModule],
  controllers: [StatsController],
  providers: [StatsService, TierRankService],
  exports: [StatsService, TierRankService],
})
export class StatsModule {}
