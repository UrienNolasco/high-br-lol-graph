import { Module } from '@nestjs/common';
import { WorkerService } from './services/worker.service';
import { WorkerController } from './worker.controller';
import { RiotModule } from '../../core/riot/riot.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { StatsModule } from '../../core/stats/stats.module';
import { MatchPersistenceService } from './services/match-persistence.service';
import { ProcessingModule } from '../../core/processing/processing.module';

@Module({
  imports: [RiotModule, PrismaModule, StatsModule, ProcessingModule],
  controllers: [WorkerController],
  providers: [WorkerService, MatchPersistenceService],
  exports: [WorkerService],
})
export class WorkerModule {}
