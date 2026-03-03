import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { PlayersService } from './players.service';
import { SyncService } from './sync.service';
import { PlayerSearchDto } from './dto/player-search.dto';
import { PlayerResponseDto } from './dto/player-response.dto';
import { SyncTriggerResponseDto, SyncStatusResponseDto } from './dto/sync-response.dto';

@ApiTags('Players')
@Controller('api/v1/players')
export class PlayersController {
  constructor(
    private readonly playersService: PlayersService,
    private readonly syncService: SyncService,
  ) {}

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
    return this.playersService.searchPlayer(dto);
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
  async triggerSync(@Param('puuid') puuid: string): Promise<SyncTriggerResponseDto> {
    return this.syncService.triggerDeepSync(puuid);
  }

  @Get(':puuid/sync-status')
  @ApiOperation({
    summary: 'Get deep sync progress',
    description: 'Returns the current status of a deep match history sync.',
  })
  @ApiParam({ name: 'puuid', description: 'Player PUUID' })
  @ApiResponse({ status: 200, type: SyncStatusResponseDto })
  async getSyncStatus(@Param('puuid') puuid: string): Promise<SyncStatusResponseDto> {
    return this.syncService.getSyncStatus(puuid);
  }
}
