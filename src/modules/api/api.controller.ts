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

@ApiTags('Stats')
@Controller('api/v1/stats')
export class StatsController {
  constructor(private readonly apiService: ApiService) {}

  @Get('champions')
  @ApiOperation({ summary: 'Get General Champion Stats' })
  @ApiResponse({
    status: 200,
    description: 'Return a paginated list of champion stats.',
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
  })
  @ApiQuery({ name: 'order', required: false, description: 'e.g., desc' })
  getChampionStats(
    @Query('patch') patch: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('sortBy') sortBy: string,
    @Query('order') order: string,
  ) {
    return this.apiService.getChampionStats(patch, page, limit, sortBy, order);
  }

  @Get('champions/:championName')
  @ApiOperation({ summary: 'Get Specific Champion Stats' })
  @ApiResponse({
    status: 200,
    description: 'Return detailed stats for a single champion.',
  })
  @ApiParam({ name: 'championName', description: 'e.g., Aatrox' })
  @ApiQuery({ name: 'patch', required: true, description: 'e.g., 15.20' })
  getChampion(
    @Param('championName') championName: string,
    @Query('patch') patch: string,
  ) {
    return this.apiService.getChampion(championName, patch);
  }

  @Get('matchups/:championA/:championB')
  @ApiOperation({ summary: 'Get Matchup Stats' })
  @ApiResponse({
    status: 200,
    description: 'Return direct matchup analysis between two champions.',
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
  ) {
    return this.apiService.getMatchupStats(championA, championB, patch, role);
  }
}
