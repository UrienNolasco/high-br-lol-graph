import {
  MetricEvidence,
  MetricResult,
  MetricUnit,
  MissingReason,
  metricContext,
  metricQuality,
  metricValue,
  ratioMetric,
  unavailableMetric,
} from '../contracts/metric-contract';

export const OBJECTIVE_EVENT_TYPES = [
  'ELITE_MONSTER_KILL',
  'BUILDING_KILL',
  'TURRET_PLATE_DESTROYED',
  'DRAGON_SOUL_GIVEN',
  'GAME_END',
] as const;
export const RECONCILED_OBJECTIVES = [
  'baron',
  'dragon',
  'horde',
  'riftHerald',
  'tower',
  'inhibitor',
] as const;
export interface ObjectiveEvent {
  matchId: string;
  frameIndex: number;
  eventIndex: number;
  type: string | null;
  timestampMs: number | null;
  actorParticipantId: number | null;
  actorPuuid: string | null;
  assistingParticipantIds: unknown;
  assistingPuuids: unknown;
  sourceTeamId: number | null;
  ownerTeamId: number | null;
  beneficiaryTeamId: number | null;
  positionX: number | null;
  positionY: number | null;
  lane: string | null;
  tier: string | null;
  payload: unknown;
  quality: unknown;
  metricVersion: number;
  processingVersion: number;
}
export interface ObjectivesInput {
  matchId: string;
  gameVersion: string;
  mapId: number;
  teams: Array<{ teamId: number; finalObjectives: unknown }>;
  participants: Array<{
    puuid: string;
    teamId: number;
    championName: string;
    finalStats: unknown;
  }>;
  events: ObjectiveEvent[];
  processing: {
    status: string;
    processingVersion: number | null;
    completedAt: Date | null;
  } | null;
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;
const text = (v: unknown) => (typeof v === 'string' ? v : null);
export const objectiveEventId = (e: ObjectiveEvent) =>
  `${e.matchId}:${e.frameIndex}:${e.eventIndex}`;
export function objectivePhase(ms: number | null) {
  return !finite(ms)
    ? null
    : ms < 840000
      ? 'early'
      : ms < 1500000
        ? 'mid'
        : 'late';
}
function objectiveType(e: ObjectiveEvent): string | null {
  const p = object(e.payload);
  if (e.type === 'TURRET_PLATE_DESTROYED') return 'plate';
  if (e.type === 'DRAGON_SOUL_GIVEN') return 'soul';
  if (e.type === 'BUILDING_KILL')
    return (
      (
        {
          TOWER_BUILDING: 'tower',
          INHIBITOR_BUILDING: 'inhibitor',
          NEXUS_BUILDING: 'nexus',
        } as Record<string, string>
      )[String(p.buildingType)] ?? null
    );
  if (e.type === 'ELITE_MONSTER_KILL')
    return (
      (
        {
          BARON_NASHOR: 'baron',
          DRAGON: 'dragon',
          HORDE: 'horde',
          RIFTHERALD: 'riftHerald',
          ATAKHAN: 'atakhan',
        } as Record<string, string>
      )[String(p.monsterType)] ?? null
    );
  return null;
}
interface Observation {
  value: number | null;
  reason: MissingReason | null;
  evidence: MetricEvidence[];
}
function observation(
  projection: unknown,
  field: string,
  source: string,
): Observation {
  const p = object(projection),
    value = object(p.values)[field];
  const reason: MissingReason | null =
    projection == null
      ? 'not_calculated'
      : p.projectionVersion !== 1
        ? 'unsupported_version'
        : finite(value)
          ? null
          : object(p.missingReasons)[field] === 'invalid_value' || value != null
            ? 'invalid_value'
            : 'missing_field';
  return {
    value: reason ? null : (value as number),
    reason,
    evidence: [
      {
        source,
        field: `values.${field}`,
        value: reason ? null : (value as number),
      },
    ],
  };
}

/** Consumes only committed projections. Temporal phases describe observations, not plate rules. */
export function calculateObjectives(input: ObjectivesInput) {
  const metadata = {
    matchId: input.matchId,
    gameVersion: input.gameVersion,
    metricVersion: 1,
    processingVersion: input.processing?.processingVersion ?? null,
    processedAt: input.processing?.completedAt?.toISOString() ?? null,
  };
  if (
    input.processing?.status !== 'COMPLETED' ||
    metadata.processingVersion == null ||
    metadata.processedAt == null
  )
    return {
      ...metadata,
      reason: 'not_calculated' as MissingReason,
      report: null,
    };
  const source = input.events.filter((e) =>
    (OBJECTIVE_EVENT_TYPES as readonly string[]).includes(e.type ?? ''),
  );
  if (
    metadata.processingVersion < 2 ||
    source.some(
      (e) =>
        e.matchId !== input.matchId ||
        e.metricVersion !== 1 ||
        e.processingVersion !== metadata.processingVersion,
    )
  )
    return {
      ...metadata,
      reason: 'unsupported_version' as MissingReason,
      report: null,
    };
  const ids = source.map(objectiveEventId);
  if (new Set(ids).size !== ids.length)
    return {
      ...metadata,
      reason: 'invalid_value' as MissingReason,
      report: null,
    };
  const terminal = source.filter(
    (e) => e.type === 'GAME_END' && finite(e.timestampMs),
  );
  const endMs = terminal.length === 1 ? terminal[0].timestampMs! : null;
  const events = source
    .filter((e) => e.type !== 'GAME_END')
    .sort(
      (a, b) =>
        (a.timestampMs ?? Infinity) - (b.timestampMs ?? Infinity) ||
        a.frameIndex - b.frameIndex ||
        a.eventIndex - b.eventIndex,
    );
  const timed = (e: ObjectiveEvent) =>
    finite(e.timestampMs) && endMs !== null && e.timestampMs <= endMs;
  const timeComplete = endMs !== null && events.every(timed);
  const eventEvidence = (e: ObjectiveEvent): MetricEvidence => ({
    source: 'MatchEventProjection',
    field: e.type ?? 'unknown',
    value: objectiveType(e),
    eventId: objectiveEventId(e),
    frameIndex: e.frameIndex,
    ...(finite(e.timestampMs) ? { timestampMs: e.timestampMs } : {}),
  });
  const context = (
    id: string,
    unit: MetricUnit,
    subject: { kind: 'match' | 'team' | 'participant'; id: string },
    evidence: MetricEvidence[],
    valid: number,
    total: number,
    eventWindow = false,
  ) =>
    metricContext({
      metricId: id,
      processingVersion: metadata.processingVersion!,
      processedAt: metadata.processedAt!,
      matchId: input.matchId,
      subject,
      unit,
      window:
        eventWindow && endMs !== null
          ? { startMs: 0, endMs, bounds: '[]' }
          : null,
      denominator: null,
      evidence,
      quality: metricQuality(valid, total),
    });
  const matchSubject = { kind: 'match' as const, id: input.matchId };
  const count = (
    id: string,
    selected: ObjectiveEvent[],
    pool: ObjectiveEvent[] = events,
    subject = matchSubject as {
      kind: 'match' | 'team' | 'participant';
      id: string;
    },
    extraReason: MissingReason | null = null,
  ) => {
    const ctx = context(
      id,
      'count',
      subject,
      selected.map(eventEvidence),
      pool.filter(timed).length,
      pool.length,
      true,
    );
    ctx.quality.unknownEvents = pool.filter(
      (e) => objectiveType(e) === null,
    ).length;
    const reason = extraReason ?? (!timeComplete ? 'missing_frame' : null);
    return reason
      ? unavailableMetric(
          ctx,
          reason,
          'count of distinct projected event identities; complete terminal/timestamp coverage required',
        )
      : metricValue(
          ctx,
          selected.length,
          'derived',
          'count of distinct projected event identities in the stated category',
        );
  };
  const participantsByPuuid = new Map(
    input.participants.map((p) => [p.puuid, p]),
  );
  const chronology = events.map((e) => {
    const p = object(e.payload),
      quality = object(e.quality);
    const assists = Array.isArray(e.assistingPuuids)
      ? e.assistingPuuids.map((v) =>
          typeof v === 'string' && participantsByPuuid.has(v) ? v : null,
        )
      : null;
    return {
      eventId: objectiveEventId(e),
      metricId: e.type === 'TURRET_PLATE_DESTROYED' ? 'O04' : 'O01',
      metricVersion: e.metricVersion,
      processingVersion: e.processingVersion,
      processedAt: metadata.processedAt!,
      frameIndex: e.frameIndex,
      eventIndex: e.eventIndex,
      timestampMs: finite(e.timestampMs) ? e.timestampMs : null,
      type: e.type!,
      objective: objectiveType(e),
      rawObjectiveType: text(p.monsterType ?? p.buildingType ?? p.name),
      subtype: text(p.monsterSubType),
      phase: objectivePhase(e.timestampMs),
      actorParticipantId: e.actorParticipantId,
      actorPuuid:
        e.actorPuuid !== null && participantsByPuuid.has(e.actorPuuid)
          ? e.actorPuuid
          : null,
      actorReason:
        e.actorPuuid !== null && participantsByPuuid.has(e.actorPuuid)
          ? null
          : 'missing_field',
      assistingParticipantIds: Array.isArray(e.assistingParticipantIds)
        ? e.assistingParticipantIds
        : null,
      assistingPuuids: assists,
      assistsReason:
        assists === null || assists.some((v) => v === null)
          ? 'missing_field'
          : null,
      sourceTeamId: e.sourceTeamId,
      ownerTeamId: e.ownerTeamId,
      beneficiaryTeamId: e.beneficiaryTeamId,
      beneficiaryReason: e.beneficiaryTeamId === null ? 'missing_field' : null,
      lane: e.lane,
      tier: e.tier,
      position:
        e.positionX !== null && e.positionY !== null
          ? { x: e.positionX, y: e.positionY }
          : null,
      sourceKillerId: finite(p.killerId) ? p.killerId : null,
      quality,
      evidence: [eventEvidence(e)],
    };
  });
  const unknownStructures = events.some(
    (e) => e.type === 'BUILDING_KILL' && objectiveType(e) === null,
  );
  const grouped = (type: 'plate' | 'tower' | 'inhibitor') => {
    const selected = events.filter((e) => objectiveType(e) === type);
    const groups = new Map<string, ObjectiveEvent[]>();
    for (const e of selected) {
      const key = JSON.stringify([
        e.beneficiaryTeamId,
        e.ownerTeamId,
        e.lane,
        e.tier,
        objectivePhase(e.timestampMs),
      ]);
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return [...groups.values()].map((es) => ({
      beneficiaryTeamId: es[0].beneficiaryTeamId,
      ownerTeamId: es[0].ownerTeamId,
      lane: es[0].lane,
      tier: es[0].tier,
      phase: objectivePhase(es[0].timestampMs),
      count: (() => {
        const result = count(
          type === 'plate' ? 'O04' : 'O03',
          es,
          selected,
          matchSubject,
          type !== 'plate' && unknownStructures ? 'unsupported_version' : null,
        );
        const phase = objectivePhase(es[0].timestampMs);
        if (endMs !== null && phase !== null) {
          const startMs =
            phase === 'early' ? 0 : phase === 'mid' ? 840000 : 1500000;
          const limit =
            phase === 'early' ? 840000 : phase === 'mid' ? 1500000 : Infinity;
          result.window = {
            startMs,
            endMs: Math.max(startMs, Math.min(limit, endMs)),
            bounds: endMs < limit ? '[]' : '[)',
          };
        }
        result.method =
          'count of distinct projected events sharing beneficiary, owner, lane, tier and phase; null categories are retained';
        return result;
      })(),
    }));
  };
  const teams =
    input.mapId === 11
      ? [100, 200].map(
          (teamId) =>
            input.teams.find((t) => t.teamId === teamId) ?? {
              teamId,
              finalObjectives: null,
            },
        )
      : input.teams;
  const finalTotals = teams.map((t) => {
    const projection = object(t.finalObjectives);
    const values = object(projection.values);
    return {
      teamId: t.teamId,
      reason:
        t.finalObjectives == null
          ? 'not_calculated'
          : projection.projectionVersion !== 1
            ? 'unsupported_version'
            : null,
      objectives: Object.fromEntries(
        [...new Set([...RECONCILED_OBJECTIVES, ...Object.keys(values)])]
          .sort()
          .map((type) => {
            const o = object(values[type]);
            const obs = observation(
              {
                ...projection,
                values: { [type]: o.kills },
                missingReasons: {
                  [type]:
                    object(projection.missingReasons)[`${type}.kills`] ??
                    object(projection.missingReasons)[type],
                },
              },
              type,
              `MatchTeam.finalObjectives:${t.teamId}`,
            );
            if (t.finalObjectives == null) obs.reason = 'not_calculated';
            obs.evidence[0].field = `values.${type}.kills`;
            const ctx = context(
              'O01',
              'count',
              { kind: 'team', id: String(t.teamId) },
              obs.evidence,
              obs.reason ? 0 : 1,
              1,
            );
            return [
              type,
              {
                kills: obs.reason
                  ? unavailableMetric(ctx, obs.reason)
                  : metricValue(
                      ctx,
                      obs.value,
                      'observed',
                      'literal final objective kills; separate from timeline event counts',
                    ),
                first:
                  projection.projectionVersion === 1 &&
                  typeof o.first === 'boolean'
                    ? o.first
                    : null,
                lost:
                  projection.projectionVersion === 1 &&
                  typeof o.lost === 'boolean'
                    ? o.lost
                    : null,
                firstReason:
                  t.finalObjectives == null
                    ? 'not_calculated'
                    : projection.projectionVersion !== 1
                      ? 'unsupported_version'
                      : typeof o.first === 'boolean'
                        ? null
                        : (object(projection.missingReasons)[`${type}.first`] ??
                          'missing_field'),
                lostReason:
                  t.finalObjectives == null
                    ? 'not_calculated'
                    : projection.projectionVersion !== 1
                      ? 'unsupported_version'
                      : typeof o.lost === 'boolean'
                        ? null
                        : (object(projection.missingReasons)[`${type}.lost`] ??
                          'missing_field'),
              },
            ];
          }),
      ),
    };
  });
  const reconciliation = finalTotals.flatMap((t) =>
    RECONCILED_OBJECTIVES.map((type) => {
      const selected = events.filter(
        (e) => objectiveType(e) === type && e.beneficiaryTeamId === t.teamId,
      );
      const family = events.filter(
        (e) =>
          e.type ===
          (['tower', 'inhibitor'].includes(type)
            ? 'BUILDING_KILL'
            : 'ELITE_MONSTER_KILL'),
      );
      const relevant = family.filter(
        (e) => objectiveType(e) === type || objectiveType(e) === null,
      );
      const attributionIncomplete = relevant.some(
        (e) => e.beneficiaryTeamId === null,
      );
      const timelineCount = count(
        'O01',
        selected,
        relevant,
        { kind: 'team', id: String(t.teamId) },
        family.some((e) => objectiveType(e) === null)
          ? 'unsupported_version'
          : attributionIncomplete
            ? 'missing_field'
            : null,
      );
      const finalCount = t.objectives[type].kills;
      if (
        finalCount.value !== null &&
        timelineCount.value !== null &&
        finalCount.value !== timelineCount.value
      )
        timelineCount.quality.reconciliationIssues.push(
          'timeline_count_differs_from_final_objectives',
        );
      return {
        teamId: t.teamId,
        objective: type,
        finalCount,
        timelineCount,
        matches:
          finalCount.value === null || timelineCount.value === null
            ? null
            : finalCount.value === timelineCount.value,
        difference:
          finalCount.value === null || timelineCount.value === null
            ? null
            : timelineCount.value - finalCount.value,
      };
    }),
  );
  const participantContributions = input.participants.map((p) => {
    const subject = { kind: 'participant' as const, id: p.puuid };
    const obs = (field: string) =>
      observation(
        p.finalStats,
        field,
        `MatchParticipant.finalStats:${p.puuid}`,
      );
    const absolute = (
      field: string,
      unit: MetricUnit,
      id = 'O03',
    ): MetricResult => {
      const o = obs(field),
        ctx = context(id, unit, subject, o.evidence, o.reason ? 0 : 1, 1);
      return o.reason
        ? unavailableMetric(ctx, o.reason)
        : metricValue(
            ctx,
            o.value,
            'observed',
            `literal ${field}; not interchangeable with event last hits or participation`,
          );
    };
    const roster = input.participants.filter(
      (other) => other.teamId === p.teamId,
    );
    const teamDamage = roster.map((other) =>
      observation(
        other.finalStats,
        'damageDealtToTurrets',
        `MatchParticipant.finalStats:${other.puuid}`,
      ),
    );
    const total = teamDamage.every((o) => o.value !== null)
      ? teamDamage.reduce((sum, o) => sum + o.value!, 0)
      : null;
    const teamTotal = total !== null && finite(total) ? total : null;
    const numerator = obs('damageDealtToTurrets');
    const shareCtx = context(
      'O03',
      'percent',
      subject,
      teamDamage.flatMap((o) => o.evidence),
      teamDamage.filter((o) => o.reason === null).length,
      Math.max(5, teamDamage.length),
    );
    shareCtx.denominator = {
      value: teamTotal,
      unit: 'damage',
      population: `five distinct participants of team ${p.teamId}`,
    };
    const rosterReason: MissingReason | null =
      input.mapId !== 11
        ? 'unsupported_version'
        : ![100, 200].includes(p.teamId)
          ? 'missing_field'
          : roster.length < 5
            ? 'insufficient_sample'
            : roster.length > 5 ||
                new Set(roster.map((r) => r.puuid)).size !== roster.length
              ? 'invalid_value'
              : null;
    const damageReason =
      teamDamage.find((o) => o.reason)?.reason ??
      (total !== null && !finite(total) ? 'invalid_value' : null);
    if (rosterReason) shareCtx.denominator.value = null;
    const turretDamageShare =
      rosterReason || damageReason
        ? unavailableMetric(shareCtx, rosterReason ?? damageReason!)
        : ratioMetric(shareCtx, numerator.value, teamTotal, 100);
    const registered = (type: string) => {
      const pool = events.filter((e) => objectiveType(e) === type);
      const authored = pool.filter((e) => e.actorPuuid === p.puuid);
      const participated = pool.filter(
        (e) =>
          e.actorPuuid === p.puuid ||
          (Array.isArray(e.assistingPuuids) &&
            e.assistingPuuids.includes(p.puuid)),
      );
      const unknownActors = pool.filter(
        (e) => e.actorPuuid === null || !participantsByPuuid.has(e.actorPuuid),
      ).length;
      const missingAssistantLists = pool.filter(
        (e) =>
          !Array.isArray(e.assistingPuuids) ||
          e.assistingPuuids.some(
            (v) => typeof v !== 'string' || !participantsByPuuid.has(v),
          ),
      ).length;
      const lastHits = count('O02', authored, pool, subject);
      const participations = count('O02', participated, pool, subject);
      lastHits.quality = metricQuality(
        pool.length - unknownActors,
        pool.length,
      );
      participations.quality = metricQuality(
        2 * pool.length - unknownActors - missingAssistantLists,
        2 * pool.length,
      );
      lastHits.method =
        'count of projected events explicitly naming this participant as author; unknown authors are not assigned';
      participations.method =
        'count of distinct projected events explicitly naming this participant as author or assistant; lower bound on presence, missing lists are not empty lists';
      return { lastHits, participations, unknownActors, missingAssistantLists };
    };
    return {
      puuid: p.puuid,
      teamId: p.teamId,
      championName: p.championName,
      registeredEvents: Object.fromEntries(
        [...RECONCILED_OBJECTIVES, 'atakhan', 'plate'].map((type) => [
          type,
          registered(type),
        ]),
      ),
      turretDamage: absolute('damageDealtToTurrets', 'damage'),
      turretDamageShare,
      turretKills: absolute('turretKills', 'count'),
      turretTakedowns: absolute('turretTakedowns', 'count'),
      buildingDamage: absolute('damageDealtToBuildings', 'damage'),
      objectiveDamage: absolute('damageDealtToObjectives', 'damage', 'O02'),
      epicMonsterDamage: absolute('damageDealtToEpicMonsters', 'damage', 'O02'),
    };
  });
  const plates = events.filter((e) => objectiveType(e) === 'plate');
  return {
    ...metadata,
    reason: null,
    report: {
      phaseDefinition: {
        early: '[0,14min)',
        mid: '[14min,25min)',
        late: '[25min,game end]',
      },
      coverage: {
        completeTimeline: timeComplete,
        endMs,
        validTimestampEvents: events.filter(timed).length,
        totalEvents: events.length,
        unknownObjectiveEvents: events.filter((e) => objectiveType(e) === null)
          .length,
        unknownActorEvents: events.filter((e) => e.actorPuuid === null).length,
        unknownBeneficiaryEvents: events.filter(
          (e) => e.beneficiaryTeamId === null,
        ).length,
        reason: timeComplete ? null : 'missing_frame',
      },
      chronology,
      finalTotals,
      reconciliation,
      participantContributions,
      structures: {
        towers: count(
          'O03',
          events.filter((e) => objectiveType(e) === 'tower'),
          events,
          matchSubject,
          unknownStructures ? 'unsupported_version' : null,
        ),
        inhibitors: count(
          'O03',
          events.filter((e) => objectiveType(e) === 'inhibitor'),
          events,
          matchSubject,
          unknownStructures ? 'unsupported_version' : null,
        ),
        groups: [
          ...grouped('tower').map((g) => ({ ...g, objective: 'tower' })),
          ...grouped('inhibitor').map((g) => ({
            ...g,
            objective: 'inhibitor',
          })),
        ],
      },
      plates: {
        total: count('O04', plates, plates),
        killerIdZero: count(
          'O04',
          plates.filter((e) => object(e.payload).killerId === 0),
          plates,
        ),
        groups: grouped('plate'),
      },
      interpretation:
        'Registered event last hits and participation are separate from final counters and damage. Unknown actors/assistants are not assigned; registered participation is a lower bound, not all players present. Plate events are retained at every timestamp; no inferred gold reward. Owner is the destroyed structure team; beneficiary is separate. Final damage has no lane/phase attribution.',
    },
  };
}
