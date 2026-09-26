import { ApiProperty } from '@nestjs/swagger';
import { MetricResultDto } from './metric-result.dto';
export class SequenceEvidenceDto {
  @ApiProperty() eventId: string;
  @ApiProperty() frameIndex: number;
  @ApiProperty() eventIndex: number;
  @ApiProperty() timestampMs: number;
  @ApiProperty() type: string;
  @ApiProperty({ type: String, nullable: true }) objective: string | null;
  @ApiProperty({ type: Number, nullable: true }) teamId: number | null;
  @ApiProperty({ type: String, nullable: true }) lane: string | null;
}
export class SequenceEpisodeDto {
  @ApiProperty({ type: SequenceEvidenceDto }) event: SequenceEvidenceDto;
  @ApiProperty() subjectId: string;
  @ApiProperty() windowMs: number;
  @ApiProperty() windowEndMs: number;
  @ApiProperty({ type: Number, nullable: true }) observedUntilMs: number | null;
  @ApiProperty() eligible: boolean;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: [SequenceEvidenceDto] })
  objectives: SequenceEvidenceDto[];
}
export class SequenceRateDto {
  @ApiProperty() subjectId: string;
  @ApiProperty() windowMs: number;
  @ApiProperty() eligibleEvents: number;
  @ApiProperty() censoredEvents: number;
  @ApiProperty() associatedEvents: number;
  @ApiProperty({ type: MetricResultDto }) rate: MetricResultDto;
}
export class SequenceGoldFrameDto {
  @ApiProperty() frameIndex: number;
  @ApiProperty() timestampMs: number;
  @ApiProperty() targetMs: number;
  @ApiProperty() offsetMs: number;
  @ApiProperty({ type: Number, nullable: true }) blueGold: number | null;
  @ApiProperty({ type: Number, nullable: true }) redGold: number | null;
  @ApiProperty({ type: Number, nullable: true }) difference: number | null;
}
export class ObjectiveGoldChangeDto {
  @ApiProperty({ type: SequenceEvidenceDto }) objective: SequenceEvidenceDto;
  @ApiProperty({ type: SequenceGoldFrameDto, nullable: true })
  before: SequenceGoldFrameDto | null;
  @ApiProperty({ type: SequenceGoldFrameDto, nullable: true })
  after: SequenceGoldFrameDto | null;
  @ApiProperty({ type: MetricResultDto }) delta: MetricResultDto;
}
export class SequenceTradeDto {
  @ApiProperty({ type: SequenceEvidenceDto }) first: SequenceEvidenceDto;
  @ApiProperty({ type: SequenceEvidenceDto }) second: SequenceEvidenceDto;
  @ApiProperty() elapsedMs: number;
}
export class SequenceSignChangeDto {
  @ApiProperty({ type: SequenceGoldFrameDto }) before: SequenceGoldFrameDto;
  @ApiProperty({ type: SequenceGoldFrameDto }) after: SequenceGoldFrameDto;
}
export class SequencePersistentLeadDto {
  @ApiProperty() frameIndex: number;
  @ApiProperty() timestampMs: number;
  @ApiProperty() winnerGoldAdvantage: number;
  @ApiProperty() subsequentSamples: number;
}
export class SequenceComebackDto {
  @ApiProperty({ type: Number, nullable: true }) winnerTeamId: number | null;
  @ApiProperty({ type: MetricResultDto })
  largestObservedDeficit: MetricResultDto;
  @ApiProperty({ type: SequencePersistentLeadDto, nullable: true })
  firstPersistentLead: SequencePersistentLeadDto | null;
  @ApiProperty({ type: String, nullable: true }) persistenceReason:
    | string
    | null;
  @ApiProperty({ type: [SequenceSignChangeDto] })
  signChanges: SequenceSignChangeDto[];
  @ApiProperty({ type: Number, nullable: true }) finalSampleMs: number | null;
}
export class SequenceCoverageDto {
  @ApiProperty({ type: Number, nullable: true }) observedEndMs: number | null;
  @ApiProperty() uniqueEvents: number;
  @ApiProperty() identicalDuplicatesRemoved: number;
  @ApiProperty() invalidTimestampEvents: number;
  @ApiProperty() unknownObjectiveTeams: number;
  @ApiProperty() unknownKillTeamsOrVictims: number;
  @ApiProperty({ type: String, nullable: true }) rateUnavailableReason:
    | string
    | null;
}
export class SequenceParametersDto {
  @ApiProperty() version: number;
  @ApiProperty() deathWindowMs: number;
  @ApiProperty({ type: [Number] }) killWindowsMs: number[];
  @ApiProperty() goldAfterMs: number;
  @ApiProperty() frameToleranceMs: number;
  @ApiProperty() tradeWindowMs: number;
  @ApiProperty({ enum: ['(]'] }) eventBounds: string;
  @ApiProperty({ enum: ['pastOnly'] }) checkpointMode: string;
  @ApiProperty({ type: [String] }) objectiveTypes: string[];
}
export class SequencesValueDto {
  @ApiProperty({ type: SequenceCoverageDto }) coverage: SequenceCoverageDto;
  @ApiProperty({ type: [SequenceEpisodeDto] })
  deathEpisodes: SequenceEpisodeDto[];
  @ApiProperty({ type: [SequenceRateDto] }) deathRates: SequenceRateDto[];
  @ApiProperty({ type: [SequenceEpisodeDto] })
  killEpisodes: SequenceEpisodeDto[];
  @ApiProperty({ type: [SequenceRateDto] }) killRates: SequenceRateDto[];
  @ApiProperty({ type: [ObjectiveGoldChangeDto] })
  goldChanges: ObjectiveGoldChangeDto[];
  @ApiProperty({ type: [SequenceTradeDto] }) temporalTrades: SequenceTradeDto[];
  @ApiProperty({ type: SequenceComebackDto }) comeback: SequenceComebackDto;
  @ApiProperty({ type: [String] }) limitations: string[];
}
export class MatchSequencesDto {
  @ApiProperty() matchId: string;
  @ApiProperty({ type: String, nullable: true }) gameVersion: string | null;
  @ApiProperty({ type: Number, nullable: true }) mapId: number | null;
  @ApiProperty() metricVersion: number;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  processedAt: string | null;
  @ApiProperty({ type: SequenceParametersDto })
  parameters: SequenceParametersDto;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: SequencesValueDto, nullable: true })
  report: SequencesValueDto | null;
}
