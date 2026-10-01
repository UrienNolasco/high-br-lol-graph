import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { EvolutionRepository } from './adapters/evolution.repository';
import { normalizeEvolutionQuery, EvolutionQuery } from './evolution-contract';
import { EvolutionQueryDto, EvolutionResponseDto } from './evolution.dto';
@ApiTags('Personal evolution')
@Controller('api/v1/players/:puuid/evolution')
export class EvolutionController {
  constructor(private readonly evolution: EvolutionRepository) {}
  @Get()
  @ApiOperation({
    summary:
      'Compare non-overlapping personal windows by champion/position; descriptive deltas, complete-followup death frequency and episodes',
  })
  @ApiOkResponse({ type: EvolutionResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid context or overlapping windows',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Window exceeds 1000 contributions; narrow dates',
  })
  get(@Param('puuid') puuid: string, @Query() raw: EvolutionQueryDto) {
    let q: EvolutionQuery;
    try {
      q = normalizeEvolutionQuery(
        puuid,
        raw as unknown as Record<string, unknown>,
      );
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    return this.evolution.getEvolution(q);
  }
}
