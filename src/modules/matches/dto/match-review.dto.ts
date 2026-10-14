import { DeathResourceSummaryDto } from './match-review-summary.dto';
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  DeathResourceEpisodeDto,
  DamageReviewIntervalDto,
  DeathReceivedRecapDto,
  ReviewCellDto,
} from './match-review-details.dto';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class MatchReviewQueryDto {
  @ApiProperty({ required: false, default: 0, minimum: 0, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  offset: number = 0;
  @ApiProperty({ required: false, default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
  @ApiProperty({
    required: false,
    minimum: 0,
    description:
      'Inclusive lower timestamp in milliseconds; filters presentation only.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fromMs?: number;
  @ApiProperty({
    required: false,
    minimum: 0,
    description:
      'Exclusive upper timestamp in milliseconds; original denominators and ranks retained.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  toMs?: number;
  @ApiProperty({
    required: false,
    enum: ['chronological', 'damage'],
    default: 'chronological',
  })
  @IsOptional()
  @IsIn(['chronological', 'damage'])
  sort: 'chronological' | 'damage' = 'chronological';
  @ApiProperty({
    required: false,
    enum: ['all', 'none', 'present'],
    default: 'all',
    description:
      'Damage intervals only; unknown death coverage never matches none/present.',
  })
  @IsOptional()
  @IsIn(['all', 'none', 'present'])
  deaths: 'all' | 'none' | 'present' = 'all';
}
export class ReviewValueDto extends ReviewCellDto {}
export class ReviewReadLimitsDto {
  @ApiProperty() eventsTruncated: boolean;
  @ApiProperty() framesTruncated: boolean;
}
export class ReviewCoverageDto {
  @ApiProperty({ type: String, nullable: true }) snapshots: string | null;
  @ApiProperty({ type: String, nullable: true }) combat: string | null;
  @ApiProperty({ type: Number, nullable: true }) observedEndMs: number | null;
  @ApiProperty({ type: ReviewReadLimitsDto })
  readLimits: ReviewReadLimitsDto;
}
export class ReviewParticipantDto {
  @ApiProperty() puuid: string;
  @ApiProperty() championName: string;
  @ApiProperty({ enum: [100, 200] }) teamId: number;
  @ApiProperty({ type: String, nullable: true }) role: string | null;
}
export class ReviewOpponentDto {
  @ApiProperty() puuid: string;
  @ApiProperty() championName: string;
  @ApiProperty() role: string;
}
export class ReviewObservationContractDto {
  @ApiProperty({ example: 180000 }) horizonMs: number;
  @ApiProperty({ example: 60000 }) maxFrameAgeMs: number;
  @ApiProperty({ enum: ['pastOnly'] }) mode: string;
}
export class ReviewRecapCoverageDto {
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) observedDeaths:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) expectedDeaths:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 })
  recapsWithObservedList: number | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) availableRecaps:
    | number
    | null;
}
export class MatchReviewSummaryDto {
  @ApiProperty({ type: String, nullable: true }) resourcesReason: string | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) deathEpisodes:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 })
  eligibleDeathEpisodes: number | null;
  @ApiProperty({ type: String, nullable: true }) damageReason: string | null;
  @ApiProperty() damageComplete: boolean;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) damageIntervals:
    | number
    | null;
  @ApiProperty({ type: ReviewValueDto }) totalDamage: ReviewValueDto;
  @ApiProperty({ type: ReviewValueDto }) damageWithoutDeaths: ReviewValueDto;
  @ApiProperty({ type: ReviewValueDto }) fractionWithoutDeaths: ReviewValueDto;
  @ApiProperty({ type: String, nullable: true }) rankingReason: string | null;
  @ApiProperty({ type: ReviewRecapCoverageDto })
  recapCoverage: ReviewRecapCoverageDto;
  @ApiProperty({ type: String, nullable: true }) recapReason: string | null;
}
export class MatchReviewHighlightsDto {
  @ApiProperty({ type: DamageReviewIntervalDto, nullable: true })
  personalPeak: DamageReviewIntervalDto | null;
  @ApiProperty({ type: DamageReviewIntervalDto, nullable: true })
  personalPeakWithoutDeaths: DamageReviewIntervalDto | null;
  @ApiProperty({ type: DamageReviewIntervalDto, nullable: true })
  globalPeakWithoutDeaths: DamageReviewIntervalDto | null;
}
export class MatchReviewLinksDto {
  @ApiProperty() deaths: string;
  @ApiProperty() damage: string;
  @ApiProperty() report: string;
}
export class MatchReviewFiltersDto {
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) fromMs:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) toMs:
    | number
    | null;
  @ApiProperty({ enum: ['chronological', 'damage'] }) sort:
    | 'chronological'
    | 'damage';
  @ApiProperty({ enum: ['all', 'none', 'present'] }) deaths:
    | 'all'
    | 'none'
    | 'present';
  @ApiProperty({
    enum: ['presentation_only; original denominators and ranks retained'],
  })
  appliedTo: string;
}
export class MatchReviewOverviewDto {
  @ApiProperty() matchId: string;
  @ApiProperty() puuid: string;
  @ApiProperty({ type: ReviewParticipantDto })
  participant: ReviewParticipantDto;
  @ApiProperty({ type: ReviewOpponentDto, nullable: true })
  opponent: ReviewOpponentDto | null;
  @ApiProperty({ type: ReviewObservationContractDto })
  observationContract: ReviewObservationContractDto;
  @ApiProperty({ example: 1 }) metricVersion: number;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true }) processedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ enum: ['retrospective_match_review'] }) temporalScope: string;
  @ApiProperty() source: string;
  @ApiProperty({ type: ReviewCoverageDto }) coverage: ReviewCoverageDto;
  @ApiProperty({ type: [String] }) interpretation: string[];
  @ApiProperty({
    type: MatchReviewSummaryDto,
    description: 'Availability and observed counts; never a performance score.',
  })
  summary: MatchReviewSummaryDto;
  @ApiProperty({
    type: MatchReviewHighlightsDto,
    description:
      'Retrospective peaks with original ranks, neighboring events and source evidence.',
  })
  highlights: MatchReviewHighlightsDto;
  @ApiProperty({ type: MatchReviewLinksDto })
  links: MatchReviewLinksDto;
}
@ApiExtraModels(DeathResourceSummaryDto, DamageReviewIntervalDto)
export class MatchReviewPageDto {
  @ApiProperty() matchId: string;
  @ApiProperty() puuid: string;
  @ApiProperty({ example: 1, minimum: 1 }) metricVersion: number;
  @ApiProperty({ type: ReviewCoverageDto }) coverage: ReviewCoverageDto;
  @ApiProperty({ type: ReviewParticipantDto })
  participant: ReviewParticipantDto;
  @ApiProperty({ type: ReviewOpponentDto, nullable: true })
  opponent: ReviewOpponentDto | null;
  @ApiProperty({ type: ReviewObservationContractDto })
  observationContract: ReviewObservationContractDto;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true }) processedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(DeathResourceSummaryDto) },
        { $ref: getSchemaPath(DamageReviewIntervalDto) },
      ],
    },
  })
  items: unknown[];
  @ApiProperty() total: number;
  @ApiProperty() offset: number;
  @ApiProperty() limit: number;
  @ApiProperty() hasMore: boolean;
  @ApiProperty({ type: String, nullable: true }) next: string | null;
  @ApiProperty({ type: MatchReviewFiltersDto }) filters: MatchReviewFiltersDto;
  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Returned by the damage page only; complete original damage coverage is required for retrospective ranks and full-game shares.',
  })
  complete?: boolean;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Returned by the damage page only; null when retrospective ranking is available.',
  })
  rankingReason?: string | null;
}
export class MatchReviewDeathDto {
  @ApiProperty() matchId: string;
  @ApiProperty() puuid: string;
  @ApiProperty({ example: 1, minimum: 1 }) metricVersion: number;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: ReviewCoverageDto }) coverage: ReviewCoverageDto;
  @ApiProperty({ type: [String] }) interpretation: string[];
  @ApiProperty({ type: ReviewParticipantDto })
  participant: ReviewParticipantDto;
  @ApiProperty({ type: ReviewOpponentDto, nullable: true })
  opponent: ReviewOpponentDto | null;
  @ApiProperty({ type: ReviewObservationContractDto })
  observationContract: ReviewObservationContractDto;
  @ApiProperty() eventId: string;
  @ApiProperty({ type: String, nullable: true }) processedAt: string | null;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({
    type: DeathResourceEpisodeDto,
    nullable: true,
    description:
      'Past-only observations before/around/after this death; null cells preserve missingness and events retain source IDs.',
  })
  resources: DeathResourceEpisodeDto | null;
  @ApiProperty({
    type: DeathReceivedRecapDto,
    nullable: true,
    description:
      'Partial received-damage recap; source identity conflicts and unknown duration preserved.',
  })
  recap: DeathReceivedRecapDto | null;
}
