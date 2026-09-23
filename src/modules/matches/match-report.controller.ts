import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MatchReportService } from './services/match-report.service';
import { MatchReportQueryDto } from './dto/match-report-query.dto';
import {
  MatchReportDto,
  ReportFamilyDto,
  ReportMetricDto,
  ReportEpisodesDto,
  ReportEvidenceDto,
} from './dto/match-report.dto';
@ApiTags('Match report')
@ApiResponse({
  status: 400,
  description:
    'Invalid family, section, path, mode, timestamp interval or pagination bounds',
})
@ApiResponse({
  status: 404,
  description: 'Match, participant or scoped detail not found',
})
@Controller('api/v1/matches/:matchId/report/:puuid')
export class MatchReportController {
  constructor(private readonly service: MatchReportService) {}
  @Get()
  @ApiOperation({
    summary: 'Compact player report with four equivalent dimensions',
    description:
      'One RepeatableRead projection snapshot per request; no raw, Riot or CDN reads. Partial/unavailable are HTTP 200 with reasons. Observed final totals survive missing timeline or processing provenance. No overall score.',
  })
  @ApiResponse({ status: 200, type: MatchReportDto })
  summary(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
    @Query() query: MatchReportQueryDto,
  ) {
    return this.service.summary(matchId, puuid, query);
  }
  @Get('families/:family')
  @ApiOperation({
    summary: 'Bounded section of a metric family',
    description:
      'Family/section allowlists and dot paths are documented in RELATORIO-PARTIDA-MET17.md. Collections are explicitly paginated; temporal filters only change presentation, never metric denominators.',
  })
  @ApiResponse({ status: 200, type: ReportFamilyDto })
  family(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
    @Param('family') family: string,
    @Query() query: MatchReportQueryDto,
  ) {
    return this.service.family(matchId, puuid, family, query);
  }
  @Get('metrics/:key')
  @ApiOperation({
    summary: 'Metric and paginated evidence, preserving checkpoint mode',
  })
  @ApiResponse({ status: 200, type: ReportMetricDto })
  metric(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
    @Param('key') key: string,
    @Query() query: MatchReportQueryDto,
  ) {
    return this.service.metric(matchId, puuid, key, query);
  }
  @Get('episodes')
  @ApiResponse({ status: 200, type: ReportEpisodesDto })
  episodes(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
    @Query() query: MatchReportQueryDto,
  ) {
    return this.service.episodes(matchId, puuid, query);
  }
  @Get('episodes/:id')
  @ApiResponse({
    status: 200,
    description:
      'Scoped episode, occurrence, temporal capture count and paginated event links',
  })
  episode(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
    @Param('id') id: string,
    @Query() query: MatchReportQueryDto,
  ) {
    return this.service.episodes(matchId, puuid, query, id);
  }
  @Get('evidence/:id')
  @ApiResponse({ status: 200, type: ReportEvidenceDto })
  evidence(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
    @Param('id') id: string,
    @Query() query: MatchReportQueryDto,
  ) {
    return this.service.evidence(matchId, puuid, id, query);
  }
}
