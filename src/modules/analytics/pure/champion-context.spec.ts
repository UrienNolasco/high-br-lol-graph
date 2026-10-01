import { championContext } from './champion-context';
import { ChampionContextMatch } from '../../matches/ports/champion-context-reader';
const match = (id: string, win: boolean): ChampionContextMatch => ({
  matchId: id,
  populationEligible: true,
  participants: [100, 200].flatMap((teamId) =>
    ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].map((role, i) => ({
      puuid: `${teamId}:${i}`,
      championId: teamId === 100 ? i + 1 : i + 11,
      role,
      teamId,
      win: teamId === 100 ? win : !win,
    })),
  ),
});
const run = (matches: ChampionContextMatch[]) =>
  championContext(
    { matches, availableMatches: matches.length, truncated: false },
    1,
    'TOP',
  );
describe('champion context', () => {
  it('deduplicates matches, publishes denominators and nominal uncertainty', () => {
    const r = run([match('a', true), match('a', true), match('b', false)]);
    expect(r.baseline).toMatchObject({
      n: 2,
      wins: 1,
      rate: 0.5,
      reason: 'insufficient_sample',
    });
    expect(r.matchups[0]).toMatchObject({
      n: 2,
      denominator: 2,
      opponentChampionId: 11,
      matchIds: ['a', 'b'],
    });
    expect(r.allies).toHaveLength(4);
    expect(r.allies[0].descriptiveGain).toBe(0);
    expect(r.coverage.exclusions.duplicate_match).toBe(1);
    expect(r.baseline.interval95![0]).toBeLessThan(0.5);
    expect(r.baseline.interval95![1]).toBeGreaterThan(0.5);
  });
  it('excludes ambiguous roles, duplicate identities, unknown population and inconsistent wins', () => {
    const a = match('a', true);
    a.participants[1].role = 'TOP';
    const b = match('b', true);
    b.participants[1].puuid = b.participants[0].puuid;
    const c = match('c', true);
    c.populationEligible = null;
    const d = match('d', true);
    d.participants[1].win = false;
    expect(run([a, b, c, d]).baseline).toMatchObject({
      n: 0,
      rate: null,
      interval95: null,
    });
    expect(run([a, b, c, d]).coverage.exclusions).toEqual({
      ambiguous_roster_or_role: 2,
      population_ineligible_or_unknown: 1,
      inconsistent_outcome: 1,
    });
  });
  it('compares each allied pair to the same focal cohort and marks rare cells', () => {
    const b = match('b', false);
    b.participants[1].championId = 99;
    const r = run([match('a', true), b]);
    expect(r.allies.find((a) => a.championId === 2)).toMatchObject({
      n: 1,
      rate: 1,
      descriptiveGain: 0.5,
      denominator: 2,
      reason: 'insufficient_sample',
    });
  });
  it('normalizes MID and rejects unsupported roles and ambiguous focal mirror', () => {
    const a = match('a', true);
    a.participants[2].role = 'MID';
    expect(run([a]).baseline.n).toBe(1);
    a.participants[5].championId = 1;
    expect(run([a]).coverage.exclusions.ambiguous_focal).toBe(1);
  });
});
