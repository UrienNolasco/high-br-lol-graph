import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CompareEvolveService } from './compare-evolve.service';
import { CompareQueryDto, PlayerComparisonDto } from './dto/compare-evolve.dto';

@ApiTags('Compare & Evolve')
@Controller('api/v1/analytics')
export class CompareEvolveController {
  constructor(private readonly compareService: CompareEvolveService) {}

  @Get('compare')
  @ApiOperation({
    summary: 'Compare two players',
    description:
      'Returns aggregated stats, laning phase metrics, timeline graphs (CS/Gold) and auto-generated insights comparing two players.',
  })
  @ApiResponse({
    status: 200,
    description: 'Player comparison data.',
    type: PlayerComparisonDto,
  })
  @ApiResponse({ status: 404, description: 'Player or stats not found.' })
  async comparePlayers(
    @Query() query: CompareQueryDto,
  ): Promise<PlayerComparisonDto> {
    return this.compareService.comparePlayerPerformance(
      query.heroPuuid,
      query.villainPuuid,
      {
        role: query.role,
        championId: query.championId,
        patch: query.patch,
      },
    );
  }
}
