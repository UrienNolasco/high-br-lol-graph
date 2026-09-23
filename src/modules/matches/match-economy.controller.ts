import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EconomyQueryDto, MatchEconomyDto } from './dto/match-economy.dto';
import { MatchEconomyService } from './services/match-economy.service';

@ApiTags('Matches')
@Controller('api/v1/matches')
export class MatchEconomyController {
  constructor(private readonly service: MatchEconomyService) {}
  @Get(':matchId/economy/:puuid')
  @ApiOperation({
    summary: 'Economy and progression from timestamped snapshots',
    description:
      'Checkpoints 5/10/15/20, unique-opponent differences, actual-time gains, team shares and sampled currentGold. Legacy @15 version 0 is separate. No raw or external reads.',
  })
  @ApiResponse({ status: 200, type: MatchEconomyDto })
  @ApiResponse({ status: 404, description: 'Match or participant not found.' })
  getEconomy(
    @Param('matchId') matchId: string,
    @Param('puuid') puuid: string,
    @Query() query: EconomyQueryDto,
  ): Promise<MatchEconomyDto> {
    return this.service.getEconomy(matchId, puuid, query.mode);
  }
}
