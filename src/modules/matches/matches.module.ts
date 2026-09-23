import { MatchVisionController } from './match-vision.controller';
import { MatchVisionService } from './services/match-vision.service';
import { MatchContributionService } from './services/match-contribution.service';
import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchDetailService } from './services/match-detail.service';
import { MatchGoldTimelineService } from './services/match-gold-timeline.service';
import { MatchTimelineEventsService } from './services/match-timeline-events.service';
import { MatchBuildsService } from './services/match-builds.service';
import { MatchPerformanceService } from './services/match-performance.service';
import { MatchRepository } from './repositories/match.repository';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { DataDragonModule } from '../../core/data-dragon/data-dragon.module';

@Module({
  imports: [PrismaModule, DataDragonModule],
  controllers: [MatchesController, MatchVisionController],
  providers: [
    MatchVisionService,
    MatchRepository,
    MatchDetailService,
    MatchGoldTimelineService,
    MatchTimelineEventsService,
    MatchBuildsService,
    MatchPerformanceService,
    MatchContributionService,
  ],
  exports: [MatchContributionService],
})
export class MatchesModule {}
