import type {
  MatchReviewContext,
  ReviewCombatWindow,
  ReviewParticipant,
  ReviewValue,
} from '../../contracts/match-review';
import type { MetricEvidence } from '../../contracts/metric-contract';
import type {
  ParticipantSnapshot,
  SnapshotFrame,
} from '../../contracts/normalized-snapshots';
import { reviewCombatWindow, reviewNumber } from './review-context';

const HORIZON_MS = 180_000;
const MAX_FRAME_AGE_MS = 60_000;
const ROLES = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
const FIELDS = {
  gold: 'totalGold',
  xp: 'xp',
  laneCs: 'minionsKilled',
  jungleCs: 'jungleMinionsKilled',
} as const;
export type DeathResourceKey = keyof typeof FIELDS | 'cs';
const KEYS: DeathResourceKey[] = ['gold', 'xp', 'laneCs', 'jungleCs', 'cs'];
type ResourceValues = Record<DeathResourceKey, ReviewValue>;
export interface DeathResourceSnapshot {
  targetMs: number;
  actualMs: number | null;
  offsetMs: number | null;
  frameIndex: number | null;
  reason: string | null;
  focal: ResourceValues;
  opponent: ResourceValues;
}
export interface DeathResourceRate extends ReviewValue {
  denominator: { value: number | null; unit: 'minutes' };
}
export interface DeathResourceMetric {
  baselineLead: ReviewValue;
  beforeLead: ReviewValue;
  afterLead: ReviewValue;
  focalPriorGain: ReviewValue;
  focalPostGain: ReviewValue;
  opponentPriorGain: ReviewValue;
  opponentPostGain: ReviewValue;
  priorRelativeGain: ReviewValue;
  postRelativeGain: ReviewValue;
  priorRelativePerMinute: DeathResourceRate;
  postRelativePerMinute: DeathResourceRate;
  relativeRateChange: ReviewValue;
}
export interface DeathResourceCombat {
  prior: ReviewCombatWindow;
  post: ReviewCombatWindow;
  afterDeath: ReviewCombatWindow;
  beforeDeath: ReviewCombatWindow;
  opponentPrior: ReviewCombatWindow;
  opponentPost: ReviewCombatWindow;
  opponentAfterDeath: ReviewCombatWindow;
  opponentBeforeDeath: ReviewCombatWindow;
}
export interface DeathResourceEpisode {
  eventId: string;
  deathMs: number;
  eligible: boolean;
  temporalEligible: boolean;
  reason: string | null;
  priorDeath: boolean | null;
  repeatedDeath: boolean | null;
  baseline: DeathResourceSnapshot | null;
  before: DeathResourceSnapshot | null;
  after: DeathResourceSnapshot | null;
  priorMinutes: number | null;
  postMinutes: number | null;
  metrics: Record<DeathResourceKey, DeathResourceMetric> | null;
  combat: DeathResourceCombat | null;
  tags: string[];
}
export interface DeathResourceReview {
  reason: string | null;
  horizonMs: number;
  maxFrameAgeMs: number;
  opponent: { puuid: string; role: string; championName: string } | null;
  episodes: DeathResourceEpisode[];
}

function canonicalRole(role: string | null): string | null {
  return role === 'MID' ? 'MIDDLE' : role;
}
function opponentFor(
  context: MatchReviewContext,
  focal: ReviewParticipant,
): ReviewParticipant | null {
  const role = canonicalRole(focal.role);
  if (!role || !ROLES.has(role)) return null;
  const sameRole = context.input.participants.filter(
    (p) => canonicalRole(p.role) === role,
  );
  const allies = sameRole.filter((p) => p.teamId === focal.teamId);
  const opponents = sameRole.filter((p) => p.teamId !== focal.teamId);
  return allies.length === 1 && opponents.length === 1 ? opponents[0] : null;
}
function unit(key: DeathResourceKey): string {
  return key === 'gold' || key === 'xp' ? key : 'cs';
}
function value(
  n: number | null,
  unit: string,
  reason: string | null,
  evidence: MetricEvidence[],
  origin: 'observed' | 'derived' = 'derived',
): ReviewValue {
  const invalid = n !== null && !Number.isFinite(n);
  return {
    value: invalid ? null : n,
    unit,
    reason: invalid ? 'invalid_value' : reason,
    origin: invalid || n === null ? 'unavailable' : origin,
    evidence,
  };
}
function subtract(a: ReviewValue, b: ReviewValue): ReviewValue {
  const reason = a.reason ?? b.reason;
  return value(
    a.value === null || b.value === null ? null : a.value - b.value,
    a.unit,
    reason,
    [...a.evidence, ...b.evidence],
  );
}
function gain(a: ReviewValue, b: ReviewValue): ReviewValue {
  const result = subtract(b, a);
  return result.value !== null && result.value < 0
    ? {
        ...result,
        value: null,
        origin: 'unavailable',
        reason: 'counter_regression',
      }
    : result;
}
function rate(
  numerator: ReviewValue,
  start: number,
  end: number,
): DeathResourceRate {
  const minutes = (end - start) / 60_000;
  return {
    ...value(
      numerator.value === null || minutes <= 0
        ? null
        : numerator.value / minutes,
      `${numerator.unit}_per_minute`,
      numerator.reason ?? (minutes <= 0 ? 'zero_denominator' : null),
      [
        ...numerator.evidence,
        {
          source: 'MatchTimelineProjection.frames',
          field: 'window.startMs',
          value: start,
        },
        {
          source: 'MatchTimelineProjection.frames',
          field: 'window.endMs',
          value: end,
        },
      ],
    ),
    denominator: { value: minutes > 0 ? minutes : null, unit: 'minutes' },
  };
}
function snapshotValues(
  context: MatchReviewContext,
  frame: SnapshotFrame | null,
  puuid: string,
  reason: string | null,
): ResourceValues {
  const candidates = Object.values(frame?.participantFrames ?? {}).filter(
    (p) => p.puuid === puuid,
  );
  const p: ParticipantSnapshot | null =
    candidates.length === 1 ? candidates[0] : null;
  const participantReason =
    reason ??
    (candidates.length > 1
      ? 'ambiguous_participant_snapshot'
      : !p
        ? 'missing_participant_snapshot'
        : context.participantIds.get(p.participantId) !== puuid
          ? 'snapshot_identity_mismatch'
          : null);
  const result = {} as ResourceValues;
  for (const key of Object.keys(FIELDS) as (keyof typeof FIELDS)[]) {
    const field = FIELDS[key];
    const fieldReason =
      participantReason ??
      (p?.[field] == null
        ? 'missing_field'
        : !reviewNumber(p[field])
          ? 'invalid_value'
          : null);
    result[key] = value(
      fieldReason === null ? p![field] : null,
      unit(key),
      fieldReason,
      [
        {
          source: 'MatchTimelineProjection.frames',
          field: `participantFrames.${puuid}.${field}`,
          value: reviewNumber(p?.[field]) ? p[field] : null,
          ...(frame
            ? { frameIndex: frame.frameIndex, timestampMs: frame.timestamp! }
            : {}),
        },
      ],
      'observed',
    );
  }
  const lane = result.laneCs,
    jungle = result.jungleCs;
  result.cs = value(
    lane.value !== null && jungle.value !== null
      ? lane.value + jungle.value
      : null,
    'cs',
    lane.reason ?? jungle.reason,
    [...lane.evidence, ...jungle.evidence],
  );
  return result;
}
function selectSnapshot(
  context: MatchReviewContext,
  targetMs: number,
  puuid: string,
  opponent: string,
): DeathResourceSnapshot {
  let selected: SnapshotFrame | null = null;
  for (const frame of context.frames) {
    if (
      frame.timestamp !== null &&
      frame.timestamp <= targetMs &&
      (selected === null || frame.timestamp > selected.timestamp!)
    )
      selected = frame;
  }
  const actualMs = selected?.timestamp ?? null;
  const reason =
    selected === null
      ? 'missing_frame'
      : targetMs - actualMs! > MAX_FRAME_AGE_MS
        ? 'stale_frame'
        : null;
  return {
    targetMs,
    actualMs,
    offsetMs: actualMs === null ? null : actualMs - targetMs,
    frameIndex: selected?.frameIndex ?? null,
    reason,
    focal: snapshotValues(context, selected, puuid, reason),
    opponent: snapshotValues(context, selected, opponent, reason),
  };
}
function resourceMetric(
  key: DeathResourceKey,
  b: DeathResourceSnapshot,
  p: DeathResourceSnapshot,
  a: DeathResourceSnapshot,
): DeathResourceMetric {
  const focalPriorGain = gain(b.focal[key], p.focal[key]);
  const focalPostGain = gain(p.focal[key], a.focal[key]);
  const opponentPriorGain = gain(b.opponent[key], p.opponent[key]);
  const opponentPostGain = gain(p.opponent[key], a.opponent[key]);
  const priorRelativeGain = subtract(focalPriorGain, opponentPriorGain);
  const postRelativeGain = subtract(focalPostGain, opponentPostGain);
  const priorRelativePerMinute = rate(
    priorRelativeGain,
    b.actualMs!,
    p.actualMs!,
  );
  const postRelativePerMinute = rate(
    postRelativeGain,
    p.actualMs!,
    a.actualMs!,
  );
  return {
    baselineLead: subtract(b.focal[key], b.opponent[key]),
    beforeLead: subtract(p.focal[key], p.opponent[key]),
    afterLead: subtract(a.focal[key], a.opponent[key]),
    focalPriorGain,
    focalPostGain,
    opponentPriorGain,
    opponentPostGain,
    priorRelativeGain,
    postRelativeGain,
    priorRelativePerMinute,
    postRelativePerMinute,
    relativeRateChange: subtract(postRelativePerMinute, priorRelativePerMinute),
  };
}

/** Describes observed windows around deaths; no causal cost, rating or prediction. */
export function calculateDeathResourceReview(
  context: MatchReviewContext,
  puuid: string,
): DeathResourceReview {
  const focal = context.input.participants.find((p) => p.puuid === puuid);
  const opponent = focal ? opponentFor(context, focal) : null;
  const sourceReason =
    context.sourceReason ??
    context.snapshotReason ??
    context.combatReason ??
    (!focal ? 'unknown_participant' : !opponent ? 'ambiguous_role' : null);
  const report: DeathResourceReview = {
    reason: sourceReason,
    horizonMs: HORIZON_MS,
    maxFrameAgeMs: MAX_FRAME_AGE_MS,
    opponent: opponent
      ? {
          puuid: opponent.puuid,
          role: canonicalRole(opponent.role)!,
          championName: opponent.championName,
        }
      : null,
    episodes: [],
  };
  for (const death of context.kills.filter((k) => k.victimPuuid === puuid)) {
    const row: DeathResourceEpisode = {
      eventId: death.eventId,
      deathMs: death.timestampMs,
      eligible: false,
      temporalEligible: false,
      reason: sourceReason,
      priorDeath: null,
      repeatedDeath: null,
      baseline: null,
      before: null,
      after: null,
      priorMinutes: null,
      postMinutes: null,
      metrics: null,
      combat: null,
      tags: [],
    };
    report.episodes.push(row);
    if (sourceReason || !opponent) continue;
    if (context.endMs === null) {
      row.reason = 'unknown_end';
      continue;
    }
    if (death.timestampMs + HORIZON_MS > context.endMs) {
      row.reason = 'censored_followup';
      continue;
    }
    row.baseline = selectSnapshot(
      context,
      death.timestampMs - HORIZON_MS,
      puuid,
      opponent.puuid,
    );
    row.before = selectSnapshot(
      context,
      death.timestampMs,
      puuid,
      opponent.puuid,
    );
    row.after = selectSnapshot(
      context,
      death.timestampMs + HORIZON_MS,
      puuid,
      opponent.puuid,
    );
    const b = row.baseline,
      p = row.before,
      a = row.after;
    const invalid = [
      ['baseline', b],
      ['before', p],
      ['after', a],
    ] as const;
    const firstInvalid = invalid.find(([, s]) => s.reason !== null);
    if (firstInvalid) {
      row.reason = `${firstInvalid[0]}_${firstInvalid[1].reason}`;
      continue;
    }
    const bm = b.actualMs!,
      pm = p.actualMs!,
      am = a.actualMs!;
    if (
      !(bm < pm && pm < death.timestampMs && death.timestampMs < am) ||
      am > context.endMs
    ) {
      row.reason = 'invalid_observed_window';
      continue;
    }
    row.temporalEligible = true;
    row.priorMinutes = (pm - bm) / 60_000;
    row.postMinutes = (am - pm) / 60_000;
    row.combat = {
      prior: reviewCombatWindow(context, puuid, bm, pm),
      post: reviewCombatWindow(context, puuid, pm, am),
      afterDeath: reviewCombatWindow(context, puuid, death.timestampMs, am),
      beforeDeath: reviewCombatWindow(context, puuid, pm, death.timestampMs),
      opponentPrior: reviewCombatWindow(context, opponent.puuid, bm, pm),
      opponentPost: reviewCombatWindow(context, opponent.puuid, pm, am),
      opponentAfterDeath: reviewCombatWindow(
        context,
        opponent.puuid,
        death.timestampMs,
        am,
      ),
      opponentBeforeDeath: reviewCombatWindow(
        context,
        opponent.puuid,
        pm,
        death.timestampMs,
      ),
    };
    row.priorDeath = row.combat.prior.deaths > 0;
    row.repeatedDeath = row.combat.post.deaths !== 1;
    row.reason = row.repeatedDeath
      ? 'repeated_death'
      : row.priorDeath
        ? 'prior_death'
        : null;
    row.eligible = row.reason === null;
    row.metrics = Object.fromEntries(
      KEYS.map((key) => [key, resourceMetric(key, b, p, a)]),
    ) as Record<DeathResourceKey, DeathResourceMetric>;
    const gold = row.metrics.gold.postRelativeGain.value;
    const cs = row.metrics.cs.postRelativeGain.value;
    const priorGold = row.metrics.gold.priorRelativeGain.value;
    if (row.eligible && gold !== null) {
      if (gold >= 0) row.tags.push('gold_gap_not_worse');
      if (priorGold !== null && priorGold < 0 && gold < 0)
        row.tags.push('decline_already_present');
      if (cs !== null && cs > 0 && gold < 0) row.tags.push('more_cs_less_gold');
      if (cs !== null && cs < 0 && gold > 0) row.tags.push('less_cs_more_gold');
    }
  }
  return report;
}
