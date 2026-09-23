import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MatchSequencesService } from './services/match-sequences.service';
import { MatchSequencesDto } from './dto/match-sequences.dto';
@ApiTags('Matches')
@Controller('api/v1/matches')
export class MatchSequencesController {
  constructor(private readonly sequences: MatchSequencesService) {}
  @Get(':matchId/sequences')
  @ApiOperation({
    summary: 'Recorded deaths, capture sequences and observed comebacks',
    description:
      'C07/O05–O08. Versioned windows, complete-follow-up denominators, temporal association and sampled gold evidence. No causal attribution.',
  })
  @ApiParam({ name: 'matchId' })
  @ApiResponse({ status: 200, type: MatchSequencesDto })
  @ApiResponse({ status: 404, description: 'Match not found' })
  getSequences(@Param('matchId') matchId: string) {
    return this.sequences.getSequences(matchId);
  }
}
