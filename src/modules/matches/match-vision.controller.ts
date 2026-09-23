import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MatchVisionService } from './services/match-vision.service';
import { MatchVisionDto } from './dto/match-vision.dto';
@ApiTags('Matches')
@Controller('api/v1/matches')
export class MatchVisionController {
  constructor(private readonly vision: MatchVisionService) {}
  @Get(':matchId/vision/:puuid')
  @ApiOperation({
    summary: 'Vision by type, phase and pre-objective window',
    description:
      'Definition1 uses projected ward events and final counters separately. 60/90s global activity before epic captures; no inferred geographic control.',
  })
  @ApiParam({ name: 'matchId' })
  @ApiParam({ name: 'puuid' })
  @ApiResponse({ status: 200, type: MatchVisionDto })
  @ApiResponse({ status: 404, description: 'Match or participant not found.' })
  getVision(@Param('matchId') matchId: string, @Param('puuid') puuid: string) {
    return this.vision.getVision(matchId, puuid);
  }
}
