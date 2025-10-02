import { Module } from '@nestjs/common';
import { CollectorService } from './collector.service';
import { RiotModule } from '../../core/riot/riot.module';
import { QueueModule } from '../../core/queue/queue.module';
import { PrismaModule } from 'src/core/prisma/prisma.module';

@Module({
  imports: [RiotModule, QueueModule, PrismaModule],
  providers: [CollectorService],
  exports: [CollectorService],
})
export class CollectorModule {}
