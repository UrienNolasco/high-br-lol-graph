import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { ApiService } from './api.service';
import { PlayerProfileDto } from './dto/player-profile.dto';
import { PlayerUpdateStatusDto } from './dto/player-update-status.dto';
import { PlayerSummaryDto } from './dto/player-summary.dto';
import { PlayerChampionsDto } from './dto/player-champions.dto';
import { PlayerRoleDistributionDto } from './dto/player-role-distribution.dto';
import { PlayerActivityDto } from './dto/player-activity.dto';

@Controller('api/v1/players')
@ApiTags('Players')
export class PlayersApiController {
  constructor(private readonly apiService: ApiService) {}

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
    return this.apiService.getPlayerProfile(puuid);
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
    return this.apiService.getPlayerUpdateStatus(puuid);
  }

  @Get(':puuid/summary')
  @ApiOperation({ summary: 'Get player macro analysis summary' })
  @ApiParam({ name: 'puuid', description: 'Player PUUID' })
  @ApiQuery({ name: 'patch', required: false, description: 'Patch version or "lifetime"' })
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
    return this.apiService.getPlayerSummary(puuid, { patch });
  }

  @Get(':puuid/champions')
  @ApiOperation({ summary: 'Get player champion performance list' })
  @ApiParam({ name: 'puuid', description: 'Player PUUID' })
  @ApiQuery({ name: 'patch', required: false, description: 'Patch version or "lifetime"' })
  @ApiQuery({ name: 'role', required: false, description: 'Filter by role (TOP, JUNGLE, MID, BOTTOM, UTILITY)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of champions to return (max 50)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort by: games, winRate, kda' })
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
    return this.apiService.getPlayerChampions(puuid, {
      patch,
      role,
      limit: limit ? parseInt(limit, 10) : undefined,
      sortBy,
    });
  }

  @Get(':puuid/roles')
  @ApiOperation({ summary: 'Get player role distribution and winrate' })
  @ApiParam({ name: 'puuid', description: 'Player PUUID' })
  @ApiQuery({ name: 'patch', required: false, description: 'Patch version or "lifetime"' })
  @ApiResponse({
    status: 200,
    description: 'Player role distribution retrieved successfully',
    type: PlayerRoleDistributionDto,
  })
  async getPlayerRoleDistribution(
    @Param('puuid') puuid: string,
    @Query('patch') patch?: string,
  ): Promise<PlayerRoleDistributionDto> {
    return this.apiService.getPlayerRoleDistribution(puuid, { patch });
  }

  @Get(':puuid/activity')
  @ApiOperation({ summary: 'Get player activity heatmap (7x24 matrix)' })
  @ApiParam({ name: 'puuid', description: 'Player PUUID' })
  @ApiQuery({ name: 'patch', required: false, description: 'Patch version or "lifetime"' })
  @ApiResponse({
    status: 200,
    description: 'Player activity heatmap retrieved successfully',
    type: PlayerActivityDto,
  })
  async getPlayerActivity(
    @Param('puuid') puuid: string,
    @Query('patch') patch?: string,
  ): Promise<PlayerActivityDto> {
    return this.apiService.getPlayerActivity(puuid, { patch });
  }
}
