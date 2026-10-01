import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CHAMPION_CONTEXT_READER,
  type ChampionContextReader,
} from '../matches/ports/champion-context-reader';
import { normalizeDatasetFilters } from '../dataset/contracts/query';
import { championContext } from './pure/champion-context';
@ApiTags('Champion context')
@Controller('api/v1/analytics')
export class ChampionContextController {
  constructor(
    @Inject(CHAMPION_CONTEXT_READER)
    private readonly reader: ChampionContextReader,
  ) {}
  @Get('champion-context')
  @ApiOperation({
    summary: 'Observed lane matchups and allied champion cooccurrence',
    description:
      'Exact internal patch and focal role required. Distinct matches; ambiguous rosters excluded. Rates and nominal Wilson intervals are descriptive, not causal.',
  })
  @ApiQuery({ name: 'patch', required: true, example: '16.2' })
  @ApiQuery({ name: 'championId', required: true, type: Number })
  @ApiQuery({
    name: 'role',
    required: true,
    enum: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'],
  })
  @ApiQuery({ name: 'queueId', required: false, type: Number, example: 420 })
  @ApiQuery({ name: 'fromMs', required: false, type: Number })
  @ApiQuery({ name: 'toMs', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 1000 })
  @ApiResponse({
    status: 200,
    description:
      'Versioned observed cohort, baseline, matchups, allies, coverage, exclusions, match evidence and limitations.',
    schema: {
      type: 'object',
      required: [
        'version',
        'filters',
        'baseline',
        'coverage',
        'matchups',
        'allies',
        'limitations',
      ],
      properties: {
        version: { type: 'integer', example: 1 },
        filters: { type: 'object', additionalProperties: true },
        baseline: {
          type: 'object',
          properties: {
            n: { type: 'integer' },
            wins: { type: 'integer' },
            rate: { type: 'number', nullable: true },
            interval95: {
              type: 'array',
              nullable: true,
              items: { type: 'number' },
            },
            reason: { type: 'string', nullable: true },
          },
        },
        coverage: { type: 'object', additionalProperties: true },
        matchups: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
        allies: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
        limitations: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid filters or missing exact patch/champion/role.',
  })
  async read(@Query() raw: Record<string, unknown>) {
    let f: ReturnType<typeof normalizeDatasetFilters>, limit: number;
    try {
      const { limit: requested, ...rest } = raw;
      f = normalizeDatasetFilters(rest);
      limit = requested === undefined ? 1000 : Number(requested);
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 10000 ||
        !f.patch ||
        !f.championId ||
        !f.role ||
        f.eligibleOnly === false ||
        Object.keys(rest).some(
          (k) =>
            ![
              'patch',
              'championId',
              'role',
              'queueId',
              'fromMs',
              'toMs',
            ].includes(k),
        )
      )
        throw new Error(
          'Require exact patch, championId and role; limit 1–10000',
        );
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const cohort = await this.reader.read({
      patch: f.patch!,
      queueId: f.queueId ?? 420,
      fromMs: f.fromMs,
      toMs: f.toMs,
      limit,
    });
    return {
      filters: { ...f, queueId: f.queueId ?? 420, mapId: 11, limit },
      ...championContext(cohort, f.championId!, f.role!),
    };
  }
}
