/**
 * Canonical collector-owned observation. It describes the account query at
 * observation time; it never describes a match participant's historical rank.
 */
export type DiscoverySource = 'collector' | 'search' | 'sync';

export interface ObservedAccountRank {
  tier: string;
  division: string | null;
  leaguePoints: number | null;
  queue: string;
  observedAt: Date;
}

export interface DiscoveryContext {
  readonly observationId: string;
  readonly source: DiscoverySource;
  readonly observedAt: Date;
  readonly region: string | null;
  readonly queriedPuuid: string;
  readonly queueFilter: number | null;
  readonly requestedCount: number;
  readonly startIndex: number;
  readonly rank: ObservedAccountRank | null;
}

export interface DiscoveryObservationData {
  id: string;
  source: DiscoverySource;
  observedAt: Date;
  region: string | null;
  queriedPuuid: string;
  queueFilter: number | null;
  requestedCount: number;
  startIndex: number;
  rankTier: string | null;
  rankDivision: string | null;
  rankLeaguePoints: number | null;
  rankQueue: string | null;
  rankObservedAt: Date | null;
  lineageVersion: number;
  matches: { createMany: { data: { matchId: string }[] } };
}

function validCounter(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** Converts and validates the immutable observation before persistence. */
export function discoveryData(
  context: DiscoveryContext,
  matchIds: readonly string[],
): DiscoveryObservationData {
  if (
    !context.observationId.trim() ||
    !context.queriedPuuid.trim() ||
    !['collector', 'search', 'sync'].includes(context.source) ||
    !Number.isFinite(context.observedAt.getTime()) ||
    !validCounter(context.requestedCount) ||
    !validCounter(context.startIndex) ||
    (context.queueFilter !== null &&
      (!Number.isInteger(context.queueFilter) || context.queueFilter < 0)) ||
    matchIds.some((id) => typeof id !== 'string' || !id.trim())
  ) {
    throw new Error('Invalid discovery observation');
  }

  const rank = context.rank;
  if (
    rank &&
    (!rank.tier.trim() ||
      !rank.queue.trim() ||
      !Number.isFinite(rank.observedAt.getTime()) ||
      rank.observedAt > context.observedAt ||
      (rank.leaguePoints !== null &&
        (!Number.isInteger(rank.leaguePoints) || rank.leaguePoints < 0)))
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
    // Preserve LP 0 and distinguish it from unknown (null).
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
