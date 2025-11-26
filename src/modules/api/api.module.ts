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
import { SemaphoreModule } from 'src/core/semaphore/semaphore.module';

@Module({
  imports: [RiotModule, DataDragonModule, PrismaModule, SemaphoreModule],
  controllers: [RateLimitController, StatsController, ChampionsController],
  providers: [ApiService],
})
export class ApiModule {}
