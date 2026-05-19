import { Controller, Post, Get, Param, Body, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PlayerSearchService } from './services/player-search.service';
import { PlayerProfileService } from './services/player-profile.service';
import { PlayerStatsService } from './services/player-stats.service';
import { PlayerMatchesService } from './services/player-matches.service';
import { SyncOrchestratorService } from './services/sync-orchestrator.service';
import { SyncStatusService } from './services/sync-status.service';
import { PlayerSearchDto } from './dto/player-search.dto';
import { PlayerResponseDto } from './dto/player-response.dto';
import {
  SyncTriggerResponseDto,
  SyncStatusResponseDto,
} from './dto/sync-response.dto';
import { PlayerProfileDto } from './dto/player-profile.dto';
import { PlayerUpdateStatusDto } from './dto/player-update-status.dto';
import { PlayerSummaryDto } from './dto/player-summary.dto';
import { PlayerChampionsDto } from './dto/player-champions.dto';
import { PlayerRoleDistributionDto } from './dto/player-role-distribution.dto';
import { PlayerActivityDto } from './dto/player-activity.dto';
import {
  PlayerMatchesDto,
  PlayerMatchesQueryDto,
} from './dto/player-match.dto';

@ApiTags('Players')
@Controller('api/v1/players')
export class PlayersController {
  constructor(
    private readonly searchSvc: PlayerSearchService,
    private readonly profileSvc: PlayerProfileService,
    private readonly statsSvc: PlayerStatsService,
    private readonly matchesSvc: PlayerMatchesService,
    private readonly syncOrchestrator: SyncOrchestratorService,
    private readonly syncStatus: SyncStatusService,
  ) {}

  @Get(':puuid')
  @ApiOperation({ summary: 'Get cached player profile' })
  @ApiParam({ name: 'puuid', description: 'Player PUUID' })
  @ApiResponse({
    status: 200,
    description: 'Player profile retrieved successfully',
    type: PlayerProfileDto,
  })
  @ApiResponse({ status: 404, description: 'Player not found' })
  async getPlayerProfile(
    @Param('puuid') puuid: string,
  ): Promise<PlayerProfileDto> {
    return this.profileSvc.getProfile(puuid);
  }

  @Get(':puuid/status')
  @ApiOperation({ summary: 'Get player match processing status' })
  @ApiParam({ name: 'puuid', description: 'Player PUUID' })
  @ApiResponse({
    status: 200,
    description: 'Player status retrieved successfully',
    type: PlayerUpdateStatusDto,
  })
  @ApiResponse({ status: 404, description: 'Player not found' })
  async getPlayerUpdateStatus(
    @Param('puuid') puuid: string,
  ): Promise<PlayerUpdateStatusDto> {
    return this.profileSvc.getUpdateStatus(puuid);
  }

  @Get(':puuid/summary')
  @ApiOperation({ summary: 'Get player macro analysis summary' })
  @ApiParam({ name: 'puuid', description: 'Player PUUID' })
  @ApiQuery({
    name: 'patch',
    required: false,
    description: 'Patch version (e.g. 15.19) or "ALL" for lifetime stats',
  })
  @ApiResponse({
    status: 200,
    description: 'Player summary retrieved successfully',
    type: PlayerSummaryDto,
  })
  @ApiResponse({ status: 404, description: 'No stats found for player' })
  async getPlayerSummary(
    @Param('puuid') puuid: string,
    @Query('patch') patch?: string,
  ): Promise<PlayerSummaryDto> {
    return this.statsSvc.getSummary(puuid, { patch: patch || 'ALL' });
  }

  @Get(':puuid/champions')
  @ApiOperation({ summary: 'Get player champion performance list' })
  @ApiParam({ name: 'puuid', description: 'Player PUUID' })
  @ApiQuery({
    name: 'patch',
    required: false,
    description: 'Patch version (e.g. 15.19) or "ALL" for lifetime stats',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    description: 'Filter by role (TOP, JUNGLE, MID, BOTTOM, UTILITY)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of champions to return (max 50)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Sort by: games, winRate, kda',
  })
  @ApiResponse({
    status: 200,
    description: 'Player champions retrieved successfully',
    type: PlayerChampionsDto,
  })
  async getPlayerChampions(
    @Param('puuid') puuid: string,
    @Query('patch') patch?: string,
    @Query('role') role?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
  ): Promise<PlayerChampionsDto> {
    return this.statsSvc.getChampions(puuid, {
      patch: patch || 'ALL',
      role,
      limit: limit ? parseInt(limit, 10) : undefined,
      sortBy,
    });
  }

  @Get(':puuid/roles')
  @ApiOperation({ summary: 'Get player role distribution and winrate' })
  @ApiParam({ name: 'puuid', description: 'Player PUUID' })
  @ApiQuery({
    name: 'patch',
    required: false,
    description: 'Patch version (e.g. 15.19) or "ALL" for lifetime stats',
  })
  @ApiResponse({
    status: 200,
    description: 'Player role distribution retrieved successfully',
    type: PlayerRoleDistributionDto,
  })
  async getPlayerRoleDistribution(
    @Param('puuid') puuid: string,
    @Query('patch') patch?: string,
  ): Promise<PlayerRoleDistributionDto> {
    return this.statsSvc.getRoleDistribution(puuid, { patch: patch || 'ALL' });
  }

  @Get(':puuid/activity')
  @ApiOperation({ summary: 'Get player activity heatmap (7x24 matrix)' })
  @ApiParam({ name: 'puuid', description: 'Player PUUID' })
  @ApiQuery({
    name: 'patch',
    required: false,
    description: 'Patch version (e.g. 15.19) or "ALL" for lifetime stats',
  })
  @ApiResponse({
    status: 200,
    description: 'Player activity heatmap retrieved successfully',
    type: PlayerActivityDto,
  })
  async getPlayerActivity(
    @Param('puuid') puuid: string,
    @Query('patch') patch?: string,
  ): Promise<PlayerActivityDto> {
    return this.statsSvc.getActivity(puuid, { patch: patch || 'ALL' });
  }

  @Get(':puuid/matches')
  @ApiOperation({
    summary: 'Get player match history (lightweight)',
    description:
      'Returns a lightweight list of matches for a player with advanced filters. Does NOT include timeline graphs. Optimized for mobile scroll.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns list of matches with basic stats.',
    type: PlayerMatchesDto,
  })
  @ApiResponse({ status: 404, description: 'Player not found.' })
  @ApiParam({
    name: 'puuid',
    description: 'Player PUUID',
    example: 'abc123-def456-ghi789',
  })
  async getPlayerMatches(
    @Param('puuid') puuid: string,
    @Query() query: PlayerMatchesQueryDto,
  ): Promise<PlayerMatchesDto> {
    if (query.page && !query.cursor) {
      return this.matchesSvc.getMatchesByPage(puuid, {
        ...query,
        page: query.page,
      });
    }
    return this.matchesSvc.getMatches(puuid, query);
  }

  @Post('search')
  @ApiOperation({
    summary: 'Search and update player by Riot ID',
    description:
      'Searches for a player by gameName#tagLine, fetches their profile data ' +
      '(including profileIconId and summonerLevel via Summoner-V4), ' +
      'enqueues new matches for processing with high priority, ' +
      'and returns complete player information for the mobile app.',
  })
  @ApiBody({ type: PlayerSearchDto })
  @ApiResponse({
    status: 200,
    description: 'Player found and data returned with match processing status.',
    type: PlayerResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Player not found on Riot servers.',
  })
  async searchPlayer(@Body() dto: PlayerSearchDto): Promise<PlayerResponseDto> {
    return this.searchSvc.search(dto);
  }

  @Post(':puuid/sync')
  @ApiOperation({
    summary: 'Trigger deep match history sync',
    description:
      'Fetches up to 100 ranked Solo/Duo matches from Riot API and enqueues new ones for processing.',
  })
  @ApiParam({ name: 'puuid', description: 'Player PUUID' })
  @ApiResponse({ status: 200, type: SyncTriggerResponseDto })
  @ApiResponse({ status: 404, description: 'Player not found in database.' })
  async triggerSync(
    @Param('puuid') puuid: string,
  ): Promise<SyncTriggerResponseDto> {
    return this.syncOrchestrator.startDeepSync(puuid);
  }

  @Get(':puuid/sync-status')
  @ApiOperation({
    summary: 'Get deep sync progress',
    description: 'Returns the current status of a deep match history sync.',
  })
  @ApiParam({ name: 'puuid', description: 'Player PUUID' })
  @ApiResponse({ status: 200, type: SyncStatusResponseDto })
  async getSyncStatus(
    @Param('puuid') puuid: string,
  ): Promise<SyncStatusResponseDto> {
    return this.syncStatus.getStatus(puuid);
  }
}
