import type {
  TimelineSnapshotProjection,
  SnapshotFrame,
} from './normalized-snapshots';
import type { MetricEvidence } from './metric-contract';

export const MATCH_REVIEW_VERSION = 1;
export interface ReviewParticipant {
  puuid: string;
  teamId: number;
  role: string | null;
  championName: string;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  finalStats: unknown;
}
export interface ReviewEvent {
  matchId: string;
  frameIndex: number;
  eventIndex: number;
  type: string | null;
  timestampMs: number | null;
  actorParticipantId: number | null;
  actorPuuid: string | null;
  victimParticipantId?: number | null;
  victimPuuid: string | null;
  assistingParticipantIds: unknown;
  assistingPuuids: unknown;
  sourceTeamId: number | null;
  payload: unknown;
  quality: unknown;
  metricVersion: number;
  processingVersion: number;
}
export interface MatchReviewInput {
  matchId: string;
  gameDuration: number;
  gameVersion: string;
  queueId: number;
  mapId: number;
  participants: ReviewParticipant[];
  projection: TimelineSnapshotProjection | null;
  events: ReviewEvent[];
  processing: {
    status: string;
    processingVersion: number | null;
    completedAt: Date | null;
  } | null;
  readLimits?: { eventsTruncated: boolean; framesTruncated: boolean };
}
export interface ReviewKill {
  eventId: string;
  timestampMs: number;
  frameIndex: number;
  eventIndex: number;
  killerPuuid: string | null;
  victimPuuid: string;
  assistingPuuids: string[];
  assistanceComplete: boolean;
  payload: Record<string, unknown>;
}
export interface MatchReviewContext {
  input: MatchReviewInput;
  sourceReason: string | null;
  snapshotReason: string | null;
  combatReason: string | null;
  processedAt: string | null;
  processingVersion: number | null;
  endMs: number | null;
  frames: SnapshotFrame[];
  kills: ReviewKill[];
  participantIds: Map<number, string>;
}
export interface ReviewValue {
  value: number | null;
  unit: string;
  reason: string | null;
  origin: 'observed' | 'derived' | 'unavailable';
  evidence: MetricEvidence[];
}
export interface ReviewEventReference {
  eventId: string;
  timestampMs: number;
  killerPuuid: string | null;
  victimPuuid: string;
}
export interface ReviewCombatWindow {
  startMs: number;
  endMs: number;
  bounds: '(]';
  kills: number;
  deaths: number;
  recordedAssists: number;
  assists: number | null;
  reason: string | null;
  events: ReviewEventReference[];
  unknownAssistEventIds: string[];
}
