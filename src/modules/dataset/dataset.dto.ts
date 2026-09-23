import { Allow } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class DatasetQueryDto {
  @Allow()
  @ApiPropertyOptional({ example: '16.2' })
  patch?: string;
  @Allow()
  @ApiPropertyOptional({ example: 420 })
  queueId?: number;
  @Allow()
  @ApiPropertyOptional({ example: 11 })
  mapId?: number;
  @Allow()
  @ApiPropertyOptional({ example: 103 })
  championId?: number;
  @Allow()
  @ApiPropertyOptional({ example: 'MIDDLE' })
  role?: string;
  @Allow()
  @ApiPropertyOptional({
    description: 'Inclusive game creation epoch milliseconds',
  })
  fromMs?: number;
  @Allow()
  @ApiPropertyOptional({
    description: 'Exclusive game creation epoch milliseconds',
  })
  toMs?: number;
  @Allow()
  @ApiPropertyOptional()
  playerId?: string;
  @Allow()
  @ApiPropertyOptional({ enum: ['participant', 'team', 'match'] })
  subjectKind?: string;
  @Allow()
  @ApiPropertyOptional({ example: 'snapshot.totalGold' })
  definitionId?: string;
  @Allow()
  @ApiPropertyOptional({ example: 't:900000' })
  horizonKey?: string;
  @Allow()
  @ApiPropertyOptional({ enum: ['predictive', 'descriptive', 'label'] })
  usage?: string;
  @Allow()
  @ApiPropertyOptional({ default: true })
  eligibleOnly?: boolean | string;
  @Allow()
  @ApiPropertyOptional({ default: 100, maximum: 500 })
  limit?: number;
  @Allow()
  @ApiPropertyOptional({
    description: 'Last row ID from the previous page; same filters required',
  })
  after?: string;
}
export class DatasetRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() matchId!: string;
  @ApiProperty() subjectKind!: string;
  @ApiProperty() subjectId!: string;
  @ApiProperty() definitionId!: string;
  @ApiProperty() definitionVersion!: number;
  @ApiProperty({ enum: ['predictive', 'descriptive', 'label'] }) usage!: string;
  @ApiProperty() horizonKey!: string;
  @ApiProperty({ type: Number, nullable: true }) horizonMs!: number | null;
  @ApiProperty({ type: Number, nullable: true }) sourceMaxTimestampMs!:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) value!: number | null;
  @ApiProperty() sumValue!: number;
  @ApiProperty({
    description:
      '0 for unavailable, 1 for available; never count unavailable as observed zero',
  })
  validCount!: number;
  @ApiProperty() sampleCount!: number;
  @ApiProperty({ type: Number, nullable: true }) numerator!: number | null;
  @ApiProperty({ type: Number, nullable: true }) denominatorValue!:
    | number
    | null;
  @ApiProperty() ratioScale!: number;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ description: 'Posthoc cohort eligibility; not a predictor' })
  eligible!: boolean;
  @ApiProperty({
    description:
      'Logical publication time recorded by worker, shared with job completedAt',
    format: 'date-time',
  })
  processedAt!: string;
  @ApiProperty() datasetVersion!: number;
  @ApiProperty() metricId!: string;
  @ApiProperty() unit!: string;
  @ApiProperty() origin!: string;
  @ApiProperty({ type: String, nullable: true }) method!: string | null;
  @ApiProperty({ type: String, nullable: true }) exclusionReason!:
    | string
    | null;
  @ApiProperty() horizonComplete!: boolean;
  @ApiProperty({ type: String, nullable: true }) patch!: string | null;
  @ApiProperty() queueId!: number;
  @ApiProperty() mapId!: number;
  @ApiProperty({ type: Number, nullable: true }) championId!: number | null;
  @ApiProperty({ type: String, nullable: true }) role!: string | null;
  @ApiProperty({ type: Number, nullable: true }) teamId!: number | null;
  @ApiProperty({ type: [String] }) playerIds!: string[];
  @ApiProperty({
    description: 'Epoch milliseconds serialized as decimal string',
  })
  gameCreation!: string;
  @ApiProperty({ type: Object, additionalProperties: true }) quality!: object;
  @ApiProperty({ type: Object, additionalProperties: true, nullable: true })
  denominator!: object | null;
  @ApiProperty() processingVersion!: number;
  @ApiProperty({ type: Object, additionalProperties: true }) evidence!: object;
  @ApiProperty({ type: Object, additionalProperties: true }) lineage!: object;
}
export class DatasetResponseDto {
  @ApiProperty({ type: Object, additionalProperties: true }) filters!: object;
  @ApiProperty() datasetVersion!: number;
  @ApiProperty() processingVersion!: number;
  @ApiProperty({
    type: Object,
    additionalProperties: true,
    description:
      'Counts of distinct matches/players versus rows; sums, validCounts, means, ratios of sums, exclusions, missingness and unmaterializedMatches',
  })
  summary!: object;
  @ApiProperty({ type: [DatasetRowDto] }) rows!: DatasetRowDto[];
  @ApiProperty({ type: String, nullable: true }) nextAfter!: string | null;
}

export class DatasetDefinitionDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty() metricId!: string;
  @ApiProperty({ enum: ['predictive', 'descriptive', 'label'] }) usage!: string;
  @ApiProperty({ type: [String] }) subjectKinds!: string[];
  @ApiProperty() unit!: string;
  @ApiProperty() source!: string;
  @ApiProperty() temporalRule!: string;
  @ApiPropertyOptional() path?: string;
}
export class DatasetDefinitionsDto {
  @ApiProperty() datasetVersion!: number;
  @ApiProperty({ type: [Number] }) horizonsMs!: number[];
  @ApiProperty({ type: [DatasetDefinitionDto] })
  definitions!: DatasetDefinitionDto[];
}
