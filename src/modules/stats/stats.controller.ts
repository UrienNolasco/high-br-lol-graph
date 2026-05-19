import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { ChampionStatsService } from './services/champion-stats.service';
import { ChampionDetailService } from './services/champion-detail.service';
import { ProcessedMatchesService } from './services/processed-matches.service';
import {
  ChampionStatsDto,
  PaginatedChampionStatsDto,
} from './dto/champion-stats.dto';
import { GetChampionStatsDto } from './dto/get-champion-stats.dto';

@ApiTags('Stats')
@Controller('api/v1/stats')
export class StatsController {
  constructor(
    private readonly championStatsSvc: ChampionStatsService,
    private readonly championDetailSvc: ChampionDetailService,
    private readonly processedMatchesSvc: ProcessedMatchesService,
  ) {}

  @Get('champions')
  @ApiOperation({ summary: 'Get General Champion Stats' })
  @ApiResponse({
    status: 200,
    description: 'Return a paginated list of champion stats.',
    type: PaginatedChampionStatsDto,
  })
  @ApiQuery({ name: 'patch', required: true, description: 'e.g., 15.20' })
  @ApiQuery({ name: 'page', required: false, description: 'e.g., 1', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'e.g., 20', type: Number })
  @ApiQuery({
    name: 'sortBy', required: false,
    description: 'e.g., winRate, gamesPlayed, kda, dpm, cspm, gpm, banRate, pickRate',
    enum: ['winRate', 'gamesPlayed', 'championName', 'banRate', 'pickRate', 'kda', 'dpm', 'cspm', 'gpm'],
  })
  @ApiQuery({ name: 'order', required: false, description: 'e.g., desc', enum: ['asc', 'desc'] })
  getChampionStats(@Query() query: GetChampionStatsDto): Promise<PaginatedChampionStatsDto> {
    const { patch, page = 1, limit = 20, sortBy = 'winRate', order = 'desc' } = query;
    return this.championStatsSvc.getChampionStats(patch, page, limit, sortBy, order);
  }

  @Get('champions/:championName')
  @ApiOperation({ summary: 'Get Specific Champion Stats' })
  @ApiResponse({ status: 200, description: 'Return detailed stats for a single champion.', type: ChampionStatsDto })
  @ApiParam({ name: 'championName', description: 'e.g., Aatrox' })
  @ApiQuery({ name: 'patch', required: true, description: 'e.g., 15.20' })
  getChampion(
    @Param('championName') championName: string,
    @Query('patch') patch: string,
  ): Promise<ChampionStatsDto> {
    return this.championDetailSvc.getChampion(championName, patch);
  }

  @Get('processed-matches')
  @ApiOperation({ summary: 'Get Processed Matches' })
  @ApiResponse({ status: 200, description: 'Return the processed matches number' })
  @ApiQuery({ name: 'patch', required: false, description: 'Filter by patch (e.g., 15.23)' })
  getProcessedMatches(@Query('patch') patch?: string): Promise<{ count: number; patch?: string; message?: string }> {
    return this.processedMatchesSvc.getProcessedMatches(patch);
  }
}
