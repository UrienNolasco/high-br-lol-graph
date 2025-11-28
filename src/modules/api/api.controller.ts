import { Controller, Get, Param, Query } from '@nestjs/common';
import { RateLimiterService } from '../../core/riot/rate-limiter.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { RateLimitStatusDto } from './dto/rate-limit-status.dto';
import { ResetResponseDto } from './dto/reset-response.dto';
import { ApiService } from './api.service';
import {
  ChampionStatsDto,
  PaginatedChampionStatsDto,
} from './dto/champion-stats.dto';
import { GetChampionStatsDto } from './dto/get-champion-stats.dto';
import { ChampionListDto } from './dto/champion-list.dto';
import { CurrentPatchDto } from './dto/current-patch.dto';
import { MatchupStatsDto } from './dto/matchup-stats.dto';

@ApiTags('Rate Limit')
@Controller('api')
export class RateLimitController {
  constructor(
    private readonly rateLimiterService: RateLimiterService,
    private readonly apiService: ApiService,
  ) {}

  @Get('rate-limit/status')
  @ApiOperation({ summary: 'Obtém o status atual do rate limit' })
  @ApiResponse({
    status: 200,
    description: 'Status retornado com sucesso.',
    type: RateLimitStatusDto,
  })
  async getRateLimitStatus(): Promise<RateLimitStatusDto> {
    return this.rateLimiterService.getStatus();
  }

  @Get('rate-limit/reset')
  @ApiOperation({ summary: 'Reseta o contador do rate limit no Redis' })
  @ApiResponse({
    status: 200,
    description: 'Contador do rate limit resetado com sucesso.',
    type: ResetResponseDto,
  })
  async resetRateLimit(): Promise<ResetResponseDto> {
    await this.rateLimiterService.clear();
    return { message: 'Rate limit tokens resetados com sucesso' };
  }
}

@ApiTags('Champions')
@Controller('api/v1/champions')
export class ChampionsController {
  constructor(private readonly apiService: ApiService) {}

  @Get()
  @ApiOperation({ summary: 'List all available champions' })
  @ApiResponse({
    status: 200,
    description: 'Return a list of all champions.',
    type: ChampionListDto,
  })
  getAllChampions(): Promise<ChampionListDto> {
    return this.apiService.getAllChampions();
  }

  @Get('current-patch')
  @ApiOperation({
    summary: 'Get all available League of Legends patch versions',
    description:
      'Returns all available patches ordered from most recent to oldest. The frontend can choose how many to display (e.g., the latest one, the last 3, etc.)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns all available patches with the current (most recent) patch highlighted.',
    type: CurrentPatchDto,
  })
  getCurrentPatch(): Promise<CurrentPatchDto> {
    return this.apiService.getCurrentPatch();
  }
}

@ApiTags('Stats')
@Controller('api/v1/stats')
export class StatsController {
  constructor(private readonly apiService: ApiService) {}

  @Get('champions')
  @ApiOperation({ summary: 'Get General Champion Stats' })
  @ApiResponse({
    status: 200,
    description: 'Return a paginated list of champion stats.',
    type: PaginatedChampionStatsDto,
  })
  @ApiQuery({ name: 'patch', required: true, description: 'e.g., 15.20' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'e.g., 1',
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'e.g., 20',
    type: Number,
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'e.g., winRate or gamesPlayed',
    enum: ['winRate', 'gamesPlayed', 'championName'],
  })
  @ApiQuery({
    name: 'order',
    required: false,
    description: 'e.g., desc',
    enum: ['asc', 'desc'],
  })
  getChampionStats(
    @Query() query: GetChampionStatsDto,
  ): Promise<PaginatedChampionStatsDto> {
    const { patch, page, limit, sortBy, order } = query;
    return this.apiService.getChampionStats(patch, page, limit, sortBy, order);
  }

  @Get('champions/:championName')
  @ApiOperation({ summary: 'Get Specific Champion Stats' })
  @ApiResponse({
    status: 200,
    description: 'Return detailed stats for a single champion.',
    type: ChampionStatsDto,
  })
  @ApiParam({ name: 'championName', description: 'e.g., Aatrox' })
  @ApiQuery({ name: 'patch', required: true, description: 'e.g., 15.20' })
  getChampion(
    @Param('championName') championName: string,
    @Query('patch') patch: string,
  ): Promise<ChampionStatsDto> {
    return this.apiService.getChampion(championName, patch);
  }

  @Get('matchups/:championA/:championB')
  @ApiOperation({ summary: 'Get Matchup Stats' })
  @ApiResponse({
    status: 200,
    description: 'Return direct matchup analysis between two champions.',
    type: MatchupStatsDto,
  })
  @ApiParam({ name: 'championA', description: 'e.g., Aatrox' })
  @ApiParam({ name: 'championB', description: 'e.g., Zed' })
  @ApiQuery({ name: 'patch', required: true, description: 'e.g., 15.20' })
  @ApiQuery({ name: 'role', required: true, description: 'e.g., TOP' })
  getMatchupStats(
    @Param('championA') championA: string,
    @Param('championB') championB: string,
    @Query('patch') patch: string,
    @Query('role') role: string,
  ): Promise<MatchupStatsDto> {
    return this.apiService.getMatchupStats(championA, championB, patch, role);
  }

  @Get('processed-matches')
  @ApiOperation({ summary: 'Get Processed Matches' })
  @ApiResponse({
    status: 200,
    description: 'Return the processed matches number',
  })
  @ApiQuery({
    name: 'patch',
    required: false,
    description: 'Filter by patch (e.g., 15.23)',
  })
  getProcessedMatches(
    @Query('patch') patch?: string,
  ): Promise<{ count: number; patch?: string; message?: string }> {
    return this.apiService.getProcessedMatches(patch);
  }
}
