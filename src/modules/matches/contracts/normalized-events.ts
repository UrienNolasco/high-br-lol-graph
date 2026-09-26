/** Quality metadata recorded without discarding the source timeline event. */
export interface EventQuality {
  unknownType: boolean;
  missingFields: string[];
  invalidFields: string[];
  sentinelFields: string[];
  unresolvedParticipantIds: number[];
  conflicts: string[];
}

/**
 * Canonical loss-aware timeline event. All timestamps and positions use the
 * Riot payload units: milliseconds and map coordinates, respectively.
 */
export interface NormalizedTimelineEvent {
  matchId: string;
  frameIndex: number;
  eventIndex: number;
  type: string | null;
  timestampMs: number | null;
  frameTimestampMs: number | null;
  actorParticipantId: number | null;
  actorPuuid: string | null;
  victimParticipantId: number | null;
  victimPuuid: string | null;
  assistingParticipantIds: number[] | null;
  assistingPuuids: (string | null)[] | null;
  sourceTeamId: number | null;
  ownerTeamId: number | null;
  beneficiaryTeamId: number | null;
  positionX: number | null;
  positionY: number | null;
  lane: string | null;
  tier: string | null;
  payload: Record<string, unknown>;
  quality: EventQuality;
  metricVersion: number;
  processingVersion: number;
}
