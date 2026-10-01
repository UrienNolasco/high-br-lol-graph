import type {
  PoolSessionQuery,
  PoolSessionRow,
} from '../contracts/pool-sessions';
export const POOL_SESSION_METHOD_VERSION = 1;
const MIN_DISPERSION_N = 5;
function dispersion(values: number[]) {
  const n = values.length;
  const mean = n ? values.reduce((s, v) => s + v, 0) / n : null;
  return {
    n,
    mean,
    sampleStandardDeviation:
      n >= MIN_DISPERSION_N
        ? Math.sqrt(values.reduce((s, v) => s + (v - mean!) ** 2, 0) / (n - 1))
        : null,
    reason: n < MIN_DISPERSION_N ? 'insufficient_sample' : null,
    origin: 'derived',
    unit: 'binary_win',
    formula: 'sqrt(sum((x-mean)^2)/(N-1)); x in {0,1}',
    minimumN: MIN_DISPERSION_N,
    interpretation:
      'Descriptive dispersion of observed binary outcomes; no skill or stability ranking',
  };
}
function inferSessions(rows: PoolSessionRow[], thresholdMinutes: number) {
  const sessions: Array<{
    id: number;
    startMs: number;
    estimatedEndMs: number;
    matches: Array<{
      matchId: string;
      position: number;
      eligible: boolean;
      win: number | null;
      evidenceId: string;
    }>;
  }> = [];
  let previousEnd: number | null = null;
  const invalid: string[] = [];
  for (const row of rows) {
    if (
      !Number.isSafeInteger(row.gameCreationMs) ||
      row.gameCreationMs < 0 ||
      !Number.isFinite(row.durationSeconds) ||
      row.durationSeconds <= 0 ||
      !Number.isSafeInteger(row.gameCreationMs + row.durationSeconds * 1000)
    ) {
      invalid.push(row.matchId);
      previousEnd = null;
      continue;
    }
    const end = row.gameCreationMs + row.durationSeconds * 1000;
    if (
      previousEnd === null ||
      row.gameCreationMs - previousEnd > thresholdMinutes * 60000
    )
      sessions.push({
        id: sessions.length + 1,
        startMs: row.gameCreationMs,
        estimatedEndMs: end,
        matches: [],
      });
    const session = sessions[sessions.length - 1];
    session.matches.push({
      matchId: row.matchId,
      position: session.matches.length + 1,
      eligible: row.eligible,
      win: row.eligible ? row.win : null,
      evidenceId: row.evidenceId,
    });
    session.estimatedEndMs = Math.max(session.estimatedEndMs, end);
    previousEnd = session.estimatedEndMs;
  }
  return {
    thresholdMinutes,
    count: sessions.length,
    sessions,
    invalidTimingMatchIds: invalid,
  };
}
export function calculatePoolSessions(
  query: PoolSessionQuery,
  input: PoolSessionRow[],
  unmaterializedMatches = 0,
  tooLarge = false,
  total = input.length,
) {
  const rows = [...new Map(input.map((r) => [r.matchId, r])).values()].sort(
    (a, b) =>
      a.gameCreationMs - b.gameCreationMs || a.matchId.localeCompare(b.matchId),
  );
  const poolRows = rows.filter(
    (r) => r.eligible && r.championId !== null && r.championId > 0,
  );
  const champions = [...new Set(poolRows.map((r) => r.championId!))]
    .map((championId) => {
      const matches = poolRows.filter((r) => r.championId === championId);
      return {
        championId,
        n: matches.length,
        share: matches.length / poolRows.length,
        sparse: matches.length < MIN_DISPERSION_N,
      };
    })
    .sort((a, b) => b.n - a.n || a.championId - b.championId);
  const top3N = champions.slice(0, 3).reduce((n, c) => n + c.n, 0);
  const groups = new Map<string, PoolSessionRow[]>();
  for (const row of poolRows) {
    const key = JSON.stringify([row.patch, row.role, row.championId]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const contexts = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, matches]) => {
      const [patch, role, championId] = JSON.parse(key) as [
        string | null,
        string | null,
        number,
      ];
      const valid = matches.filter((r) => r.win === 0 || r.win === 1);
      return {
        patch,
        role,
        championId,
        observedMatches: matches.length,
        missingOutcomeN: matches.length - valid.length,
        status:
          !patch || !role
            ? 'unknown_context'
            : valid.length < MIN_DISPERSION_N
              ? 'insufficient'
              : 'descriptive',
        dispersion: dispersion(valid.map((r) => r.win!)),
        evidence: matches.map((r) => ({
          matchId: r.matchId,
          datasetContributionId: r.evidenceId,
        })),
      };
    });
  const sessions = inferSessions(rows, query.gapMinutes);
  const positionMap = new Map<number, number[]>();
  for (const session of sessions.sessions)
    for (const match of session.matches) {
      if (match.eligible && (match.win === 0 || match.win === 1))
        positionMap.set(match.position, [
          ...(positionMap.get(match.position) ?? []),
          match.win,
        ]);
    }
  return {
    methodVersion: POOL_SESSION_METHOD_VERSION,
    opportunities: ['H08', 'H10'],
    status: tooLarge
      ? 'unavailable'
      : rows.length
        ? 'descriptive'
        : 'unavailable',
    reason: tooLarge
      ? 'candidate_limit_exceeded'
      : rows.length
        ? null
        : 'no_observed_matches',
    filters: query,
    coverage: {
      candidateRows: total,
      observedDistinctMatches: rows.length,
      duplicateRowsRemoved: input.length - rows.length,
      eligiblePoolMatches: poolRows.length,
      excludedN: rows.filter((r) => !r.eligible).length,
      missingChampionN: rows.filter(
        (r) => r.eligible && (r.championId === null || r.championId <= 0),
      ).length,
      unmaterializedMatches,
      exclusions: [
        ...new Set(
          rows
            .filter((r) => !r.eligible)
            .map((r) => r.exclusionReason ?? 'unknown_exclusion'),
        ),
      ]
        .sort()
        .map((reason) => ({
          reason,
          n: rows.filter(
            (r) =>
              !r.eligible &&
              (r.exclusionReason ?? 'unknown_exclusion') === reason,
          ).length,
        })),
      complete: false,
      status: unmaterializedMatches
        ? 'incomplete_import'
        : 'unknown_collection_completeness',
      caveat:
        'Only imported/materialized matches are observed; undiscovered or failed imports can join or split inferred sessions. Period boundaries censor sessions.',
    },
    pool: {
      origin: 'derived',
      n: poolRows.length,
      champions,
      top3: {
        numerator: top3N,
        denominator: poolRows.length,
        value: poolRows.length ? top3N / poolRows.length : null,
        reason: poolRows.length ? null : 'zero_denominator',
        unit: 'fraction',
        formula:
          'sum(count of three most observed champions)/eligible known-champion matches',
        tiePolicy:
          'Equal counts ordered by ascending championId; tied cutoff does not alter concentration',
      },
      contexts,
    },
    sessions: {
      ...sessions,
      origin: 'estimated',
      endFormula: 'gameCreationMs + gameDurationSeconds * 1000',
      gapRule:
        'New session when start minus previous estimated session end > threshold; equality stays in session; overlaps keep maximum end',
      positions: [...positionMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([position, values]) => ({ position, ...dispersion(values) })),
      sensitivity: [...new Set([15, 30, 60, query.gapMinutes])]
        .sort((a, b) => a - b)
        .map((thresholdMinutes) => {
          const result = inferSessions(rows, thresholdMinutes);
          return {
            thresholdMinutes,
            sessionCount: result.count,
            matchN: result.sessions.reduce((n, s) => n + s.matches.length, 0),
          };
        }),
    },
    limitations: [
      'Outcome dispersion uses observed binary wins within champion/role/patch contexts; small samples are insufficient and repeated player matches are dependent.',
      'Session positions are descriptive associations, not evidence of tilt, fatigue or a reason to change routine.',
      'Excluded matches remain in session chronology; unknown timing breaks continuity; no gap proves inactivity.',
    ],
  };
}
export type PoolSessionResponse = ReturnType<typeof calculatePoolSessions>;
