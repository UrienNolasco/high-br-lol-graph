import { Module } from '@nestjs/common';
import { CollectorService } from './collector.service';
import { RiotModule } from '../../core/riot/riot.module';
import { QueueModule } from '../../core/queue/queue.module';

@Module({
  imports: [RiotModule, QueueModule],
  providers: [CollectorService],
  exports: [CollectorService],
})
export class CollectorModule {}
