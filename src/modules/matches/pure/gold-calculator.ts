import { metricQuality } from '../contracts/metric-contract';
import type { TimelineSnapshotProjection } from '../contracts/normalized-snapshots';

export interface GoldParticipant {
  teamId: number;
  goldGraph: (number | null | undefined)[];
}

export interface GoldDifferenceEntry {
  timestampMs?: number;
  frameIndex?: number;
  minute: number;
  blueTeam: number | null;
  redTeam: number | null;
  difference: number | null;
}

export interface MaxAdvantageEntry {
  timestampMs?: number;
  frameIndex?: number;
  minute: number;
  team: 'blueTeam' | 'redTeam' | null;
  difference: number;
}

export interface ObservedSwingEntry {
  timestampMs?: number;
  beforeTimestampMs?: number;
  minute: number;
  beforeMinute: number;
  beforeDifference: number;
  afterDifference: number;
  swing: number;
}

/** @deprecated Compatibility name; describes observed change, never blame. */
export type ThrowPointEntry = ObservedSwingEntry;

const validGold = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function computeSnapshotGoldTimeline(
  projection: TimelineSnapshotProjection,
  participants: { puuid: string; teamId: number }[],
) {
  return [...projection.frames]
    .filter((frame) => frame.timestamp !== null)
    .sort((a, b) => a.timestamp! - b.timestamp! || a.frameIndex - b.frameIndex)
    .map((frame) => {
      const row = computeGoldTimeline(
        participants.map((p) => {
          const snapshots = Object.values(frame.participantFrames).filter(
            (s) => s.puuid === p.puuid,
          );
          return {
            teamId: p.teamId,
            goldGraph: [snapshots.length === 1 ? snapshots[0].totalGold : null],
          };
        }),
        1,
      )[0];
      return {
        ...row,
        minute: Math.floor(frame.timestamp! / 60000),
        timestampMs: frame.timestamp!,
        frameIndex: frame.frameIndex,
      };
    });
}

export function computeGoldTimeline(
  participants: GoldParticipant[],
  minimumPoints = 0,
) {
  const teams = [100, 200].map((teamId) =>
    participants.filter((p) => p.teamId === teamId),
  );
  const maxMinutes = Math.max(
    minimumPoints,
    ...teams.flat().map((p) => p.goldGraph.length),
  );
  return Array.from({ length: maxMinutes }, (_, minute) => {
    const totals = teams.map((roster) => {
      const samples = roster.map((p) => p.goldGraph[minute]);
      const validSamples = samples.filter(validGold);
      // The legacy two-team timeline represents 5v5. Partial rosters cannot
      // establish a team total, even when every loaded player has a sample.
      const complete = roster.length === 5 && validSamples.length === 5;
      return {
        value: complete
          ? validSamples.reduce((sum, gold) => sum + gold, 0)
          : null,
        reason: complete
          ? null
          : roster.length > 5 || samples.some((v) => v != null && !validGold(v))
            ? 'invalid_value'
            : 'missing_frame',
        quality: metricQuality(validSamples.length, Math.max(5, roster.length)),
      };
    });
    const [blue, red] = totals;
    return {
      minute,
      blueTeam: blue.value,
      redTeam: red.value,
      difference:
        blue.value === null || red.value === null
          ? null
          : blue.value - red.value,
      reason: blue.reason ?? red.reason,
      coverage: { blueTeam: blue.quality, redTeam: red.quality },
      missingReasons: { blueTeam: blue.reason, redTeam: red.reason },
    };
  });
}

/** Match-V5 outcome is authoritative; gold is deliberately not an input. */
export function determineWinner(
  teams: { teamId: number; win: boolean }[],
): 'blueTeam' | 'redTeam' | null {
  if (
    teams.length !== 2 ||
    teams.filter((team) => team.teamId === 100).length !== 1 ||
    teams.filter((team) => team.teamId === 200).length !== 1 ||
    teams.some((team) => typeof team.win !== 'boolean')
  )
    return null;
  const winners = teams.filter((team) => team.win);
  return winners.length === 1
    ? winners[0].teamId === 100
      ? 'blueTeam'
      : 'redTeam'
    : null;
}

export function findMaxAdvantage(
  entries: GoldDifferenceEntry[],
): MaxAdvantageEntry | null {
  let best: GoldDifferenceEntry | null = null;
  for (const entry of entries) {
    if (entry.difference == null || !Number.isFinite(entry.difference))
      continue;
    if (!best || Math.abs(entry.difference) > Math.abs(best.difference!))
      best = entry;
  }
  if (!best) return null;
  return {
    ...(best.timestampMs !== undefined
      ? { timestampMs: best.timestampMs, frameIndex: best.frameIndex }
      : {}),
    minute: best.minute,
    team:
      best.difference === 0
        ? null
        : best.difference! > 0
          ? 'blueTeam'
          : 'redTeam',
    difference: Math.abs(best.difference!),
  };
}

export function findObservedSwing(
  entries: GoldDifferenceEntry[],
  threshold = 3000,
): ObservedSwingEntry | null {
  for (let i = 1; i < entries.length; i++) {
    const before = entries[i - 1];
    const after = entries[i];
    if (
      before.difference == null ||
      after.difference == null ||
      !Number.isFinite(before.difference) ||
      !Number.isFinite(after.difference) ||
      (after.timestampMs !== undefined && before.timestampMs !== undefined
        ? after.timestampMs <= before.timestampMs ||
          after.timestampMs - before.timestampMs > 120_000
        : after.minute !== before.minute + 1)
    )
      continue;
    const swing = Math.abs(after.difference - before.difference);
    if (swing > threshold) {
      return {
        ...(after.timestampMs !== undefined
          ? {
              timestampMs: after.timestampMs,
              beforeTimestampMs: before.timestampMs,
            }
          : {}),
        minute: after.minute,
        beforeMinute: before.minute,
        beforeDifference: before.difference,
        afterDifference: after.difference,
        swing,
      };
    }
  }
  return null;
}

/** @deprecated Use findObservedSwing. */
export const findThrowPoint = findObservedSwing;
