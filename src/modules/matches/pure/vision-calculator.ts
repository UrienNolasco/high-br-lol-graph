import {
  MetricResult,
  metricContext,
  metricQuality,
  metricValue,
  unavailableMetric,
  ratioMetric,
} from '../contracts/metric-contract';
export const VISION_DEFINITION_VERSION = 1;
export const VISION_WARD_TYPES = [
  'SIGHT_WARD',
  'YELLOW_TRINKET',
  'BLUE_TRINKET',
  'CONTROL_WARD',
] as const;
export interface VisionEvent {
  matchId: string;
  frameIndex: number;
  eventIndex: number;
  type: string | null;
  timestampMs: number | null;
  actorPuuid: string | null;
  beneficiaryTeamId: number | null;
  payload: unknown;
  metricVersion: number;
  processingVersion: number;
}
export interface VisionInput {
  matchId: string;
  gameVersion: string;
  gameDuration: number;
  participants: Array<{ puuid: string; teamId: number; finalStats: unknown }>;
  events: VisionEvent[];
  processing: {
    status: string;
    processingVersion: number | null;
    completedAt: Date | null;
  } | null;
}
export const visionEventId = (e: VisionEvent) =>
  `${e.matchId}:${e.frameIndex}:${e.eventIndex}`;
function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function stat(p: VisionInput['participants'][number], key: string) {
  const projection = record(p.finalStats);
  if (projection.projectionVersion !== 1) return null;
  const v = record(projection.values)[key];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}
function wardType(e: VisionEvent): string {
  const v = record(e.payload).wardType;
  return typeof v === 'string' ? v : 'MISSING';
}
function known(e: VisionEvent) {
  return (VISION_WARD_TYPES as readonly string[]).includes(wardType(e));
}
function prepareVision(input: VisionInput) {
  const byPuuid = new Map(input.participants.map((p) => [p.puuid, p]));
  const sourceEvents = input.events.filter((e) =>
    ['WARD_PLACED', 'WARD_KILL', 'ELITE_MONSTER_KILL', 'GAME_END'].includes(
      e.type ?? '',
    ),
  );
  const unique = [
    ...new Map(sourceEvents.map((e) => [visionEventId(e), e])).values(),
  ];
  const events = unique.sort(
    (a, b) =>
      (a.timestampMs ?? Infinity) - (b.timestampMs ?? Infinity) ||
      a.frameIndex - b.frameIndex ||
      a.eventIndex - b.eventIndex,
  );
  const generation = input.processing?.processingVersion ?? 0;
  const consistent =
    generation >= 2 &&
    events.every(
      (e) => e.metricVersion === 1 && e.processingVersion === generation,
    );
  const endEvent = events.find(
    (e) =>
      e.type === 'GAME_END' && e.timestampMs !== null && e.timestampMs >= 0,
  );
  const endMs = endEvent?.timestampMs ?? input.gameDuration * 1000;
  const relevant = events.filter(
    (e) => e.type === 'WARD_PLACED' || e.type === 'WARD_KILL',
  );
  const timed = relevant.filter(
    (e) =>
      e.timestampMs !== null && e.timestampMs >= 0 && e.timestampMs <= endMs,
  );
  const attributed = timed.filter(
    (e) => e.actorPuuid !== null && byPuuid.has(e.actorPuuid),
  );
  const complete =
    input.processing?.status === 'COMPLETED' &&
    consistent &&
    !!endEvent &&
    timed.length === relevant.length;
  const processedAt = input.processing?.completedAt?.toISOString() ?? null;
  return {
    byPuuid,
    sourceEvents,
    unique,
    events,
    generation,
    endMs,
    relevant,
    timed,
    attributed,
    processedAt,
    sourceComplete: complete && attributed.length === relevant.length,
    unknownTypeEvents: relevant.filter((e) => !known(e)).length,
    calculated:
      !!processedAt &&
      input.processing?.status === 'COMPLETED' &&
      input.processing.processingVersion !== null,
  };
}

function createVisionCounters(
  input: VisionInput,
  puuid: string,
  prepared: ReturnType<typeof prepareVision>,
) {
  const player = input.participants.find((p) => p.puuid === puuid);
  if (!player) throw new Error('Participant not found');
  const {
    byPuuid,
    generation,
    endMs,
    relevant,
    attributed,
    processedAt,
    sourceComplete,
    unknownTypeEvents,
  } = prepared;
  const own = attributed.filter((e) => e.actorPuuid === puuid);
  const team = attributed.filter(
    (e) => byPuuid.get(e.actorPuuid!)!.teamId === player.teamId,
  );
  const window: { startMs: number; endMs: number; bounds: '[]' | '[)' } = {
    startMs: 0,
    endMs,
    bounds: '[]',
  };
  const context = (
    id: string,
    unit: 'count' | 'count_per_minute' | 'seconds' | 'score' | 'percent',
    selected: VisionEvent[],
    w = window,
  ) =>
    metricContext({
      metricId: id,
      metricVersion: VISION_DEFINITION_VERSION,
      processingVersion: generation,
      processedAt: processedAt!,
      matchId: input.matchId,
      subject: { kind: 'participant', id: puuid },
      unit,
      window: w,
      denominator: null,
      quality: {
        ...metricQuality(attributed.length, relevant.length),
        unknownEvents: unknownTypeEvents,
        reconciliationIssues: [],
      },
      evidence: selected.map((e) => ({
        source: 'MatchEventProjection',
        field: e.type ?? 'unknown',
        value: wardType(e),
        eventId: visionEventId(e),
        timestampMs: e.timestampMs!,
      })),
    });
  const count = (id: string, selected: VisionEvent[], w = window) => {
    const ctx = context(id, 'count', selected, w);
    return sourceComplete
      ? metricValue(
          ctx,
          selected.length,
          'derived',
          'count of distinct attributed source event identities in the stated category/window',
        )
      : unavailableMetric(
          ctx,
          'missing_field',
          'complete, version-compatible event projection with timestamps and actors required',
        );
  };
  const recognizedCount = (
    type: 'WARD_PLACED' | 'WARD_KILL',
    selected: VisionEvent[],
    w = window,
  ) =>
    count(
      type === 'WARD_PLACED'
        ? 'V01.recognized_placements'
        : 'V02.recognized_removals',
      selected.filter((e) => e.type === type && known(e)),
      w,
    );
  return { player, own, team, window, context, count, recognizedCount };
}

export interface VisionTotals {
  metrics: {
    recognizedPlacements: MetricResult;
    recognizedRemovals: MetricResult;
  } | null;
}

/** Reuses the full report's source gates, counters and evidence; prepares a match once. */
export function calculateVisionTotals(
  input: VisionInput,
): Map<string, VisionTotals> {
  const prepared = prepareVision(input);
  return new Map<string, VisionTotals>(
    input.participants.map((player) => {
      if (!prepared.calculated) return [player.puuid, { metrics: null }];
      const { own, recognizedCount } = createVisionCounters(
        input,
        player.puuid,
        prepared,
      );
      return [
        player.puuid,
        {
          metrics: {
            recognizedPlacements: recognizedCount('WARD_PLACED', own),
            recognizedRemovals: recognizedCount('WARD_KILL', own),
          },
        },
      ];
    }),
  );
}

export function calculateVision(input: VisionInput, puuid: string) {
  const prepared = prepareVision(input);
  const {
    byPuuid,
    sourceEvents,
    unique,
    events,
    endMs,
    relevant,
    timed,
    attributed,
    processedAt,
    sourceComplete,
    unknownTypeEvents,
    calculated,
  } = prepared;
  const { player, own, team, window, context, count, recognizedCount } =
    createVisionCounters(input, puuid, prepared);
  const groups = (
    selected: VisionEvent[],
    w = window,
  ): Record<string, MetricResult> => ({
    recognizedPlacements: recognizedCount('WARD_PLACED', selected, w),
    unknownPlacements: count(
      'V01.unknown_placements',
      selected.filter((e) => e.type === 'WARD_PLACED' && !known(e)),
      w,
    ),
    recognizedRemovals: recognizedCount('WARD_KILL', selected, w),
    unknownRemovals: count(
      'V02.unknown_removals',
      selected.filter((e) => e.type === 'WARD_KILL' && !known(e)),
      w,
    ),
    controlPlacements: count(
      'V01.control_placements',
      selected.filter(
        (e) => e.type === 'WARD_PLACED' && wardType(e) === 'CONTROL_WARD',
      ),
      w,
    ),
    controlRemovals: count(
      'V02.control_removals',
      selected.filter(
        (e) => e.type === 'WARD_KILL' && wardType(e) === 'CONTROL_WARD',
      ),
      w,
    ),
  });
  const eventRefs = events
    .filter((e) => e.type !== 'GAME_END')
    .map((e) => ({
      eventId: visionEventId(e),
      type: e.type,
      timestampMs: e.timestampMs,
      actorPuuid: e.actorPuuid,
      teamId: e.actorPuuid ? (byPuuid.get(e.actorPuuid)?.teamId ?? null) : null,
      wardType:
        e.type === 'WARD_PLACED' || e.type === 'WARD_KILL' ? wardType(e) : null,
      wardCategory:
        e.type === 'WARD_PLACED' || e.type === 'WARD_KILL'
          ? known(e)
            ? 'recognized'
            : 'unknown'
          : null,
      beneficiaryTeamId: e.beneficiaryTeamId,
      monsterType:
        typeof record(e.payload).monsterType === 'string'
          ? record(e.payload).monsterType
          : null,
      position: null,
      spatialInterpretation: 'global_event_activity_only',
    }));
  const base = {
    matchId: input.matchId,
    puuid,
    teamId: player.teamId,
    gameVersion: input.gameVersion,
    metricVersion: VISION_DEFINITION_VERSION,
    processingVersion: input.processing?.processingVersion ?? null,
    processedAt,
    window,
    recognizedWardTypes: [...VISION_WARD_TYPES],
    coverage: {
      projectionComplete: sourceComplete,
      sourceEvents: relevant.length,
      timedEvents: timed.length,
      attributedEvents: attributed.length,
      unknownTypeEvents,
      duplicateInputIdentities: sourceEvents.length - unique.length,
    },
    events: eventRefs,
  };
  if (!calculated)
    return {
      ...base,
      reason: 'not_calculated',
      metrics: null,
      byType: [],
      phases: [],
      gaps: [],
      objectiveWindows: [],
      reconciliation: null,
    };
  const metrics = groups(own);
  const finalFields = [
    'visionWardsBoughtInGame',
    'detectorWardsPlaced',
    'wardsPlaced',
    'wardsKilled',
    'visionScore',
  ] as const;
  for (const field of finalFields) {
    const value = stat(player, field),
      ctx = context(
        `${field === 'wardsPlaced' ? 'V01' : field === 'wardsKilled' ? 'V02' : field === 'visionScore' ? 'V04' : 'V03'}.${field}`,
        field === 'visionScore' ? 'score' : 'count',
        [],
      );
    ctx.evidence = [
      {
        source: 'MatchParticipant.finalStats',
        field: `values.${field}`,
        value,
      },
    ];
    ctx.quality = metricQuality(value === null ? 0 : 1, 1);
    metrics[field] =
      value === null &&
      record(record(player.finalStats).missingReasons)[field] ===
        'invalid_value'
        ? unavailableMetric(ctx, 'invalid_value')
        : metricValue(
            ctx,
            value,
            'observed',
            `literal summary field ${field}; separate from timeline event counts`,
          );
  }
  const recognizedOwn = own.filter((e) => e.type === 'WARD_PLACED' && known(e));
  const recognizedTeam = team.filter(
    (e) => e.type === 'WARD_PLACED' && known(e),
  );
  const shareCtx = {
    ...context('V04.recognized_placement_share', 'percent', recognizedOwn),
    denominator: {
      value: sourceComplete ? recognizedTeam.length : null,
      unit: 'recognized placements',
      population: `attributed recognized WARD_PLACED of team ${player.teamId}`,
    },
  };
  metrics.placementShare = sourceComplete
    ? ratioMetric(shareCtx, recognizedOwn.length, recognizedTeam.length, 100)
    : unavailableMetric(shareCtx, 'missing_field');
  const ownRemovals = own.filter((e) => e.type === 'WARD_KILL' && known(e));
  const teamRemovals = team.filter((e) => e.type === 'WARD_KILL' && known(e));
  const removalContext = {
    ...context('V04.recognized_removal_share', 'percent', ownRemovals),
    denominator: {
      value: sourceComplete ? teamRemovals.length : null,
      unit: 'recognized removals',
      population: `attributed recognized WARD_KILL of team ${player.teamId}`,
    },
  };
  metrics.removalShare = sourceComplete
    ? ratioMetric(removalContext, ownRemovals.length, teamRemovals.length, 100)
    : unavailableMetric(removalContext, 'missing_field');
  const scorePlayers = input.participants.filter(
    (p) => p.teamId === player.teamId,
  );
  const scoreValues = scorePlayers.map((p) => stat(p, 'visionScore'));
  const scoresComplete =
    scorePlayers.length === 5 &&
    new Set(scorePlayers.map((p) => p.puuid)).size === 5 &&
    scoreValues.every((v) => v !== null);
  const teamScore = scoresComplete
    ? scoreValues.reduce<number>((n, v) => n + v, 0)
    : null;
  const scoreContext = {
    ...context('V04.vision_score_share', 'percent', []),
    denominator: {
      value: teamScore,
      unit: 'score',
      population: `summary visionScore of all five participants of team ${player.teamId}`,
    },
  };
  scoreContext.evidence = scorePlayers.map((p) => ({
    source: 'MatchParticipant.finalStats',
    field: `${p.puuid}.values.visionScore`,
    value: stat(p, 'visionScore'),
  }));
  scoreContext.quality = metricQuality(
    scoreValues.filter((v) => v !== null).length,
    Math.max(5, scoreValues.length),
  );
  metrics.visionScoreShare = ratioMetric(
    scoreContext,
    stat(player, 'visionScore'),
    teamScore,
    100,
  );
  const rateContext = {
    ...context(
      'V05.recognized_placements_per_minute',
      'count_per_minute',
      recognizedOwn,
    ),
    denominator: {
      value: sourceComplete ? endMs / 60000 : null,
      unit: 'minutes',
      population: 'observed game interval from zero to GAME_END',
    },
  };
  metrics.recognizedPlacementsPerMinute = sourceComplete
    ? ratioMetric(rateContext, recognizedOwn.length, endMs / 60000)
    : unavailableMetric(rateContext, 'missing_field');
  const byType = [...VISION_WARD_TYPES, 'UNKNOWN'].map((type) => ({
    type,
    metrics: {
      placements: count(
        'V01.type_placements',
        own.filter(
          (e) =>
            e.type === 'WARD_PLACED' &&
            (type === 'UNKNOWN' ? !known(e) : wardType(e) === type),
        ),
      ),
      removals: count(
        'V02.type_removals',
        own.filter(
          (e) =>
            e.type === 'WARD_KILL' &&
            (type === 'UNKNOWN' ? !known(e) : wardType(e) === type),
        ),
      ),
    },
  }));
  const phases = [
    [0, 840000],
    [840000, 1500000],
    [1500000, endMs],
  ]
    .filter(([start]) => start < endMs)
    .map(([start, end], index) => {
      const w = {
        startMs: start,
        endMs: Math.min(end, endMs),
        bounds:
          Math.min(end, endMs) === endMs ? ('[]' as const) : ('[)' as const),
      };
      const inside = (e: VisionEvent) =>
        e.timestampMs! >= w.startMs &&
        (w.bounds === '[]'
          ? e.timestampMs! <= w.endMs
          : e.timestampMs! < w.endMs);
      const ownTeam = team.filter(
        (e) => inside(e) && e.type === 'WARD_PLACED' && known(e),
      );
      const otherTeam = attributed.filter(
        (e) =>
          inside(e) &&
          e.type === 'WARD_PLACED' &&
          known(e) &&
          byPuuid.get(e.actorPuuid!)!.teamId !== player.teamId,
      );
      const differenceCtx = context(
        'V07.team_placement_difference',
        'count',
        [...ownTeam, ...otherTeam],
        w,
      );
      differenceCtx.subject = { kind: 'team', id: String(player.teamId) };
      const ownRemovals = team.filter(
        (e) => inside(e) && e.type === 'WARD_KILL' && known(e),
      );
      const otherRemovals = attributed.filter(
        (e) =>
          inside(e) &&
          e.type === 'WARD_KILL' &&
          known(e) &&
          byPuuid.get(e.actorPuuid!)!.teamId !== player.teamId,
      );
      const removalContext = context(
        'V07.team_removal_difference',
        'count',
        [...ownRemovals, ...otherRemovals],
        w,
      );
      removalContext.subject = { kind: 'team', id: String(player.teamId) };
      return {
        phase: index,
        window: w,
        metrics: groups(own.filter(inside), w),
        teamRecognizedRemovalDifference: sourceComplete
          ? metricValue(
              removalContext,
              ownRemovals.length - otherRemovals.length,
              'derived',
              'recognized removals of subject team minus other teams in phase',
            )
          : unavailableMetric(removalContext, 'missing_field'),
        teamRecognizedPlacementDifference: sourceComplete
          ? metricValue(
              differenceCtx,
              ownTeam.length - otherTeam.length,
              'derived',
              'recognized placements of subject team minus other team in phase',
            )
          : unavailableMetric(differenceCtx, 'missing_field'),
      };
    });
  const gaps = [false, true].map((includeEdges) => {
    const points = recognizedOwn.map((e) => ({
      timestampMs: e.timestampMs!,
      eventId: visionEventId(e),
    }));
    if (includeEdges) {
      points.unshift({ timestampMs: 0, eventId: '' });
      points.push({ timestampMs: endMs, eventId: '' });
    }
    const pairs = points
      .slice(1)
      .map((end, i) => ({
        start: points[i],
        end,
        durationMs: end.timestampMs - points[i].timestampMs,
      }))
      .sort(
        (a, b) =>
          b.durationMs - a.durationMs ||
          a.start.timestampMs - b.start.timestampMs,
      );
    const longest = sourceComplete ? pairs[0] : undefined;
    const ctx = context(
      'V05.longest_recognized_placement_gap',
      'seconds',
      recognizedOwn,
    );
    const metric = !sourceComplete
      ? unavailableMetric(ctx, 'missing_field')
      : !longest
        ? unavailableMetric(ctx, 'insufficient_sample')
        : metricValue(
            ctx,
            longest.durationMs / 1000,
            'derived',
            'maximum consecutive timestamp difference between recognized placements; configured game edges included explicitly',
          );
    return {
      includeGameEdges: includeEdges,
      metric,
      startMs: longest?.start.timestampMs ?? null,
      endMs: longest?.end.timestampMs ?? null,
      startEventId: longest?.start.eventId || null,
      endEventId: longest?.end.eventId || null,
      unknownPlacementEvents: own.filter(
        (e) => e.type === 'WARD_PLACED' && !known(e),
      ).length,
    };
  });
  const objectiveGroups = (...args: Parameters<typeof groups>) =>
    Object.fromEntries(
      Object.entries(groups(...args)).map(([key, value]) => [
        key,
        { ...value, metricId: `V06.${key}` },
      ]),
    );
  const objectiveWindows = events
    .filter(
      (e) =>
        e.type === 'ELITE_MONSTER_KILL' &&
        e.timestampMs !== null &&
        e.timestampMs >= 0 &&
        e.timestampMs <= endMs,
    )
    .flatMap((objective) =>
      [60000, 90000].map((lookbackMs) => {
        const end = objective.timestampMs!,
          start = Math.max(0, end - lookbackMs);
        const selected = attributed.filter(
          (e) => e.timestampMs! >= start && e.timestampMs! < end,
        );
        const w = { startMs: start, endMs: end, bounds: '[)' as const };
        return {
          objectiveEventId: visionEventId(objective),
          beneficiaryTeamId: objective.beneficiaryTeamId,
          lookbackMs,
          requestedStartMs: end - lookbackMs,
          window: w,
          censored: end < lookbackMs,
          eventIds: selected.map(visionEventId),
          player: objectiveGroups(
            selected.filter((e) => e.actorPuuid === puuid),
            w,
          ),
          teams: [...new Set(input.participants.map((p) => p.teamId))]
            .sort()
            .map((teamId) => ({
              teamId,
              metrics: Object.fromEntries(
                Object.entries(
                  objectiveGroups(
                    selected.filter(
                      (e) => byPuuid.get(e.actorPuuid!)!.teamId === teamId,
                    ),
                    w,
                  ),
                ).map(([key, value]) => [
                  key,
                  {
                    ...value,
                    subject: { kind: 'team' as const, id: String(teamId) },
                  },
                ]),
              ),
            })),
          spatialInterpretation: 'global_event_activity_only',
        };
      }),
    );
  const finalPlaced = stat(player, 'wardsPlaced'),
    finalRemoved = stat(player, 'wardsKilled');
  return {
    ...base,
    reason: sourceComplete ? null : 'missing_field',
    metrics,
    byType,
    phases,
    gaps,
    objectiveWindows,
    reconciliation: {
      recognizedPlacementEvents: recognizedOwn.length,
      summaryWardsPlaced: finalPlaced,
      placementDifference:
        sourceComplete && finalPlaced !== null
          ? recognizedOwn.length - finalPlaced
          : null,
      recognizedRemovalEvents: own.filter(
        (e) => e.type === 'WARD_KILL' && known(e),
      ).length,
      summaryWardsKilled: finalRemoved,
      removalDifference:
        sourceComplete && finalRemoved !== null
          ? own.filter((e) => e.type === 'WARD_KILL' && known(e)).length -
            finalRemoved
          : null,
      policy:
        'comparison only; unknown events retained separately; do not overwrite either source',
    },
  };
}
