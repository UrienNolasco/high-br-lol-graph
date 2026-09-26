import { ApiProperty } from '@nestjs/swagger';
import { MetricResultDto } from './metric-result.dto';
export class EpisodeThresholdsDto {
  @ApiProperty({ enum: ['tight', 'default', 'loose'] }) profile: string;
  @ApiProperty({ example: 15000 }) gapMs: number;
  @ApiProperty({ example: 30000 }) maxSpanMs: number;
  @ApiProperty({
    example: 2000,
    description:
      'Euclidean distance in Riot map units, applied to every pair in a cluster.',
  })
  diameterUnits: number;
  @ApiProperty({
    example: 10000,
    description: 'Strictly positive latency, inclusive upper bound.',
  })
  tradeMs: number;
  @ApiProperty({ example: 2000 }) tradeDistanceUnits: number;
  @ApiProperty({ example: 60000 }) maxSnapshotAgeMs: number;
}
export class EpisodeDefinitionDto {
  @ApiProperty({ example: 1 }) version: number;
  @ApiProperty({ type: EpisodeThresholdsDto }) thresholds: EpisodeThresholdsDto;
  @ApiProperty() grouping: string;
  @ApiProperty() quickTrade: string;
}
export class LocatedKillDto {
  @ApiProperty() eventId: string;
  @ApiProperty() timestampMs: number;
  @ApiProperty() frameIndex: number;
  @ApiProperty() eventIndex: number;
  @ApiProperty() x: number;
  @ApiProperty() y: number;
  @ApiProperty({ type: String, nullable: true }) actorPuuid: string | null;
  @ApiProperty({ type: String, nullable: true }) victimPuuid: string | null;
  @ApiProperty({ type: Number, nullable: true }) actorTeamId: number | null;
  @ApiProperty({ type: Number, nullable: true }) victimTeamId: number | null;
  @ApiProperty({
    type: [String],
    description:
      'Known valid registered assistants; unknown assistance is exposed separately.',
  })
  assistingPuuids: string[];
}
export class EpisodeParticipantResourcesDto {
  @ApiProperty() puuid: string;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({
    type: MetricResultDto,
    description:
      'Observed currentGold at the dated previous snapshot; zero is valid.',
  })
  currentGold: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) totalGold: MetricResultDto;
  @ApiProperty({
    type: MetricResultDto,
    description:
      'Estimated proxy for resources before episode, never exact inventory at start.',
  })
  unspentGoldProxy: MetricResultDto;
  @ApiProperty({
    type: MetricResultDto,
    description:
      '100*currentGold/totalGold in the same previous snapshot; null with zero or absent denominator.',
  })
  unspentShare: MetricResultDto;
}
export class EpisodeResourcesDto {
  @ApiProperty() episodeId: string;
  @ApiProperty() selection: string;
  @ApiProperty({ type: Number, nullable: true }) snapshotFrameIndex:
    | number
    | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Strictly less than episode start, never equal.',
  })
  snapshotTimestampMs: number | null;
  @ApiProperty({ type: Number, nullable: true }) ageMs: number | null;
  @ApiProperty() maxAgeMs: number;
  @ApiProperty() stale: boolean;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: [EpisodeParticipantResourcesDto] })
  participants: EpisodeParticipantResourcesDto[];
}
export class EpisodeTeamBalanceDto {
  @ApiProperty() teamId: number;
  @ApiProperty({
    description:
      'Known registered authors on this team, lower bound if attribution incomplete.',
  })
  killsRegistered: number;
  @ApiProperty({
    description:
      'Known registered victims on this team, lower bound if attribution incomplete.',
  })
  deathsRegistered: number;
  @ApiProperty() attributionComplete: boolean;
  @ApiProperty({ type: MetricResultDto }) net: MetricResultDto;
}
export class KillEpisodeDto {
  @ApiProperty() episodeId: string;
  @ApiProperty() startMs: number;
  @ApiProperty() endMs: number;
  @ApiProperty() durationMs: number;
  @ApiProperty({ type: [String] }) eventIds: string[];
  @ApiProperty({ type: [LocatedKillDto] }) events: LocatedKillDto[];
  @ApiProperty({
    type: [String],
    description:
      'Retrospective union of registered authors, victims and known assistants; not everybody present.',
  })
  participantPuuids: string[];
  @ApiProperty({ type: [String] }) unknownAssistanceEventIds: string[];
  @ApiProperty({ type: MetricResultDto }) killEvents: MetricResultDto;
  @ApiProperty({ type: [EpisodeTeamBalanceDto] })
  teamBalance: EpisodeTeamBalanceDto[];
  @ApiProperty({ type: EpisodeResourcesDto }) resources: EpisodeResourcesDto;
}
export class QuickTradeDto {
  @ApiProperty() deathEventId: string;
  @ApiProperty() responseEventId: string;
  @ApiProperty() respondingTeamId: number;
  @ApiProperty() latencyMs: number;
  @ApiProperty() distanceUnits: number;
  @ApiProperty({
    description:
      'Literal identity comparison, not proof of intent or causation.',
  })
  killedOriginalAuthor: boolean;
  @ApiProperty() deathEpisodeId: string;
  @ApiProperty() responseEpisodeId: string;
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  evidence: unknown[];
}
export class UnassignedKillDto {
  @ApiProperty() eventId: string;
  @ApiProperty() reason: string;
  @ApiProperty({ type: Number, nullable: true }) timestampMs: number | null;
}
export class EpisodeSensitivityDto {
  @ApiProperty({ type: String, nullable: true }) tradeReason: string | null;
  @ApiProperty({ type: EpisodeThresholdsDto }) thresholds: EpisodeThresholdsDto;
  @ApiProperty({
    description:
      'Descriptive count on the located observed subset; consult reason/coverage before interpreting a complete match.',
  })
  observedEpisodeCount: number;
  @ApiProperty() observedQuickTradeCount: number;
  @ApiProperty() multiKillEpisodes: number;
  @ApiProperty() largestEpisodeKillCount: number;
  @ApiProperty({
    description:
      'Symmetric difference in unordered event pairs sharing an episode versus default; not a statistical confidence interval.',
  })
  coClusterPairChangesFromDefault: number;
  @ApiProperty() quickTradePairChangesFromDefault: number;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
}
export class KillEpisodeCoverageDto {
  @ApiProperty() sourceKillEvents: number;
  @ApiProperty() assignedKillEvents: number;
  @ApiProperty() unassignedKillEvents: number;
  @ApiProperty() excludedEnvironmentalEvents: number;
  @ApiProperty() unknownTradeTeamEvents: number;
  @ApiProperty({ type: String, nullable: true }) tradeReason: string | null;
  @ApiProperty() knownTradeTeamEvents: number;
  @ApiProperty() unknownAssistanceEvents: number;
  @ApiProperty() unknownSourceEvents: number;
  @ApiProperty() terminalObserved: boolean;
  @ApiProperty() summaryReconciled: boolean;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
}
export class KillEpisodesReportDto {
  @ApiProperty({ type: EpisodeDefinitionDto }) definition: EpisodeDefinitionDto;
  @ApiProperty({ type: KillEpisodeCoverageDto })
  coverage: KillEpisodeCoverageDto;
  @ApiProperty({ type: MetricResultDto }) episodeCount: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) quickTradeCount: MetricResultDto;
  @ApiProperty({ type: [KillEpisodeDto] }) episodes: KillEpisodeDto[];
  @ApiProperty({ type: [QuickTradeDto] }) quickTrades: QuickTradeDto[];
  @ApiProperty({ type: [UnassignedKillDto] }) unassigned: UnassignedKillDto[];
  @ApiProperty({ type: [EpisodeSensitivityDto] })
  sensitivity: EpisodeSensitivityDto[];
  @ApiProperty() interpretation: string;
}
export class MatchKillEpisodesDto {
  @ApiProperty() matchId: string;
  @ApiProperty() gameVersion: string;
  @ApiProperty({ example: 1 }) metricVersion: number;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  processedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({
    type: KillEpisodesReportDto,
    nullable: true,
    description:
      'Null with absent processing provenance, unsupported map/generation or duplicate source identity; partial grouping exposes unassigned events and unavailable match aggregates.',
  })
  report: KillEpisodesReportDto | null;
}
