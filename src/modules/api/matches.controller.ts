import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ApiService } from './api.service';
import {
  PlayerMatchDto,
  PlayerMatchesDto,
} from './dto/player-match.dto';
import { MatchDetailDto } from './dto/match-detail.dto';

@ApiTags('Matches')
@Controller('api/v1')
export class MatchesController {
  constructor(private readonly apiService: ApiService) {}

  /**
   * Endpoint LEVE para histórico do jogador
   * Retorna apenas dados essenciais para renderizar a lista de partidas
   * Não inclui gráficos de timeline para otimizar payload mobile
   */
  @Get('players/:puuid/matches')
  @ApiOperation({
    summary: 'Get player match history (lightweight)',
    description:
      'Returns a lightweight list of matches for a player. Does NOT include timeline graphs. Optimized for mobile scroll.',
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
  @ApiQuery({
    name: 'take',
    required: false,
    description: 'Number of matches to return',
    type: Number,
    example: 20,
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor for pagination (matchId to start from)',
    example: 'BR1_123456',
  })
  async getPlayerMatches(
    @Param('puuid') puuid: string,
    @Query('take') take: number = 20,
    @Query('cursor') cursor?: string,
  ): Promise<PlayerMatchesDto> {
    const matches = await this.apiService.getPlayerMatches(
      puuid,
      Math.min(take, 100), // Limitar a 100 por requisição
      cursor,
    );

    // Se retornou menos que o solicitado, não há próxima página
    const nextCursor =
      matches.length === take ? matches[matches.length - 1].matchId : undefined;

    return { data: matches, nextCursor };
  }

  /**
   * Endpoint PESADO para detalhes completos da partida
   * Retorna todos os dados incluindo gráficos de timeline
   */
  @Get('matches/:matchId')
  @ApiOperation({
    summary: 'Get match details (full)',
    description:
      'Returns complete match data including timeline graphs, positions, and all participant details.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns full match details.',
    type: MatchDetailDto,
  })
  @ApiResponse({ status: 404, description: 'Match not found.' })
  @ApiParam({
    name: 'matchId',
    description: 'Match ID',
    example: 'BR1_123456',
  })
  async getMatchDetails(
    @Param('matchId') matchId: string,
  ): Promise<MatchDetailDto> {
    const match = await this.apiService.getMatchDetails(matchId);

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    return match;
  }

  /**
   * Endpoint para buscar partidas por PUUID em uma página específica
   * Alternativa ao cursor-based pagination
   */
  @Get('players/:puuid/matches/page')
  @ApiOperation({
    summary: 'Get player matches by page',
    description:
      'Pagination-based alternative to cursor-based. Returns matches for a specific page.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated list of matches.',
    type: PlayerMatchesDto,
  })
  @ApiParam({
    name: 'puuid',
    description: 'Player PUUID',
    example: 'abc123-def456-ghi789',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (1-indexed)',
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Matches per page',
    type: Number,
    example: 20,
  })
  async getPlayerMatchesByPage(
    @Param('puuid') puuid: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ): Promise<PlayerMatchesDto> {
    const matches = await this.apiService.getPlayerMatchesByPage(
      puuid,
      Math.max(1, page),
      Math.min(limit, 100),
    );

    return { data: matches };
  }
}
