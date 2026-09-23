export type DiscoverySource = 'collector' | 'search' | 'sync';
export interface ObservedAccountRank {
  tier: string;
  division: string | null;
  leaguePoints: number | null;
  queue: string;
  observedAt: Date;
}

/** Rank describes this account at observation time, not the match's players. */
export interface DiscoveryContext {
  observationId: string;
  source: DiscoverySource;
  observedAt: Date;
  region: string | null;
  queriedPuuid: string;
  queueFilter: number | null;
  requestedCount: number;
  startIndex: number;
  rank: ObservedAccountRank | null;
}

export function discoveryData(context: DiscoveryContext, matchIds: string[]) {
  if (
    !context.observationId ||
    !context.queriedPuuid ||
    !['collector', 'search', 'sync'].includes(context.source) ||
    !Number.isFinite(context.observedAt.getTime()) ||
    ![context.requestedCount, context.startIndex].every(
      (n) => Number.isInteger(n) && n >= 0,
    ) ||
    (context.queueFilter !== null &&
      (!Number.isInteger(context.queueFilter) || context.queueFilter < 0)) ||
    matchIds.some((id) => typeof id !== 'string' || !id.trim())
  )
    throw new Error('Invalid discovery observation');
  const rank = context.rank;
  if (
    rank &&
    (!rank.tier ||
      !rank.queue ||
      !Number.isFinite(rank.observedAt.getTime()) ||
      rank.observedAt > context.observedAt ||
      (rank.leaguePoints !== null && !Number.isInteger(rank.leaguePoints)))
  ) {
    throw new Error('Invalid observed account rank');
  }
  return {
    id: context.observationId,
    source: context.source,
    observedAt: context.observedAt,
    region: context.region,
    queriedPuuid: context.queriedPuuid,
    queueFilter: context.queueFilter,
    requestedCount: context.requestedCount,
    startIndex: context.startIndex,
    rankTier: rank?.tier ?? null,
    rankDivision: rank?.division ?? null,
    rankLeaguePoints: rank?.leaguePoints ?? null,
    rankQueue: rank?.queue ?? null,
    rankObservedAt: rank?.observedAt ?? null,
    lineageVersion: 1,
    matches: {
      createMany: {
        data: [...new Set(matchIds)].map((matchId) => ({ matchId })),
      },
    },
  };
}
