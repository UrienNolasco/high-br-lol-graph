import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchDetailService } from './services/match-detail.service';
import { MatchGoldTimelineService } from './services/match-gold-timeline.service';
import { MatchTimelineEventsService } from './services/match-timeline-events.service';
import { MatchBuildsService } from './services/match-builds.service';
import { MatchPerformanceService } from './services/match-performance.service';
import { MatchRepository } from './repositories/match.repository';
import { PrismaModule } from '../../core/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MatchesController],
  providers: [
    MatchRepository,
    MatchDetailService,
    MatchGoldTimelineService,
    MatchTimelineEventsService,
    MatchBuildsService,
    MatchPerformanceService,
  ],
})
export class MatchesModule {}
