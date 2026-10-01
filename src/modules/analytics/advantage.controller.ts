import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ADVANTAGE_READER,
  type AdvantageReader,
} from '../matches/ports/advantage-reader';
import { normalizeDatasetFilters } from '../dataset/contracts/query';
import { analyzeAdvantage } from './pure/advantage';
@ApiTags('Advantage exploration')
@Controller('api/v1/analytics')
export class AdvantageController {
  constructor(
    @Inject(ADVANTAGE_READER)
    private readonly reader: AdvantageReader,
  ) {}
  @Get('advantage')
  @ApiOperation({
    summary:
      'Observed advantage conversion, recovery and signed gold-minute area',
    description:
      'Exact internal patch and focal role required. Past-only checkpoints and five-minute windows; ambiguous opponents excluded. Rates and nominal Wilson intervals are descriptive, not causal.',
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
      'Versioned checkpoints, bins, conditional outcome/recovery rates, means with nominal intervals, coverage, evidence and limitations.',
    schema: {
      type: 'object',
      required: [
        'policy',
        'filters',
        'cells',
        'coverage',
        'evidence',

        'limitations',
      ],
      properties: {
        policy: { type: 'object', additionalProperties: true },
        cells: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              checkpointMs: { type: 'integer' },
              bin: { type: 'string', enum: ['deficit', 'neutral', 'lead'] },
              outcome: {
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
              recovery: { type: 'object', additionalProperties: true },
              leadChange: { type: 'object', additionalProperties: true },
              structures: { type: 'object', additionalProperties: true },
              integral: { type: 'object', additionalProperties: true },
              futureN: { type: 'integer' },
              censoredOrMissingFutureN: { type: 'integer' },
            },
            additionalProperties: true,
          },
        },
        evidence: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
        filters: { type: 'object', additionalProperties: true },
        coverage: { type: 'object', additionalProperties: true },
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
      ...analyzeAdvantage(cohort, f.championId!, f.role!),
    };
  }
}
