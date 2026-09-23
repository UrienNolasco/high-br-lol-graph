import { MatchObjectivesController } from './match-objectives.controller';
import { MatchObjectivesService } from './services/match-objectives.service';
import { MatchVisionController } from './match-vision.controller';
import { MatchVisionService } from './services/match-vision.service';
import { MatchContributionService } from './services/match-contribution.service';
import { CombatRepository } from './repositories/combat.repository';
import { MatchCombatService } from './services/match-combat.service';
import { MatchCombatController } from './match-combat.controller';
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
import { MatchEconomyController } from './match-economy.controller';
import { MatchEconomyService } from './services/match-economy.service';

@Module({
  imports: [PrismaModule, DataDragonModule],
  controllers: [
    MatchesController,
    MatchVisionController,
    MatchCombatController,
    MatchEconomyController,
    MatchObjectivesController,
  ],
  providers: [
    MatchVisionService,
    MatchObjectivesService,
    MatchRepository,
    CombatRepository,
    MatchCombatService,
    MatchDetailService,
    MatchGoldTimelineService,
    MatchTimelineEventsService,
    MatchBuildsService,
    MatchPerformanceService,
    MatchContributionService,
    MatchEconomyService,
  ],
  exports: [MatchContributionService, MatchObjectivesService],
})
export class MatchesModule {}
