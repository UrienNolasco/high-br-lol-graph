import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlayersController } from './players.controller';
import { SyncService } from './services/sync.service';
import { RiotModule } from '../../core/riot/riot.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { QueueModule } from '../../core/queue/queue.module';
import { DataDragonModule } from '../../core/data-dragon/data-dragon.module';
import { PlayerRepository } from './repositories/player.repository';
import { PlayerStatsRepository } from './repositories/player-stats.repository';
import { MatchRepository } from './repositories/match.repository';
import { PlayerSearchService } from './services/player-search.service';
import { PlayerProfileService } from './services/player-profile.service';
import { PlayerStatsService } from './services/player-stats.service';
import { PlayerMatchesService } from './services/player-matches.service';
import { SyncOrchestratorService } from './services/sync-orchestrator.service';
import { SyncStatusService } from './services/sync-status.service';

@Module({
  imports: [
    RiotModule,
    PrismaModule,
    QueueModule,
    ConfigModule,
    DataDragonModule,
  ],
  controllers: [PlayersController],
  providers: [
    PlayerRepository,
    PlayerStatsRepository,
    MatchRepository,
    PlayerSearchService,
    PlayerProfileService,
    PlayerStatsService,
    PlayerMatchesService,
    SyncOrchestratorService,
    SyncStatusService,
    SyncService,
  ],
})
export class PlayersModule {}
