import {
  MetricContext,
  MetricEvidence,
  MetricResult,
  MissingReason,
  metricContext,
  metricQuality,
  metricValue,
  ratioMetric,
  unavailableMetric,
} from '../contracts/metric-contract';

export const COMBAT_METRIC_VERSION = 1;
export interface CombatParticipant {
  puuid: string;
  teamId: number;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kda?: number | null;
}
export interface CombatEvent {
  matchId: string;
  frameIndex: number;
  eventIndex: number;
  type: string | null;
  timestampMs: number | null;
  actorParticipantId: number | null;
  actorPuuid: string | null;
  victimPuuid: string | null;
  assistingParticipantIds: unknown;
  assistingPuuids: unknown;
  sourceTeamId: number | null;
  payload: unknown;
  quality: unknown;
  metricVersion: number;
  processingVersion: number;
}
export interface CombatInput {
  matchId: string;
  gameDuration: number;
  participants: CombatParticipant[];
  events: CombatEvent[];
  processingVersion: number;
  projectionComplete: boolean;
  processedAt: string;
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const team = (value: unknown) => value === 100 || value === 200;
export const combatEventId = (
  event: Pick<CombatEvent, 'matchId' | 'frameIndex' | 'eventIndex'>,
) => `${event.matchId}:${event.frameIndex}:${event.eventIndex}`;
type Window = NonNullable<MetricContext['window']>;
const within = (timestamp: number | null, window: Window) =>
  timestamp !== null &&
  timestamp >= window.startMs &&
  (window.bounds === '[]'
    ? timestamp <= window.endMs
    : timestamp < window.endMs);

export function prepareCombat(input: CombatInput) {
  const players = new Map(input.participants.map((p) => [p.puuid, p]));
  const unique = new Map<string, CombatEvent>();
  let duplicateN = 0;
  let conflictingIdentity = false;
  for (const event of input.events) {
    const id = combatEventId(event),
      previous = unique.get(id);
    if (previous) {
      duplicateN++;
      if (JSON.stringify(previous) !== JSON.stringify(event))
        conflictingIdentity = true;
    } else unique.set(id, event);
  }
  const events = [...unique.values()].sort(
    (a, b) => a.frameIndex - b.frameIndex || a.eventIndex - b.eventIndex,
  );
  const wrongVersion = events.some(
    (e) =>
      e.matchId !== input.matchId ||
      e.metricVersion !== 1 ||
      e.processingVersion !== input.processingVersion,
  );
  const available =
    input.projectionComplete &&
    input.processingVersion !== null &&
    input.processingVersion >= 2 &&
    !wrongVersion &&
    !conflictingIdentity;
  const reason: MissingReason | null = !input.projectionComplete
    ? 'missing_projection'
    : wrongVersion ||
        input.processingVersion === null ||
        input.processingVersion < 2
      ? 'unsupported_version'
      : conflictingIdentity
        ? 'invalid_value'
        : null;
  const ends = events
    .filter(
      (e) =>
        e.type === 'GAME_END' &&
        finite(e.timestampMs) &&
        team(object(e.payload).winningTeam),
    )
    .map((e) => e.timestampMs!);
  const endMs = ends.length
    ? Math.max(...ends)
    : Math.max(0, input.gameDuration * 1000);
  const unknownEvents = events.filter(
    (e) => object(e.quality).unknownType === true,
  ).length;
  const kills = events
    .filter((e) => e.type === 'CHAMPION_KILL')
    .map((event) => {
      const actor = event.actorPuuid
        ? (players.get(event.actorPuuid) ?? null)
        : null;
      const victim = event.victimPuuid
        ? (players.get(event.victimPuuid) ?? null)
        : null;
      const environmental =
        event.actorParticipantId === null &&
        object(event.payload).killerId === 0;
      const ids = event.assistingParticipantIds,
        names = event.assistingPuuids,
        quality = object(event.quality);
      const problems = [
        'invalidFields',
        'sentinelFields',
        'missingFields',
      ].flatMap((k) =>
        Array.isArray(quality[k]) ? (quality[k] as unknown[]) : [],
      );
      const rawAssistants = Array.isArray(names) ? names : [];
      const assistants = [
        ...new Set(
          rawAssistants.filter(
            (name): name is string =>
              typeof name === 'string' &&
              players.has(name) &&
              name !== actor?.puuid &&
              name !== victim?.puuid &&
              actor !== null &&
              team(actor.teamId) &&
              players.get(name)!.teamId === actor.teamId,
          ),
        ),
      ];
      const assistanceComplete =
        Array.isArray(ids) &&
        Array.isArray(names) &&
        ids.length === names.length &&
        ids.every((id) => count(id) && id > 0) &&
        new Set(ids).size === ids.length &&
        assistants.length === names.length &&
        new Set(names).size === names.length &&
        !problems.some(
          (p) =>
            typeof p === 'string' && p.startsWith('assistingParticipantIds'),
        );
      const solo =
        assistants.length > 0 ? false : assistanceComplete ? true : null;
      return {
        event,
        actor,
        victim,
        environmental,
        assistants,
        assistanceComplete,
        solo,
      };
    });
  const observed = (puuid: string) => ({
    kills: kills.filter((k) => k.actor?.puuid === puuid).length,
    deaths: kills.filter((k) => k.victim?.puuid === puuid).length,
    assists: kills.filter((k) => k.assistants.includes(puuid)).length,
  });
  const missingKillEvents = input.participants.some((p) => {
    const actual = observed(p.puuid);
    return (
      (count(p.kills) && actual.kills !== p.kills) ||
      (count(p.deaths) && actual.deaths !== p.deaths)
    );
  });
  const evidence = (
    source: (typeof kills)[number],
    field = 'type',
    value: MetricEvidence['value'] = 'CHAMPION_KILL',
  ): MetricEvidence => ({
    source: 'MatchEventProjection',
    field,
    value,
    eventId: combatEventId(source.event),
    frameIndex: source.event.frameIndex,
    ...(source.event.timestampMs !== null
      ? { timestampMs: source.event.timestampMs }
      : {}),
  });
  const context = (
    puuid: string,
    metricId: string,
    unit: MetricContext['unit'],
    window: MetricContext['window'],
    validN: number,
    totalN: number,
    sources: typeof kills,
    field = 'type',
  ): MetricContext =>
    metricContext({
      metricId,
      metricVersion: COMBAT_METRIC_VERSION,
      processingVersion: input.processingVersion,
      processedAt: input.processedAt,
      matchId: input.matchId,
      subject: { kind: 'participant', id: puuid },
      unit,
      window,
      denominator: null,
      quality: {
        ...metricQuality(validN, totalN),
        unknownEvents,
        reconciliationIssues: [
          ...(duplicateN ? ['duplicate_event_identity_deduplicated'] : []),
          ...(conflictingIdentity ? ['conflicting_event_identity'] : []),
          ...(missingKillEvents ? ['kill_death_summary_mismatch'] : []),
        ],
      },
      evidence: sources.map((k) => evidence(k, field)),
    });
  return {
    input,
    players,
    events,
    kills,
    endMs,
    endObserved: ends.length > 0,
    available,
    reason,
    duplicateN,
    unknownEvents,
    missingKillEvents,
    observed,
    evidence,
    context,
  };
}
export type PreparedCombat = ReturnType<typeof prepareCombat>;

export function soloCheckpoint(
  prepared: PreparedCombat,
  puuid: string,
  targetMs: number,
  kind: 'kills' | 'deaths',
): MetricResult {
  const { kills, context, endMs, available, reason, missingKillEvents } =
    prepared;
  const window: Window = { startMs: 0, endMs: targetMs, bounds: '[)' };
  const potentiallyRelevant = kills.filter((k) =>
    kind === 'kills'
      ? k.actor?.puuid === puuid || (!k.actor && !k.environmental)
      : k.victim?.puuid === puuid || !k.victim,
  );
  const relevant = potentiallyRelevant.filter((k) =>
    within(k.event.timestampMs, window),
  );
  const eligible = relevant.filter((k) => !k.environmental);
  const valid = eligible.filter((k) => k.actor && k.victim && k.solo !== null);
  const c = context(
    puuid,
    'E08',
    'count',
    window,
    valid.length,
    eligible.length,
    relevant,
  );
  const method = `${kind} before ${targetMs}ms with a player author and an explicitly complete empty assistant list; not proof of an isolated duel`;
  if (!prepared.players.has(puuid))
    return unavailableMetric(c, 'outside_cohort', method);
  if (!available)
    return unavailableMetric(c, reason ?? 'missing_projection', method);
  if (prepared.endObserved && endMs < targetMs)
    return unavailableMetric(c, 'short_match', method);
  if (missingKillEvents)
    return unavailableMetric(c, 'incomplete_events', method);
  if (!prepared.endObserved)
    return unavailableMetric(c, 'missing_frame', method);
  if (potentiallyRelevant.some((k) => k.event.timestampMs === null))
    return unavailableMetric(c, 'missing_field', method);
  if (valid.length !== eligible.length)
    return unavailableMetric(c, 'unknown_assistance', method);
  return metricValue(c, valid.filter((k) => k.solo).length, 'derived', method);
}
export function calculateSoloCheckpoints(input: CombatInput, puuid: string) {
  const prepared = prepareCombat(input);
  return {
    soloKills10: soloCheckpoint(prepared, puuid, 600000, 'kills'),
    soloDeaths10: soloCheckpoint(prepared, puuid, 600000, 'deaths'),
    soloKills15: soloCheckpoint(prepared, puuid, 900000, 'kills'),
    soloDeaths15: soloCheckpoint(prepared, puuid, 900000, 'deaths'),
  };
}

function phaseKp(
  prepared: PreparedCombat,
  player: CombatParticipant,
  window: Window,
): MetricResult {
  const { kills, context, available, reason, missingKillEvents } = prepared;
  const events = kills.filter((k) => within(k.event.timestampMs, window));
  const teamKills = events.filter((k) => k.actor?.teamId === player.teamId);
  const participationKnown = teamKills.filter(
    (k) =>
      k.actor?.puuid === player.puuid ||
      k.assistants.includes(player.puuid) ||
      k.assistanceComplete,
  );
  const c = context(
    player.puuid,
    'C01',
    'percent',
    window,
    participationKnown.length,
    teamKills.length,
    teamKills,
  );
  c.denominator = {
    value: teamKills.length,
    unit: 'kills',
    population: 'player-authored team kills in the same phase',
  };
  if (!available) return unavailableMetric(c, reason ?? 'missing_projection');
  if (
    !team(player.teamId) ||
    events.some((k) => !k.actor && !k.environmental) ||
    kills.some((k) => k.event.timestampMs === null)
  )
    return unavailableMetric(c, 'missing_field');
  if (missingKillEvents) return unavailableMetric(c, 'incomplete_events');
  if (!prepared.endObserved) return unavailableMetric(c, 'missing_frame');
  if (participationKnown.length !== teamKills.length)
    return unavailableMetric(c, 'unknown_assistance');
  return ratioMetric(
    c,
    teamKills.filter(
      (k) =>
        k.actor?.puuid === player.puuid || k.assistants.includes(player.puuid),
    ).length,
    teamKills.length,
    100,
  );
}

export function calculateCombat(input: CombatInput) {
  const p = prepareCombat(input);
  const fullWindow: Window = { startMs: 0, endMs: p.endMs, bounds: '[]' };
  const boundaries = [0, 600000, 900000, 1200000].filter((t) => t < p.endMs);
  const phases = boundaries.map(
    (startMs, i): Window => ({
      startMs,
      endMs: boundaries[i + 1] ?? p.endMs,
      bounds: i === boundaries.length - 1 ? '[]' : '[)',
    }),
  );
  const participants = input.participants.map((player) => {
    const actual = p.observed(player.puuid);
    const assistRelevant = p.kills.filter(
      (k) =>
        (k.actor?.teamId === player.teamId && k.actor.puuid !== player.puuid) ||
        (!k.actor && !k.environmental),
    );
    const assistsComplete = assistRelevant.every(
      (k) => k.assistanceComplete || k.assistants.includes(player.puuid),
    );
    const registered = (kind: 'kills' | 'deaths' | 'assists') => {
      const sources = p.kills.filter((k) =>
        kind === 'kills'
          ? k.actor?.puuid === player.puuid
          : kind === 'deaths'
            ? k.victim?.puuid === player.puuid
            : k.assistants.includes(player.puuid),
      );
      const complete =
        kind === 'assists'
          ? assistsComplete
          : kind === 'kills'
            ? p.kills.every((k) => k.actor || k.environmental)
            : p.kills.every((k) => k.victim);
      const c = p.context(
        player.puuid,
        'C09',
        'count',
        null,
        kind === 'assists'
          ? assistRelevant.filter(
              (k) =>
                k.assistanceComplete || k.assistants.includes(player.puuid),
            ).length
          : sources.length,
        kind === 'assists' ? assistRelevant.length : sources.length,
        sources,
      );
      return !p.available
        ? unavailableMetric(c, p.reason ?? 'missing_projection')
        : p.missingKillEvents
          ? unavailableMetric(c, 'incomplete_events')
          : !complete
            ? unavailableMetric(
                c,
                kind === 'assists' ? 'unknown_assistance' : 'missing_field',
                'Count registered assistants; observed lower bound is in reconciliation',
              )
            : metricValue(
                c,
                actual[kind],
                'derived',
                `Count unique CHAMPION_KILL identities for ${kind}`,
              );
    };
    const reconciliation = Object.fromEntries(
      (['kills', 'deaths', 'assists'] as const).map((kind) => [
        kind,
        {
          observedCount: p.available ? actual[kind] : null,
          summaryCount: player[kind],
          difference:
            p.available && count(player[kind])
              ? actual[kind] - player[kind]
              : null,
          matches:
            p.available && count(player[kind])
              ? actual[kind] === player[kind]
              : null,
          complete:
            p.available &&
            !p.missingKillEvents &&
            (kind === 'assists'
              ? assistsComplete
              : kind === 'kills'
                ? p.kills.every((k) => k.actor || k.environmental)
                : p.kills.every((k) => k.victim)),
        },
      ]),
    );
    const teamPlayers = input.participants.filter(
      (other) => other.teamId === player.teamId,
    );
    const totalKpContext = p.context(
      player.puuid,
      'C01',
      'percent',
      fullWindow,
      count(player.kills) && count(player.assists) ? 1 : 0,
      1,
      [],
    );
    totalKpContext.denominator = {
      value: null,
      unit: 'kills',
      population: 'team final kills from MatchParticipant',
    };
    totalKpContext.evidence = [
      { source: 'MatchParticipant', field: 'kills', value: player.kills },
      { source: 'MatchParticipant', field: 'assists', value: player.assists },
      ...teamPlayers.map((member) => ({
        source: 'MatchParticipant',
        field: `${member.puuid}.kills`,
        value: member.kills,
      })),
    ];
    const kpTotal = ratioMetric(
      totalKpContext,
      count(player.kills) && count(player.assists)
        ? player.kills + player.assists
        : null,
      team(player.teamId) && teamPlayers.every((member) => count(member.kills))
        ? teamPlayers.reduce((sum, member) => sum + member.kills!, 0)
        : null,
      100,
    );
    const reward = (
      field: 'bounty' | 'shutdownBounty',
      direction: 'received' | 'onDeaths',
    ) => {
      const relevant = p.kills.filter((k) =>
        direction === 'received'
          ? k.actor?.puuid === player.puuid
          : k.victim?.puuid === player.puuid,
      );
      const valid = relevant.filter((k) =>
        finite(object(k.event.payload)[field]),
      );
      const c = p.context(
        player.puuid,
        'C08',
        'gold',
        null,
        valid.length,
        relevant.length,
        relevant,
        field,
      );
      c.evidence = relevant.map((k) =>
        p.evidence(
          k,
          field,
          finite(object(k.event.payload)[field])
            ? (object(k.event.payload)[field] as number)
            : null,
        ),
      );
      if (!p.available)
        return unavailableMetric(c, p.reason ?? 'missing_projection');
      if (p.missingKillEvents) return unavailableMetric(c, 'incomplete_events');
      if (
        p.kills.some((k) =>
          direction === 'received' ? !k.actor && !k.environmental : !k.victim,
        )
      )
        return unavailableMetric(c, 'missing_field');
      return valid.length !== relevant.length
        ? unavailableMetric(c, 'missing_field')
        : metricValue(
            c,
            valid.reduce(
              (sum, k) => sum + (object(k.event.payload)[field] as number),
              0,
            ),
            'derived',
            `Sum recorded ${field} independently (${direction}); never add bounty and shutdownBounty`,
          );
    };
    return {
      puuid: player.puuid,
      teamId: player.teamId,
      summary: {
        kills: player.kills,
        deaths: player.deaths,
        assists: player.assists,
        kda: player.kda ?? null,
      },
      events: {
        kills: registered('kills'),
        deaths: registered('deaths'),
        assists: registered('assists'),
      },
      reconciliation,
      kpTotal,
      kpByPhase: phases.map((window) => phaseKp(p, player, window)),
      soloKills10: soloCheckpoint(p, player.puuid, 600000, 'kills'),
      soloDeaths10: soloCheckpoint(p, player.puuid, 600000, 'deaths'),
      soloKills15: soloCheckpoint(p, player.puuid, 900000, 'kills'),
      soloDeaths15: soloCheckpoint(p, player.puuid, 900000, 'deaths'),
      rewards: {
        bountyReceived: reward('bounty', 'received'),
        bountyOnDeaths: reward('bounty', 'onDeaths'),
        shutdownReceived: reward('shutdownBounty', 'received'),
        shutdownOnDeaths: reward('shutdownBounty', 'onDeaths'),
      },
    };
  });
  const matrix = new Map<
    string,
    {
      killerPuuid: string;
      victimPuuid: string;
      count: number;
      evidence: MetricEvidence[];
    }
  >();
  const coParticipation = new Map<
    string,
    {
      participantA: string;
      participantB: string;
      count: number;
      evidence: MetricEvidence[];
    }
  >();
  for (const kill of p.available ? p.kills : []) {
    if (kill.actor && kill.victim) {
      const key = JSON.stringify([kill.actor.puuid, kill.victim.puuid]);
      const edge = matrix.get(key) ?? {
        killerPuuid: kill.actor.puuid,
        victimPuuid: kill.victim.puuid,
        count: 0,
        evidence: [],
      };
      edge.count++;
      edge.evidence.push(p.evidence(kill));
      matrix.set(key, edge);
    }
    const members = [
      ...new Set([
        ...(kill.actor ? [kill.actor.puuid] : []),
        ...kill.assistants,
      ]),
    ].sort();
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        const key = JSON.stringify([members[i], members[j]]);
        const edge = coParticipation.get(key) ?? {
          participantA: members[i],
          participantB: members[j],
          count: 0,
          evidence: [],
        };
        edge.count++;
        edge.evidence.push(p.evidence(kill));
        coParticipation.set(key, edge);
      }
  }
  const relationMetric = (
    value: number,
    evidence: MetricEvidence[],
    kind: 'matrix' | 'coparticipation',
  ) => {
    const validN = p.kills.filter((k) =>
      kind === 'matrix' ? k.actor && k.victim : k.actor && k.assistanceComplete,
    ).length;
    const c = p.context(
      input.matchId,
      'C09',
      'count',
      null,
      validN,
      p.kills.length,
      [],
    );
    c.subject = { kind: 'match', id: input.matchId };
    c.evidence = evidence;
    return metricValue(
      c,
      value,
      'derived',
      'Count distinct registered event identities for this pair; incomplete observations may omit additional relations',
    );
  };
  return {
    matchId: input.matchId,
    metricVersion: COMBAT_METRIC_VERSION,
    processingVersion: input.processingVersion,
    processedAt: input.processedAt,
    source: 'MatchEventProjection + MatchParticipant',
    window: fullWindow,
    quality: {
      available: p.available,
      reason: p.reason,
      uniqueKillEvents: p.kills.length,
      duplicateIdentities: p.duplicateN,
      unknownEvents: p.unknownEvents,
      environmentalDeaths: p.kills.filter((k) => k.environmental).length,
      unknownAssistanceEvents: p.kills.filter((k) => !k.assistanceComplete)
        .length,
      unresolvedActors: p.kills.filter((k) => !k.actor && !k.environmental)
        .length,
      unresolvedVictims: p.kills.filter((k) => !k.victim).length,
      summaryKillDeathMismatch: p.missingKillEvents,
      relationCoverage: {
        killerVictim: metricQuality(
          p.kills.filter((k) => k.actor && k.victim).length,
          p.kills.length,
        ),
        coParticipation: metricQuality(
          p.kills.filter((k) => k.actor && k.assistanceComplete).length,
          p.kills.length,
        ),
      },
    },
    participants,
    killerVictimMatrix: [...matrix.values()]
      .map((edge) => ({
        ...edge,
        metric: relationMetric(edge.count, edge.evidence, 'matrix'),
      }))
      .sort(
        (a, b) =>
          a.killerPuuid.localeCompare(b.killerPuuid) ||
          a.victimPuuid.localeCompare(b.victimPuuid),
      ),
    coParticipation: [...coParticipation.values()]
      .map((edge) => ({
        ...edge,
        metric: relationMetric(edge.count, edge.evidence, 'coparticipation'),
      }))
      .sort(
        (a, b) =>
          a.participantA.localeCompare(b.participantA) ||
          a.participantB.localeCompare(b.participantB),
      ),
    relationSemantics:
      'Sparse counts of registered relations; missing edges do not prove no relation; co-participation does not imply premade or intent',
  };
}
