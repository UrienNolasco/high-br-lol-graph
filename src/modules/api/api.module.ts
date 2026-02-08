import { Module } from '@nestjs/common';
import {
  RateLimitController,
  StatsController,
  ChampionsController,
} from './api.controller';
import { MatchesController } from './matches.controller';
import { PlayersApiController } from './players-api.controller';
import { ApiService } from './api.service';
import { TierRankService } from './tier-rank.service';
import { RiotModule } from '../../core/riot/riot.module';
import { DataDragonModule } from 'src/core/data-dragon/data-dragon.module';
import { PrismaModule } from 'src/core/prisma/prisma.module';

@Module({
  imports: [RiotModule, DataDragonModule, PrismaModule],
  controllers: [
    RateLimitController,
    StatsController,
    ChampionsController,
    MatchesController,
    PlayersApiController,
  ],
  providers: [ApiService, TierRankService],
})
export class ApiModule {}
