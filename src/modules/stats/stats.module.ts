import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { TierRankService } from './services/tier-rank.service';
import { DataDragonModule } from '../../core/data-dragon/data-dragon.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ChampionStatsRepository } from './repositories/champion-stats.repository';
import { MatchCountRepository } from './repositories/match-count.repository';
import { ChampionStatsService } from './services/champion-stats.service';
import { ChampionDetailService } from './services/champion-detail.service';
import { ProcessedMatchesService } from './services/processed-matches.service';

@Module({
  imports: [DataDragonModule, PrismaModule],
  controllers: [StatsController],
  providers: [
    ChampionStatsRepository,
    MatchCountRepository,
    ChampionStatsService,
    ChampionDetailService,
    ProcessedMatchesService,
    TierRankService,
  ],
  exports: [
    ChampionStatsService,
    ChampionDetailService,
    ProcessedMatchesService,
    TierRankService,
    ChampionStatsRepository,
  ],
})
export class StatsModule {}
