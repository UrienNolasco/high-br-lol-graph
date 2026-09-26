import {
  assessRemake,
  CHECKPOINT_TOLERANCE_MS,
  CheckpointMode,
  metricQuality,
  normalizeRole,
  selectCheckpoint,
  selectUniqueOpponent,
} from '../../../core/metrics';
import {
  MetricEvidence,
  MetricQuality,
} from '../../../core/metrics/metric-contract';
import type {
  ParticipantSnapshot,
  SnapshotFrame,
  TimelineSnapshotProjection,
} from '../contracts/normalized-snapshots';

export const ECONOMY_VERSION = 1;
export const ECONOMY_CHECKPOINTS = [
  300_000, 600_000, 900_000, 1_200_000,
] as const;
export const UNSPENT_GOLD_THRESHOLD = 1000;
export interface EconomyParticipant {
  puuid: string;
  teamId: number;
  role: string | null;
  finalStats: unknown;
}
export interface EconomyInput {
  matchId: string;
  gameVersion: string;
  queueId: number;
  mapId: number;
  gameDuration: number;
  participants: EconomyParticipant[];
  projection: TimelineSnapshotProjection | null;
  processing: {
    status: string;
    completedAt: Date | null;
    processingVersion: number | null;
  } | null;
}
export interface EconomyValue {
  metricId: string;
  value: number | null;
  unit: string;
  origin: 'observed' | 'derived' | 'unavailable';
  reason: string | null;
  method: string;
  denominator: {
    value: number | null;
    unit: string;
    population: string;
  } | null;
  quality: MetricQuality;
  evidence: MetricEvidence[];
}
const FIELDS = {
  totalGold: ['E01', 'gold'],
  currentGold: ['E05', 'gold'],
  xp: ['E01', 'xp'],
  level: ['E07', 'level'],
  laneCs: ['E02', 'cs'],
  jungleCs: ['E02', 'cs'],
  totalCs: ['E01', 'cs'],
  goldShare: ['E04', 'ratio'],
  csShare: ['E04', 'ratio'],
} as const;
type Field = keyof typeof FIELDS;
export type EconomyValues = Record<Field, EconomyValue>;
export interface EconomySample {
  frameIndex: number;
  timestampMs: number | null;
  values: EconomyValues;
}
export interface EconomyCheckpoint {
  targetMs: number;
  actualMs: number | null;
  offsetMs: number | null;
  mode: CheckpointMode;
  toleranceMs: number;
  frameIndex: number | null;
  eligible: boolean;
  comparisonEligible: boolean;
  reason: string | null;
  comparisonReason: string | null;
  values: EconomyValues;
  opponent: EconomyValues;
  differences: EconomyValues;
}
export interface EconomyInterval {
  startMs: number | null;
  endMs: number | null;
  elapsedMs: number | null;
  fromFrameIndex: number | null;
  toFrameIndex: number | null;
  partialFinalInterval: boolean;
  reason: string | null;
  gains: Record<string, EconomyValue>;
  perMinute: Record<string, EconomyValue>;
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function finalValue(participant: EconomyParticipant, field: string): unknown {
  const projection = record(participant.finalStats);
  return projection.projectionVersion === 1
    ? record(projection.values)[field]
    : null;
}
function value(
  metricId: string,
  unit: string,
  observed: unknown,
  evidence: MetricEvidence[],
  reason: string | null = null,
  derived = false,
  method = 'literal snapshot field',
): EconomyValue {
  const invalid =
    observed !== null &&
    observed !== undefined &&
    (typeof observed !== 'number' || !Number.isFinite(observed));
  const missing =
    reason ??
    (invalid ? 'invalid_value' : observed == null ? 'missing_field' : null);
  return {
    metricId,
    unit,
    value: missing ? null : (observed as number),
    origin: missing ? 'unavailable' : derived ? 'derived' : 'observed',
    reason: missing,
    method,
    denominator: null,
    quality: metricQuality(missing ? 0 : 1, 1),
    evidence,
  };
}
function absentValues(reason: string): EconomyValues {
  return Object.fromEntries(
    Object.entries(FIELDS).map(([key, [id, unit]]) => [
      key,
      value(id, unit, null, [], reason),
    ]),
  ) as EconomyValues;
}
function participantSnapshot(frame: SnapshotFrame, puuid: string) {
  const rows = Object.values(frame.participantFrames).filter(
    (p) => p.puuid === puuid,
  );
  return rows.length === 1 ? rows[0] : null;
}
function scalar(
  frame: SnapshotFrame,
  puuid: string,
  field: keyof ParticipantSnapshot,
): number | null {
  const raw = participantSnapshot(frame, puuid)?.[field];
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
    ? raw
    : null;
}
function frameValues(
  frame: SnapshotFrame,
  participant: EconomyParticipant,
  roster: EconomyParticipant[],
  globalReason: string | null,
): EconomyValues {
  if (globalReason) return absentValues(globalReason);
  if (frame.timestamp === null) return absentValues('missing_timestamp');
  if (!participantSnapshot(frame, participant.puuid))
    return absentValues('missing_participant_frame');
  const fields = {
    totalGold: 'totalGold',
    currentGold: 'currentGold',
    xp: 'xp',
    level: 'level',
    laneCs: 'minionsKilled',
    jungleCs: 'jungleMinionsKilled',
  } as const;
  const result = {} as EconomyValues;
  for (const [key, source] of Object.entries(fields)) {
    const [id, unit] = FIELDS[key as Field];
    const raw = participantSnapshot(frame, participant.puuid)?.[source];
    result[key as Field] = value(
      id,
      unit,
      scalar(frame, participant.puuid, source),
      [
        {
          source: 'MatchTimelineProjection.frames',
          field: `participantFrames.${participantSnapshot(frame, participant.puuid)!.participantId}.${source}`,
          value: typeof raw === 'number' && Number.isFinite(raw) ? raw : null,
          frameIndex: frame.frameIndex,
          timestampMs: frame.timestamp,
        },
      ],
      typeof raw === 'number' && (raw < 0 || !Number.isFinite(raw))
        ? 'invalid_value'
        : null,
    );
  }
  result.totalCs = value(
    'E01',
    'cs',
    result.laneCs.value !== null && result.jungleCs.value !== null
      ? result.laneCs.value + result.jungleCs.value
      : null,
    [...result.laneCs.evidence, ...result.jungleCs.evidence],
    null,
    true,
    'laneCs + jungleCs',
  );
  const teammates = roster.filter((p) => p.teamId === participant.teamId);
  for (const key of ['goldShare', 'csShare'] as const) {
    const source = key === 'goldShare' ? 'totalGold' : 'totalCs';
    const counts = teammates.map((p) =>
      key === 'goldShare'
        ? scalar(frame, p.puuid, 'totalGold')
        : (() => {
            const lane = scalar(frame, p.puuid, 'minionsKilled'),
              jungle = scalar(frame, p.puuid, 'jungleMinionsKilled');
            return lane !== null && jungle !== null ? lane + jungle : null;
          })(),
    );
    const complete =
      teammates.length === 5 &&
      new Set(teammates.map((p) => p.puuid)).size === 5 &&
      counts.every((n) => n !== null);
    const total = complete ? counts.reduce((a, b) => a + b, 0) : null;
    const evidenceFields: Array<
      'totalGold' | 'minionsKilled' | 'jungleMinionsKilled'
    > =
      key === 'goldShare'
        ? ['totalGold']
        : ['minionsKilled', 'jungleMinionsKilled'];
    const metric = value(
      'E04',
      'ratio',
      total && result[source].value !== null
        ? result[source].value / total
        : null,
      teammates.flatMap((p) =>
        evidenceFields.map((field) => ({
          source: 'MatchTimelineProjection.frames',
          field: `participantFrames.${participantSnapshot(frame, p.puuid)?.participantId ?? 'missing'}.${field}`,
          value: scalar(frame, p.puuid, field),
          frameIndex: frame.frameIndex,
          timestampMs: frame.timestamp!,
        })),
      ),
      total === 0
        ? 'zero_denominator'
        : total === null
          ? 'missing_team_sample'
          : null,
      true,
      'participant resource / complete five-player team total',
    );
    metric.denominator = {
      value: total,
      unit: key === 'goldShare' ? 'gold' : 'cs',
      population: 'five teammates in the same frame',
    };
    metric.quality = metricQuality(
      counts.filter((n) => n !== null).length,
      Math.max(5, teammates.length),
    );
    result[key] = metric;
  }
  return result;
}
function differences(
  player: EconomyValues,
  opponent: EconomyValues,
  reason: string | null,
): EconomyValues {
  return Object.fromEntries(
    Object.keys(FIELDS).map((key: Field) => [
      key,
      value(
        FIELDS[key][0],
        FIELDS[key][1],
        player[key].value !== null && opponent[key].value !== null
          ? player[key].value - opponent[key].value
          : null,
        [...player[key].evidence, ...opponent[key].evidence],
        reason ?? player[key].reason ?? opponent[key].reason,
        true,
        'participant minus unique same-role opponent, same frame',
      ),
    ]),
  ) as EconomyValues;
}
const GAIN_FIELDS = [
  'totalGold',
  'xp',
  'laneCs',
  'jungleCs',
  'totalCs',
] as const;
function interval(
  from: EconomySample | null,
  to: EconomySample | null,
  observedEndMs: number,
  frameIntervalMs: number | null,
  forceReason: string | null = null,
): EconomyInterval {
  const startMs = from?.timestampMs ?? null,
    endMs = to?.timestampMs ?? null;
  const elapsedMs = startMs !== null && endMs !== null ? endMs - startMs : null;
  const reason =
    forceReason ??
    (elapsedMs === null
      ? 'missing_frame'
      : elapsedMs <= 0
        ? 'zero_denominator'
        : null);
  const gains: Record<string, EconomyValue> = {},
    perMinute: Record<string, EconomyValue> = {};
  for (const key of GAIN_FIELDS) {
    const a = from?.values[key],
      b = to?.values[key];
    const delta =
      a?.value != null && b?.value != null ? b.value - a.value : null;
    const invalid = delta !== null && delta < 0 ? 'counter_regression' : null;
    const missing = reason ?? a?.reason ?? b?.reason ?? invalid;
    gains[key] = value(
      'E03',
      FIELDS[key][1],
      delta,
      [...(a?.evidence ?? []), ...(b?.evidence ?? [])],
      missing,
      true,
      'end observed cumulative counter - start observed cumulative counter',
    );
    perMinute[key] = value(
      'E03',
      `${FIELDS[key][1]}_per_minute`,
      delta !== null && elapsedMs && elapsedMs > 0
        ? delta / (elapsedMs / 60_000)
        : null,
      gains[key].evidence,
      missing,
      true,
      'counter delta / (actual elapsed milliseconds / 60000)',
    );
    perMinute[key].denominator = {
      value: elapsedMs !== null && elapsedMs > 0 ? elapsedMs / 60_000 : null,
      unit: 'minutes',
      population: 'actual elapsed time between the two observations',
    };
  }
  return {
    startMs,
    endMs,
    elapsedMs,
    fromFrameIndex: from?.frameIndex ?? null,
    toFrameIndex: to?.frameIndex ?? null,
    partialFinalInterval:
      endMs === observedEndMs &&
      elapsedMs !== null &&
      elapsedMs > 0 &&
      frameIntervalMs !== null &&
      elapsedMs < frameIntervalMs,
    reason,
    gains,
    perMinute,
  };
}

/** Pure projected-input computation. No raw/network reads and no processing timestamp invented at request time. */
export function calculateEconomy(
  input: EconomyInput,
  puuid: string,
  mode: CheckpointMode = 'nearest',
) {
  const participant = input.participants.find((p) => p.puuid === puuid);
  if (!participant) throw new RangeError('Participant not found');
  const processing = input.processing;
  const provenanceKnown =
    processing?.status === 'COMPLETED' &&
    processing.completedAt instanceof Date &&
    Number.isFinite(processing.completedAt.getTime()) &&
    processing.processingVersion !== null;
  const processingSupported =
    provenanceKnown && processing.processingVersion! >= 2;
  const processedAt = provenanceKnown
    ? processing.completedAt!.toISOString()
    : null;
  const projection = input.projection;
  const projectionReason = !provenanceKnown
    ? 'missing_processing_provenance'
    : !processingSupported
      ? 'unsupported_version'
      : !projection
        ? 'missing_projection'
        : null;
  const remake = assessRemake({
    gameVersion: input.gameVersion,
    durationSeconds: input.gameDuration,
    surrender: null,
    earlySurrenderFlags: input.participants.map((p) => {
      const flag = finalValue(p, 'gameEndedInEarlySurrender');
      return typeof flag === 'boolean' ? flag : null;
    }),
  });
  const cohortReason =
    input.mapId !== 11 || ![420, 440].includes(input.queueId)
      ? 'outside_cohort'
      : remake.reason;
  const globalReason = projectionReason ?? cohortReason;
  const rawEnd = projection?.observedEndMs;
  const endMs =
    rawEnd !== null &&
    rawEnd !== undefined &&
    Number.isFinite(rawEnd) &&
    rawEnd >= 0
      ? rawEnd
      : Math.max(0, input.gameDuration * 1000);
  const role = normalizeRole(participant.role);
  const opponentResult = selectUniqueOpponent(participant, input.participants);
  const ownRoleCount = role
    ? input.participants.filter(
        (p) =>
          p.teamId === participant.teamId && normalizeRole(p.role) === role,
      ).length
    : 0;
  const opponent = ownRoleCount === 1 ? opponentResult.opponent : null;
  const opponentReason =
    ownRoleCount !== 1 ? 'ambiguous_role' : opponentResult.reason;
  const candidates = (projection?.frames ?? [])
    .filter(
      (frame): frame is SnapshotFrame & { timestamp: number } =>
        frame.timestamp !== null &&
        Number.isFinite(frame.timestamp) &&
        frame.timestamp >= 0 &&
        frame.timestamp <= endMs,
    )
    .sort((a, b) => a.timestamp - b.timestamp || a.frameIndex - b.frameIndex);
  const samples: EconomySample[] = projectionReason
    ? []
    : (projection?.frames ?? [])
        .map((frame) => ({
          frameIndex: frame.frameIndex,
          timestampMs: frame.timestamp,
          values: frameValues(
            frame,
            participant,
            input.participants,
            globalReason ??
              (frame.timestamp !== null &&
              (frame.timestamp < 0 || frame.timestamp > endMs)
                ? 'outside_observed_duration'
                : null),
          ),
        }))
        .sort(
          (a, b) =>
            (a.timestampMs ?? Infinity) - (b.timestampMs ?? Infinity) ||
            a.frameIndex - b.frameIndex,
        );
  const checkpoint = (targetMs: number): EconomyCheckpoint => {
    const selected = selectCheckpoint(candidates, targetMs, endMs, mode);
    const reason = globalReason ?? selected.reason;
    const values = selected.frame
      ? frameValues(selected.frame, participant, input.participants, reason)
      : absentValues(reason ?? 'missing_frame');
    const comparisonReason = reason ?? opponentReason;
    const other =
      selected.frame && opponent
        ? frameValues(
            selected.frame,
            opponent,
            input.participants,
            comparisonReason,
          )
        : absentValues(comparisonReason ?? 'missing_opponent');
    const participantMissing =
      selected.frame && !participantSnapshot(selected.frame, puuid)
        ? 'missing_participant_frame'
        : null;
    return {
      targetMs,
      actualMs: selected.timestampMs,
      offsetMs: selected.offsetMs,
      mode,
      toleranceMs: CHECKPOINT_TOLERANCE_MS,
      frameIndex: selected.frame?.frameIndex ?? null,
      eligible: !reason && !participantMissing,
      comparisonEligible:
        !comparisonReason &&
        !participantMissing &&
        !!selected.frame &&
        !!opponent &&
        !!participantSnapshot(selected.frame, opponent.puuid),
      reason: reason ?? participantMissing,
      comparisonReason:
        comparisonReason ??
        participantMissing ??
        (selected.frame &&
        opponent &&
        !participantSnapshot(selected.frame, opponent.puuid)
          ? 'missing_participant_frame'
          : null),
      values,
      opponent: other,
      differences: differences(values, other, comparisonReason),
    };
  };
  const checkpoints = ECONOMY_CHECKPOINTS.map(checkpoint);
  const usable = samples.filter(
    (s) =>
      s.timestampMs !== null && s.timestampMs >= 0 && s.timestampMs <= endMs,
  );
  const intervals = usable
    .slice(1)
    .map((to, i) =>
      interval(
        usable[i],
        to,
        endMs,
        projection?.frameIntervalMs ?? null,
        globalReason,
      ),
    );
  const boundaries = [
    0,
    ...ECONOMY_CHECKPOINTS.filter((t) => t < endMs),
    endMs,
  ];
  const phases = boundaries.slice(1).map((targetEndMs, i) => {
    const targetStartMs = boundaries[i],
      start = checkpoint(targetStartMs),
      end = checkpoint(targetEndMs);
    const from = samples.find((s) => s.frameIndex === start.frameIndex) ?? null,
      to = samples.find((s) => s.frameIndex === end.frameIndex) ?? null;
    return {
      targetStartMs,
      targetEndMs,
      startOffsetMs: start.offsetMs,
      endOffsetMs: end.offsetMs,
      mode,
      toleranceMs: CHECKPOINT_TOLERANCE_MS,
      ...interval(
        from,
        to,
        endMs,
        projection?.frameIntervalMs ?? null,
        globalReason ?? start.reason ?? end.reason,
      ),
    };
  });
  const gold = usable
    .map((s) => s.values.currentGold)
    .filter((v) => v.value !== null);
  const sortedGold = gold.map((v) => v.value!).sort((a, b) => a - b);
  const middle = Math.floor(sortedGold.length / 2);
  const median = sortedGold.length
    ? sortedGold.length % 2
      ? sortedGold[middle]
      : (sortedGold[middle - 1] + sortedGold[middle]) / 2
    : null;
  const summary = (observed: number | null, unit: string, method: string) => {
    const result = value(
      'E05',
      unit,
      observed,
      gold.flatMap((g) => g.evidence),
      globalReason ?? (!gold.length ? 'missing_sample' : null),
      true,
      method,
    );
    result.quality = metricQuality(gold.length, usable.length);
    return result;
  };
  const fractionAboveThreshold = summary(
    gold.length
      ? sortedGold.filter((v) => v >= UNSPENT_GOLD_THRESHOLD).length /
          gold.length
      : null,
    'ratio',
    'valid snapshots currentGold >= threshold / valid currentGold snapshots; not time weighted',
  );
  fractionAboveThreshold.denominator = {
    value: gold.length,
    unit: 'snapshots',
    population: 'observed valid currentGold snapshots',
  };
  const finalResources = Object.fromEntries(
    [
      'totalMinionsKilled',
      'neutralMinionsKilled',
      'totalAllyJungleMinionsKilled',
      'totalEnemyJungleMinionsKilled',
    ].map((field) => [
      field,
      value(
        field.includes('Jungle') ? 'E10' : 'E02',
        'cs',
        finalValue(participant, field),
        [
          {
            source: 'MatchParticipant.finalStats.values',
            field,
            value:
              typeof finalValue(participant, field) === 'number'
                ? (finalValue(participant, field) as number)
                : null,
          },
        ],
        globalReason,
        false,
        'literal final counter; no jungle route inferred',
      ),
    ]),
  );
  return {
    matchId: input.matchId,
    puuid,
    metricVersion: ECONOMY_VERSION,
    processingVersion: provenanceKnown ? processing.processingVersion : null,
    processedAt,
    reason: globalReason,
    eligible: globalReason === null,
    eligibility: {
      mapId: input.mapId,
      queueId: input.queueId,
      gameVersion: input.gameVersion,
      remakeRuleVersion: remake.ruleVersion,
      remakeStatus: remake.status,
    },
    opponent: { puuid: opponent?.puuid ?? null, role, reason: opponentReason },
    observedEndMs: rawEnd === endMs ? rawEnd : null,
    effectiveEndMs: endMs,
    endSource: rawEnd === endMs ? 'GAME_END' : 'Match.gameDuration_seconds',
    checkpointContract: {
      metricVersion: ECONOMY_VERSION,
      mode,
      toleranceMs: CHECKPOINT_TOLERANCE_MS,
      legacyAt15Version: 0,
    },
    quality: {
      validTimestampFrames: candidates.length,
      totalFrames: projection?.frames.length ?? 0,
      ...metricQuality(
        samples.filter((s) => s.values.totalGold.value !== null).length,
        samples.length,
      ),
    },
    checkpoints,
    samples,
    intervals,
    phases,
    unspentGold: {
      threshold: UNSPENT_GOLD_THRESHOLD,
      maximum: summary(
        sortedGold.at(-1) ?? null,
        'gold',
        'maximum observed currentGold',
      ),
      median: summary(
        median,
        'gold',
        'median observed currentGold; not time weighted',
      ),
      fractionAboveThreshold,
      interpretation:
        'Sampled unspent balance; not waste or a spend recommendation.',
    },
    finalResources,
  };
}
export type EconomyReport = ReturnType<typeof calculateEconomy>;
