import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { MatchDeepDiveService } from './match-deep-dive.service';
import {
  MatchGoldTimelineDto,
  MatchTimelineEventsDto,
  MatchBuildsDto,
  MatchPerformanceComparisonDto,
} from './dto/match-deep-dive.dto';

@ApiTags('Match Deep Dive')
@Controller('api/v1/matches')
export class MatchDeepDiveController {
  constructor(private readonly deepDiveService: MatchDeepDiveService) {}

  @Get(':matchId/timeline/gold')
  @ApiOperation({
    summary: 'Get match gold timeline',
    description:
      'Returns gold difference between teams per minute, winner, max advantage point and throw point detection.',
  })
  @ApiResponse({
    status: 200,
    description: 'Gold timeline data.',
    type: MatchGoldTimelineDto,
  })
  @ApiResponse({ status: 404, description: 'Match not found.' })
  @ApiParam({
    name: 'matchId',
    description: 'Match ID',
    example: 'BR1_3216549870',
  })
  async getGoldTimeline(
    @Param('matchId') matchId: string,
  ): Promise<MatchGoldTimelineDto> {
    return this.deepDiveService.getMatchGoldTimeline(matchId);
  }

  @Get(':matchId/timeline/events')
  @ApiOperation({
    summary: 'Get match timeline events',
    description:
      'Returns kill, death, ward and objective positions for heatmap rendering.',
  })
  @ApiResponse({
    status: 200,
    description: 'Timeline events data.',
    type: MatchTimelineEventsDto,
  })
  @ApiResponse({ status: 404, description: 'Match not found.' })
  @ApiParam({
    name: 'matchId',
    description: 'Match ID',
    example: 'BR1_3216549870',
  })
  async getTimelineEvents(
    @Param('matchId') matchId: string,
  ): Promise<MatchTimelineEventsDto> {
    return this.deepDiveService.getMatchTimelineEvents(matchId);
  }

  @Get(':matchId/builds')
  @ApiOperation({
    summary: 'Get match builds',
    description:
      'Returns item timeline and final build for all participants.',
  })
  @ApiResponse({
    status: 200,
    description: 'Builds data.',
    type: MatchBuildsDto,
  })
  @ApiResponse({ status: 404, description: 'Match not found.' })
  @ApiParam({
    name: 'matchId',
    description: 'Match ID',
    example: 'BR1_3216549870',
  })
  async getBuilds(
    @Param('matchId') matchId: string,
  ): Promise<MatchBuildsDto> {
    return this.deepDiveService.getMatchBuilds(matchId);
  }

  @Get(':matchId/performance/:puuid')
  @ApiOperation({
    summary: 'Get performance comparison',
    description:
      'Returns radar chart data comparing player vs lane opponent (DPM, GPM, CSPM, Vision, KDA).',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance comparison data.',
    type: MatchPerformanceComparisonDto,
  })
  @ApiResponse({ status: 404, description: 'Match or player not found.' })
  @ApiParam({
    name: 'matchId',
    description: 'Match ID',
    example: 'BR1_3216549870',
  })
  @ApiParam({
    name: 'puuid',
    description: 'Player PUUID',
    example: 'abc123-def456-ghi789',
  })
  async getPerformanceComparison(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
  ): Promise<MatchPerformanceComparisonDto> {
    return this.deepDiveService.getMatchPerformanceComparison(matchId, puuid);
  }
}
