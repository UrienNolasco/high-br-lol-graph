import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CollectorService } from './collector.service';
import { CollectorController } from './collector.controller';
import { RiotModule } from '../../core/riot/riot.module';
import { QueueModule } from '../../core/queue/queue.module';
import { PrismaModule } from 'src/core/prisma/prisma.module';

@Module({
  imports: [ScheduleModule, RiotModule, QueueModule, PrismaModule],
  controllers: [CollectorController],
  providers: [CollectorService],
  exports: [CollectorService],
})
export class CollectorModule {}
