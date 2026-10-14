import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MatchReviewService } from './services/match-review.service';
import {
  MatchReviewDeathDto,
  MatchReviewOverviewDto,
  MatchReviewPageDto,
  MatchReviewQueryDto,
  ReviewValueDto,
} from './dto/match-review.dto';

@ApiTags('Matches')
@ApiExtraModels(ReviewValueDto)
@Controller('api/v1/matches')
export class MatchReviewController {
  constructor(private readonly service: MatchReviewService) {}
  @Get(':matchId/review/:puuid')
  @ApiOperation({
    summary:
      'Review observed resource changes, damage peaks and received-damage recaps',
    description:
      'Read-only persisted projections from one committed processing generation. Retrospective observations, not causal costs or a performance score. Existing cohort/remake rules are unchanged.',
  })
  @ApiResponse({ status: 200, type: MatchReviewOverviewDto })
  @ApiResponse({ status: 404, description: 'Match or participant not found.' })
  overview(@Param('matchId') matchId: string, @Param('puuid') puuid: string) {
    return this.service.overview(matchId, puuid);
  }
  @Get(':matchId/review/:puuid/deaths')
  @ApiOperation({
    summary: 'Page resource comparisons around each death',
    description:
      'Past-only snapshots targeted at death minus 180s, death and death plus 180s, at most 60s old. Actual observation times and multiple-death context are explicit. Filters never change denominators.',
  })
  @ApiResponse({ status: 200, type: MatchReviewPageDto })
  deaths(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
    @Query() query: MatchReviewQueryDto,
  ) {
    return this.service.deaths(matchId, puuid, query);
  }
  @Get(':matchId/review/:puuid/deaths/:eventId')
  @ApiOperation({
    summary:
      'Open one death with resource trajectory and partial received-damage sources',
    description:
      'eventId is the stable matchId:frameIndex:eventIndex identity, not a timestamp. Recap duration and unrecorded sources remain unknown.',
  })
  @ApiResponse({ status: 200, type: MatchReviewDeathDto })
  @ApiResponse({
    status: 404,
    description: 'Death does not belong to this participant.',
  })
  death(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
    @Param('eventId') eventId: string,
  ) {
    return this.service.death(matchId, puuid, eventId);
  }
  @Get(':matchId/review/:puuid/damage')
  @ApiOperation({
    summary:
      'Page observed damage intervals with neighboring deaths and original ranks',
    description:
      'Counters use exact adjacent snapshots and actual elapsed time. Global totals combine both teams across the map, not one fight. Unknown death coverage does not match deaths=none.',
  })
  @ApiResponse({ status: 200, type: MatchReviewPageDto })
  damage(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
    @Query() query: MatchReviewQueryDto,
  ) {
    return this.service.damage(matchId, puuid, query);
  }
}
