import { MissingReason } from '../../../core/metrics';
export interface BountyBoundary {
  eventId: string;
  type: 'OBJECTIVE_BOUNTY_PRESTART' | 'OBJECTIVE_BOUNTY_FINISH';
  timestampMs: number | null;
  teamId: number | null;
  actualStartTime: unknown;
  frameIndex: number;
  eventIndex: number;
}
export interface BountyWindow {
  windowId: string;
  teamId: number | null;
  announcement: BountyBoundary | null;
  finish: BountyBoundary | null;
  startMs: number | null;
  startSource: 'actualStartTime' | 'announcement_timestamp' | null;
  endMs: number | null;
  observedEndMs: number | null;
  censoredStart: boolean;
  censoredEnd: boolean;
  reason: MissingReason | null;
  issues: string[];
}
const finite = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;
/** Pair only unambiguous known-team boundaries. Source identity and unknown teams are never collapsed. */
export function interpretBountyWindows(
  boundaries: readonly BountyBoundary[],
  observedGameEndMs: number | null,
): BountyWindow[] {
  if (new Set(boundaries.map((b) => b.eventId)).size !== boundaries.length)
    throw new Error('Duplicate bounty boundary identity');
  const windows: BountyWindow[] = [];
  const pending = new Map<number, BountyWindow[]>();
  const ordered = [...boundaries].sort(
    (a, b) =>
      (a.timestampMs ?? Infinity) - (b.timestampMs ?? Infinity) ||
      a.frameIndex - b.frameIndex ||
      a.eventIndex - b.eventIndex,
  );
  for (const boundary of ordered) {
    const knownTeam = boundary.teamId === 100 || boundary.teamId === 200;
    if (boundary.type === 'OBJECTIVE_BOUNTY_PRESTART') {
      const supplied =
        boundary.actualStartTime !== null &&
        boundary.actualStartTime !== undefined;
      const startMs = supplied
        ? finite(boundary.actualStartTime)
          ? boundary.actualStartTime
          : null
        : finite(boundary.timestampMs)
          ? boundary.timestampMs
          : null;
      const reason: MissingReason | null =
        startMs === null
          ? supplied
            ? 'invalid_value'
            : 'missing_field'
          : !finite(boundary.timestampMs)
            ? 'missing_field'
            : observedGameEndMs !== null &&
                (startMs > observedGameEndMs ||
                  boundary.timestampMs > observedGameEndMs)
              ? 'invalid_value'
              : null;
      const window: BountyWindow = {
        windowId: `bounty:v1:${boundary.eventId}`,
        teamId: knownTeam ? boundary.teamId : null,
        announcement: boundary,
        finish: null,
        startMs,
        startSource:
          startMs === null
            ? null
            : supplied
              ? 'actualStartTime'
              : 'announcement_timestamp',
        endMs: null,
        observedEndMs: null,
        censoredStart: false,
        censoredEnd: true,
        reason,
        issues: [
          ...(knownTeam ? [] : ['unknown_team']),
          ...(reason ? ['invalid_or_missing_start_context'] : []),
        ],
      };
      windows.push(window);
      if (knownTeam && finite(boundary.timestampMs))
        pending.set(boundary.teamId!, [
          ...(pending.get(boundary.teamId!) ?? []),
          window,
        ]);
      continue;
    }
    const candidates =
      knownTeam && finite(boundary.timestampMs)
        ? (pending.get(boundary.teamId!) ?? []).filter(
            (w) => w.announcement!.timestampMs! <= boundary.timestampMs!,
          )
        : [];
    if (candidates.length === 1) {
      const window = candidates[0];
      window.finish = boundary;
      window.endMs = boundary.timestampMs;
      window.observedEndMs = boundary.timestampMs;
      window.censoredEnd = false;
      if (
        (window.startMs !== null && boundary.timestampMs! < window.startMs) ||
        (observedGameEndMs !== null &&
          boundary.timestampMs! > observedGameEndMs)
      ) {
        window.reason = 'invalid_value';
        window.issues.push('finish_outside_valid_window');
      }
      pending.set(boundary.teamId!, []);
    } else {
      if (candidates.length > 1)
        for (const w of candidates) {
          w.reason = 'invalid_value';
          if (!w.issues.includes('ambiguous_finish_multiple_announcements'))
            w.issues.push('ambiguous_finish_multiple_announcements');
        }
      windows.push({
        windowId: `bounty:v1:orphan:${boundary.eventId}`,
        teamId: knownTeam ? boundary.teamId : null,
        announcement: null,
        finish: boundary,
        startMs: null,
        startSource: null,
        endMs: finite(boundary.timestampMs) ? boundary.timestampMs : null,
        observedEndMs: finite(boundary.timestampMs)
          ? boundary.timestampMs
          : null,
        censoredStart: true,
        censoredEnd: false,
        reason: candidates.length > 1 ? 'invalid_value' : 'missing_field',
        issues: [
          knownTeam ? 'unmatched_finish' : 'unknown_team',
          ...(candidates.length > 1
            ? ['ambiguous_finish_multiple_announcements']
            : []),
        ],
      });
      // An ambiguous finish is not re-used to choose one of the candidate announcements.
      // Keep ambiguous announcements pending: a later FINISH cannot prove which earlier window closed.
    }
  }
  for (const w of windows)
    if (w.censoredEnd) {
      w.observedEndMs = observedGameEndMs;
      if (
        w.startMs !== null &&
        observedGameEndMs !== null &&
        observedGameEndMs < w.startMs
      ) {
        w.reason = 'invalid_value';
        w.issues.push('start_after_game_end');
      }
      if (observedGameEndMs === null && w.reason === null)
        w.reason = 'missing_frame';
      // Unknown team boundaries cannot safely be linked to a finish, even another unknown team.
      if (w.teamId === null && w.reason === null) w.reason = 'missing_field';
    }
  return windows;
}
