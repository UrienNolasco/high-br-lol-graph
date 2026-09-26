import {
  MetricEvidence,
  MissingReason,
  metricContext,
  metricQuality,
  metricValue,
  unavailableMetric,
} from '../contracts/metric-contract';
import {
  CombatEvent,
  CombatInput,
  prepareCombat,
  combatEventId,
} from './combat-calculator';
import {
  EPISODE_SENSITIVITY_PROFILES,
  KILL_EPISODE_DEFINITION_VERSION,
  LocatedKill,
  clusterKills,
  pairQuickTrades,
  coClusterPairs,
  symmetricDifferenceSize,
} from './kill-episode-clustering';
import { episodeResources } from './episode-resources';
export interface KillEpisodeEvent extends CombatEvent {
  positionX: number | null;
  positionY: number | null;
}
export interface KillEpisodesInput extends Omit<CombatInput, 'events'> {
  events: KillEpisodeEvent[];
  snapshotProjection: unknown;
  mapId: number;
  gameVersion: string;
}
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;
export function calculateKillEpisodes(input: KillEpisodesInput) {
  const prepared = prepareCombat(input);
  const metadata = {
    matchId: input.matchId,
    gameVersion: input.gameVersion,
    metricVersion: KILL_EPISODE_DEFINITION_VERSION,
    processingVersion: input.processingVersion,
    processedAt: input.processedAt,
  };
  const unavailable = (reason: MissingReason) => ({
    ...metadata,
    reason,
    report: null,
  });
  if (!prepared.available)
    return unavailable(prepared.reason ?? 'missing_projection');
  if (input.mapId !== 11) return unavailable('unsupported_version');
  if (prepared.duplicateN) return unavailable('invalid_value');
  const primary = EPISODE_SENSITIVITY_PROFILES[1];
  const located: LocatedKill[] = [],
    unassigned: Array<{
      eventId: string;
      reason: MissingReason;
      timestampMs: number | null;
    }> = [];
  const sourceById = new Map(input.events.map((e) => [combatEventId(e), e]));
  const unknownAssistanceIds: string[] = [];
  for (const k of prepared.kills) {
    const event = sourceById.get(combatEventId(k.event))!;
    const invalid =
      (event.timestampMs !== null && !finite(event.timestampMs)) ||
      (event.positionX !== null && !finite(event.positionX)) ||
      (event.positionY !== null && !finite(event.positionY));
    const reason: MissingReason | null = invalid
      ? 'invalid_value'
      : !finite(event.timestampMs) ||
          !finite(event.positionX) ||
          !finite(event.positionY)
        ? 'missing_field'
        : event.timestampMs > prepared.endMs
          ? 'invalid_value'
          : null;
    if (reason) {
      unassigned.push({
        eventId: combatEventId(event),
        reason,
        timestampMs: finite(event.timestampMs) ? event.timestampMs : null,
      });
      continue;
    }
    if (!k.assistanceComplete) unknownAssistanceIds.push(combatEventId(event));
    const knownTeam = (team: number | undefined) =>
      team === 100 || team === 200 ? team : null;
    located.push({
      eventId: combatEventId(event),
      timestampMs: event.timestampMs!,
      frameIndex: event.frameIndex,
      eventIndex: event.eventIndex,
      x: event.positionX!,
      y: event.positionY!,
      actorPuuid: k.actor?.puuid ?? null,
      victimPuuid: k.victim?.puuid ?? null,
      actorTeamId: knownTeam(k.actor?.teamId),
      victimTeamId: knownTeam(k.victim?.teamId),
      assistingPuuids: k.assistants,
    });
  }
  const overallReason: MissingReason | null = !prepared.endObserved
    ? 'missing_frame'
    : prepared.missingKillEvents
      ? 'incomplete_events'
      : unassigned.length
        ? 'missing_field'
        : null;
  const evidence = (kills: readonly LocatedKill[]): MetricEvidence[] =>
    kills.map((k) => ({
      source: 'MatchEventProjection',
      field: 'CHAMPION_KILL',
      value: k.eventId,
      eventId: k.eventId,
      frameIndex: k.frameIndex,
      timestampMs: k.timestampMs,
    }));
  const context = (
    id: string,
    kills: readonly LocatedKill[],
    window: { startMs: number; endMs: number; bounds: '[]' } | null,
  ) =>
    metricContext({
      metricId: id,
      processingVersion: input.processingVersion,
      processedAt: input.processedAt,
      matchId: input.matchId,
      subject: { kind: 'match', id: input.matchId },
      unit: 'count',
      window,
      denominator: null,
      evidence: evidence(kills),
      quality: {
        ...metricQuality(located.length, prepared.kills.length),
        unknownEvents: prepared.unknownEvents,
        reconciliationIssues: prepared.missingKillEvents
          ? ['kill_death_summary_mismatch']
          : [],
      },
    });
  const profiles = EPISODE_SENSITIVITY_PROFILES.map((thresholds) => ({
    thresholds,
    clusters: clusterKills(located, thresholds),
    trades: pairQuickTrades(located, thresholds),
  }));
  const main = profiles[1],
    baselinePairs = coClusterPairs(main.clusters);
  const tradePairIds = (trades: ReturnType<typeof pairQuickTrades>) =>
    new Set(
      trades.map((t) => JSON.stringify([t.deathEventId, t.responseEventId])),
    );
  const baselineTradePairs = tradePairIds(main.trades);
  const episodes = main.clusters.map((cluster) => {
    const first = cluster.kills[0],
      last = cluster.kills.at(-1)!;
    const window = {
      startMs: first.timestampMs,
      endMs: last.timestampMs,
      bounds: '[]' as const,
    };
    const participantPuuids = [
      ...new Set(
        cluster.kills.flatMap((k) =>
          [k.actorPuuid, k.victimPuuid, ...k.assistingPuuids].filter(
            (p): p is string => p !== null,
          ),
        ),
      ),
    ].sort();
    const attributionComplete = cluster.kills.every(
      (k) =>
        k.actorTeamId !== null &&
        k.victimTeamId !== null &&
        k.actorTeamId !== k.victimTeamId,
    );
    const teamBalance = [100, 200].map((teamId) => {
      const kills = cluster.kills.filter(
          (k) => k.actorTeamId === teamId,
        ).length,
        deaths = cluster.kills.filter((k) => k.victimTeamId === teamId).length;
      const c = context('C11', cluster.kills, window);
      c.subject = { kind: 'team', id: String(teamId) };
      c.quality = {
        ...c.quality,
        ...metricQuality(
          cluster.kills.reduce(
            (n, k) =>
              n +
              Number(k.actorTeamId !== null) +
              Number(k.victimTeamId !== null),
            0,
          ),
          2 * cluster.kills.length,
        ),
      };
      return {
        teamId,
        killsRegistered: kills,
        deathsRegistered: deaths,
        attributionComplete,
        net: attributionComplete
          ? metricValue(
              c,
              kills - deaths,
              'estimated',
              'registered kills minus deaths inside a threshold-defined episode, not a fight outcome or causal advantage',
            )
          : unavailableMetric(
              c,
              'missing_field',
              'complete author/victim team attribution required for episode balance',
            ),
      };
    });
    return {
      episodeId: cluster.episodeId,
      startMs: first.timestampMs,
      endMs: last.timestampMs,
      durationMs: last.timestampMs - first.timestampMs,
      eventIds: cluster.kills.map((k) => k.eventId),
      events: cluster.kills,
      participantPuuids,
      unknownAssistanceEventIds: cluster.kills
        .filter((k) => unknownAssistanceIds.includes(k.eventId))
        .map((k) => k.eventId),
      killEvents: metricValue(
        context('C11', cluster.kills, window),
        cluster.kills.length,
        'estimated',
        'count of observed kill events assigned once by the versioned time/diameter/max-span algorithm',
      ),
      teamBalance,
      resources: episodeResources(input.snapshotProjection, participantPuuids, {
        matchId: input.matchId,
        processedAt: input.processedAt,
        processingVersion: input.processingVersion,
        episodeId: cluster.episodeId,
        startMs: first.timestampMs,
        maxAgeMs: primary.maxSnapshotAgeMs,
      }),
    };
  });
  const environmentalIds = new Set(
    prepared.kills
      .filter((k) => k.environmental)
      .map((k) => combatEventId(k.event)),
  );
  const unknownTradeTeams = located.filter(
    (k) =>
      !environmentalIds.has(k.eventId) &&
      (k.actorTeamId === null ||
        k.victimTeamId === null ||
        k.actorTeamId === k.victimTeamId),
  );
  const tradeReason: MissingReason | null =
    overallReason ?? (unknownTradeTeams.length ? 'missing_field' : null);
  const episodeByEvent = new Map(
    main.clusters.flatMap((c) =>
      c.kills.map((k) => [k.eventId, c.episodeId] as const),
    ),
  );
  const quickTrades = main.trades.map((pair) => ({
    ...pair,
    deathEpisodeId: episodeByEvent.get(pair.deathEventId)!,
    responseEpisodeId: episodeByEvent.get(pair.responseEventId)!,
    evidence: evidence(
      located.filter(
        (k) =>
          k.eventId === pair.deathEventId || k.eventId === pair.responseEventId,
      ),
    ),
  }));
  const aggregate = (
    id: string,
    value: number,
    method: string,
    reason = overallReason,
  ) => {
    const c = context(
      id,
      located,
      prepared.endObserved
        ? {
            startMs: 0,
            endMs: prepared.endMs,
            bounds: '[]',
          }
        : null,
    );
    if (id === 'C10') {
      const valid = located.filter(
        (k) =>
          !environmentalIds.has(k.eventId) &&
          k.actorTeamId !== null &&
          k.victimTeamId !== null &&
          k.actorTeamId !== k.victimTeamId,
      ).length;
      c.quality = {
        ...c.quality,
        ...metricQuality(
          valid,
          prepared.kills.filter((k) => !k.environmental).length,
        ),
      };
    }
    return reason
      ? unavailableMetric(c, reason, method)
      : metricValue(c, value, 'estimated', method);
  };
  return {
    ...metadata,
    reason: null,
    report: {
      definition: {
        version: KILL_EPISODE_DEFINITION_VERSION,
        thresholds: primary,
        grouping:
          'chronological greedy, spatial complete-link, maximum gap and total span; choose smallest maximum distance, then gap, then stable episode id',
        quickTrade:
          'strictly later reciprocal-team kill; most recent eligible unmatched death, then nearest distance and stable event id; each event used once in either role',
      },
      coverage: {
        sourceKillEvents: prepared.kills.length,
        assignedKillEvents: located.length,
        unassignedKillEvents: unassigned.length,
        excludedEnvironmentalEvents: located.filter((k) =>
          environmentalIds.has(k.eventId),
        ).length,
        unknownTradeTeamEvents: unknownTradeTeams.length,
        tradeReason,
        knownTradeTeamEvents: located.filter(
          (k) =>
            k.actorTeamId !== null &&
            k.victimTeamId !== null &&
            k.actorTeamId !== k.victimTeamId,
        ).length,
        unknownAssistanceEvents: unknownAssistanceIds.length,
        unknownSourceEvents: prepared.unknownEvents,
        terminalObserved: prepared.endObserved,
        summaryReconciled: !prepared.missingKillEvents,
        reason: overallReason,
      },
      episodeCount: aggregate(
        'C11',
        episodes.length,
        'number of threshold-defined episodes over complete located observed kill events',
      ),
      quickTradeCount: aggregate(
        'C10',
        quickTrades.length,
        'number of disjoint ordered reciprocal-team kill pairs within time/distance limits; environmental kills excluded',
        tradeReason,
      ),
      episodes,
      quickTrades,
      unassigned,
      sensitivity: profiles.map((profile) => ({
        thresholds: profile.thresholds,
        observedEpisodeCount: profile.clusters.length,
        observedQuickTradeCount: profile.trades.length,
        multiKillEpisodes: profile.clusters.filter((c) => c.kills.length > 1)
          .length,
        largestEpisodeKillCount: Math.max(
          0,
          ...profile.clusters.map((c) => c.kills.length),
        ),
        coClusterPairChangesFromDefault: symmetricDifferenceSize(
          coClusterPairs(profile.clusters),
          baselinePairs,
        ),
        quickTradePairChangesFromDefault: symmetricDifferenceSize(
          tradePairIds(profile.trades),
          baselineTradePairs,
        ),
        reason: overallReason,
        tradeReason,
      })),
      interpretation:
        'Episodes of observed kills, not detection of every teamfight or combat without deaths. Spatial/temporal thresholds are exploratory proxies, not validated fight labels. Quick trades describe a subsequent regional team response, not causality or necessarily revenge. Registered membership is retrospective; resource values use strictly previous snapshots and never imply exact inventory or wasted gold.',
    },
  };
}
