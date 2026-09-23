import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { MetricResultDto } from '../../../core/metrics/metric-result.dto';
class PositionDto {
  @ApiProperty() x: number;
  @ApiProperty() y: number;
}
export class ObjectiveChronologyDto {
  @ApiProperty() eventId: string;
  @ApiProperty({ enum: ['O01', 'O04'] }) metricId: string;
  @ApiProperty() metricVersion: number;
  @ApiProperty() processingVersion: number;
  @ApiProperty({ format: 'date-time' }) processedAt: string;
  @ApiProperty() frameIndex: number;
  @ApiProperty() eventIndex: number;
  @ApiProperty({ type: Number, nullable: true }) timestampMs: number | null;
  @ApiProperty() type: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Normalized category; null preserves an unknown source type.',
  })
  objective: string | null;
  @ApiProperty({ type: String, nullable: true }) rawObjectiveType:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) subtype: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['early', 'mid', 'late'] })
  phase: string | null;
  @ApiProperty({ type: Number, nullable: true }) actorParticipantId:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true }) actorPuuid: string | null;
  @ApiProperty({ type: String, nullable: true }) actorReason: string | null;
  @ApiProperty({ type: [Number], nullable: true }) assistingParticipantIds:
    | number[]
    | null;
  @ApiProperty({
    type: 'array',
    nullable: true,
    items: { type: 'string', nullable: true },
  })
  assistingPuuids: (string | null)[] | null;
  @ApiProperty({ type: String, nullable: true }) assistsReason: string | null;
  @ApiProperty({ type: Number, nullable: true }) sourceTeamId: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Team owning the destroyed structure.',
  })
  ownerTeamId: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Beneficiary from normalized semantics; soul source teamId=0 stays null.',
  })
  beneficiaryTeamId: number | null;
  @ApiProperty({ type: String, nullable: true }) beneficiaryReason:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) lane: string | null;
  @ApiProperty({ type: String, nullable: true }) tier: string | null;
  @ApiProperty({ type: PositionDto, nullable: true })
  position: PositionDto | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Literal source killerId, including sentinel zero; never a player identity.',
  })
  sourceKillerId: number | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) quality: Record<
    string,
    unknown
  >;
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Stable event IDs, source field and timestamp.',
  })
  evidence: unknown[];
}
export class ObjectiveGroupDto {
  @ApiProperty({ type: Number, nullable: true }) beneficiaryTeamId:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) ownerTeamId: number | null;
  @ApiProperty({ type: String, nullable: true }) lane: string | null;
  @ApiProperty({ type: String, nullable: true }) tier: string | null;
  @ApiProperty({ type: String, nullable: true }) phase: string | null;
  @ApiProperty({ type: MetricResultDto }) count: MetricResultDto;
}
export class StructureGroupDto extends ObjectiveGroupDto {
  @ApiProperty({ enum: ['tower', 'inhibitor'] }) objective: string;
}
export class ObjectiveFinalCountDto {
  @ApiProperty({ type: String, nullable: true }) firstReason: string | null;
  @ApiProperty({ type: String, nullable: true }) lostReason: string | null;
  @ApiProperty({ type: MetricResultDto }) kills: MetricResultDto;
  @ApiProperty({ type: Boolean, nullable: true }) first: boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) lost: boolean | null;
}
@ApiExtraModels(ObjectiveFinalCountDto)
export class ObjectiveFinalTotalsDto {
  @ApiProperty() teamId: number;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(ObjectiveFinalCountDto) },
    description:
      'Final MatchTeam.finalObjectives observations, separate from event counts. Includes future categories.',
  })
  objectives: Record<string, ObjectiveFinalCountDto>;
}
export class ObjectiveReconciliationDto {
  @ApiProperty() teamId: number;
  @ApiProperty() objective: string;
  @ApiProperty({ type: MetricResultDto }) finalCount: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) timelineCount: MetricResultDto;
  @ApiProperty({ type: Boolean, nullable: true }) matches: boolean | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Timeline count minus final count; null if either unavailable.',
  })
  difference: number | null;
}
export class RegisteredObjectiveContributionDto {
  @ApiProperty({ type: MetricResultDto }) lastHits: MetricResultDto;
  @ApiProperty({
    type: MetricResultDto,
    description:
      'Count of distinct events explicitly naming participant as author or assistant, a lower bound on presence.',
  })
  participations: MetricResultDto;
  @ApiProperty() unknownActors: number;
  @ApiProperty() missingAssistantLists: number;
}
@ApiExtraModels(RegisteredObjectiveContributionDto)
export class ObjectiveParticipantDto {
  @ApiProperty() puuid: string;
  @ApiProperty() teamId: number;
  @ApiProperty() championName: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: {
      $ref: getSchemaPath(RegisteredObjectiveContributionDto),
    },
  })
  registeredEvents: Record<string, RegisteredObjectiveContributionDto>;
  @ApiProperty({ type: MetricResultDto }) turretDamage: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) turretDamageShare: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) turretKills: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) turretTakedowns: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) buildingDamage: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) objectiveDamage: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) epicMonsterDamage: MetricResultDto;
}
export class ObjectiveCoverageDto {
  @ApiProperty() completeTimeline: boolean;
  @ApiProperty({ type: Number, nullable: true }) endMs: number | null;
  @ApiProperty() validTimestampEvents: number;
  @ApiProperty() totalEvents: number;
  @ApiProperty() unknownObjectiveEvents: number;
  @ApiProperty() unknownActorEvents: number;
  @ApiProperty() unknownBeneficiaryEvents: number;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
}
export class ObjectiveStructuresDto {
  @ApiProperty({ type: MetricResultDto }) towers: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) inhibitors: MetricResultDto;
  @ApiProperty({ type: [StructureGroupDto] }) groups: StructureGroupDto[];
}
export class ObjectivePlatesDto {
  @ApiProperty({ type: MetricResultDto }) total: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) killerIdZero: MetricResultDto;
  @ApiProperty({ type: [ObjectiveGroupDto] }) groups: ObjectiveGroupDto[];
}
export class ObjectivesReportDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Descriptive bins [0,14min), [14min,25min), [25min,game end]. No plate validity rule.',
  })
  phaseDefinition: Record<string, string>;
  @ApiProperty({ type: ObjectiveCoverageDto }) coverage: ObjectiveCoverageDto;
  @ApiProperty({ type: [ObjectiveChronologyDto] })
  chronology: ObjectiveChronologyDto[];
  @ApiProperty({ type: [ObjectiveFinalTotalsDto] })
  finalTotals: ObjectiveFinalTotalsDto[];
  @ApiProperty({ type: [ObjectiveReconciliationDto] })
  reconciliation: ObjectiveReconciliationDto[];
  @ApiProperty({ type: [ObjectiveParticipantDto] })
  participantContributions: ObjectiveParticipantDto[];
  @ApiProperty({ type: ObjectiveStructuresDto })
  structures: ObjectiveStructuresDto;
  @ApiProperty({ type: ObjectivePlatesDto }) plates: ObjectivePlatesDto;
  @ApiProperty() interpretation: string;
}
export class MatchObjectivesDto {
  @ApiProperty() matchId: string;
  @ApiProperty() gameVersion: string;
  @ApiProperty() metricVersion: number;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  processedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({
    type: ObjectivesReportDto,
    nullable: true,
    description:
      'Null without committed source provenance or compatible unique event projection. Missing timeline coverage preserves final observations and marks event aggregates unavailable.',
  })
  report: ObjectivesReportDto | null;
}
