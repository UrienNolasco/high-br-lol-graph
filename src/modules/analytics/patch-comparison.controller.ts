import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  DATASET_READER,
  type DatasetReader,
} from '../dataset/ports/dataset-reader';
import { DATASET_DEFINITION_MAP } from '../dataset/contracts/definition';
import { normalizeDatasetFilters } from '../dataset/contracts/query';
import { patchComparison } from './pure/patch-comparison';
@ApiTags('Patch comparison')
@Controller('api/v1/analytics')
export class PatchComparisonController {
  constructor(@Inject(DATASET_READER) private readonly reader: DatasetReader) {}
  @Get('patch-comparison')
  @ApiOperation({
    summary: 'Compare observed patch distributions and champion choices',
    description:
      'H09. Exact internal patch identifiers; order resolved by observed gameCreation. Bounded imported metric cohort, role/champion stratification and version compatibility. Descriptive, never causal.',
  })
  @ApiQuery({ name: 'beforePatch', required: true, example: '16.1' })
  @ApiQuery({ name: 'afterPatch', required: true, example: '16.2' })
  @ApiQuery({
    name: 'definitionId',
    required: true,
    example: 'final.goldPerMinute',
  })
  @ApiQuery({ name: 'horizonKey', required: false, example: 'final' })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'],
  })
  @ApiQuery({ name: 'championId', required: false, type: Number })
  @ApiQuery({ name: 'queueId', required: false, type: Number, example: 420 })
  @ApiQuery({ name: 'fromMs', required: false, type: Number })
  @ApiQuery({ name: 'toMs', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10000 })
  @ApiResponse({
    status: 200,
    description:
      'Observed chronological patch sequence, two periods with N, dates, choice/role cells, distributions and evidence; nullable compatible deltas and coverage.',
    schema: {
      type: 'object',
      required: [
        'version',
        'filters',
        'sequence',
        'before',
        'after',
        'changes',
        'coverage',
        'limitations',
      ],
      properties: {
        version: { type: 'integer' },
        filters: { type: 'object', additionalProperties: true },
        sequence: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            patches: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  patch: { type: 'string' },
                  firstObservedMs: { type: 'number', nullable: true },
                  lastObservedMs: { type: 'number', nullable: true },
                },
              },
            },
            adjacentObserved: { type: 'boolean' },
            chronologyAmbiguous: { type: 'boolean' },
            complete: { type: 'boolean' },
          },
        },
        before: { type: 'object', additionalProperties: true },
        after: { type: 'object', additionalProperties: true },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              championId: { type: 'integer', nullable: true },
              role: { type: 'string', nullable: true },
              meanDelta: {
                type: 'number',
                nullable: true,
                description: 'After minus before, compatible units only',
              },
              pickRateDelta: {
                type: 'number',
                nullable: true,
                description:
                  'Difference in fractions of represented distinct matches',
              },
              beforeN: { type: 'integer' },
              afterN: { type: 'integer' },
              reason: { type: 'string', nullable: true },
              precision: { type: 'string' },
            },
          },
        },
        coverage: { type: 'object', additionalProperties: true },
        limitations: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid patches, filters, definition or limit.',
  })
  async read(@Query() raw: Record<string, unknown>) {
    let filters: ReturnType<typeof normalizeDatasetFilters>,
      before: string,
      after: string,
      limit: number;
    try {
      const { beforePatch, afterPatch, limit: requested, ...rest } = raw;
      if (
        Object.keys(rest).some(
          (k) =>
            ![
              'definitionId',
              'horizonKey',
              'role',
              'championId',
              'queueId',
              'fromMs',
              'toMs',
            ].includes(k),
        )
      )
        throw new Error('Unknown comparison filter');
      before = normalizeDatasetFilters({ patch: beforePatch }).patch!;
      after = normalizeDatasetFilters({ patch: afterPatch }).patch!;
      if (!before || !after || before === after)
        throw new Error('Two distinct exact patches required');
      filters = normalizeDatasetFilters({
        ...rest,
        subjectKind: 'participant',
        eligibleOnly: true,
        mapId: 11,
        queueId: rest.queueId ?? 420,
        horizonKey: rest.horizonKey ?? 'final',
      });
      if (!filters.definitionId) throw new Error('definitionId required');
      const definition = DATASET_DEFINITION_MAP.get(filters.definitionId)!;
      if (
        !definition.subjectKinds.includes('participant') ||
        (definition.usage === 'predictive'
          ? filters.horizonKey === 'final'
          : filters.horizonKey !== 'final')
      )
        throw new Error(
          'Definition, participant subject and horizon are incompatible',
        );
      limit = requested === undefined ? 10000 : Number(requested);
      if (!Number.isInteger(limit) || limit < 1 || limit > 10000)
        throw new Error('limit must be 1–10000');
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const cohort = await this.reader.query(filters, limit);
    return {
      filters: { ...filters, beforePatch: before, afterPatch: after, limit },
      availableCohort: cohort.summary.counts,
      cohortCaveat: cohort.summary.cohortCaveat,
      unmaterializedMatches: cohort.summary.unmaterializedMatches,
      ...patchComparison(cohort.rows, before, after, cohort.nextAfter !== null),
    };
  }
}
