import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { normalizePoolSessionQuery } from './contracts/pool-sessions';
import { PoolSessionsRepository } from './repositories/pool-sessions.repository';
import { calculatePoolSessions } from './domain/pool-sessions';
const example = calculatePoolSessions(
  {
    playerId: 'example',
    queueId: 420,
    mapId: 11,
    fromMs: 0,
    toMs: 86400000,
    gapMinutes: 30,
  },
  [],
);
export class PoolSessionsResponseDto {
  @ApiProperty({ example: 10000 }) maximumCandidateMatches: number;
  @ApiProperty({ example: ['H08', 'H10'] }) opportunities: string[];
  @ApiProperty({ example: 1 }) processingVersion: number;
  @ApiProperty({
    type: Object,
    example: {
      discoveredUnimportedMatches: 1,
      status: 'incomplete_import',
      scope: 'Discovery observedAt period; unknown gameCreation/queue/map',
    },
  })
  discoveryGaps: object;
  @ApiProperty({ example: 1 }) methodVersion: number;
  @ApiProperty({ example: 4 }) datasetVersion: number;
  @ApiProperty({ example: 'descriptive', enum: ['descriptive', 'unavailable'] })
  status: string;
  @ApiProperty({ nullable: true, example: 'no_observed_matches' }) reason:
    | string
    | null;
  @ApiProperty({ type: Object, example: example.filters }) filters: object;
  @ApiProperty({ type: Object, example: example.coverage }) coverage: object;
  @ApiProperty({ type: Object, example: example.pool }) pool: object;
  @ApiProperty({ type: Object, example: example.sessions }) sessions: object;
  @ApiProperty({ type: [String], example: example.limitations })
  limitations: string[];
}
@ApiTags('Players')
@Controller('api/v1/players')
export class PoolSessionsController {
  constructor(private readonly repository: PoolSessionsRepository) {}
  @Get(':puuid/pool-sessions')
  @ApiOperation({
    summary:
      'H08/H10: observed champion pool, contextual binary outcome dispersion and estimated sessions; no fatigue or routine inference',
  })
  @ApiQuery({ name: 'queueId', required: true, type: Number })
  @ApiQuery({ name: 'mapId', required: true, type: Number })
  @ApiQuery({
    name: 'fromMs',
    required: true,
    type: Number,
    description: 'Inclusive gameCreation epoch milliseconds',
  })
  @ApiQuery({
    name: 'toMs',
    required: true,
    type: Number,
    description: 'Exclusive epoch milliseconds; maximum period 366 days',
  })
  @ApiQuery({
    name: 'gapMinutes',
    required: false,
    type: Number,
    description:
      '1–180; default 30. Sensitivity compares 15/30/60 and requested value',
  })
  @ApiOkResponse({ type: PoolSessionsResponseDto })
  get(@Param('puuid') playerId: string, @Query() raw: Record<string, unknown>) {
    let query;
    try {
      query = normalizePoolSessionQuery(playerId, raw);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    return this.repository.analyze(query);
  }
}
