import { ApiProperty } from '@nestjs/swagger';
export class IndicatorMetricDto {
  @ApiProperty() metricId: string;
  @ApiProperty() metricVersion: number;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true }) processedAt: string | null;
  @ApiProperty({ type: Number, nullable: true }) value: number | null;
  @ApiProperty({ enum: ['count', 'count_per_minute'] }) unit: string;
  @ApiProperty({ enum: ['observed', 'derived', 'unavailable'] }) origin: string;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: Object, nullable: true }) denominator: unknown;
  @ApiProperty({ type: Object }) quality: unknown;
  @ApiProperty({ type: [Object] }) evidence: unknown[];
  @ApiProperty({ enum: ['final_summary_retrospective'] }) temporalScope: string;
}
export class IndicatorValueDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['execution', 'casts', 'pings'] }) family: string;
  @ApiProperty({ type: IndicatorMetricDto }) count: IndicatorMetricDto;
  @ApiProperty({
    type: IndicatorMetricDto,
    nullable: true,
    description:
      'Execution challenges have no rate; casts/pings divide by observed participant timePlayed minutes',
  })
  perMinute: IndicatorMetricDto | null;
}
export class MatchIndicatorsDto {
  @ApiProperty() catalogVersion: number;
  @ApiProperty() matchId: string;
  @ApiProperty({ type: Object }) participant: unknown;
  @ApiProperty({ type: Object }) context: unknown;
  @ApiProperty({ type: Object }) provenance: unknown;
  @ApiProperty({ type: Object }) catalogValidation: unknown;
  @ApiProperty({ type: Object }) duration: unknown;
  @ApiProperty({ type: [IndicatorValueDto] }) metrics: IndicatorValueDto[];
  @ApiProperty({ type: Object }) coverage: unknown;
  @ApiProperty({
    type: Object,
    description:
      'Uncatalogued keys (max20 per source), total and truncation; no arbitrary fields promoted to metrics',
  })
  unknownFields: unknown;
  @ApiProperty({ type: [String] }) limitations: string[];
}
export class IndicatorHistoryDto {
  @ApiProperty() catalogVersion: number;
  @ApiProperty() playerId: string;
  @ApiProperty({ type: Object }) filters: unknown;
  @ApiProperty({
    type: Object,
    description:
      'Full filtered count, selected count<=100, truncation, next cursor; aggregates describe the selected page only',
  })
  selection: unknown;
  @ApiProperty({
    type: Object,
    description:
      'Distinct match/player counts, observations and ignored duplicates on this page',
  })
  sample: unknown;
  @ApiProperty({
    type: Object,
    description:
      'Paginated exact champion/role/patch/full-version/queue/map/generation cohorts; means, ratio of sums, N valid/total, missingness and evidence links. No population percentile.',
  })
  groups: unknown;
  @ApiProperty({ enum: ['final_summary_retrospective'] }) temporalScope: string;
  @ApiProperty({ type: [String] }) limitations: string[];
}
export class IndicatorCatalogDto {
  @ApiProperty() catalogVersion: number;
  @ApiProperty() optional: boolean;
  @ApiProperty({ type: [String] }) validatedFixturePatches: string[];
  @ApiProperty() validation: string;
  @ApiProperty({
    type: [Object],
    description:
      '24 optional fields with field/source/name/unit/version, per-minute availability and validation',
  })
  definitions: unknown[];
  @ApiProperty({ type: [String] }) limitations: string[];
}
