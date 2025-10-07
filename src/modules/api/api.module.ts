import { Module } from '@nestjs/common';
import { RateLimitController, StatsController } from './api.controller';
import { ApiService } from './api.service';
import { RiotModule } from '../../core/riot/riot.module';
import { DataDragonModule } from 'src/core/data-dragon/data-dragon.module';

@Module({
  imports: [RiotModule, DataDragonModule],
  controllers: [RateLimitController, StatsController],
  providers: [ApiService],
})
export class ApiModule {}
