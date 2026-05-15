import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppConfigModule } from './core/config/config.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { DataDragonModule } from './core/data-dragon/data-dragon.module';
import { LoggerModule } from './core/logger/logger.module';

import { WorkerModule } from './modules/worker/worker.module';
import { CollectorModule } from './modules/collector/collector.module';
import { PlayersModule } from './modules/players/players.module';
import { ChampionsModule } from './modules/champions/champions.module';
import { StatsModule } from './modules/stats/stats.module';
import { MatchesModule } from './modules/matches/matches.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    LoggerModule,
    AppConfigModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    DataDragonModule,
    ChampionsModule,
    StatsModule,
    PlayersModule,
    MatchesModule,
    AnalyticsModule,
    CollectorModule,
    WorkerModule,
    AdminModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
