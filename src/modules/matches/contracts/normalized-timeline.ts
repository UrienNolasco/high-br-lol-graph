import type { NormalizedTimelineEvent } from './normalized-events';
import type { TimelineSnapshotProjection } from './normalized-snapshots';

export interface PositionEvent {
  x: number;
  y: number;
  /** Milliseconds from game start. */
  timestamp: number;
}

export interface WardEvent {
  x: number | null;
  y: number | null;
  /** Milliseconds from game start. */
  timestamp: number;
  wardType: string;
}

export interface ItemEvent {
  itemId: number;
  /** Milliseconds from game start. */
  timestamp: number;
  type: 'BUY' | 'SELL' | 'UNDO';
}

export interface PathPoint {
  x?: number;
  y?: number;
  /** Milliseconds from game start. */
  time: number;
}

export interface ParticipantTimelineData {
  /** Legacy minute-indexed series. */
  goldGraph: number[];
  xpGraph: number[];
  csGraph: number[];
  damageGraph: number[];
  deathPositions: PositionEvent[];
  killPositions: PositionEvent[];
  wardPositions: WardEvent[];
  pathingSample: PathPoint[];
  skillOrder: string[];
  itemTimeline: ItemEvent[];
}

export interface ObjectiveEvent {
  type:
    | 'DRAGON'
    | 'BARON_NASHOR'
    | 'RIFTHERALD'
    | 'HORDE'
    | 'TOWER'
    | 'INHIBITOR';
  subType?: string;
  teamId: number | null;
  ownerTeamId?: number | null;
  lane?: string | null;
  tier?: string | null;
  assistingParticipantIds?: number[] | null;
  /** Milliseconds from game start. */
  timestamp: number;
  killerId?: number;
}

export interface ParsedTimelineData {
  snapshotProjection: TimelineSnapshotProjection;
  /** Participant data indexed by PUUID. */
  participants: Map<string, ParticipantTimelineData>;
  objectivesTimeline: ObjectiveEvent[];
  normalizedEvents: NormalizedTimelineEvent[];
}
