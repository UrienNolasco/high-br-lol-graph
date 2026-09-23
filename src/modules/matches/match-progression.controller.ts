import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MatchProgressionService } from './services/match-progression.service';
import { MatchProgressionDto } from './dto/match-progression.dto';
@ApiTags('Matches')
@Controller('api/v1/matches')
export class MatchProgressionController {
  constructor(private readonly service: MatchProgressionService) {}
  @Get(':matchId/progression/:puuid')
  @ApiOperation({
    summary: 'Observed effective acquisitions and skill allocation timing',
    description:
      'Projection-only, cached patch catalogs only; original events and final authoritative inventory remain distinct. Ambiguity is explicit; no build quality or skill efficacy score.',
  })
  @ApiResponse({ status: 200, type: MatchProgressionDto })
  @ApiResponse({ status: 404, description: 'Match or participant not found' })
  getProgression(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
  ) {
    return this.service.getProgression(matchId, puuid);
  }
}
