import { ApiProperty } from '@nestjs/swagger';
import type {
  MapPresenceReport,
  PositionSample,
} from '../pure/map-presence-calculator';

export class RegionFrequencyDto {
  @ApiProperty() regionId: string;
  @ApiProperty({
    description: 'Number of valid player snapshots in the cell; not seconds.',
  })
  sampleCount: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'sampleCount / valid position sample N for this phase; never a time fraction.',
  })
  fraction: number | null;
  @ApiProperty({ type: 'object', additionalProperties: true })
  denominator: Record<string, unknown>;
  @ApiProperty({ enum: ['derived', 'unavailable'] }) origin: string;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({
    type: [Number],
    description: 'Source frame identities contributing to the numerator.',
  })
  frameIndices: number[];
}
export class PositionSampleDto {
  @ApiProperty() frameIndex: number;
  @ApiProperty({ type: Number, nullable: true }) timestampMs: number | null;
  @ApiProperty({ type: Number, nullable: true }) participantId: number | null;
  @ApiProperty({
    type: 'object',
    nullable: true,
    required: ['x', 'y'],
    properties: { x: { type: 'number' }, y: { type: 'number' } },
  })
  position: PositionSample['position'];
  @ApiProperty({ type: String, nullable: true }) regionId: string | null;
  @ApiProperty({ type: String, nullable: true }) teamRelativeRegionId:
    | string
    | null;
  @ApiProperty({ enum: ['derived', 'unavailable'] }) origin: string;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
}
export class MapPresencePhaseDto {
  @ApiProperty({ enum: ['early', 'middle', 'late'] }) id: string;
  @ApiProperty() targetStartMs: number;
  @ApiProperty() targetEndMs: number;
  @ApiProperty() observedStartMs: number;
  @ApiProperty() observedEndMs: number;
  @ApiProperty({ enum: ['[)', '[]'] }) bounds: string;
  @ApiProperty() censored: boolean;
  @ApiProperty({ type: 'object', additionalProperties: true })
  quality: MapPresenceReport['quality'];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' } })
  excludedReasons: Record<string, number>;
  @ApiProperty({ type: [RegionFrequencyDto] }) absolute: RegionFrequencyDto[];
  @ApiProperty({ type: [RegionFrequencyDto], nullable: true }) teamRelative:
    | RegionFrequencyDto[]
    | null;
  @ApiProperty({ type: String, nullable: true }) teamRelativeReason:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Actual valid-position sample intervals, nominal cadence is separate at root.',
  })
  sampling: Record<string, unknown>;
}
export class MapPresenceDto {
  @ApiProperty({ example: 'B08' }) metricId: string;
  @ApiProperty({ example: 1 }) metricVersion: number;
  @ApiProperty() matchId: string;
  @ApiProperty() puuid: string;
  @ApiProperty() mapId: number;
  @ApiProperty() gameVersion: string;
  @ApiProperty() teamId: number;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'Stored COMPLETED processing time, never request time.',
  })
  processedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description:
      'Versioned experimental geometric definition, polygons, chosen domain, edge priority, team rotation and validation limits; not official lanes/jungle.',
  })
  definition: MapPresenceReport['definition'];
  @ApiProperty({ type: Number, nullable: true }) observedEndMs: number | null;
  @ApiProperty() effectiveEndMs: number;
  @ApiProperty({ enum: ['GAME_END', 'Match.gameDuration_seconds'] })
  endSource: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  quality: MapPresenceReport['quality'];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' } })
  excludedReasons: Record<string, number>;
  @ApiProperty({ type: [RegionFrequencyDto] }) absolute: RegionFrequencyDto[];
  @ApiProperty({ type: [RegionFrequencyDto], nullable: true }) teamRelative:
    | RegionFrequencyDto[]
    | null;
  @ApiProperty({ type: String, nullable: true }) teamRelativeReason:
    | string
    | null;
  @ApiProperty({ type: [MapPresencePhaseDto] }) phases: MapPresencePhaseDto[];
  @ApiProperty({ type: [PositionSampleDto] }) samples: PositionSampleDto[];
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Nominal frame interval plus actual timestamp intervals/frequency, separately for all frames and valid positions.',
  })
  sampling: MapPresenceReport['sampling'];
  @ApiProperty({ type: 'object', additionalProperties: true })
  evidence: MapPresenceReport['evidence'];
}
