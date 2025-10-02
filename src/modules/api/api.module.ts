import { Module } from '@nestjs/common';
import { RateLimitController, StatsController } from './api.controller';
import { ApiService } from './api.service';
import { RiotModule } from '../../core/riot/riot.module';

@Module({
  imports: [RiotModule],
  controllers: [RateLimitController, StatsController],
  providers: [ApiService],
})
export class ApiModule {}
