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
} from '@nestjs/swagger';
import { ApiService } from './api.service';
import {
  PlayerMatchesDto,
  PlayerMatchesQueryDto,
  PlayerMatchesPageQueryDto,
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
    return this.apiService.getPlayerMatches(puuid, query);
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
      'Pagination-based alternative to cursor-based. Returns matches for a specific page with advanced filters.',
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
  async getPlayerMatchesByPage(
    @Param('puuid') puuid: string,
    @Query() query: PlayerMatchesPageQueryDto,
  ): Promise<PlayerMatchesDto> {
    return this.apiService.getPlayerMatchesByPage(puuid, query);
  }
}
