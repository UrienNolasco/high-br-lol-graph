import { gunzipSync } from 'node:zlib';
import { readSnapshotProjection } from '../../../core/riot/timeline-snapshots';
import type { SnapshotFrame } from '../../matches/contracts/normalized-snapshots';
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
export interface FrameParticipant {
  totalGold?: number | null;
  xp?: number | null;
  minionsKilled?: number | null;
  jungleMinionsKilled?: number | null;
}
export interface Frame {
  timestamp: number;
  frameIndex: number;
  participantFrames: Record<string, FrameParticipant>;
}
export interface ComparisonTimeline {
  frames: Frame[];
  participants: { participantId: number; puuid: string }[];
  endMs: number | null;
  reason: string | null;
}

/** API path: persisted snapshots only; no decompression of MatchRaw during GET. */
export function projectionComparisonTimeline(
  value: unknown,
): ComparisonTimeline {
  const projection = readSnapshotProjection(value);
  if (!projection)
    return {
      frames: [],
      participants: [],
      endMs: null,
      reason: 'missing_projection',
    };
  const participants = new Map<
    string,
    { participantId: number; puuid: string }
  >();
  for (const frame of projection.frames)
    for (const p of Object.values(frame.participantFrames)) {
      if (p.puuid !== null)
        participants.set(`${p.participantId}:${p.puuid}`, {
          participantId: p.participantId,
          puuid: p.puuid,
        });
    }
  return {
    frames: projection.frames.filter(
      (f): f is SnapshotFrame & { timestamp: number } => finite(f.timestamp),
    ),
    participants: [...participants.values()],
    endMs: projection.observedEndMs,
    reason: null,
  };
}

/** Raw timestamps are required: compact legacy arrays cannot prove a checkpoint time. */
export function decodeComparisonTimeline(
  bytes?: Uint8Array | null,
): ComparisonTimeline {
  const absent = (reason: string): ComparisonTimeline => ({
    frames: [],
    participants: [],
    endMs: null,
    reason,
  });
  if (!bytes) return absent('missing_timeline');
  try {
    const timeline = JSON.parse(gunzipSync(bytes).toString('utf8'));
    if (
      !Array.isArray(timeline?.info?.frames) ||
      !Array.isArray(timeline?.info?.participants)
    )
      return absent('invalid_timeline');
    const frames: Frame[] = timeline.info.frames.flatMap((f, frameIndex) =>
      finite(f?.timestamp) &&
      f.timestamp >= 0 &&
      f.participantFrames &&
      typeof f.participantFrames === 'object'
        ? [
            {
              timestamp: f.timestamp,
              frameIndex,
              participantFrames: f.participantFrames,
            },
          ]
        : [],
    );
    const ends: number[] = timeline.info.frames.flatMap((f) =>
      Array.isArray(f?.events)
        ? f.events
            .filter(
              (e) =>
                e?.type === 'GAME_END' &&
                finite(e.timestamp) &&
                e.timestamp >= 0 &&
                [100, 200].includes(e.winningTeam),
            )
            .map((e) => e.timestamp)
        : [],
    );
    return {
      frames,
      participants: timeline.info.participants.filter(
        (p) =>
          Number.isInteger(p?.participantId) && typeof p?.puuid === 'string',
      ),
      endMs: ends.length ? Math.max(...ends) : null,
      reason: null,
    };
  } catch {
    return absent('invalid_timeline');
  }
}
