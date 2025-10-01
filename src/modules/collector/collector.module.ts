import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectorService } from './collector.service';
import { ProcessedMatch } from '../../core/database/entities/processed-match.entity';
import { RiotModule } from '../../core/riot/riot.module';
import { QueueModule } from '../../core/queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProcessedMatch]),
    RiotModule,
    QueueModule,
  ],
  providers: [CollectorService],
  exports: [CollectorService],
})
export class CollectorModule {}
