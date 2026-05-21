import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CollectorController } from './collector.controller';
import { CollectorService } from './services/collector.service';
import { CollectorConfigService } from './services/collector-config.service';
import { CollectorPipelineService } from './services/collector-pipeline.service';
import { CollectorRepository } from './repositories/collector.repository';
import { RiotModule } from '../../core/riot/riot.module';
import { QueueModule } from '../../core/queue/queue.module';
import { PrismaModule } from '../../core/prisma/prisma.module';

@Module({
  imports: [ScheduleModule, RiotModule, QueueModule, PrismaModule],
  controllers: [CollectorController],
  providers: [
    CollectorConfigService,
    CollectorPipelineService,
    CollectorService,
    CollectorRepository,
  ],
  exports: [CollectorService],
})
export class CollectorModule {}
