import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IndicatorService } from './indicator.service';
import { IndicatorQueryDto } from './indicator-query.dto';
import { indicatorCatalog } from './pure/indicator-catalog';
import {
  IndicatorCatalogDto,
  IndicatorHistoryDto,
  MatchIndicatorsDto,
} from './indicator.dto';
@ApiTags('Optional execution indicators')
@ApiResponse({
  status: 400,
  description: 'Invalid family, cohort, cursor or limit',
})
@Controller('api/v1')
export class IndicatorController {
  constructor(private readonly service: IndicatorService) {}
  @Get('indicators/catalog')
  @ApiOperation({
    summary: 'Validated optional execution/casts/pings field catalog',
  })
  @ApiResponse({ status: 200, type: IndicatorCatalogDto })
  catalog() {
    return indicatorCatalog();
  }
  @Get('matches/:matchId/indicators/:puuid')
  @ApiOperation({
    summary: 'Literal optional final counters and observed-duration rates',
    description:
      'Projection-only; accepts family only. No accuracy denominator, cast timestamps/cooldowns, communication intent, toxicity or quality judgments.',
  })
  @ApiResponse({ status: 200, type: MatchIndicatorsDto })
  @ApiResponse({ status: 404, description: 'Match or participant not found' })
  match(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
    @Query() query: IndicatorQueryDto,
  ) {
    return this.service.match(matchId, puuid, query);
  }
  @Get('players/:puuid/indicators')
  @ApiOperation({
    summary: 'Bounded retrospective player history by exact cohort',
    description:
      'Creation-time cursor; <=100 source matches, <=10 groups per response. Means and ratios of sums use valid observations only; N describes this page, not full history. No population reference percentile.',
  })
  @ApiResponse({ status: 200, type: IndicatorHistoryDto })
  history(@Param('puuid') puuid: string, @Query() query: IndicatorQueryDto) {
    return this.service.history(puuid, query);
  }
}
