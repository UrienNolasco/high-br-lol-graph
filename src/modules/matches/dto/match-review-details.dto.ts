import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import type { MetricEvidence } from '../contracts/metric-contract';
import type {
  ReviewCombatWindow,
  ReviewEventReference,
  ReviewValue,
} from '../contracts/match-review';
import type { DamageReviewInterval } from '../pure/review/damage-review';
import type {
  DeathResourceCombat,
  DeathResourceEpisode,
  DeathResourceMetric,
  DeathResourceRate,
  DeathResourceSnapshot,
} from '../pure/review/death-resource-review';
import type {
  DeathRecapEntry,
  DeathRecapSource,
  DeathReceivedRecap,
  RecapDamageBreakdown,
  RecapPartialDamage,
} from '../pure/review/death-recap-review';

export class ReviewEvidenceDto implements MetricEvidence {
  @ApiProperty() source: string;
  @ApiProperty() field: string;
  @ApiProperty({
    nullable: true,
    oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }],
  })
  value: MetricEvidence['value'];
  @ApiPropertyOptional() eventId?: string;
  @ApiPropertyOptional({ type: Number, minimum: 0 }) frameIndex?: number;
  @ApiPropertyOptional({ type: Number, minimum: 0 }) timestampMs?: number;
}

export class ReviewCellDto implements ReviewValue {
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Finite observation or derived value; absent/invalid operands remain null. Observed zero remains zero.',
  })
  value: number | null;
  @ApiProperty({
    description:
      'Named source unit; ratio values use 0–1 shares, signed resource leads retain their source units.',
  })
  unit: string;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ enum: ['observed', 'derived', 'unavailable'] })
  origin: ReviewValue['origin'];
  @ApiProperty({ type: [ReviewEvidenceDto] }) evidence: ReviewEvidenceDto[];
}

export class ReviewEventReferenceDto implements ReviewEventReference {
  @ApiProperty({
    description: 'Stable matchId:frameIndex:eventIndex identity.',
  })
  eventId: string;
  @ApiProperty({ minimum: 0 }) timestampMs: number;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null for a known non-player/environmental author.',
  })
  killerPuuid: string | null;
  @ApiProperty() victimPuuid: string;
}

export class ReviewCombatWindowDto implements ReviewCombatWindow {
  @ApiProperty({ minimum: 0 }) startMs: number;
  @ApiProperty({ minimum: 0 }) endMs: number;
  @ApiProperty({ enum: ['(]'] }) bounds: '(]';
  @ApiProperty({ minimum: 0 }) kills: number;
  @ApiProperty({ minimum: 0 }) deaths: number;
  @ApiProperty({
    minimum: 0,
    description:
      'Explicitly recorded assists; does not imply complete assistance coverage.',
  })
  recordedAssists: number;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) assists:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: [ReviewEventReferenceDto] })
  events: ReviewEventReferenceDto[];
  @ApiProperty({ type: [String] }) unknownAssistEventIds: string[];
}

export class DeathResourceValuesDto {
  @ApiProperty({ type: ReviewCellDto }) gold: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) xp: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) laneCs: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) jungleCs: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) cs: ReviewCellDto;
}

export class DeathResourceSnapshotDto implements DeathResourceSnapshot {
  @ApiProperty({
    description:
      'Target time of a past-only lookup, not an observed timestamp.',
  })
  targetMs: number;
  @ApiProperty({ type: Number, nullable: true }) actualMs: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Signed actual observation time minus requested target.',
  })
  offsetMs: number | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) frameIndex:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: DeathResourceValuesDto }) focal: DeathResourceValuesDto;
  @ApiProperty({ type: DeathResourceValuesDto })
  opponent: DeathResourceValuesDto;
}

export class ReviewMinuteDenominatorDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Elapsed minutes between actual observations.',
  })
  value: number | null;
  @ApiProperty({ enum: ['minutes'] }) unit: 'minutes';
}

export class DeathResourceRateDto
  extends ReviewCellDto
  implements DeathResourceRate
{
  @ApiProperty({ type: ReviewMinuteDenominatorDto })
  denominator: ReviewMinuteDenominatorDto;
}

export class DeathResourceMetricDto implements DeathResourceMetric {
  @ApiProperty({ type: ReviewCellDto }) baselineLead: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) beforeLead: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) afterLead: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) focalPriorGain: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) focalPostGain: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) opponentPriorGain: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) opponentPostGain: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) priorRelativeGain: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) postRelativeGain: ReviewCellDto;
  @ApiProperty({ type: DeathResourceRateDto })
  priorRelativePerMinute: DeathResourceRateDto;
  @ApiProperty({ type: DeathResourceRateDto })
  postRelativePerMinute: DeathResourceRateDto;
  @ApiProperty({ type: ReviewCellDto }) relativeRateChange: ReviewCellDto;
}

export class DeathResourceMetricsDto {
  @ApiProperty({ type: DeathResourceMetricDto }) gold: DeathResourceMetricDto;
  @ApiProperty({ type: DeathResourceMetricDto }) xp: DeathResourceMetricDto;
  @ApiProperty({ type: DeathResourceMetricDto }) laneCs: DeathResourceMetricDto;
  @ApiProperty({ type: DeathResourceMetricDto })
  jungleCs: DeathResourceMetricDto;
  @ApiProperty({ type: DeathResourceMetricDto }) cs: DeathResourceMetricDto;
}

export class DeathResourceCombatDto implements DeathResourceCombat {
  @ApiProperty({ type: ReviewCombatWindowDto }) prior: ReviewCombatWindowDto;
  @ApiProperty({ type: ReviewCombatWindowDto }) post: ReviewCombatWindowDto;
  @ApiProperty({ type: ReviewCombatWindowDto })
  afterDeath: ReviewCombatWindowDto;
  @ApiProperty({ type: ReviewCombatWindowDto })
  beforeDeath: ReviewCombatWindowDto;
  @ApiProperty({ type: ReviewCombatWindowDto })
  opponentPrior: ReviewCombatWindowDto;
  @ApiProperty({ type: ReviewCombatWindowDto })
  opponentPost: ReviewCombatWindowDto;
  @ApiProperty({ type: ReviewCombatWindowDto })
  opponentAfterDeath: ReviewCombatWindowDto;
  @ApiProperty({ type: ReviewCombatWindowDto })
  opponentBeforeDeath: ReviewCombatWindowDto;
}

export class DeathResourceEpisodeDto implements DeathResourceEpisode {
  @ApiProperty() eventId: string;
  @ApiProperty({ minimum: 0 }) deathMs: number;
  @ApiProperty() eligible: boolean;
  @ApiProperty() temporalEligible: boolean;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: Boolean, nullable: true }) priorDeath: boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) repeatedDeath: boolean | null;
  @ApiProperty({ type: DeathResourceSnapshotDto, nullable: true })
  baseline: DeathResourceSnapshotDto | null;
  @ApiProperty({ type: DeathResourceSnapshotDto, nullable: true })
  before: DeathResourceSnapshotDto | null;
  @ApiProperty({ type: DeathResourceSnapshotDto, nullable: true })
  after: DeathResourceSnapshotDto | null;
  @ApiProperty({ type: Number, nullable: true }) priorMinutes: number | null;
  @ApiProperty({ type: Number, nullable: true }) postMinutes: number | null;
  @ApiProperty({ type: DeathResourceMetricsDto, nullable: true })
  metrics: DeathResourceMetricsDto | null;
  @ApiProperty({ type: DeathResourceCombatDto, nullable: true })
  combat: DeathResourceCombatDto | null;
  @ApiProperty({ type: [String] }) tags: string[];
  @ApiPropertyOptional({ description: 'Present on the paginated death list.' })
  href?: string;
  @ApiPropertyOptional({ description: 'Present on the paginated death list.' })
  recapAvailable?: boolean;
}

export class DamageMarginNoDeathsDto {
  @ApiProperty({ type: Boolean, nullable: true }) '0': boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) '15000': boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) '30000': boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) '60000': boolean | null;
}

export class DamageReviewIntervalDto implements DamageReviewInterval {
  @ApiProperty({ minimum: 0 }) startFrameIndex: number;
  @ApiProperty({ minimum: 0 }) endFrameIndex: number;
  @ApiProperty({ minimum: 0 }) startMs: number;
  @ApiProperty({ minimum: 0 }) endMs: number;
  @ApiProperty({ minimum: 0 }) durationMs: number;
  @ApiProperty({ enum: ['(]'] }) bounds: '(]';
  @ApiProperty({
    description:
      'True for a valid interval lasting 45–75 seconds; partial final intervals still retain their observed damage.',
  })
  comparableMinute: boolean;
  @ApiProperty({ type: ReviewCellDto }) personalDamage: ReviewCellDto;
  @ApiProperty({
    type: ReviewCellDto,
    description: 'Sum across both teams and the entire map, not one encounter.',
  })
  globalDamage: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) personalRate: ReviewCellDto;
  @ApiProperty({ type: ReviewCellDto }) globalRate: ReviewCellDto;
  @ApiProperty({
    type: Boolean,
    nullable: true,
    description:
      'No registered death in (startMs,endMs]; null when combat coverage is unknown.',
  })
  noDeaths: boolean | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) deathCount:
    | number
    | null;
  @ApiProperty({ type: [ReviewEventReferenceDto] })
  deaths: ReviewEventReferenceDto[];
  @ApiProperty({ type: ReviewEventReferenceDto, nullable: true })
  previousDeath: ReviewEventReferenceDto | null;
  @ApiProperty({ type: ReviewEventReferenceDto, nullable: true })
  nextDeath: ReviewEventReferenceDto | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) nextDeathGapMs:
    | number
    | null;
  @ApiProperty({
    type: DamageMarginNoDeathsDto,
    description:
      'Death absence including the indicated milliseconds before and after; null for censored margins or unknown combat coverage.',
  })
  marginNoDeaths: Record<string, boolean | null>;
  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 1,
    description:
      'Retrospective rate rank among comparable intervals; null without complete damage coverage.',
  })
  personalRank: number | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 1 }) globalRank:
    | number
    | null;
  @ApiProperty({ type: ReviewCellDto }) shareOfFinalDamage: ReviewCellDto;
}

export class RecapDamageBreakdownDto implements RecapDamageBreakdown {
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) physical:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) magic:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) true:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) total:
    | number
    | null;
}

export class RecapPartialDamageDto
  extends RecapDamageBreakdownDto
  implements RecapPartialDamage
{
  @ApiProperty({ minimum: 0 }) knownPhysicalComponents: number;
  @ApiProperty({ minimum: 0 }) knownMagicComponents: number;
  @ApiProperty({ minimum: 0 }) knownTrueComponents: number;
}

export class DeathRecapEntryDto implements DeathRecapEntry {
  @ApiProperty({ minimum: 0 }) entryIndex: number;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) participantId:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true }) name: string | null;
  @ApiProperty({ type: String, nullable: true }) type: string | null;
  @ApiProperty({ type: String, nullable: true }) spellName: string | null;
  @ApiProperty({
    enum: ['participant', 'non_participant_unit', 'unattributed'],
  })
  classification: DeathRecapEntry['classification'];
  @ApiProperty({ type: String, nullable: true }) sourcePuuid: string | null;
  @ApiProperty({ type: RecapDamageBreakdownDto })
  damage: RecapDamageBreakdownDto;
  @ApiProperty({ type: [String] }) issues: string[];
  @ApiProperty({ type: [ReviewEvidenceDto] }) evidence: ReviewEvidenceDto[];
}

export class DeathRecapSourceDto implements DeathRecapSource {
  @ApiProperty({ minimum: 1 }) participantId: number;
  @ApiProperty() puuid: string;
  @ApiProperty() championName: string;
  @ApiProperty({ type: [Number] }) entryIndices: number[];
  @ApiProperty({ type: RecapDamageBreakdownDto })
  damage: RecapDamageBreakdownDto;
  @ApiProperty({ type: RecapPartialDamageDto })
  partialDamage: RecapPartialDamageDto;
}

export class DeathRecapQualityDto {
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) entryCount:
    | number
    | null;
  @ApiProperty({ minimum: 0 }) validEntries: number;
  @ApiProperty({ type: [String] }) issues: string[];
}

export class DeathReceivedRecapDto implements DeathReceivedRecap {
  @ApiProperty() eventId: string;
  @ApiProperty({ minimum: 0 }) frameIndex: number;
  @ApiProperty({ minimum: 0 }) eventIndex: number;
  @ApiProperty({ minimum: 0 }) timestampMs: number;
  @ApiProperty({
    minimum: 0,
    description:
      'Timestamp of the source death; does not identify the start of the recorded damage.',
  })
  sourceMaxTimestampMs: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Always null: original data do not identify the recap window duration.',
  })
  windowDurationMs: null;
  @ApiProperty({ enum: ['source_window_not_observed'] })
  windowReason: 'source_window_not_observed';
  @ApiProperty({ enum: ['derived'] }) origin: 'derived';
  @ApiProperty({ enum: ['absent', 'invalid', 'empty', 'observed'] })
  listState: DeathReceivedRecap['listState'];
  @ApiProperty() available: boolean;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: DeathRecapQualityDto }) quality: DeathRecapQualityDto;
  @ApiProperty({ type: RecapDamageBreakdownDto })
  listedDamage: RecapDamageBreakdownDto;
  @ApiProperty({ type: RecapPartialDamageDto })
  partialListedDamage: RecapPartialDamageDto;
  @ApiProperty({ type: RecapDamageBreakdownDto })
  nonParticipantUnitDamage: RecapDamageBreakdownDto;
  @ApiProperty({ type: RecapPartialDamageDto })
  partialNonParticipantUnitDamage: RecapPartialDamageDto;
  @ApiProperty({ type: RecapPartialDamageDto })
  partialUnattributedDamage: RecapPartialDamageDto;
  @ApiProperty({ type: [DeathRecapEntryDto] }) entries: DeathRecapEntryDto[];
  @ApiProperty({ type: [DeathRecapSourceDto] }) sources: DeathRecapSourceDto[];
  @ApiProperty() sourcesComplete: boolean;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) sourceCount:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 })
  championListedDamageDenominator: number | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 1 })
  largestSourceShare: number | null;
  @ApiProperty() baselineComparable: boolean;
  @ApiProperty({ type: String, nullable: true }) baselineReason: string | null;
  @ApiProperty({ type: [Number], nullable: true }) baselineSourceIds:
    | number[]
    | null;
  @ApiProperty({ type: [Number], nullable: true }) additionalSourceIds:
    | number[]
    | null;
  @ApiProperty({ type: [Number], nullable: true })
  baselineAbsentFromPositiveRecap: number[] | null;
  @ApiProperty({ type: [ReviewEvidenceDto] }) evidence: ReviewEvidenceDto[];
}

/** Register these roots when a parent response uses the exported $refs. */
@ApiExtraModels(
  DeathResourceEpisodeDto,
  DamageReviewIntervalDto,
  DeathReceivedRecapDto,
)
export class MatchReviewDetailModelsDto {}
export const MATCH_REVIEW_DETAIL_SCHEMAS = {
  resources: { $ref: getSchemaPath(DeathResourceEpisodeDto) },
  damage: { $ref: getSchemaPath(DamageReviewIntervalDto) },
  recap: { $ref: getSchemaPath(DeathReceivedRecapDto) },
} as const;
