import { Allow } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import { normalizeDatasetFilters } from '../dataset/contracts/query';
import { decodeIndicatorCursor } from './pure/indicator-cursor';
import { IndicatorQuery } from './pure/indicator.types';
import { INDICATOR_FAMILIES, IndicatorFamily } from './pure/indicator-catalog';
export class IndicatorQueryDto {
  @Allow()
  @ApiPropertyOptional({
    description:
      'Opaque cursor for gameCreation DESC, matchId ASC; same cohort filters required',
  })
  after?: string;
  @Allow() @ApiPropertyOptional({ enum: INDICATOR_FAMILIES }) family?: string;
  @Allow()
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  limit?: number;
  @Allow()
  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 5 })
  groupLimit?: number;
  @Allow()
  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 0 })
  groupOffset?: number;
  @Allow()
  @ApiPropertyOptional({ minimum: 0, maximum: 3, default: 3 })
  evidenceLimit?: number;
  @Allow() @ApiPropertyOptional({ example: '16.2' }) patch?: string;
  @Allow() @ApiPropertyOptional({ default: 420 }) queueId?: number;
  @Allow() @ApiPropertyOptional({ default: 11 }) mapId?: number;
  @Allow() @ApiPropertyOptional() championId?: number;
  @Allow()
  @ApiPropertyOptional({
    enum: ['TOP', 'JUNGLE', 'MID', 'MIDDLE', 'BOTTOM', 'UTILITY'],
  })
  role?: string;
  @Allow()
  @ApiPropertyOptional({ description: 'Inclusive creation epoch milliseconds' })
  fromMs?: number;
  @Allow()
  @ApiPropertyOptional({ description: 'Exclusive creation epoch milliseconds' })
  toMs?: number;
  @Allow() @ApiPropertyOptional({ default: true }) eligibleOnly?:
    | boolean
    | string;
}
const ownKeys = new Set([
  'after',
  'family',
  'limit',
  'groupLimit',
  'groupOffset',
  'evidenceLimit',
  'patch',
  'queueId',
  'mapId',
  'championId',
  'role',
  'fromMs',
  'toMs',
  'eligibleOnly',
]);
export function parseIndicatorQuery(
  raw: IndicatorQueryDto,
  playerId: string,
): IndicatorQuery {
  try {
    for (const key of Object.keys(raw))
      if (!ownKeys.has(key)) throw Error(`Unknown query ${key}`);
    const integer = (
      key: 'limit' | 'groupLimit' | 'groupOffset' | 'evidenceLimit',
      fallback: number,
      min: number,
      max: number,
    ) => {
      const rawValue = raw[key];
      if (rawValue === undefined) return fallback;
      const value =
        typeof rawValue === 'number'
          ? rawValue
          : typeof rawValue === 'string' && /^\d+$/.test(rawValue)
            ? Number(rawValue)
            : NaN;
      if (!Number.isSafeInteger(value) || value < min || value > max)
        throw Error(`Invalid ${key}`);
      return value;
    };
    if (
      raw.family !== undefined &&
      !INDICATOR_FAMILIES.includes(raw.family as IndicatorFamily)
    )
      throw Error('Unknown indicator family');
    const { family, after } = raw;
    const filters = Object.fromEntries(
      Object.entries(raw).filter(
        ([key, value]) =>
          value !== undefined &&
          ![
            'family',
            'after',
            'limit',
            'groupLimit',
            'groupOffset',
            'evidenceLimit',
          ].includes(key),
      ),
    );
    const normalized = normalizeDatasetFilters({
      queueId: 420,
      mapId: 11,
      ...filters,
      playerId,
    });
    for (const key of ['queueId', 'mapId', 'championId'] as const) {
      if (normalized[key] !== undefined && normalized[key] > 2147483647)
        throw Error(`Invalid ${key}: exceeds database integer range`);
    }
    return {
      filters: normalized,
      ...(after !== undefined
        ? { after: decodeIndicatorCursor(after, normalized), afterToken: after }
        : {}),
      options: {
        family: family as IndicatorFamily | undefined,
        limit: integer('limit', 30, 1, 100),
        groupLimit: integer('groupLimit', 5, 1, 10),
        groupOffset: integer('groupOffset', 0, 0, 100),
        evidenceLimit: integer('evidenceLimit', 3, 0, 3),
      },
    };
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Invalid indicator query',
    );
  }
}
