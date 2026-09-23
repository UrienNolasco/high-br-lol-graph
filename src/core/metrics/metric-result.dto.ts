import { ApiProperty } from '@nestjs/swagger';
import { METRIC_ORIGINS } from './metric-contract';
import { METRIC_RESPONSE_EXAMPLES } from './metric-examples';
import type {
  MetricContext,
  MetricOrigin,
  MissingReason,
  MetricUnit,
} from './metric-contract';

/** Shared documented envelope; legacy response DTOs keep their original shapes. */
export class MetricResultDto implements MetricContext {
  @ApiProperty({ example: 'V03' }) metricId: string;
  @ApiProperty({ example: 1, minimum: 1 }) metricVersion: number;
  @ApiProperty({ example: 1, minimum: 1 }) processingVersion: number;
  @ApiProperty({ format: 'date-time', example: '2026-09-22T00:00:00.000Z' })
  processedAt: string;
  @ApiProperty({ example: 'BR1_3200579475' }) matchId: string;
  @ApiProperty({
    type: 'object',
    required: ['kind', 'id'],
    properties: {
      kind: { type: 'string', enum: ['participant', 'team', 'match'] },
      id: { type: 'string' },
    },
  })
  subject: MetricContext['subject'];
  @ApiProperty({
    example: 'count',
    description:
      'Explicit unit; percentages use 0–100, shares use 0–1. General ratios follow their definition and may exceed one.',
  })
  unit: MetricUnit;
  @ApiProperty({
    type: 'object',
    nullable: true,
    required: ['startMs', 'endMs', 'bounds'],
    properties: {
      startMs: { type: 'number' },
      endMs: { type: 'number' },
      bounds: { type: 'string', enum: ['[)', '[]', '(]'] },
    },
  })
  window: MetricContext['window'];
  @ApiProperty({
    type: 'object',
    nullable: true,
    required: ['value', 'unit', 'population'],
    properties: {
      value: { type: 'number', nullable: true },
      unit: { type: 'string' },
      population: { type: 'string' },
    },
  })
  denominator: MetricContext['denominator'];
  @ApiProperty({
    type: 'object',
    required: [
      'validSamples',
      'totalSamples',
      'coverage',
      'unknownEvents',
      'reconciliationIssues',
    ],
    properties: {
      validSamples: { type: 'integer', minimum: 0 },
      totalSamples: { type: 'integer', minimum: 0 },
      coverage: { type: 'number', nullable: true, minimum: 0, maximum: 1 },
      unknownEvents: { type: 'integer', minimum: 0 },
      reconciliationIssues: { type: 'array', items: { type: 'string' } },
    },
  })
  quality: MetricContext['quality'];
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      required: ['source', 'field', 'value'],
      properties: {
        source: { type: 'string' },
        field: { type: 'string' },
        value: {
          nullable: true,
          oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }],
        },
        eventId: { type: 'string' },
        frameIndex: { type: 'integer' },
        timestampMs: { type: 'number' },
      },
    },
  })
  evidence: MetricContext['evidence'];
  @ApiProperty({ enum: METRIC_ORIGINS }) origin: MetricOrigin;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Finite value, or null only when origin=unavailable. Zero requires valid source evidence.',
  })
  value: number | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Required non-null reason when unavailable; null for all available values.',
  })
  reason: MissingReason | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Formula or convention; required for available values.',
  })
  method: string | null;
}

export const METRIC_OPENAPI_EXAMPLES = Object.fromEntries(
  Object.entries(METRIC_RESPONSE_EXAMPLES).map(([key, value]) => [
    key,
    { summary: `Synthetic ${key} metric`, value },
  ]),
);
