import { calculatePoolSessions } from './pool-sessions';
import {
  normalizePoolSessionQuery,
  PoolSessionRow,
} from '../contracts/pool-sessions';
const query = normalizePoolSessionQuery('p', {
  queueId: 420,
  mapId: 11,
  fromMs: 0,
  toMs: 86400000,
});
const row = (
  i: number,
  overrides: Partial<PoolSessionRow> = {},
): PoolSessionRow => ({
  matchId: `m${i}`,
  gameCreationMs: i * 3000000,
  durationSeconds: 1200,
  championId: 1,
  role: 'MIDDLE',
  patch: '16.2',
  eligible: true,
  win: i % 2,
  evidenceId: `e${i}`,
  exclusionReason: null,
  ...overrides,
});
describe('MET31 pool and estimated sessions', () => {
  it('deduplicates pool denominators and deterministically handles cutoff ties', () => {
    const input = [
      row(1, { championId: 4 }),
      row(2, { championId: 2 }),
      row(3, { championId: 1 }),
      row(4, { championId: 3 }),
    ];
    const result = calculatePoolSessions(query, [
      ...input,
      input[0],
      row(5, { eligible: false }),
      row(6, { championId: null }),
    ]);
    expect(result.pool.top3).toMatchObject({
      numerator: 3,
      denominator: 4,
      value: 0.75,
    });
    expect(result.pool.champions.map((c) => c.championId)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(result.coverage).toMatchObject({
      duplicateRowsRemoved: 1,
      excludedN: 1,
      missingChampionN: 1,
    });
  });
  it('keeps losses zero and calculates sample standard deviation only with enough observations', () => {
    const result = calculatePoolSessions(
      query,
      Array.from({ length: 5 }, (_, i) => row(i)),
    );
    expect(result.pool.contexts[0].dispersion).toMatchObject({
      n: 5,
      mean: 0.4,
    });
    expect(
      result.pool.contexts[0].dispersion.sampleStandardDeviation,
    ).toBeCloseTo(Math.sqrt(0.3));
    expect(
      calculatePoolSessions(query, [row(0)]).pool.contexts[0].dispersion,
    ).toMatchObject({
      n: 1,
      mean: 0,
      sampleStandardDeviation: null,
      reason: 'insufficient_sample',
    });
  });
  it('keeps context versions and unknown contexts separate and excludes missing outcome', () => {
    const result = calculatePoolSessions(query, [
      row(0),
      row(1, { patch: '16.3' }),
      row(2, { role: null, win: null }),
    ]);
    expect(result.pool.contexts).toHaveLength(3);
    expect(result.pool.contexts.find((c) => c.role === null)).toMatchObject({
      status: 'unknown_context',
      missingOutcomeN: 1,
      dispersion: { n: 0, mean: null },
    });
  });
  it('sorts chronology, keeps exact threshold together and reports sensitivity', () => {
    const result = calculatePoolSessions(query, [
      row(2, { gameCreationMs: 6000001 }),
      row(0, { gameCreationMs: 0 }),
      row(1, { gameCreationMs: 3000000, eligible: false }),
    ]);
    expect(result.sessions.count).toBe(2);
    expect(result.sessions.sessions[0].matches.map((m) => m.matchId)).toEqual([
      'm0',
      'm1',
    ]);
    expect(result.sessions.sessions[0].matches[1]).toMatchObject({
      position: 2,
      eligible: false,
      win: null,
    });
    expect(result.sessions.sensitivity).toEqual([
      { thresholdMinutes: 15, sessionCount: 3, matchN: 3 },
      { thresholdMinutes: 30, sessionCount: 2, matchN: 3 },
      { thresholdMinutes: 60, sessionCount: 1, matchN: 3 },
    ]);
  });
  it('overlaps use maximum end, invalid timing breaks continuity and boundaries remain censored', () => {
    const result = calculatePoolSessions(
      query,
      [
        row(0, { durationSeconds: 7200 }),
        row(1, { gameCreationMs: 1000, durationSeconds: 1 }),
        row(2, { gameCreationMs: 7200000 }),
        row(3, { durationSeconds: 0 }),
        row(4),
      ],
      2,
    );
    expect(result.sessions.sessions[0].matches).toHaveLength(3);
    expect(result.sessions.invalidTimingMatchIds).toEqual(['m3']);
    expect(result.coverage).toMatchObject({
      complete: false,
      status: 'incomplete_import',
      unmaterializedMatches: 2,
    });
  });
  it('returns explicit absent denominator and bounded-query unavailability', () => {
    expect(calculatePoolSessions(query, []).pool.top3).toMatchObject({
      value: null,
      reason: 'zero_denominator',
    });
    expect(calculatePoolSessions(query, [], 0, true, 10001)).toMatchObject({
      status: 'unavailable',
      reason: 'candidate_limit_exceeded',
      coverage: { candidateRows: 10001 },
    });
  });
  it('rejects unbounded, unsupported filters and invalid periods or sensitivity thresholds', () => {
    for (const raw of [
      {},
      { ...query, playerId: undefined },
      { queueId: 420, mapId: 11, fromMs: 0, toMs: 1, gapMinutes: 181 },
      { queueId: 420, mapId: 11, fromMs: 1, toMs: 1 },
    ])
      expect(() => normalizePoolSessionQuery('p', raw)).toThrow();
  });
});
