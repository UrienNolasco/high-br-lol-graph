import { ApiProperty } from '@nestjs/swagger';
import type { ReviewValue } from '../contracts/match-review';

export class ReviewCompactValueDto {
  @ApiProperty({ type: Number, nullable: true }) value: number | null;
  @ApiProperty() unit: string;
  @ApiProperty({ enum: ['observed', 'derived', 'unavailable'] })
  origin: ReviewValue['origin'];
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({
    minimum: 0,
    description:
      'Number of evidence records for this cell. Full records are available at the death summary href; this count is not a sample denominator.',
  })
  evidenceCount: number;
}
export class DeathResourceMetricSummaryDto {
  @ApiProperty({ type: ReviewCompactValueDto })
  focalPostGain: ReviewCompactValueDto;
  @ApiProperty({ type: ReviewCompactValueDto })
  opponentPostGain: ReviewCompactValueDto;
  @ApiProperty({ type: ReviewCompactValueDto })
  beforeLead: ReviewCompactValueDto;
  @ApiProperty({ type: ReviewCompactValueDto })
  afterLead: ReviewCompactValueDto;
  @ApiProperty({ type: ReviewCompactValueDto })
  priorRelativeGain: ReviewCompactValueDto;
  @ApiProperty({ type: ReviewCompactValueDto })
  postRelativeGain: ReviewCompactValueDto;
}
export class DeathResourceMetricsSummaryDto {
  @ApiProperty({ type: DeathResourceMetricSummaryDto })
  gold: DeathResourceMetricSummaryDto;
  @ApiProperty({ type: DeathResourceMetricSummaryDto })
  cs: DeathResourceMetricSummaryDto;
  @ApiProperty({ type: DeathResourceMetricSummaryDto })
  xp: DeathResourceMetricSummaryDto;
}
export class DeathResourceWindowSummaryDto {
  @ApiProperty({ type: Number, nullable: true }) baselineMs: number | null;
  @ApiProperty({ type: Number, nullable: true }) beforeMs: number | null;
  @ApiProperty({ type: Number, nullable: true }) afterMs: number | null;
}
export class DeathCombatSummaryDto {
  @ApiProperty() kills: number;
  @ApiProperty() deaths: number;
  @ApiProperty({
    description:
      'Assists explicitly recorded in source events. This can be a lower bound when assists is null.',
  })
  recordedAssists: number;
  @ApiProperty({ type: Number, nullable: true }) assists: number | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({
    minimum: 0,
    description:
      'Number of events with unresolved possible assistance. Source event identities remain in the detail response.',
  })
  unknownAssistEventsN: number;
}
export class DeathCombatPairSummaryDto {
  @ApiProperty({ type: DeathCombatSummaryDto }) focal: DeathCombatSummaryDto;
  @ApiProperty({ type: DeathCombatSummaryDto }) opponent: DeathCombatSummaryDto;
}
export class DeathResourceSummaryDto {
  @ApiProperty() eventId: string;
  @ApiProperty() deathMs: number;
  @ApiProperty() eligible: boolean;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: Boolean, nullable: true }) priorDeath: boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) repeatedDeath: boolean | null;
  @ApiProperty({ type: [String] }) tags: string[];
  @ApiProperty({
    type: DeathResourceWindowSummaryDto,
    description:
      'Actual snapshot timestamps, not nominal death-relative targets. beforeMs may precede the death by up to 60000 ms; detail preserves offsets.',
  })
  window: DeathResourceWindowSummaryDto;
  @ApiProperty({ type: DeathResourceMetricsSummaryDto, nullable: true })
  metrics: DeathResourceMetricsSummaryDto | null;
  @ApiProperty({
    type: DeathCombatPairSummaryDto,
    nullable: true,
    description:
      'Combat strictly in (deathMs, window.afterMs], distinct from the resource interval that begins at window.beforeMs.',
  })
  combat: DeathCombatPairSummaryDto | null;
  @ApiProperty({
    description:
      'Participant-scoped death detail containing full resource observations, cell evidence, event identities and recap availability.',
  })
  href: string;
  @ApiProperty() recapAvailable: boolean;
}
