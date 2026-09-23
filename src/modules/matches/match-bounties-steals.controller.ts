import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MatchBountiesStealsService } from './services/match-bounties-steals.service';
import { MatchBountiesStealsDto } from './dto/match-bounties-steals.dto';
@ApiTags('Matches')
@Controller('api/v1/matches')
export class MatchBountiesStealsController {
  constructor(private readonly service: MatchBountiesStealsService) {}
  @Get(':matchId/bounties-steals')
  @ApiOperation({
    summary: 'Recorded bounty windows and objective steal observations',
    description:
      'O10/O11 definition1: actualStartTime takes precedence over announcement, unmatched windows are censored, optional steals/assists/proximity and literal bounty/shutdown fields remain separate. No inferred catch-up, payout sum, lost value or attempts denominator.',
  })
  @ApiParam({ name: 'matchId' })
  @ApiResponse({ status: 200, type: MatchBountiesStealsDto })
  @ApiResponse({ status: 404, description: 'Match not found' })
  getBountiesSteals(@Param('matchId') matchId: string) {
    return this.service.getBountiesSteals(matchId);
  }
}
