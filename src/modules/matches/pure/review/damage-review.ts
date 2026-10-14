import type { MetricEvidence } from '../../contracts/metric-contract';
import {
  MATCH_REVIEW_VERSION,
  type MatchReviewContext,
  type ReviewEventReference,
  type ReviewKill,
  type ReviewValue,
} from '../../contracts/match-review';
import type { SnapshotFrame } from '../../contracts/normalized-snapshots';
import { reviewFinalValue, reviewNumber } from './review-context';

const FIELD = 'totalDamageDoneToChampions';
const FINAL_FIELD = 'totalDamageDealtToChampions';
const MARGINS = [0, 15000, 30000, 60000] as const;

export interface DamageReviewInterval {
  startFrameIndex: number;
  endFrameIndex: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  bounds: '(]';
  comparableMinute: boolean;
  personalDamage: ReviewValue;
  globalDamage: ReviewValue;
  personalRate: ReviewValue;
  globalRate: ReviewValue;
  noDeaths: boolean | null;
  deathCount: number | null;
  deaths: ReviewEventReference[];
  previousDeath: ReviewEventReference | null;
  nextDeath: ReviewEventReference | null;
  nextDeathGapMs: number | null;
  marginNoDeaths: Record<string, boolean | null>;
  personalRank: number | null;
  globalRank: number | null;
  shareOfFinalDamage: ReviewValue;
}

export interface DamageReview {
  matchId: string;
  puuid: string;
  metricVersion: number;
  processingVersion: number | null;
  processedAt: string | null;
  available: boolean;
  reason: string | null;
  complete: boolean;
  coverageReasons: string[];
  combatReason: string | null;
  rankingReason: string | null;
  intervals: DamageReviewInterval[];
  totalDamage: ReviewValue;
  damageWithoutDeaths: ReviewValue;
  fractionWithoutDeaths: ReviewValue;
  personalPeak: DamageReviewInterval | null;
  personalPeakWithoutDeaths: DamageReviewInterval | null;
  globalPeakWithoutDeaths: DamageReviewInterval | null;
}

function unavailable(
  unit: string,
  reason: string,
  evidence: MetricEvidence[] = [],
): ReviewValue {
  return { value: null, unit, reason, origin: 'unavailable', evidence };
}
function derived(
  value: number,
  unit: string,
  evidence: MetricEvidence[] = [],
): ReviewValue {
  return reviewNumber(value)
    ? { value, unit, reason: null, origin: 'derived', evidence }
    : unavailable(unit, 'invalid_value', evidence);
}
function reference(kill: ReviewKill): ReviewEventReference {
  return {
    eventId: kill.eventId,
    timestampMs: kill.timestampMs,
    killerPuuid: kill.killerPuuid,
    victimPuuid: kill.victimPuuid,
  };
}
function counterEvidence(
  frame: SnapshotFrame,
  participantId: number,
  value: number | null,
): MetricEvidence {
  return {
    source: 'MatchTimelineProjection',
    field: `participantFrames.${participantId}.damageStats.${FIELD}`,
    value,
    frameIndex: frame.frameIndex,
    timestampMs: frame.timestamp!,
  };
}
function exactCounters(
  frame: SnapshotFrame,
  context: MatchReviewContext,
): { counters: Map<string, number | null>; reason: string | null } {
  const snapshots = Object.values(frame.participantFrames ?? {});
  const expected = context.participantIds;
  const ids = snapshots.map((p) => p?.participantId);
  if (
    expected.size !== 10 ||
    snapshots.length !== 10 ||
    new Set(ids).size !== 10 ||
    snapshots.some(
      (p) =>
        !p ||
        !expected.has(p.participantId) ||
        expected.get(p.participantId) !== p.puuid,
    )
  ) {
    return { counters: new Map(), reason: 'invalid_frame_roster' };
  }
  return {
    counters: new Map(
      snapshots.map((p) => {
        const value = p.damageStats?.[FIELD];
        return [p.puuid!, reviewNumber(value) ? value : null];
      }),
    ),
    reason: null,
  };
}

/** Descriptive increments between actual snapshots. No fight, pressure or skill inference. */
export function calculateDamageReview(
  context: MatchReviewContext,
  puuid: string,
): DamageReview {
  const participant = context.input.participants.find((p) => p.puuid === puuid);
  const sourceReason =
    context.sourceReason ??
    context.snapshotReason ??
    (!participant ? 'missing_participant' : null);
  const result: DamageReview = {
    matchId: context.input.matchId,
    puuid,
    metricVersion: MATCH_REVIEW_VERSION,
    processingVersion: context.processingVersion,
    processedAt: context.processedAt,
    available: false,
    reason: sourceReason,
    complete: false,
    coverageReasons: [],
    combatReason: context.combatReason,
    rankingReason: sourceReason ?? 'incomplete_damage_coverage',
    intervals: [],
    totalDamage: unavailable(
      'damage',
      sourceReason ?? 'incomplete_damage_coverage',
    ),
    damageWithoutDeaths: unavailable(
      'damage',
      sourceReason ?? 'incomplete_damage_coverage',
    ),
    fractionWithoutDeaths: unavailable(
      'ratio',
      sourceReason ?? 'incomplete_damage_coverage',
    ),
    personalPeak: null,
    personalPeakWithoutDeaths: null,
    globalPeakWithoutDeaths: null,
  };
  if (sourceReason || !participant) return result;
  const frames = context.frames;
  const reasons = new Set<string>();
  if (frames.length < 2) reasons.add('missing_frame');
  if (
    frames[0]?.timestamp !== 0 ||
    context.endMs === null ||
    frames.at(-1)?.timestamp !== context.endMs
  )
    reasons.add('incomplete_game_boundaries');
  const counters = frames.map((f) => exactCounters(f, context));
  const final = reviewFinalValue(participant, FINAL_FIELD);
  const finalEvidence: MetricEvidence[] = [
    {
      source: 'MatchParticipant.finalStats',
      field: `${puuid}.${FINAL_FIELD}`,
      value: reviewNumber(final) ? final : null,
    },
  ];
  const first = counters[0],
    last = counters.at(-1);
  if (!first || !last || first.reason || last.reason)
    reasons.add('invalid_game_endpoints');
  else {
    for (const p of context.input.participants) {
      const endValue = reviewFinalValue(p, FINAL_FIELD);
      if (
        first.counters.get(p.puuid) !== 0 ||
        !reviewNumber(endValue) ||
        last.counters.get(p.puuid) !== endValue
      )
        reasons.add('unreconciled_game_damage');
    }
  }
  const knownCombat = context.combatReason === null;
  const kills = [...context.kills].sort(
    (a, b) =>
      a.timestampMs - b.timestampMs ||
      a.frameIndex - b.frameIndex ||
      a.eventIndex - b.eventIndex,
  );
  for (let i = 1; i < frames.length; i++) {
    const left = frames[i - 1],
      right = frames[i];
    const start = left.timestamp,
      stop = right.timestamp;
    if (!reviewNumber(start) || !reviewNumber(stop) || stop <= start) {
      reasons.add('invalid_frame_timestamps');
      continue;
    }
    const duration = stop - start;
    const intervalReason =
      counters[i - 1].reason ??
      counters[i].reason ??
      (context.endMs !== null && stop > context.endMs
        ? 'outside_observed_end'
        : duration > 90000
          ? 'gapped_window'
          : null);
    const evidence: MetricEvidence[] = [];
    let global = 0;
    let globalReason = intervalReason;
    let personal = unavailable('damage', intervalReason ?? 'missing_field');
    for (const [pid, id] of context.participantIds) {
      const a = counters[i - 1].counters.get(id),
        b = counters[i].counters.get(id);
      const source = [
        counterEvidence(left, pid, a ?? null),
        counterEvidence(right, pid, b ?? null),
      ];
      evidence.push(...source);
      const issue =
        intervalReason ??
        (!reviewNumber(a) || !reviewNumber(b)
          ? 'missing_field'
          : b < a
            ? 'counter_regression'
            : null);
      const value = issue
        ? unavailable('damage', issue, source)
        : derived(b! - a!, 'damage', source);
      if (id === puuid) personal = value;
      if (value.value === null)
        globalReason ??= value.reason ?? 'invalid_value';
      else global += value.value;
    }
    const globalDamage = globalReason
      ? unavailable('damage', globalReason, evidence)
      : derived(global, 'damage', evidence);
    if (personal.value === null || globalDamage.value === null)
      reasons.add(personal.reason ?? globalDamage.reason ?? 'invalid_value');
    const rate = (damage: ReviewValue): ReviewValue =>
      damage.value === null
        ? unavailable(
            'damage_per_minute',
            damage.reason ?? 'missing_field',
            damage.evidence,
          )
        : derived(damage.value * (60000 / duration), 'damage_per_minute', [
            ...damage.evidence,
            {
              source: 'MatchTimelineProjection',
              field: 'elapsedTimestampMs',
              value: duration,
              frameIndex: right.frameIndex,
              timestampMs: stop,
            },
          ]);
    const personalRate = rate(personal),
      globalRate = rate(globalDamage);
    if (personalRate.value === null || globalRate.value === null)
      reasons.add(personalRate.reason ?? globalRate.reason ?? 'invalid_value');
    const deaths = knownCombat
      ? kills.filter((k) => start < k.timestampMs && k.timestampMs <= stop)
      : [];
    const before = knownCombat
      ? kills.filter((k) => k.timestampMs <= start).at(-1)
      : undefined;
    const after = knownCombat
      ? kills.find((k) => k.timestampMs > stop)
      : undefined;
    const noDeaths = knownCombat ? deaths.length === 0 : null;
    result.intervals.push({
      startFrameIndex: left.frameIndex,
      endFrameIndex: right.frameIndex,
      startMs: start,
      endMs: stop,
      durationMs: duration,
      bounds: '(]',
      comparableMinute:
        duration >= 45000 &&
        duration <= 75000 &&
        personalRate.value !== null &&
        globalRate.value !== null,
      personalDamage: personal,
      globalDamage,
      personalRate,
      globalRate,
      noDeaths,
      deathCount: knownCombat ? deaths.length : null,
      deaths: deaths.map(reference),
      previousDeath: before ? reference(before) : null,
      nextDeath: after ? reference(after) : null,
      nextDeathGapMs: after ? after.timestampMs - stop : null,
      marginNoDeaths: Object.fromEntries(
        MARGINS.map((m) => [
          String(m),
          knownCombat &&
          context.endMs !== null &&
          start >= m &&
          stop + m <= context.endMs
            ? !kills.some(
                (k) => start - m < k.timestampMs && k.timestampMs <= stop + m,
              )
            : null,
        ]),
      ),
      personalRank: null,
      globalRank: null,
      shareOfFinalDamage: unavailable('ratio', 'incomplete_damage_coverage'),
    });
  }
  result.coverageReasons = [...reasons].sort();
  result.complete = reasons.size === 0;
  result.available = result.intervals.some(
    (r) => r.personalDamage.value !== null,
  );
  result.reason = result.available
    ? null
    : (result.coverageReasons[0] ?? 'missing_frame');
  result.rankingReason = result.complete ? null : 'incomplete_damage_coverage';
  if (!result.complete || !reviewNumber(final)) return result;
  result.totalDamage = derived(final, 'damage', [
    counterEvidence(
      frames[0],
      [...context.participantIds].find(([, id]) => id === puuid)![0],
      0,
    ),
    counterEvidence(
      frames.at(-1)!,
      [...context.participantIds].find(([, id]) => id === puuid)![0],
      final,
    ),
    ...finalEvidence,
  ]);
  for (const row of result.intervals)
    row.shareOfFinalDamage =
      final > 0
        ? derived(row.personalDamage.value! / final, 'ratio', [
            ...row.personalDamage.evidence,
            ...finalEvidence,
          ])
        : unavailable('ratio', 'zero_denominator', finalEvidence);
  const comparable = result.intervals.filter((r) => r.comparableMinute);
  const personalRanked = [...comparable].sort(
    (a, b) =>
      b.personalRate.value! - a.personalRate.value! ||
      a.startMs - b.startMs ||
      a.startFrameIndex - b.startFrameIndex,
  );
  const globalRanked = [...comparable].sort(
    (a, b) =>
      b.globalRate.value! - a.globalRate.value! ||
      a.startMs - b.startMs ||
      a.startFrameIndex - b.startFrameIndex,
  );
  personalRanked.forEach((r, i) => {
    r.personalRank = i + 1;
  });
  globalRanked.forEach((r, i) => {
    r.globalRank = i + 1;
  });
  if (!comparable.length) result.rankingReason = 'no_comparable_intervals';
  result.personalPeak =
    personalRanked.find((r) => r.personalDamage.value! > 0) ?? null;
  if (!knownCombat) {
    result.damageWithoutDeaths = unavailable('damage', context.combatReason!);
    result.fractionWithoutDeaths = unavailable('ratio', context.combatReason!);
    return result;
  }
  result.personalPeakWithoutDeaths =
    personalRanked.find(
      (r) => r.noDeaths === true && r.personalDamage.value! > 0,
    ) ?? null;
  result.globalPeakWithoutDeaths =
    globalRanked.find(
      (r) => r.noDeaths === true && r.globalDamage.value! > 0,
    ) ?? null;
  const silent = result.intervals.filter((r) => r.noDeaths === true);
  const silentDamage = silent.reduce(
    (sum, r) => sum + r.personalDamage.value!,
    0,
  );
  const silentEvidence = silent.flatMap((r) => r.personalDamage.evidence);
  result.damageWithoutDeaths = derived(silentDamage, 'damage', silentEvidence);
  result.fractionWithoutDeaths =
    final > 0
      ? derived(silentDamage / final, 'ratio', [
          ...silentEvidence,
          ...finalEvidence,
        ])
      : unavailable('ratio', 'zero_denominator', finalEvidence);
  return result;
}
