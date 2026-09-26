export interface ParticipantSnapshot {
  participantId: number;
  puuid: string | null;
  totalGold: number | null;
  currentGold: number | null;
  xp: number | null;
  level: number | null;
  minionsKilled: number | null;
  jungleMinionsKilled: number | null;
  position: { x: number | null; y: number | null } | null;
  damageStats: Record<string, number | null> | null;
  championStats: Record<string, number | null> | null;
  additionalFields: Record<string, unknown>;
  missingFields: string[];
}

export interface SnapshotFrame {
  frameIndex: number;
  /** Milliseconds from game start. */
  timestamp: number | null;
  participantFrames: Record<string, ParticipantSnapshot>;
}

export interface TimelineSnapshotProjection {
  projectionVersion: number;
  /** Observed cadence in milliseconds when present in the source. */
  frameIntervalMs: number | null;
  /** Observed GAME_END timestamp in milliseconds. */
  observedEndMs: number | null;
  frames: SnapshotFrame[];
}
