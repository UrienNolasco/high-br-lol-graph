/** Versioned exploratory thresholds in timeline milliseconds and Riot map units. */
export const KILL_EPISODE_DEFINITION_VERSION = 1;
export interface EpisodeThresholds {
  profile: 'tight' | 'default' | 'loose';
  gapMs: number;
  maxSpanMs: number;
  diameterUnits: number;
  tradeMs: number;
  tradeDistanceUnits: number;
  maxSnapshotAgeMs: number;
}
export const EPISODE_SENSITIVITY_PROFILES: readonly EpisodeThresholds[] = [
  {
    profile: 'tight',
    gapMs: 7500,
    maxSpanMs: 15000,
    diameterUnits: 1250,
    tradeMs: 5000,
    tradeDistanceUnits: 1250,
    maxSnapshotAgeMs: 60000,
  },
  {
    profile: 'default',
    gapMs: 15000,
    maxSpanMs: 30000,
    diameterUnits: 2000,
    tradeMs: 10000,
    tradeDistanceUnits: 2000,
    maxSnapshotAgeMs: 60000,
  },
  {
    profile: 'loose',
    gapMs: 22500,
    maxSpanMs: 45000,
    diameterUnits: 3000,
    tradeMs: 15000,
    tradeDistanceUnits: 3000,
    maxSnapshotAgeMs: 60000,
  },
];
export interface LocatedKill {
  eventId: string;
  timestampMs: number;
  frameIndex: number;
  eventIndex: number;
  x: number;
  y: number;
  actorPuuid: string | null;
  victimPuuid: string | null;
  actorTeamId: number | null;
  victimTeamId: number | null;
  assistingPuuids: string[];
}
export interface KillCluster {
  episodeId: string;
  kills: LocatedKill[];
}
const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function validateKills(kills: readonly LocatedKill[]) {
  if (new Set(kills.map((k) => k.eventId)).size !== kills.length)
    throw new Error('Duplicate event identity');
  if (
    kills.some(
      (k) =>
        ![k.timestampMs, k.x, k.y, k.frameIndex, k.eventIndex].every(
          (n) => Number.isFinite(n) && n >= 0,
        ),
    )
  )
    throw new RangeError('Invalid located event');
}
export const killOrder = (a: LocatedKill, b: LocatedKill) =>
  a.timestampMs - b.timestampMs ||
  a.frameIndex - b.frameIndex ||
  a.eventIndex - b.eventIndex ||
  compareId(a.eventId, b.eventId);
export const killDistance = (a: LocatedKill, b: LocatedKill) =>
  Math.hypot(a.x - b.x, a.y - b.y);
function validateThresholds(t: EpisodeThresholds) {
  if (
    ![
      t.gapMs,
      t.maxSpanMs,
      t.diameterUnits,
      t.tradeMs,
      t.tradeDistanceUnits,
      t.maxSnapshotAgeMs,
    ].every((n) => Number.isFinite(n) && n >= 0) ||
    t.maxSpanMs < t.gapMs
  )
    throw new RangeError('Invalid episode thresholds');
}
/** Chronological greedy complete-link spatial assignment; each event belongs to one cluster. */
export function clusterKills(
  kills: readonly LocatedKill[],
  thresholds: EpisodeThresholds,
): KillCluster[] {
  validateThresholds(thresholds);
  validateKills(kills);
  const clusters: KillCluster[] = [];
  for (const kill of [...kills].sort(killOrder)) {
    const candidates = clusters
      .flatMap((cluster) => {
        const first = cluster.kills[0],
          last = cluster.kills.at(-1)!;
        const gap = kill.timestampMs - last.timestampMs;
        if (
          gap > thresholds.gapMs ||
          kill.timestampMs - first.timestampMs > thresholds.maxSpanMs
        )
          return [];
        const diameter = Math.max(
          ...cluster.kills.map((previous) => killDistance(previous, kill)),
        );
        if (diameter > thresholds.diameterUnits) return [];
        return [{ cluster, diameter, gap }];
      })
      .sort(
        (a, b) =>
          a.diameter - b.diameter ||
          a.gap - b.gap ||
          compareId(a.cluster.episodeId, b.cluster.episodeId),
      );
    if (candidates[0]) candidates[0].cluster.kills.push(kill);
    else
      clusters.push({
        episodeId: `kill-episode:v${KILL_EPISODE_DEFINITION_VERSION}:${thresholds.profile}:${kill.eventId}`,
        kills: [kill],
      });
  }
  return clusters;
}
export interface QuickTrade {
  deathEventId: string;
  responseEventId: string;
  respondingTeamId: number;
  latencyMs: number;
  distanceUnits: number;
  killedOriginalAuthor: boolean;
}
/** One event can participate in at most one pair, in either role; simultaneous kills have no inferred order. */
export function pairQuickTrades(
  kills: readonly LocatedKill[],
  thresholds: EpisodeThresholds,
): QuickTrade[] {
  validateThresholds(thresholds);
  validateKills(kills);
  const ordered = [...kills].sort(killOrder),
    used = new Set<string>(),
    pairs: QuickTrade[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const response = ordered[i];
    if (
      used.has(response.eventId) ||
      response.actorTeamId === null ||
      response.victimTeamId === null ||
      response.actorTeamId === response.victimTeamId
    )
      continue;
    const candidates = ordered
      .slice(0, i)
      .filter(
        (death) =>
          !used.has(death.eventId) &&
          death.actorTeamId === response.victimTeamId &&
          death.victimTeamId === response.actorTeamId &&
          response.timestampMs > death.timestampMs &&
          response.timestampMs - death.timestampMs <= thresholds.tradeMs &&
          killDistance(death, response) <= thresholds.tradeDistanceUnits,
      )
      .sort(
        (a, b) =>
          b.timestampMs - a.timestampMs ||
          killDistance(a, response) - killDistance(b, response) ||
          compareId(a.eventId, b.eventId),
      );
    const death = candidates[0];
    if (!death) continue;
    used.add(death.eventId);
    used.add(response.eventId);
    pairs.push({
      deathEventId: death.eventId,
      responseEventId: response.eventId,
      respondingTeamId: response.actorTeamId,
      latencyMs: response.timestampMs - death.timestampMs,
      distanceUnits: killDistance(death, response),
      killedOriginalAuthor: response.victimPuuid === death.actorPuuid,
    });
  }
  return pairs;
}
export function coClusterPairs(clusters: readonly KillCluster[]) {
  const result = new Set<string>();
  for (const cluster of clusters)
    for (let i = 0; i < cluster.kills.length; i++)
      for (let j = i + 1; j < cluster.kills.length; j++)
        result.add(
          JSON.stringify(
            [cluster.kills[i].eventId, cluster.kills[j].eventId].sort(),
          ),
        );
  return result;
}
export function symmetricDifferenceSize(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
) {
  return (
    [...a].filter((v) => !b.has(v)).length +
    [...b].filter((v) => !a.has(v)).length
  );
}
