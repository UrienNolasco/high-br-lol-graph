import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ApiService } from './api.service';
import { PlayerProfileDto } from './dto/player-profile.dto';
import { PlayerUpdateStatusDto } from './dto/player-update-status.dto';

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
}
