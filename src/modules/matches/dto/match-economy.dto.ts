import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { CheckpointMode } from '../contracts/temporal';
import type {
  EconomyValue,
  EconomyValues,
  EconomyReport,
} from '../pure/economy-calculator';

export class EconomyQueryDto {
  @ApiProperty({
    required: false,
    enum: ['nearest', 'pastOnly'],
    default: 'nearest',
  })
  @IsOptional()
  @IsIn(['nearest', 'pastOnly'])
  mode: CheckpointMode = 'nearest';
}
export class EconomyValueDto {
  @ApiProperty({ example: 'E01' }) metricId: string;
  @ApiProperty({ type: Number, nullable: true }) value: number | null;
  @ApiProperty({
    example: 'gold',
    description:
      'Literal units; shares use ratio 0–1, rates use actual minutes.',
  })
  unit: string;
  @ApiProperty({ enum: ['observed', 'derived', 'unavailable'] })
  origin: EconomyValue['origin'];
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty() method: string;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  denominator: EconomyValue['denominator'];
  @ApiProperty({ type: 'object', additionalProperties: true })
  quality: EconomyValue['quality'];
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  evidence: EconomyValue['evidence'];
}
const valuesSchema = {
  type: 'object' as const,
  additionalProperties: { $ref: getSchemaPath(EconomyValueDto) },
  description:
    'totalGold, currentGold, xp, level, laneCs, jungleCs, totalCs, goldShare and csShare; null cells include reason.',
};
@ApiExtraModels(EconomyValueDto)
export class EconomySampleDto {
  @ApiProperty() frameIndex: number;
  @ApiProperty({ type: Number, nullable: true }) timestampMs: number | null;
  @ApiProperty(valuesSchema) values: EconomyValues;
}
export class EconomyCheckpointDto {
  @ApiProperty({ enum: [300000, 600000, 900000, 1200000] }) targetMs: number;
  @ApiProperty({ type: Number, nullable: true }) actualMs: number | null;
  @ApiProperty({ type: Number, nullable: true }) offsetMs: number | null;
  @ApiProperty({ enum: ['nearest', 'pastOnly'] }) mode: CheckpointMode;
  @ApiProperty({ example: 60000 }) toleranceMs: number;
  @ApiProperty({ type: Number, nullable: true }) frameIndex: number | null;
  @ApiProperty() eligible: boolean;
  @ApiProperty() comparisonEligible: boolean;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: String, nullable: true }) comparisonReason:
    | string
    | null;
  @ApiProperty(valuesSchema) values: EconomyValues;
  @ApiProperty(valuesSchema) opponent: EconomyValues;
  @ApiProperty(valuesSchema) differences: EconomyValues;
}
export class EconomyIntervalDto {
  @ApiProperty({ type: Number, nullable: true }) startMs: number | null;
  @ApiProperty({ type: Number, nullable: true }) endMs: number | null;
  @ApiProperty({ type: Number, nullable: true }) elapsedMs: number | null;
  @ApiProperty({ type: Number, nullable: true }) fromFrameIndex: number | null;
  @ApiProperty({ type: Number, nullable: true }) toFrameIndex: number | null;
  @ApiProperty() partialFinalInterval: boolean;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({
    ...valuesSchema,
    description:
      'Counter gains: totalGold, xp, laneCs, jungleCs, totalCs. currentGold is never treated as income.',
  })
  gains: Record<string, EconomyValue>;
  @ApiProperty({
    ...valuesSchema,
    description:
      'Counter gains divided by actual elapsed minutes, including partial final intervals.',
  })
  perMinute: Record<string, EconomyValue>;
}
export class EconomyPhaseDto extends EconomyIntervalDto {
  @ApiProperty() targetStartMs: number;
  @ApiProperty() targetEndMs: number;
  @ApiProperty({ type: Number, nullable: true }) startOffsetMs: number | null;
  @ApiProperty({ type: Number, nullable: true }) endOffsetMs: number | null;
  @ApiProperty({ enum: ['nearest', 'pastOnly'] }) mode: CheckpointMode;
  @ApiProperty() toleranceMs: number;
}
@ApiExtraModels(EconomyValueDto)
export class MatchEconomyDto {
  @ApiProperty() matchId: string;
  @ApiProperty() puuid: string;
  @ApiProperty({ example: 1 }) metricVersion: number;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Persisted MatchProcessing.completedAt; null with missing_processing_provenance, never request time.',
  })
  processedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty() eligible: boolean;
  @ApiProperty({ type: 'object', additionalProperties: true })
  eligibility: EconomyReport['eligibility'];
  @ApiProperty({ type: 'object', additionalProperties: true })
  opponent: EconomyReport['opponent'];
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Observed GAME_END timestamp; absent when only summary duration is available.',
  })
  observedEndMs: number | null;
  @ApiProperty({
    description:
      'Duration used for temporal eligibility; source is explicit in endSource.',
  })
  effectiveEndMs: number;
  @ApiProperty({ enum: ['GAME_END', 'Match.gameDuration_seconds'] })
  endSource: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  checkpointContract: EconomyReport['checkpointContract'];
  @ApiProperty({ type: 'object', additionalProperties: true })
  quality: EconomyReport['quality'];
  @ApiProperty({ type: [EconomyCheckpointDto] })
  checkpoints: EconomyCheckpointDto[];
  @ApiProperty({ type: [EconomySampleDto] }) samples: EconomySampleDto[];
  @ApiProperty({ type: [EconomyIntervalDto] }) intervals: EconomyIntervalDto[];
  @ApiProperty({ type: [EconomyPhaseDto] }) phases: EconomyPhaseDto[];
  @ApiProperty({ type: 'object', additionalProperties: true })
  unspentGold: EconomyReport['unspentGold'];
  @ApiProperty({
    ...valuesSchema,
    description:
      'Literal final lane/jungle/ally-jungle/enemy-jungle counters from MET05; not route inference.',
  })
  finalResources: Record<string, EconomyValue>;
}
