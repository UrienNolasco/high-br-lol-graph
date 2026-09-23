import { Allow } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class ReferenceQueryDto {
  @Allow() @ApiProperty({ example: '16.2' }) patch!: string;
  @Allow() @ApiProperty({ example: 420 }) queueId!: number;
  @Allow() @ApiProperty({ example: 11 }) mapId!: number;
  @Allow() @ApiProperty({ example: 103 }) championId!: number;
  @Allow() @ApiProperty({ example: 'MIDDLE' }) role!: string;
  @Allow()
  @ApiProperty({ example: 'snapshot.totalGold' })
  definitionId!: string;
  @Allow() @ApiProperty({ example: 't:900000' }) horizonKey!: string;
  @Allow()
  @ApiPropertyOptional({ description: 'Inclusive creation epoch milliseconds' })
  fromMs?: number;
  @Allow()
  @ApiPropertyOptional({ description: 'Exclusive creation epoch milliseconds' })
  toMs?: number;
  @Allow()
  @ApiPropertyOptional({
    description:
      'Dataset anchor ID of target; entire target roster is excluded from reference',
  })
  individualId?: string;
  @Allow()
  @ApiPropertyOptional({ default: 0.95, minimum: 0.8, maximum: 0.999 })
  confidence?: number;
  @Allow()
  @ApiPropertyOptional({
    default: 0.15,
    minimum: 0.01,
    maximum: 0.25,
    description:
      'Maximum nominal CDF half-width;0.15 means15percentage points, not15% metric error',
  })
  cdfHalfWidth?: number;
  @Allow()
  @ApiPropertyOptional({
    default: 0,
    description:
      'Additional floor; cannot reduce the precision-derived minimum',
  })
  minimumUnits?: number;
}
export class ReferenceCountsDto {
  @ApiProperty() candidateRows!: number;
  @ApiProperty({ type: Number, nullable: true }) eligibleRows!: number | null;
  @ApiProperty({ type: Number, nullable: true }) eligibleMatches!:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) eligiblePlayers!:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) validEligibleRows!:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) validEligibleMatches!:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) validEligiblePlayers!:
    | number
    | null;
  @ApiProperty() selectedRows!: number;
  @ApiProperty() selectedMatches!: number;
  @ApiProperty() selectedSubjects!: number;
  @ApiProperty() selectedRosterPlayers!: number;
}
export class ReferencePrecisionDto {
  @ApiProperty() confidence!: number;
  @ApiProperty() cdfHalfWidth!: number;
  @ApiProperty() minimumUnits!: number;
  @ApiProperty() requiredUnits!: number;
  @ApiProperty() observedUnits!: number;
  @ApiProperty({ type: Number, nullable: true }) achievedCdfHalfWidth!:
    | number
    | null;
  @ApiProperty() sufficient!: boolean;
}
export class ReferenceQuantileIntervalDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Null means an unidentified/unbounded tail, not observed sample minimum',
  })
  lower!: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Null means an unidentified/unbounded tail, not observed sample maximum',
  })
  upper!: number | null;
  @ApiProperty() lowerUnbounded!: boolean;
  @ApiProperty() upperUnbounded!: boolean;
  @ApiProperty() confidence!: number;
  @ApiProperty() method!: string;
}
export class ReferenceQuantileDto {
  @ApiProperty() probability!: number;
  @ApiProperty() value!: number;
  @ApiProperty({ type: ReferenceQuantileIntervalDto })
  interval!: ReferenceQuantileIntervalDto;
}
export class ReferenceDistributionPointDto {
  @ApiProperty() value!: number;
  @ApiProperty() count!: number;
  @ApiProperty({ description: 'Empirical CDF in 0..1' }) cdf!: number;
  @ApiProperty() lower!: number;
  @ApiProperty() upper!: number;
}
export class ReferenceResponseDto {
  @ApiProperty() datasetVersion!: number;
  @ApiProperty() processingVersion!: number;
  @ApiProperty() methodVersion!: number;
  @ApiProperty() maximumCandidateRows!: number;
  @ApiProperty() datasetAnchorDefinitionId!: string;
  @ApiProperty({ type: Object, additionalProperties: true })
  observations!: object;
  @ApiProperty({ enum: ['available', 'insufficient'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: Object, additionalProperties: true })
  definition!: object;
  @ApiProperty({ type: Object, additionalProperties: true }) filters!: object;
  @ApiProperty({ type: ReferenceCountsDto }) counts!: ReferenceCountsDto;
  @ApiProperty({ type: Object, additionalProperties: true }) coverage!: object;
  @ApiProperty({ type: Object, additionalProperties: true }) period!: object;
  @ApiProperty({ type: Object, additionalProperties: true }) selection!: object;
  @ApiProperty({ type: ReferencePrecisionDto })
  precision!: ReferencePrecisionDto;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Lower median, inverse empirical CDF; absent when precision criterion fails',
  })
  median!: number | null;
  @ApiProperty({ type: [ReferenceDistributionPointDto], nullable: true })
  distribution!: ReferenceDistributionPointDto[] | null;
  @ApiProperty({ type: [ReferenceQuantileDto], nullable: true }) quantiles!:
    | ReferenceQuantileDto[]
    | null;
  @ApiProperty({ type: Object, additionalProperties: true, nullable: true })
  individual!: object | null;
  @ApiProperty({ type: Object, additionalProperties: true })
  provenance!: object;
  @ApiProperty({ type: Object, additionalProperties: true, nullable: true })
  visionInvestmentPolicy!: object | null;
}
