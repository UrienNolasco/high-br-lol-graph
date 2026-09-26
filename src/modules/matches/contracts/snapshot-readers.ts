import { selectCheckpoint, CheckpointMode } from './temporal';
import type {
  SnapshotFrame,
  TimelineSnapshotProjection,
} from './normalized-snapshots';
export const SNAPSHOT_PROJECTION_VERSION = 1;
const object = (value: unknown): Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/** Read only supported persisted envelopes; older/missing projections are unavailable. */
export function readSnapshotProjection(
  value: unknown,
): TimelineSnapshotProjection | null {
  const p = object(value);
  if (
    p.projectionVersion !== SNAPSHOT_PROJECTION_VERSION ||
    !Array.isArray(p.frames)
  )
    return null;
  return p as TimelineSnapshotProjection;
}

export function snapshotCheckpoint(
  projection: TimelineSnapshotProjection,
  participantId: number,
  targetMs: number,
  fallbackDurationMs: number,
  mode: CheckpointMode = 'nearest',
) {
  const candidates = projection.frames.filter(
    (frame): frame is SnapshotFrame & { timestamp: number } =>
      frame.timestamp !== null,
  );
  const checkpoint = selectCheckpoint(
    candidates,
    targetMs,
    projection.observedEndMs ?? fallbackDurationMs,
    mode,
  );
  const snapshot =
    checkpoint.frame?.participantFrames[String(participantId)] ?? null;
  return {
    ...checkpoint,
    snapshot,
    reason:
      checkpoint.reason ??
      (snapshot === null ? 'missing_participant_frame' : null),
  };
}

/** Legacy Int[] cannot encode absence/timestamps. Never use these arrays for new metrics. */
export function legacyMinuteGraphs(
  projection: TimelineSnapshotProjection,
  puuid: string,
) {
  const lastMs = projection.frames.at(-1)?.timestamp;
  const length = Math.ceil((lastMs ?? 0) / 60000) || 40;
  const result = {
    goldGraph: Array<number>(length).fill(0),
    xpGraph: Array<number>(length).fill(0),
    csGraph: Array<number>(length).fill(0),
    damageGraph: Array<number>(length).fill(0),
  };
  for (const frame of projection.frames) {
    if (frame.timestamp === null) continue;
    const p = Object.values(frame.participantFrames).find(
      (p) => p.puuid === puuid,
    );
    if (!p) continue;
    const minute = Math.floor(frame.timestamp / 60000);
    result.goldGraph[minute] = p.totalGold ?? 0;
    result.xpGraph[minute] = p.xp ?? 0;
    result.csGraph[minute] =
      p.minionsKilled === null || p.jungleMinionsKilled === null
        ? 0
        : p.minionsKilled + p.jungleMinionsKilled;
    result.damageGraph[minute] = p.damageStats?.totalDamageDoneToChampions ?? 0;
  }
  return result;
}
