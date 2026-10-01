import { normalizeRole } from '../../matches/contracts/eligibility';
import type { ChampionContextCohort } from '../../matches/ports/champion-context-reader';
const estimate = (wins: number, n: number) => {
  if (!n)
    return { n, wins, rate: null, interval95: null, reason: 'no_observations' };
  const p = wins / n,
    z = 1.96,
    d = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return {
    n,
    wins,
    rate: p,
    interval95: [center - half, center + half],
    reason: n < 30 ? 'insufficient_sample' : null,
  };
};
/** One focal champion/role observation per distinct eligible match. */
export function championContext(
  cohort: ChampionContextCohort,
  championId: number,
  role: string,
) {
  const seen = new Set<string>();
  const matchup = new Map<number, { n: number; wins: number; ids: string[] }>();
  const allies = new Map<
    string,
    { championId: number; role: string; n: number; wins: number; ids: string[] }
  >();
  const excluded: Record<string, number> = {};
  const reject = (reason: string) => {
    excluded[reason] = (excluded[reason] ?? 0) + 1;
  };
  let n = 0,
    wins = 0;
  for (const m of cohort.matches) {
    if (seen.has(m.matchId)) {
      reject('duplicate_match');
      continue;
    }
    seen.add(m.matchId);
    if (m.populationEligible !== true) {
      reject('population_ineligible_or_unknown');
      continue;
    }
    const roster = m.participants;
    if (
      roster.length !== 10 ||
      new Set(roster.map((p) => p.puuid)).size !== 10 ||
      [100, 200].some(
        (team) => roster.filter((p) => p.teamId === team).length !== 5,
      ) ||
      roster.some((p) => !normalizeRole(p.role)) ||
      [100, 200].some(
        (team) =>
          new Set(
            roster
              .filter((p) => p.teamId === team)
              .map((p) => normalizeRole(p.role)),
          ).size !== 5,
      )
    ) {
      reject('ambiguous_roster_or_role');
      continue;
    }
    const focal = roster.filter(
      (p) => p.championId === championId && normalizeRole(p.role) === role,
    );
    if (focal.length !== 1) {
      reject(focal.length ? 'ambiguous_focal' : 'outside_champion_role');
      continue;
    }
    const p = focal[0];
    if (
      roster.some((q) => q.win !== (q.teamId === p.teamId ? p.win : !p.win))
    ) {
      reject('inconsistent_outcome');
      continue;
    }
    n++;
    wins += Number(p.win);
    const opponent = roster.find(
      (q) => q.teamId !== p.teamId && normalizeRole(q.role) === role,
    )!;
    const cell = matchup.get(opponent.championId) ?? { n: 0, wins: 0, ids: [] };
    cell.n++;
    cell.wins += Number(p.win);
    cell.ids.push(m.matchId);
    matchup.set(opponent.championId, cell);
    for (const ally of roster.filter(
      (q) => q.teamId === p.teamId && q.puuid !== p.puuid,
    )) {
      const allyRole = normalizeRole(ally.role)!;
      const key = `${ally.championId}:${allyRole}`;
      const a = allies.get(key) ?? {
        championId: ally.championId,
        role: allyRole,
        n: 0,
        wins: 0,
        ids: [],
      };
      a.n++;
      a.wins += Number(p.win);
      a.ids.push(m.matchId);
      allies.set(key, a);
    }
  }
  const baseline = estimate(wins, n);
  return {
    version: 1,
    championId,
    role,
    baseline,
    coverage: {
      availableMatches: cohort.availableMatches,
      returnedMatches: cohort.matches.length,
      distinctMatches: seen.size,
      eligibleFocalMatches: n,
      truncated: cohort.truncated,
      exclusions: excluded,
    },
    matchups: [...matchup]
      .sort((a, b) => a[0] - b[0])
      .map(([opponentChampionId, c]) => ({
        opponentChampionId,
        ...estimate(c.wins, c.n),
        denominator: n,
        matchIds: c.ids,
      })),
    allies: [...allies.values()]
      .sort(
        (a, b) => a.role.localeCompare(b.role) || a.championId - b.championId,
      )
      .map((a) => ({
        championId: a.championId,
        role: a.role,
        ...estimate(a.wins, a.n),
        denominator: n,
        descriptiveGain: n ? a.wins / a.n - wins / n : null,
        baseline,
        matchIds: a.ids,
      })),
    limitations: [
      'Observed imported cohort; selection and composition confounding.',
      'No premade inference or causal synergy ranking.',
      'Wilson intervals are nominal; players recur, matches and pair cells are correlated.',
      'Baseline includes pair observations; descriptiveGain has no independent uncertainty estimate.',
      'Small cells (N < 30) are insufficient; N >= 30 does not guarantee precision.',
    ],
  };
}
