import {
  MetricContext,
  MetricResult,
  MissingReason,
  metricContext,
  metricQuality,
  metricValue,
  ratioMetric,
  unavailableMetric,
} from '../contracts/metric-contract';
import type { TimelineSnapshotProjection } from '../contracts/normalized-snapshots';
import {
  computeSnapshotGoldTimeline,
  determineWinner,
} from './gold-calculator';

export const SEQUENCE_PARAMETERS = {
  version: 1,
  deathWindowMs: 60_000,
  killWindowsMs: [60_000, 90_000],
  goldAfterMs: 180_000,
  frameToleranceMs: 60_000,
  tradeWindowMs: 90_000,
  eventBounds: '(]',
  checkpointMode: 'pastOnly',
  objectiveTypes: ['ELITE_MONSTER_KILL', 'BUILDING_KILL'],
} as const;
export const SEQUENCE_EVENT_TYPES = [
  ...SEQUENCE_PARAMETERS.objectiveTypes,
  'CHAMPION_KILL',
  'GAME_END',
];
export interface SequenceEvent {
  matchId: string;
  frameIndex: number;
  eventIndex: number;
  type: string | null;
  timestampMs: number | null;
  actorPuuid: string | null;
  victimPuuid: string | null;
  sourceTeamId: number | null;
  beneficiaryTeamId: number | null;
  lane: string | null;
  payload: unknown;
  metricVersion: number;
  processingVersion: number;
}
export interface SequencesInput {
  matchId: string;
  gameVersion: string | null;
  mapId: number | null;
  participants: { puuid: string; teamId: number }[];
  teams: { teamId: number; win: boolean }[];
  projection: TimelineSnapshotProjection | null;
  events: SequenceEvent[];
  processing: {
    status: string;
    processingVersion: number | null;
    completedAt: Date | null;
  } | null;
}
export interface SequenceEvidence {
  eventId: string;
  frameIndex: number;
  eventIndex: number;
  timestampMs: number;
  type: string;
  objective: string | null;
  teamId: number | null;
  lane: string | null;
}
export interface SequenceEpisode {
  event: SequenceEvidence;
  subjectId: string;
  windowMs: number;
  windowEndMs: number;
  observedUntilMs: number | null;
  eligible: boolean;
  reason: MissingReason | null;
  objectives: SequenceEvidence[];
}
export interface SequenceRate {
  subjectId: string;
  windowMs: number;
  eligibleEvents: number;
  censoredEvents: number;
  associatedEvents: number;
  rate: MetricResult;
}
export interface SequenceGoldFrame {
  frameIndex: number;
  timestampMs: number;
  targetMs: number;
  offsetMs: number;
  blueGold: number | null;
  redGold: number | null;
  difference: number | null;
}
export interface ObjectiveGoldChange {
  objective: SequenceEvidence;
  before: SequenceGoldFrame | null;
  after: SequenceGoldFrame | null;
  delta: MetricResult;
}
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;
const team = (v: unknown): v is 100 | 200 => v === 100 || v === 200;
const id = (e: SequenceEvent) => `${e.matchId}:${e.frameIndex}:${e.eventIndex}`;
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

/** Associations of recorded events only. No causal attribution or inferred objective availability. */
export function calculateSequences(input: SequencesInput) {
  const job = input.processing;
  const base = {
    matchId: input.matchId,
    gameVersion: input.gameVersion,
    mapId: input.mapId,
    metricVersion: 1,
    processingVersion: job?.processingVersion ?? null,
    processedAt:
      job?.completedAt instanceof Date && finite(job.completedAt.getTime())
        ? job.completedAt.toISOString()
        : null,
    parameters: SEQUENCE_PARAMETERS,
  };
  const unavailable = (reason: MissingReason) => ({
    ...base,
    reason,
    report: null,
  });
  if (job?.status !== 'COMPLETED' || !base.processedAt)
    return unavailable('not_calculated');
  if (job.processingVersion === null || job.processingVersion < 2)
    return unavailable('unsupported_version');
  const unique = new Map<string, SequenceEvent>();
  let duplicates = 0;
  for (const e of input.events.filter((e) =>
    SEQUENCE_EVENT_TYPES.includes(e.type ?? ''),
  )) {
    if (
      e.matchId !== input.matchId ||
      e.processingVersion !== job.processingVersion ||
      e.metricVersion !== 1
    )
      return unavailable('unsupported_version');
    if (
      !Number.isSafeInteger(e.frameIndex) ||
      e.frameIndex < 0 ||
      !Number.isSafeInteger(e.eventIndex) ||
      e.eventIndex < 0
    )
      return unavailable('invalid_value');
    const previous = unique.get(id(e));
    if (previous) {
      duplicates++;
      if (JSON.stringify(previous) !== JSON.stringify(e))
        return unavailable('invalid_value');
    } else unique.set(id(e), e);
  }
  const all = [...unique.values()];
  const ends = all.filter(
    (e) => e.type === 'GAME_END' && finite(e.timestampMs),
  );
  const observedEndMs = ends.length === 1 ? ends[0].timestampMs! : null;
  const invalidTimes = all.filter(
    (e) =>
      !finite(e.timestampMs) ||
      (observedEndMs !== null && e.timestampMs > observedEndMs),
  ).length;
  const valid = all
    .filter(
      (e) =>
        finite(e.timestampMs) &&
        (observedEndMs === null || e.timestampMs <= observedEndMs),
    )
    .sort(
      (a, b) =>
        a.timestampMs! - b.timestampMs! ||
        a.frameIndex - b.frameIndex ||
        a.eventIndex - b.eventIndex,
    );
  const players = new Map(input.participants.map((p) => [p.puuid, p.teamId]));
  if (players.size !== input.participants.length)
    return unavailable('invalid_value');
  const kills = valid.filter((e) => e.type === 'CHAMPION_KILL');
  const objectives = valid.filter((e) =>
    SEQUENCE_PARAMETERS.objectiveTypes.some((t) => t === e.type),
  );
  const unknownObjectives = objectives.filter(
    (e) => !team(e.beneficiaryTeamId),
  ).length;
  const unknownKills = kills.filter(
    (e) => !team(e.sourceTeamId) || !team(players.get(e.victimPuuid ?? '')),
  ).length;
  const completeReason: MissingReason | null =
    observedEndMs === null || invalidTimes
      ? 'incomplete_events'
      : unknownObjectives || unknownKills
        ? 'missing_field'
        : null;
  const context = (
    metricId: string,
    subject: MetricContext['subject'],
    unit: MetricContext['unit'],
    denominator: MetricContext['denominator'] = null,
  ): MetricContext =>
    metricContext({
      metricId,
      subject,
      unit,
      denominator,
      metricVersion: 1,
      processingVersion: job.processingVersion!,
      processedAt: base.processedAt!,
      matchId: input.matchId,
      window:
        observedEndMs === null
          ? null
          : { startMs: 0, endMs: observedEndMs, bounds: '[]' },
      quality: {
        ...metricQuality(valid.length, all.length),
        unknownEvents: unknownObjectives + unknownKills,
        reconciliationIssues: duplicates
          ? [`${duplicates} identical duplicate event identities removed`]
          : [],
      },
      evidence:
        ends.length === 1
          ? [
              {
                source: 'MatchEvent',
                field: 'GAME_END',
                value: observedEndMs,
                eventId: id(ends[0]),
                frameIndex: ends[0].frameIndex,
                timestampMs: observedEndMs!,
              },
            ]
          : [],
    });
  const evidence = (e: SequenceEvent): SequenceEvidence => {
    const payload = object(e.payload);
    const objective =
      e.type === 'ELITE_MONSTER_KILL'
        ? payload.monsterType
        : e.type === 'BUILDING_KILL'
          ? payload.buildingType
          : null;
    return {
      eventId: id(e),
      frameIndex: e.frameIndex,
      eventIndex: e.eventIndex,
      timestampMs: e.timestampMs!,
      type: e.type!,
      objective: typeof objective === 'string' ? objective : null,
      teamId:
        e.type === 'CHAMPION_KILL'
          ? team(e.sourceTeamId)
            ? e.sourceTeamId
            : null
          : team(e.beneficiaryTeamId)
            ? e.beneficiaryTeamId
            : null,
      lane: e.lane,
    };
  };
  const episode = (
    event: SequenceEvent,
    subjectId: string,
    capturingTeam: number,
    windowMs: number,
  ): SequenceEpisode => {
    const windowEndMs = event.timestampMs! + windowMs;
    const eligible =
      completeReason === null &&
      observedEndMs !== null &&
      windowEndMs <= observedEndMs;
    return {
      event: evidence(event),
      subjectId,
      windowMs,
      windowEndMs,
      observedUntilMs:
        observedEndMs === null ? null : Math.min(windowEndMs, observedEndMs),
      eligible,
      reason: eligible ? null : (completeReason ?? 'short_match'),
      objectives: objectives
        .filter(
          (o) =>
            o.beneficiaryTeamId === capturingTeam &&
            o.timestampMs! > event.timestampMs! &&
            o.timestampMs! <= windowEndMs,
        )
        .map(evidence),
    };
  };
  // Exactly one episode per recorded death; several objectives remain evidence in that episode.
  const deathEpisodes = kills
    .filter((e) => team(players.get(e.victimPuuid ?? '')))
    .map((e) =>
      episode(
        e,
        e.victimPuuid!,
        300 - players.get(e.victimPuuid!)!,
        SEQUENCE_PARAMETERS.deathWindowMs,
      ),
    );
  const killEpisodes = SEQUENCE_PARAMETERS.killWindowsMs.flatMap((windowMs) =>
    kills
      .filter((e) => team(e.sourceTeamId))
      .map((e) =>
        episode(e, String(e.sourceTeamId), e.sourceTeamId!, windowMs),
      ),
  );
  const rate = (
    episodes: SequenceEpisode[],
    subjectId: string,
    windowMs: number,
    metricId: string,
    kind: 'participant' | 'team',
  ): SequenceRate => {
    const matching = episodes.filter(
      (e) => e.subjectId === subjectId && e.windowMs === windowMs,
    );
    const eligible = matching.filter((e) => e.eligible);
    const associatedEvents = eligible.filter(
      (e) => e.objectives.length > 0,
    ).length;
    const ctx = context(metricId, { kind, id: subjectId }, 'percent', {
      value: completeReason ? null : eligible.length,
      unit: 'count',
      population: `${kind === 'participant' ? 'recorded participant deaths' : 'recorded team champion kills'} with complete ${windowMs}ms follow-up`,
    });
    ctx.quality = {
      ...ctx.quality,
      ...metricQuality(eligible.length, matching.length),
    };
    ctx.evidence.push(
      ...eligible.map((e) => ({
        source: 'MatchEvent',
        field: 'eligible_trigger',
        value: e.objectives.length,
        eventId: e.event.eventId,
        frameIndex: e.event.frameIndex,
        timestampMs: e.event.timestampMs,
      })),
    );
    return {
      subjectId,
      windowMs,
      eligibleEvents: eligible.length,
      censoredEvents: matching.filter((e) => e.reason === 'short_match').length,
      associatedEvents,
      rate: completeReason
        ? unavailableMetric(ctx, completeReason)
        : ratioMetric(ctx, associatedEvents, eligible.length, 100),
    };
  };
  const deathRates = input.participants.map((p) =>
    rate(deathEpisodes, p.puuid, 60_000, 'C07', 'participant'),
  );
  const killRates = [100, 200].flatMap((t) =>
    SEQUENCE_PARAMETERS.killWindowsMs.map((w) =>
      rate(killEpisodes, String(t), w, 'O05', 'team'),
    ),
  );
  // Each unordered pair appears once; a capture can participate in multiple explicitly dependent pairs.
  const temporalTrades: {
    first: SequenceEvidence;
    second: SequenceEvidence;
    elapsedMs: number;
  }[] = [];
  objectives.forEach((first, i) =>
    objectives.slice(i + 1).forEach((second) => {
      const elapsedMs = second.timestampMs! - first.timestampMs!;
      if (
        team(first.beneficiaryTeamId) &&
        team(second.beneficiaryTeamId) &&
        first.beneficiaryTeamId !== second.beneficiaryTeamId &&
        elapsedMs <= SEQUENCE_PARAMETERS.tradeWindowMs
      )
        temporalTrades.push({
          first: evidence(first),
          second: evidence(second),
          elapsedMs,
        });
    }),
  );
  const projection =
    input.projection?.projectionVersion === 1 ? input.projection : null;
  const gold = projection
    ? computeSnapshotGoldTimeline(projection, input.participants).filter(
        (f) =>
          finite(f.timestampMs) &&
          (observedEndMs === null || f.timestampMs <= observedEndMs),
      )
    : [];
  const sample = (targetMs: number): SequenceGoldFrame | null => {
    const row = [...gold].reverse().find((f) => f.timestampMs <= targetMs);
    if (
      !row ||
      targetMs - row.timestampMs > SEQUENCE_PARAMETERS.frameToleranceMs
    )
      return null;
    return {
      frameIndex: row.frameIndex,
      timestampMs: row.timestampMs,
      targetMs,
      offsetMs: row.timestampMs - targetMs,
      blueGold: row.blueTeam,
      redGold: row.redTeam,
      difference: row.difference,
    };
  };
  const goldChanges: ObjectiveGoldChange[] = objectives.map((o) => {
    const before = sample(o.timestampMs!),
      target = o.timestampMs! + SEQUENCE_PARAMETERS.goldAfterMs;
    const after =
      observedEndMs !== null && target <= observedEndMs ? sample(target) : null;
    const ctx = context(
      'O06',
      { kind: 'team', id: String(o.beneficiaryTeamId ?? 'unknown') },
      'gold',
    );
    ctx.window = { startMs: o.timestampMs!, endMs: target, bounds: '[]' };
    ctx.evidence = [
      {
        source: 'MatchEvent',
        field: 'objective',
        value: o.type,
        eventId: id(o),
        frameIndex: o.frameIndex,
        timestampMs: o.timestampMs!,
      },
      ...[before, after]
        .filter((f) => f !== null)
        .map((f) => ({
          source: 'Match.timelineProjection',
          field: 'team_gold_difference_blue_minus_red',
          value: f.difference,
          frameIndex: f.frameIndex,
          timestampMs: f.timestampMs,
        })),
    ];
    ctx.quality = metricQuality(
      [before, after].filter((f) => f?.difference != null).length,
      2,
    );
    const reason: MissingReason | null = !projection
      ? input.projection
        ? 'unsupported_version'
        : 'missing_projection'
      : observedEndMs === null
        ? 'incomplete_events'
        : target > observedEndMs
          ? 'short_match'
          : !team(o.beneficiaryTeamId)
            ? 'missing_field'
            : before?.difference == null || after?.difference == null
              ? 'missing_frame'
              : null;
    return {
      objective: evidence(o),
      before,
      after,
      delta: reason
        ? unavailableMetric(ctx, reason)
        : metricValue(
            ctx,
            (after!.difference! - before!.difference!) *
              (o.beneficiaryTeamId === 100 ? 1 : -1),
            'derived',
            'beneficiary team gold advantage at past-only objective+180s minus past-only objective; whole-map observed change, no causal attribution',
          ),
    };
  });
  const winner = determineWinner(input.teams),
    winnerTeamId =
      winner === 'blueTeam' ? 100 : winner === 'redTeam' ? 200 : null;
  const observed = gold.filter((f) => f.difference !== null);
  const signed = (value: number) => value * (winnerTeamId === 100 ? 1 : -1);
  const worst =
    winnerTeamId === null
      ? null
      : observed.reduce<(typeof gold)[number] | null>(
          (best, f) =>
            !best || signed(f.difference!) < signed(best.difference!)
              ? f
              : best,
          null,
        );
  // A missing sample after the candidate prevents a persistence assertion across the sampled series.
  const persistent =
    winnerTeamId === null
      ? undefined
      : gold.find(
          (f, i) =>
            f.difference !== null &&
            signed(f.difference) > 0 &&
            gold
              .slice(i)
              .every(
                (next) =>
                  next.difference !== null && signed(next.difference) > 0,
              ),
        );
  const comebackCtx = context(
    'O08',
    { kind: 'team', id: String(winnerTeamId ?? 'unknown') },
    'gold',
  );
  comebackCtx.quality = metricQuality(observed.length, gold.length);
  comebackCtx.evidence = worst
    ? [
        {
          source: 'Match.timelineProjection',
          field: 'winner_gold_difference',
          value: signed(worst.difference!),
          frameIndex: worst.frameIndex,
          timestampMs: worst.timestampMs,
        },
      ]
    : [];
  const comebackReason: MissingReason | null =
    winnerTeamId === null
      ? 'missing_field'
      : !projection
        ? input.projection
          ? 'unsupported_version'
          : 'missing_projection'
        : !worst
          ? 'missing_frame'
          : null;
  return {
    ...base,
    reason: null,
    report: {
      coverage: {
        observedEndMs,
        uniqueEvents: all.length,
        identicalDuplicatesRemoved: duplicates,
        invalidTimestampEvents: invalidTimes,
        unknownObjectiveTeams: unknownObjectives,
        unknownKillTeamsOrVictims: unknownKills,
        rateUnavailableReason: completeReason,
      },
      deathEpisodes,
      deathRates,
      killEpisodes,
      killRates,
      goldChanges,
      temporalTrades,
      comeback: {
        winnerTeamId,
        largestObservedDeficit: comebackReason
          ? unavailableMetric(comebackCtx, comebackReason)
          : metricValue(
              comebackCtx,
              Math.max(0, -signed(worst!.difference!)),
              'derived',
              'negative minimum observed gold difference of the actual Match-V5 winner, floored at zero',
            ),
        firstPersistentLead: persistent
          ? {
              frameIndex: persistent.frameIndex,
              timestampMs: persistent.timestampMs,
              winnerGoldAdvantage: signed(persistent.difference!),
              subsequentSamples: gold.filter(
                (f) => f.timestampMs >= persistent.timestampMs,
              ).length,
            }
          : null,
        persistenceReason:
          comebackReason ?? (persistent ? null : 'insufficient_sample'),
        signChanges: gold.slice(1).flatMap((f, i) =>
          gold[i].difference !== null &&
          f.difference !== null &&
          Math.sign(gold[i].difference) !== Math.sign(f.difference)
            ? [
                {
                  before: sample(gold[i].timestampMs)!,
                  after: sample(f.timestampMs)!,
                },
              ]
            : [],
        ),
        finalSampleMs: gold.at(-1)?.timestampMs ?? null,
      },
      limitations: [
        'Temporal association does not establish causality, objective availability, intent, player blame or buff gold.',
        'O05 denominator is individual team kill events. Multiple kills linked to one capture are dependent observations.',
        'C07 counts one death episode with an objective list. Overlapping windows are dependent observations.',
        'O07 lists unordered opposing capture pairs once; pairs sharing an objective are not independent exchanges.',
        'O08 persistence refers only to available snapshots through finalSampleMs; no continuous or unobserved lead is inferred.',
      ],
    },
  };
}
export type SequencesReport = ReturnType<typeof calculateSequences>;
