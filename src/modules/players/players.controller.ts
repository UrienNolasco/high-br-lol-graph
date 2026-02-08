import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { PlayersService } from './players.service';
import { PlayerSearchDto } from './dto/player-search.dto';
import { PlayerResponseDto } from './dto/player-response.dto';

@ApiTags('Players')
@Controller('api/v1/players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

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
  async searchPlayer(
    @Body() dto: PlayerSearchDto,
  ): Promise<PlayerResponseDto> {
    return this.playersService.searchPlayer(dto);
  }
}
