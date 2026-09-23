import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { MetricResultDto } from '../../../core/metrics/metric-result.dto';
export class BountyWindowDto {
  @ApiProperty() windowId: string;
  @ApiProperty({ type: Number, nullable: true }) teamId: number | null;
  @ApiProperty({ type: String, nullable: true }) announcementEventId:
    | string
    | null;
  @ApiProperty({ type: Number, nullable: true }) announcementTimestampMs:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) actualStartTime: number | null;
  @ApiProperty({ type: String, nullable: true }) finishEventId: string | null;
  @ApiProperty({ type: Number, nullable: true }) startMs: number | null;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['actualStartTime', 'announcement_timestamp'],
  })
  startSource: string | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Literal FINISH timestamp only; game end is never invented as a finish.',
  })
  endMs: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Known finish or observed game end for right-censored windows.',
  })
  observedEndMs: number | null;
  @ApiProperty() censoredStart: boolean;
  @ApiProperty() censoredEnd: boolean;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: [String] }) issues: string[];
  @ApiProperty({
    type: MetricResultDto,
    description:
      'Milliseconds in the observed portion, not the unknown full duration of a censored window.',
  })
  observedDuration: MetricResultDto;
  @ApiProperty({ type: [String] }) associatedObjectiveEventIds: string[];
  @ApiProperty({
    type: MetricResultDto,
    description:
      'Temporal association for known beneficiary; does not assert a payout or steal.',
  })
  associatedObjectiveCount: MetricResultDto;
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  evidence: unknown[];
}
export class StealChallengeDto {
  @ApiProperty({
    enum: ['steals', 'steals_without_smite', 'proximity', 'spawn_timing'],
  })
  category: string;
  @ApiProperty({ type: MetricResultDto }) metric: MetricResultDto;
}
@ApiExtraModels(StealChallengeDto)
export class ParticipantStealsDto {
  @ApiProperty() puuid: string;
  @ApiProperty() teamId: number;
  @ApiProperty() championName: string;
  @ApiProperty({ type: MetricResultDto }) objectivesStolen: MetricResultDto;
  @ApiProperty({ type: MetricResultDto })
  objectivesStolenAssists: MetricResultDto;
  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(StealChallengeDto) },
  })
  challenges: Record<string, StealChallengeDto>;
  @ApiProperty({
    type: MetricResultDto,
    description:
      'Literal optional challenge bountyGold; never added to event bounty/shutdown.',
  })
  bountyGold: MetricResultDto;
  @ApiProperty() interpretation: string;
}
export class LiteralBountyRewardDto {
  @ApiProperty() eventId: string;
  @ApiProperty() type: string;
  @ApiProperty({ type: Number, nullable: true }) timestampMs: number | null;
  @ApiProperty({ type: String, nullable: true }) actorPuuid: string | null;
  @ApiProperty({ type: String, nullable: true }) actorReason: string | null;
  @ApiProperty({ type: Number, nullable: true }) sourceKillerId: number | null;
  @ApiProperty({ type: Number, nullable: true }) sourceTeamId: number | null;
  @ApiProperty({ type: Number, nullable: true }) ownerTeamId: number | null;
  @ApiProperty({ type: Number, nullable: true }) beneficiaryTeamId:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true }) objectiveType: string | null;
  @ApiProperty({ type: MetricResultDto }) bounty: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) shutdownBounty: MetricResultDto;
  @ApiProperty({ type: 'object', additionalProperties: true }) quality: Record<
    string,
    unknown
  >;
}
export class BountyCoverageDto {
  @ApiProperty() terminalObserved: boolean;
  @ApiProperty({ type: Number, nullable: true }) gameEndMs: number | null;
  @ApiProperty() boundaryEvents: number;
  @ApiProperty() windows: number;
  @ApiProperty() censoredStartWindows: number;
  @ApiProperty() censoredEndWindows: number;
  @ApiProperty() unknownTeamBoundaries: number;
  @ApiProperty({ type: [String] }) issues: string[];
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
}
export class BountyContractsDto {
  @ApiProperty({ example: 1 }) definitionVersion: number;
  @ApiProperty({ example: 1 }) eventProjectionVersion: number;
  @ApiProperty({ example: 1 }) finalStatsProjectionVersion: number;
  @ApiProperty({ example: 1 }) challengeCatalogVersion: number;
  @ApiProperty({ example: '16.2' }) fixtureValidatedPatch: string;
  @ApiProperty() currentPatchFixtureValidated: boolean;
  @ApiProperty() crossPatchPolicy: string;
}
export class BountiesStealsReportDto {
  @ApiProperty({ type: BountyContractsDto }) contracts: BountyContractsDto;
  @ApiProperty({ type: BountyCoverageDto }) coverage: BountyCoverageDto;
  @ApiProperty({ type: [BountyWindowDto] }) windows: BountyWindowDto[];
  @ApiProperty({ type: [ParticipantStealsDto] })
  participants: ParticipantStealsDto[];
  @ApiProperty({ type: [LiteralBountyRewardDto] })
  literalRewards: LiteralBountyRewardDto[];
  @ApiProperty() interpretation: string;
}
export class MatchBountiesStealsDto {
  @ApiProperty() matchId: string;
  @ApiProperty() gameVersion: string;
  @ApiProperty({ example: 1 }) metricVersion: number;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  processedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: BountiesStealsReportDto, nullable: true })
  report: BountiesStealsReportDto | null;
}
