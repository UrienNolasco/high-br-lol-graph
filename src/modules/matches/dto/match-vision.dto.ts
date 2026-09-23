import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { MetricResultDto } from '../../../core/metrics/metric-result.dto';
export class VisionWindowDto {
  @ApiProperty() startMs: number;
  @ApiProperty() endMs: number;
  @ApiProperty({ enum: ['[]', '[)'] }) bounds: string;
}
const metricMap = {
  type: 'object' as const,
  additionalProperties: { $ref: getSchemaPath(MetricResultDto) },
};
export class VisionEventDto {
  @ApiProperty({
    description: 'Stable matchId:frameIndex:eventIndex identity.',
  })
  eventId: string;
  @ApiProperty({ nullable: true, type: String }) type: string | null;
  @ApiProperty({ nullable: true, type: Number }) timestampMs: number | null;
  @ApiProperty({ nullable: true, type: String }) actorPuuid: string | null;
  @ApiProperty({ nullable: true, type: Number }) teamId: number | null;
  @ApiProperty({ nullable: true, type: String }) wardType: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    enum: ['recognized', 'unknown'],
  })
  wardCategory: string | null;
  @ApiProperty({ nullable: true, type: Number }) beneficiaryTeamId:
    | number
    | null;
  @ApiProperty({ nullable: true, type: String }) monsterType: string | null;
  @ApiProperty({
    nullable: true,
    type: Object,
    description:
      'No geographic inference; ward placement has no coordinates in the fixture.',
  })
  position: null;
  @ApiProperty({ enum: ['global_event_activity_only'] })
  spatialInterpretation: string;
}
export class VisionGapDto {
  @ApiProperty() includeGameEdges: boolean;
  @ApiProperty({ type: MetricResultDto }) metric: MetricResultDto;
  @ApiProperty({ nullable: true, type: Number }) startMs: number | null;
  @ApiProperty({ nullable: true, type: Number }) endMs: number | null;
  @ApiProperty({ nullable: true, type: String }) startEventId: string | null;
  @ApiProperty({ nullable: true, type: String }) endEventId: string | null;
  @ApiProperty({
    description:
      'Excluded unknown placements; this is not a gap without any ward.',
  })
  unknownPlacementEvents: number;
}
export class VisionTypeDto {
  @ApiProperty() type: string;
  @ApiProperty(metricMap) metrics: Record<string, MetricResultDto>;
}
export class VisionPhaseDto {
  @ApiProperty({
    description: 'Definition1: [0,14min), [14,25min), [25min,game end].',
  })
  phase: number;
  @ApiProperty({ type: VisionWindowDto }) window: VisionWindowDto;
  @ApiProperty(metricMap) metrics: Record<string, MetricResultDto>;
  @ApiProperty({ type: MetricResultDto })
  teamRecognizedPlacementDifference: MetricResultDto;
  @ApiProperty({ type: MetricResultDto })
  teamRecognizedRemovalDifference: MetricResultDto;
}
export class VisionTeamDto {
  @ApiProperty() teamId: number;
  @ApiProperty(metricMap) metrics: Record<string, MetricResultDto>;
}
export class VisionObjectiveWindowDto {
  @ApiProperty() objectiveEventId: string;
  @ApiProperty({ nullable: true, type: Number }) beneficiaryTeamId:
    | number
    | null;
  @ApiProperty({ enum: [60000, 90000] }) lookbackMs: number;
  @ApiProperty() requestedStartMs: number;
  @ApiProperty({ type: VisionWindowDto }) window: VisionWindowDto;
  @ApiProperty({ description: 'True if requested start precedes game start.' })
  censored: boolean;
  @ApiProperty({ type: [String] }) eventIds: string[];
  @ApiProperty(metricMap) player: Record<string, MetricResultDto>;
  @ApiProperty({ type: [VisionTeamDto] }) teams: VisionTeamDto[];
  @ApiProperty({ enum: ['global_event_activity_only'] })
  spatialInterpretation: string;
}
@ApiExtraModels(MetricResultDto)
export class MatchVisionDto {
  @ApiProperty() matchId: string;
  @ApiProperty() puuid: string;
  @ApiProperty() teamId: number;
  @ApiProperty() gameVersion: string;
  @ApiProperty({ example: 1 }) metricVersion: number;
  @ApiProperty({ nullable: true, type: Number }) processingVersion:
    | number
    | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  processedAt: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    enum: ['not_calculated', 'missing_field'],
  })
  reason: string | null;
  @ApiProperty({ type: VisionWindowDto }) window: VisionWindowDto;
  @ApiProperty({ type: [String] }) recognizedWardTypes: string[];
  @ApiProperty({
    type: 'object',
    properties: {
      projectionComplete: { type: 'boolean' },
      sourceEvents: { type: 'integer' },
      timedEvents: { type: 'integer' },
      attributedEvents: { type: 'integer' },
      unknownTypeEvents: { type: 'integer' },
      duplicateInputIdentities: { type: 'integer' },
    },
  })
  coverage: object;
  @ApiProperty({
    ...metricMap,
    nullable: true,
    description:
      'Null when processing provenance is missing; nullable individual values otherwise.',
  })
  metrics: Record<string, MetricResultDto> | null;
  @ApiProperty({ type: [VisionTypeDto] }) byType: VisionTypeDto[];
  @ApiProperty({ type: [VisionPhaseDto] }) phases: VisionPhaseDto[];
  @ApiProperty({ type: [VisionGapDto] }) gaps: VisionGapDto[];
  @ApiProperty({ type: [VisionObjectiveWindowDto] })
  objectiveWindows: VisionObjectiveWindowDto[];
  @ApiProperty({ type: [VisionEventDto] }) events: VisionEventDto[];
  @ApiProperty({
    nullable: true,
    type: 'object',
    properties: {
      recognizedPlacementEvents: { type: 'integer' },
      summaryWardsPlaced: { type: 'number', nullable: true },
      placementDifference: { type: 'number', nullable: true },
      recognizedRemovalEvents: { type: 'integer' },
      summaryWardsKilled: { type: 'number', nullable: true },
      removalDifference: { type: 'number', nullable: true },
      policy: { type: 'string' },
    },
  })
  reconciliation: object | null;
}
