import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkerService } from './worker.service';
import { WorkerController } from './worker.controller';
import { RiotModule } from '../../core/riot/riot.module';
import { ChampionStats } from '../../core/database/entities/champion-stats.entity';
import { MatchupStats } from '../../core/database/entities/matchup-stats.entity';
import { ProcessedMatch } from '../../core/database/entities/processed-match.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChampionStats, MatchupStats, ProcessedMatch]),
    RiotModule,
  ],
  controllers: [WorkerController],
  providers: [WorkerService],
  exports: [WorkerService],
})
export class WorkerModule {}
