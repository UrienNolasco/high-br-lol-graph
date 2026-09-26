import {
  MetricEvidence,
  MetricUnit,
  MissingReason,
  metricContext,
  metricQuality,
  metricValue,
  unavailableMetric,
} from '../contracts/metric-contract';
import { BountyBoundary, interpretBountyWindows } from './bounty-windows';
export const BOUNTY_STEALS_VERSION = 1;
export const BOUNTY_EVENT_TYPES = [
  'OBJECTIVE_BOUNTY_PRESTART',
  'OBJECTIVE_BOUNTY_FINISH',
  'ELITE_MONSTER_KILL',
  'BUILDING_KILL',
  'CHAMPION_KILL',
  'GAME_END',
] as const;
export const STEAL_CHALLENGES = {
  epicMonsterSteals: 'steals',
  epicMonsterStolenWithoutSmite: 'steals_without_smite',
  epicMonsterKillsNearEnemyJungler: 'proximity',
  junglerTakedownsNearDamagedEpicMonster: 'proximity',
  epicMonsterKillsWithin30SecondsOfSpawn: 'spawn_timing',
} as const;
export interface BountyEvent {
  matchId: string;
  frameIndex: number;
  eventIndex: number;
  type: string | null;
  timestampMs: number | null;
  actorPuuid: string | null;
  sourceTeamId: number | null;
  ownerTeamId: number | null;
  beneficiaryTeamId: number | null;
  payload: unknown;
  quality: unknown;
  metricVersion: number;
  processingVersion: number;
}
export interface BountiesStealsInput {
  matchId: string;
  gameVersion: string;
  events: BountyEvent[];
  participants: Array<{
    puuid: string;
    teamId: number;
    championName: string;
    finalStats: unknown;
    challenges: unknown;
  }>;
  processing: {
    status: string;
    processingVersion: number | null;
    completedAt: Date | null;
  } | null;
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;
const eventId = (e: BountyEvent) =>
  `${e.matchId}:${e.frameIndex}:${e.eventIndex}`;
export function calculateBountiesSteals(input: BountiesStealsInput) {
  const date = input.processing?.completedAt;
  const metadata = {
    matchId: input.matchId,
    gameVersion: input.gameVersion,
    metricVersion: BOUNTY_STEALS_VERSION,
    processingVersion: input.processing?.processingVersion ?? null,
    processedAt:
      date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
  };
  if (
    input.processing?.status !== 'COMPLETED' ||
    metadata.processingVersion === null ||
    metadata.processedAt === null
  )
    return { ...metadata, reason: 'missing_projection', report: null };
  const events = input.events.filter((e) =>
    (BOUNTY_EVENT_TYPES as readonly string[]).includes(e.type ?? ''),
  );
  if (
    metadata.processingVersion < 2 ||
    events.some(
      (e) =>
        e.matchId !== input.matchId ||
        e.metricVersion !== 1 ||
        e.processingVersion !== metadata.processingVersion,
    )
  )
    return { ...metadata, reason: 'unsupported_version', report: null };
  if (new Set(events.map(eventId)).size !== events.length)
    return { ...metadata, reason: 'invalid_value', report: null };
  const ends = events.filter(
    (e) => e.type === 'GAME_END' && finite(e.timestampMs),
  );
  const gameEndMs = ends.length === 1 ? ends[0].timestampMs! : null;
  const context = (
    id: string,
    unit: MetricUnit,
    subject: { kind: 'match' | 'team' | 'participant'; id: string },
    evidence: MetricEvidence[],
    valid: number,
    total: number,
  ) =>
    metricContext({
      metricId: id,
      processingVersion: metadata.processingVersion!,
      processedAt: metadata.processedAt!,
      matchId: input.matchId,
      subject,
      unit,
      window: null,
      denominator: null,
      evidence,
      quality: metricQuality(valid, total),
    });
  const literal = (
    id: string,
    unit: MetricUnit,
    value: unknown,
    source: string,
    field: string,
    subject: { kind: 'match' | 'team' | 'participant'; id: string },
    reason: MissingReason | null = null,
    e?: BountyEvent,
  ) => {
    const invalid =
      value != null &&
      (!finite(value) || (unit === 'count' && !Number.isSafeInteger(value)));
    const r =
      reason ??
      (invalid ? 'invalid_value' : value == null ? 'missing_field' : null);
    const c = context(
      id,
      unit,
      subject,
      [
        {
          source,
          field,
          value: r ? null : (value as number),
          ...(e
            ? {
                eventId: eventId(e),
                frameIndex: e.frameIndex,
                ...(finite(e.timestampMs)
                  ? { timestampMs: e.timestampMs }
                  : {}),
              }
            : {}),
        },
      ],
      r ? 0 : 1,
      1,
    );
    return r
      ? unavailableMetric(c, r, 'literal source field; absent is not zero')
      : metricValue(
          c,
          value as number,
          'observed',
          'literal source field, no inferred reward/attempt/steal semantics or addition to other counters',
        );
  };
  const eventEvidence = (
    e: BountyEvent,
    field: string,
    value: MetricEvidence['value'],
  ): MetricEvidence => ({
    source: 'MatchEventProjection.payload',
    field,
    value,
    eventId: eventId(e),
    frameIndex: e.frameIndex,
    ...(finite(e.timestampMs) ? { timestampMs: e.timestampMs } : {}),
  });
  const boundaryEvents = events.filter(
    (e) =>
      e.type === 'OBJECTIVE_BOUNTY_PRESTART' ||
      e.type === 'OBJECTIVE_BOUNTY_FINISH',
  );
  const boundaries: BountyBoundary[] = boundaryEvents.map((e) => ({
    eventId: eventId(e),
    type: e.type as BountyBoundary['type'],
    timestampMs: finite(e.timestampMs) ? e.timestampMs : null,
    teamId:
      e.beneficiaryTeamId === 100 || e.beneficiaryTeamId === 200
        ? e.beneficiaryTeamId
        : null,
    actualStartTime: record(e.payload).actualStartTime,
    frameIndex: e.frameIndex,
    eventIndex: e.eventIndex,
  }));
  const interpreted = interpretBountyWindows(boundaries, gameEndMs);
  const byId = new Map(events.map((e) => [eventId(e), e]));
  const objectiveEvents = events.filter(
    (e) => e.type === 'ELITE_MONSTER_KILL' || e.type === 'BUILDING_KILL',
  );
  const windows = interpreted.map((w) => {
    const evidence = [w.announcement, w.finish]
      .filter((e): e is BountyBoundary => e !== null)
      .flatMap((b) => {
        const e = byId.get(b.eventId)!;
        return [
          eventEvidence(e, 'timestamp', b.timestampMs),
          ...(b.type === 'OBJECTIVE_BOUNTY_PRESTART'
            ? [
                eventEvidence(
                  e,
                  'actualStartTime',
                  finite(b.actualStartTime) ? b.actualStartTime : null,
                ),
              ]
            : []),
          eventEvidence(
            e,
            'teamId',
            typeof record(e.payload).teamId === 'number'
              ? (record(e.payload).teamId as number)
              : null,
          ),
        ];
      });
    if (w.censoredEnd && gameEndMs !== null)
      evidence.push(eventEvidence(ends[0], 'timestamp', gameEndMs));
    const c = context(
      'O10',
      'milliseconds',
      w.teamId === null
        ? { kind: 'match', id: input.matchId }
        : { kind: 'team', id: String(w.teamId) },
      evidence,
      w.reason ? 0 : 2,
      2,
    );
    if (
      w.startMs !== null &&
      w.observedEndMs !== null &&
      w.observedEndMs >= w.startMs
    )
      c.window = {
        startMs: w.startMs,
        endMs: w.observedEndMs,
        bounds: w.censoredEnd ? '[]' : '[)',
      };
    const reason =
      w.reason ??
      (w.startMs === null
        ? 'missing_field'
        : w.observedEndMs === null
          ? 'missing_frame'
          : null);
    const observedDuration = reason
      ? unavailableMetric(
          c,
          reason,
          'observed portion only; censored endpoint is not a FINISH event',
        )
      : metricValue(
          c,
          w.observedEndMs! - w.startMs!,
          w.startSource === 'announcement_timestamp' ? 'estimated' : 'derived',
          'observed end minus effective start; censored portion only, not total bounty duration',
        );
    const inWindow = (e: BountyEvent) =>
      finite(e.timestampMs) &&
      w.startMs !== null &&
      w.observedEndMs !== null &&
      e.timestampMs >= w.startMs &&
      (w.censoredEnd
        ? e.timestampMs <= w.observedEndMs
        : e.timestampMs < w.observedEndMs);
    const associated = objectiveEvents.filter(
      (e) =>
        inWindow(e) && w.teamId !== null && e.beneficiaryTeamId === w.teamId,
    );
    const associationReason =
      reason ??
      (w.teamId === null ||
      objectiveEvents.some((e) => !finite(e.timestampMs)) ||
      objectiveEvents.some((e) => inWindow(e) && e.beneficiaryTeamId === null)
        ? 'missing_field'
        : null);
    const relevantObjectives = objectiveEvents.filter(
      (e) => !finite(e.timestampMs) || inWindow(e),
    );
    const validOperands =
      (reason ? 0 : 2) +
      Number(w.teamId !== null) +
      relevantObjectives.reduce(
        (n, e) =>
          n +
          Number(finite(e.timestampMs)) +
          Number(e.beneficiaryTeamId === 100 || e.beneficiaryTeamId === 200),
        0,
      );
    const countCtx = {
      ...c,
      quality: metricQuality(validOperands, 3 + 2 * relevantObjectives.length),
      unit: 'count' as const,
      evidence: [
        ...evidence,
        ...associated.map((e) => eventEvidence(e, 'type', e.type)),
      ],
    };
    const associatedObjectiveCount = associationReason
      ? unavailableMetric(countCtx, associationReason)
      : metricValue(
          countCtx,
          associated.length,
          w.startSource === 'announcement_timestamp' ? 'estimated' : 'derived',
          'objective events for the known beneficiary within the interval; temporal association does not prove bounty awarded',
        );
    const { announcement, finish, ...window } = w;
    return {
      ...window,
      announcementEventId: w.announcement?.eventId ?? null,
      announcementTimestampMs: w.announcement?.timestampMs ?? null,
      actualStartTime: finite(w.announcement?.actualStartTime)
        ? (w.announcement!.actualStartTime as number)
        : null,
      finishEventId: w.finish?.eventId ?? null,
      observedDuration,
      associatedObjectiveEventIds: associated.map(eventId),
      associatedObjectiveCount,
      evidence,
    };
  });
  const participants = input.participants.map((p) => {
    const subject = { kind: 'participant' as const, id: p.puuid };
    const projection = record(p.finalStats);
    const sourceReason: MissingReason | null =
      p.finalStats == null
        ? 'missing_projection'
        : projection.projectionVersion !== 1
          ? 'unsupported_version'
          : null;
    const finalCounter = (field: string) =>
      literal(
        'O11',
        'count',
        record(projection.values)[field],
        `MatchParticipant.finalStats:${p.puuid}`,
        `values.${field}`,
        subject,
        sourceReason ??
          (record(projection.missingReasons)[field] === 'invalid_value'
            ? 'invalid_value'
            : null),
      );
    const challenges = Object.fromEntries(
      Object.entries(STEAL_CHALLENGES).map(([field, category]) => [
        field,
        {
          category,
          metric: literal(
            'O11',
            'count',
            record(p.challenges)[field],
            `MatchParticipant.challenges:${p.puuid}`,
            field,
            subject,
          ),
        },
      ]),
    );
    return {
      puuid: p.puuid,
      teamId: p.teamId,
      championName: p.championName,
      objectivesStolen: finalCounter('objectivesStolen'),
      objectivesStolenAssists: finalCounter('objectivesStolenAssists'),
      challenges,
      bountyGold: literal(
        'C08',
        'gold',
        record(p.challenges).bountyGold,
        `MatchParticipant.challenges:${p.puuid}`,
        'bountyGold',
        subject,
      ),
      interpretation:
        'Independent optional literal records: steals, assists, without-smite, proximity and timing are not interchangeable. No success rate, attempt count or event-level steal attribution.',
    };
  });
  const literalRewards = events
    .filter((e) =>
      ['CHAMPION_KILL', 'ELITE_MONSTER_KILL', 'BUILDING_KILL'].includes(
        e.type ?? '',
      ),
    )
    .sort(
      (a, b) =>
        (a.timestampMs ?? Infinity) - (b.timestampMs ?? Infinity) ||
        a.frameIndex - b.frameIndex ||
        a.eventIndex - b.eventIndex,
    )
    .map((e) => {
      const p = record(e.payload),
        knownActor = input.participants.some(
          (player) => player.puuid === e.actorPuuid,
        )
          ? e.actorPuuid
          : null;
      const subject = knownActor
        ? { kind: 'participant' as const, id: knownActor }
        : { kind: 'match' as const, id: input.matchId };
      const id = e.type === 'CHAMPION_KILL' ? 'C08' : 'O10';
      return {
        eventId: eventId(e),
        type: e.type!,
        timestampMs: e.timestampMs,
        actorPuuid: knownActor,
        actorReason: knownActor ? null : 'missing_field',
        sourceKillerId: finite(p.killerId) ? p.killerId : null,
        sourceTeamId: e.sourceTeamId,
        ownerTeamId: e.ownerTeamId,
        beneficiaryTeamId: e.beneficiaryTeamId,
        objectiveType:
          typeof (p.monsterType ?? p.buildingType) === 'string'
            ? ((p.monsterType ?? p.buildingType) as string)
            : null,
        bounty: literal(
          id,
          'gold',
          p.bounty,
          'MatchEventProjection.payload',
          'bounty',
          subject,
          null,
          e,
        ),
        shutdownBounty: literal(
          id,
          'gold',
          p.shutdownBounty,
          'MatchEventProjection.payload',
          'shutdownBounty',
          subject,
          null,
          e,
        ),
        quality: record(e.quality),
      };
    });
  return {
    ...metadata,
    reason: null,
    report: {
      contracts: {
        definitionVersion: BOUNTY_STEALS_VERSION,
        eventProjectionVersion: 1,
        finalStatsProjectionVersion: 1,
        challengeCatalogVersion: 1,
        fixtureValidatedPatch: '16.2',
        currentPatchFixtureValidated: /^16\.2(?:\.|$)/.test(input.gameVersion),
        crossPatchPolicy:
          'Literal optional fields only; no inferred patch-specific activation delay, payout formula, attempted steals or contestation semantics',
      },
      coverage: {
        terminalObserved: gameEndMs !== null,
        gameEndMs,
        boundaryEvents: boundaries.length,
        windows: windows.length,
        censoredStartWindows: windows.filter((w) => w.censoredStart).length,
        censoredEndWindows: windows.filter((w) => w.censoredEnd).length,
        unknownTeamBoundaries: boundaries.filter((b) => b.teamId === null)
          .length,
        issues: windows.flatMap((w) => w.issues),
        reason: gameEndMs === null ? 'missing_frame' : null,
      },
      windows,
      participants,
      literalRewards,
      interpretation:
        'Bounty announcements, effective starts, finishes and literal rewards are separate observations. Unknown teams/authors remain unknown; open windows are censored. Temporal objective association does not prove a payout, catch-up, lost gold, a steal or all contests. Summary/challenge counters are not mapped to individual capture events and do not provide an attempts denominator.',
    },
  };
}
