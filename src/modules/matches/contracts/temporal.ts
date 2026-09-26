export const CHECKPOINT_TOLERANCE_MS = 60_000;
export const LEGACY_LANE_CHECKPOINT = {
  metricVersion: 0,
  mode: 'first_in_window',
  startMs: 900_000,
  endMs: 960_000,
  bounds: '[)',
} as const;
export type CheckpointMode = 'nearest' | 'pastOnly';
export interface TimestampedFrame {
  timestamp: number;
  frameIndex?: number;
}
export type Checkpoint<T> = {
  targetMs: number;
  mode: CheckpointMode;
  toleranceMs: number;
} & (
  | { frame: T; timestampMs: number; offsetMs: number; reason: null }
  | {
      frame: null;
      timestampMs: null;
      offsetMs: null;
      reason: 'short_match' | 'missing_frame';
    }
);

/** Stable tie: previous timestamp, then frameIndex, then original input order. */
export function selectCheckpoint<T extends TimestampedFrame>(
  frames: readonly T[],
  targetMs: number,
  durationMs: number,
  mode: CheckpointMode = 'nearest',
  toleranceMs = CHECKPOINT_TOLERANCE_MS,
): Checkpoint<T> {
  if (
    ![targetMs, durationMs, toleranceMs].every(
      (n) => Number.isFinite(n) && n >= 0,
    )
  )
    throw new RangeError('Invalid checkpoint time');
  const base = { targetMs, mode, toleranceMs };
  const absent = (reason: 'short_match' | 'missing_frame'): Checkpoint<T> => ({
    ...base,
    frame: null,
    timestampMs: null,
    offsetMs: null,
    reason,
  });
  if (durationMs < targetMs) return absent('short_match');
  const frame = frames
    .filter(
      (f) =>
        Number.isFinite(f.timestamp) &&
        f.timestamp >= 0 &&
        f.timestamp <= durationMs &&
        Math.abs(f.timestamp - targetMs) <= toleranceMs &&
        (mode !== 'pastOnly' || f.timestamp <= targetMs),
    )
    .sort(
      (a, b) =>
        Math.abs(a.timestamp - targetMs) - Math.abs(b.timestamp - targetMs) ||
        a.timestamp - b.timestamp ||
        (a.frameIndex ?? 0) - (b.frameIndex ?? 0),
    )[0];
  if (!frame) return absent('missing_frame');
  return {
    ...base,
    frame,
    timestampMs: frame.timestamp,
    offsetMs: frame.timestamp - targetMs,
    reason: null,
  };
}

export interface TemporalWindow {
  startMs: number;
  endMs: number;
  bounds: '[)' | '[]' | '(]';
  observedStartMs: number;
  observedEndMs: number;
  effectiveDurationMs: number;
  censored: boolean;
}
export function temporalWindow(
  startMs: number,
  endMs: number,
  bounds: TemporalWindow['bounds'],
  observedEndMs: number,
): TemporalWindow {
  if (
    ![startMs, endMs, observedEndMs].every(Number.isFinite) ||
    endMs < startMs ||
    observedEndMs < 0
  )
    throw new RangeError('Invalid window');
  const start = Math.max(0, Math.min(startMs, observedEndMs));
  const end = Math.max(0, Math.min(endMs, observedEndMs));
  return {
    startMs,
    endMs,
    bounds,
    observedStartMs: start,
    observedEndMs: end,
    effectiveDurationMs: end - start,
    censored: startMs < 0 || endMs > observedEndMs,
  };
}
export function containsTimestamp(
  window: TemporalWindow,
  timestampMs: number,
): boolean {
  return (
    Number.isFinite(timestampMs) &&
    timestampMs >= window.observedStartMs &&
    timestampMs <= window.observedEndMs &&
    (window.bounds === '(]'
      ? timestampMs > window.startMs
      : timestampMs >= window.startMs) &&
    (window.bounds === '[)'
      ? timestampMs < window.endMs
      : timestampMs <= window.endMs)
  );
}
