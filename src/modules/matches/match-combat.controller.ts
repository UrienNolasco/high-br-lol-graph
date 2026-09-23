import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MatchCombatService } from './services/match-combat.service';
import { MatchCombatDto } from './dto/match-combat.dto';
@ApiTags('Matches')
@Controller('api/v1/matches')
export class MatchCombatController {
  constructor(private readonly combat: MatchCombatService) {}
  @Get(':matchId/combat')
  @ApiOperation({
    summary: 'Combat relations, registered rewards and solo/KP evidence',
    description:
      'Projection-only report. Solo means explicitly no registered assistant, not an isolated duel. Unknown assistance remains unavailable.',
  })
  @ApiResponse({ status: 200, type: MatchCombatDto })
  @ApiResponse({ status: 404, description: 'Match not found' })
  getCombat(@Param('matchId') matchId: string): Promise<MatchCombatDto> {
    return this.combat.getCombat(matchId);
  }
}
