import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MatchObjectivesService } from './services/match-objectives.service';
import { MatchObjectivesDto } from './dto/match-objectives.dto';
@ApiTags('Matches')
@Controller('api/v1/matches')
export class MatchObjectivesController {
  constructor(private readonly objectives: MatchObjectivesService) {}
  @Get(':matchId/objectives')
  @ApiOperation({
    summary: 'Objectives, plates and structure contributions',
    description:
      'O01–O04: projected event chronology, final totals and reconciliation; lane/phase event groups, registered authors/assistants and separate tower damage. No universal 14-minute plate cutoff or inferred plate gold.',
  })
  @ApiParam({ name: 'matchId' })
  @ApiResponse({ status: 200, type: MatchObjectivesDto })
  @ApiResponse({ status: 404, description: 'Match not found' })
  getObjectives(@Param('matchId') matchId: string) {
    return this.objectives.getObjectives(matchId);
  }
}
