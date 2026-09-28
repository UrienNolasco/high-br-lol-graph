import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CollectorController } from './collector.controller';
import { CollectorService } from './services/collector.service';
import { CollectorConfigService } from './services/collector-config.service';
import { CollectorPipelineService } from './services/collector-pipeline.service';
import { RiotModule } from '../../core/riot/riot.module';
import { QueueModule } from '../../core/queue/queue.module';
import { RedisModule } from '../../core/redis/redis.module';
import { CollectorDiscoveryModule } from './collector-discovery.module';

@Module({
  imports: [
    ScheduleModule,
    RiotModule,
    QueueModule,
    RedisModule,
    CollectorDiscoveryModule,
  ],
  controllers: [CollectorController],
  providers: [
    CollectorConfigService,
    CollectorPipelineService,
    CollectorService,
  ],
  exports: [CollectorService],
})
export class CollectorModule {}
