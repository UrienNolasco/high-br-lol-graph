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
import { PlayerStatsAggregationService } from './adapters/persistence/player-stats-writer';
import { STATS_WRITER } from './ports/stats-writer';
import { PlayerStatsReaderAdapter } from './adapters/persistence/player-stats-reader';
import { STATS_READER } from './ports/stats-reader';

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
    PlayerStatsAggregationService,
    { provide: STATS_WRITER, useExisting: PlayerStatsAggregationService },
    PlayerStatsReaderAdapter,
    { provide: STATS_READER, useExisting: PlayerStatsReaderAdapter },
  ],
  exports: [
    ChampionStatsService,
    ChampionDetailService,
    ProcessedMatchesService,
    TierRankService,
    ChampionStatsRepository,
    STATS_WRITER,
    STATS_READER,
  ],
})
export class StatsModule {}
