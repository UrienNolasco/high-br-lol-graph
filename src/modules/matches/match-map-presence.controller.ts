import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MapPresenceDto } from './dto/map-presence.dto';
import { MatchMapPresenceService } from './services/match-map-presence.service';

@ApiTags('Matches')
@Controller('api/v1/matches')
export class MatchMapPresenceController {
  constructor(private readonly service: MatchMapPresenceService) {}
  @Get(':matchId/map-presence/:puuid')
  @ApiOperation({
    summary: 'Player sampled presence in experimental map regions',
    description:
      'Versioned geometric cells and phase distributions of valid positions. Fractions count samples, never exact occupancy seconds or continuous routes. Player positions are not ward positions.',
  })
  @ApiResponse({ status: 200, type: MapPresenceDto })
  @ApiResponse({ status: 404, description: 'Match or participant not found.' })
  getPresence(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
  ): Promise<MapPresenceDto> {
    return this.service.getPresence(matchId, puuid);
  }
}
