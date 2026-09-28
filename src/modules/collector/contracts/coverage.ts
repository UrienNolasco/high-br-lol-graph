export interface CoverageMatch {
  matchId: string;
  imported: boolean;
  summaryPresent: boolean;
  timelinePresent: boolean;
  gameCreation: bigint | null;
  queueId: number | null;
  mapId: number | null;
  gameVersion: string | null;
}

export interface CoverageObservation {
  id: string;
  source: string;
  observedAt: Date;
  queriedPuuid: string;
  region: string | null;
  queueFilter: number | null;
  rankTier: string | null;
  rankDivision: string | null;
  rankQueue: string | null;
  matches: { matchId: string }[];
}

function bounds(values: number[]) {
  return {
    first: values.length ? new Date(Math.min(...values)).toISOString() : null,
    last: values.length ? new Date(Math.max(...values)).toISOString() : null,
    knownN: values.length,
  };
}

/** Pure, deterministic coverage projection owned by collector. */
export function discoveryCoverage(
  matches: readonly CoverageMatch[],
  observations: readonly CoverageObservation[],
  participantAccounts: number,
) {
  const uniqueMatches = [
    ...new Map(matches.map((m) => [m.matchId, m])).values(),
  ];
  const discovered = new Set(
    observations.flatMap((o) => o.matches.map((m) => m.matchId)),
  );
  const complete = uniqueMatches.filter(
    (m) => m.summaryPresent && m.timelinePresent,
  ).length;
  const groups = <T>(
    rows: readonly T[],
    key: (row: T) => Record<string, unknown>,
  ) => {
    const grouped = new Map<
      string,
      { dimensions: Record<string, unknown>; count: number }
    >();
    for (const row of rows) {
      const dimensions = key(row);
      const id = JSON.stringify(dimensions);
      const group = grouped.get(id) ?? { dimensions, count: 0 };
      group.count++;
      grouped.set(id, group);
    }
    return [...grouped.values()].sort((a, b) =>
      JSON.stringify(a.dimensions).localeCompare(JSON.stringify(b.dimensions)),
    );
  };
  return {
    lineageVersion: 1,
    population: {
      distinctKnownMatches: uniqueMatches.length,
      importedMatches: uniqueMatches.filter((m) => m.imported).length,
      queriedAccounts: new Set(observations.map((o) => o.queriedPuuid)).size,
      participantAccounts,
      discoveryObservations: observations.length,
      observationsWithNoMatches: observations.filter((o) => !o.matches.length)
        .length,
      historicalParticipantRank: 'unavailable',
      selection:
        'observed_imports_and_account_queries; not representative of all matches',
    },
    rawPair: {
      complete,
      summaryOnly: uniqueMatches.filter(
        (m) => m.summaryPresent && !m.timelinePresent,
      ).length,
      timelineOnly: uniqueMatches.filter(
        (m) => !m.summaryPresent && m.timelinePresent,
      ).length,
      neither: uniqueMatches.filter(
        (m) => !m.summaryPresent && !m.timelinePresent,
      ).length,
      denominator: uniqueMatches.length,
      coverage: uniqueMatches.length ? complete / uniqueMatches.length : null,
      validation: 'presence_only; payload validity is assessed by processing',
    },
    lineage: {
      knownMatches: uniqueMatches.filter((m) => discovered.has(m.matchId))
        .length,
      unknownMatches: uniqueMatches.filter((m) => !discovered.has(m.matchId))
        .length,
      bySource: ['collector', 'search', 'sync'].map((source) => {
        const sourceRows = observations.filter((o) => o.source === source);
        return {
          source,
          observations: sourceRows.length,
          distinctMatches: new Set(
            sourceRows.flatMap((o) => o.matches.map((m) => m.matchId)),
          ).size,
          queriedAccounts: new Set(sourceRows.map((o) => o.queriedPuuid)).size,
        };
      }),
      sourceCountsOverlap: true,
    },
    importedGamePeriod: {
      ...bounds(
        uniqueMatches
          .filter((m) => m.imported && m.gameCreation !== null)
          .map((m) => Number(m.gameCreation)),
      ),
      unknownN: uniqueMatches.filter((m) => m.gameCreation === null).length,
      source: 'Match.gameCreation; no discovery timestamp substitution',
      continuousCoverage: 'unknown',
    },
    discoveryPeriod: bounds(observations.map((o) => o.observedAt.getTime())),
    matchPopulation: groups(uniqueMatches, (m) => ({
      queueId: m.queueId,
      mapId: m.mapId,
      gameVersion: m.gameVersion,
    })),
    queryPopulation: groups(observations, (o) => ({
      source: o.source,
      region: o.region,
      queueFilter: o.queueFilter,
    })),
    queriedAccountRankObservations: groups(observations, (o) => ({
      tier: o.rankTier,
      division: o.rankDivision,
      queue: o.rankQueue,
    })),
    rankInterpretation:
      'Queried account at discovery time only; never the historical rank of match participants.',
  };
}
