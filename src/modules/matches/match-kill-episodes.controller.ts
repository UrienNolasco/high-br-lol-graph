import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MatchKillEpisodesService } from './services/match-kill-episodes.service';
import { MatchKillEpisodesDto } from './dto/match-kill-episodes.dto';
@ApiTags('Matches')
@Controller('api/v1/matches')
export class MatchKillEpisodesController {
  constructor(private readonly episodes: MatchKillEpisodesService) {}
  @Get(':matchId/kill-episodes')
  @ApiOperation({
    summary: 'Explore episodes of observed kills and quick regional trades',
    description:
      'C10/C11/E06 definition1: deterministic time/distance grouping, disjoint quick response pairs and strictly earlier resource snapshots with age. Includes three threshold sensitivity profiles; does not identify every teamfight or combat without deaths.',
  })
  @ApiParam({ name: 'matchId' })
  @ApiResponse({ status: 200, type: MatchKillEpisodesDto })
  @ApiResponse({ status: 404, description: 'Match not found' })
  getEpisodes(@Param('matchId') matchId: string) {
    return this.episodes.getKillEpisodes(matchId);
  }
}
