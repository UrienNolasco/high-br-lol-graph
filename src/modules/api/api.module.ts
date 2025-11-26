import { Module } from '@nestjs/common';
import {
  RateLimitController,
  StatsController,
  ChampionsController,
} from './api.controller';
import { ApiService } from './api.service';
import { RiotModule } from '../../core/riot/riot.module';
import { DataDragonModule } from 'src/core/data-dragon/data-dragon.module';
import { PrismaModule } from 'src/core/prisma/prisma.module';

@Module({
  imports: [RiotModule, DataDragonModule, PrismaModule],
  controllers: [RateLimitController, StatsController, ChampionsController],
  providers: [ApiService],
})
export class ApiModule {}
