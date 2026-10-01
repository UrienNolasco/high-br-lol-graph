import {
  aggregateDeathPattern,
  calculateEvolution,
  calculateEvolutionWindow,
  EvolutionRow,
  uniqueEvolutionRows,
} from './evolution-calculator';
import {
  normalizeEvolutionQuery,
  evolutionWindowFilters,
} from './evolution-contract';
const raw = {
  definitionId: 'final.deathsNearObjectives',
  championId: 114,
  role: 'TOP',
  queueId: 420,
  mapId: 11,
  horizonKey: 'final',
  baselineFromMs: 10,
  baselineToMs: 20,
  recentFromMs: 20,
  recentToMs: 30,
};
const q = normalizeEvolutionQuery('player', raw);
const row = (overrides: Partial<EvolutionRow> = {}): EvolutionRow => ({
  id: 'a',
  matchId: 'a',
  subjectId: 'player',
  gameCreation: 10n,
  definitionId: raw.definitionId,
  definitionVersion: 1,
  horizonKey: 'final',
  patch: '16.2',
  queueId: 420,
  mapId: 11,
  championId: 114,
  role: 'TOP',
  eligible: true,
  exclusionReason: null,
  value: 50,
  validCount: 1,
  reason: null,
  numerator: 1,
  denominatorValue: 2,
  ratioScale: 100,
  quality: { totalSamples: 3, validSamples: 2 },
  processedAt: new Date(0),
  processingVersion: 4,
  lineage: { status: 'observed' },
  ...overrides,
});
describe('MET21 personal windows', () => {
  it('requires fixed context, rejects overlap/invalid windows and normalizes MID', () => {
    expect(() =>
      normalizeEvolutionQuery('p', { ...raw, recentFromMs: 19 }),
    ).toThrow('overlap');
    expect(() =>
      normalizeEvolutionQuery('p', { ...raw, baselineToMs: 10 }),
    ).toThrow();
    expect(() =>
      normalizeEvolutionQuery('p', { ...raw, role: undefined }),
    ).toThrow('role');
    expect(() =>
      normalizeEvolutionQuery('p', { ...raw, playerId: 'other' }),
    ).toThrow();
    expect(
      normalizeEvolutionQuery('p', { ...raw, role: 'MID' }).filters.role,
    ).toBe('MIDDLE');
    expect(evolutionWindowFilters(q, q.baseline)).toMatchObject({
      fromMs: 10,
      toMs: 20,
    });
  });
  it('uses ratio of sums with explicit censoring and zero-death known matches', () => {
    const result = aggregateDeathPattern([
      row(),
      row({
        id: 'b',
        matchId: 'b',
        numerator: 0,
        denominatorValue: 0,
        validCount: 0,
        value: null,
        reason: 'zero_denominator',
        quality: { totalSamples: 0, validSamples: 0 },
      }),
      row({
        id: 'c',
        matchId: 'c',
        value: 100,
        numerator: 1,
        denominatorValue: 1,
        quality: { totalSamples: 1, validSamples: 1 },
      }),
    ]);
    expect(result).toMatchObject({
      value: (100 * 2) / 3,
      eligibleDeaths: 3,
      associatedEligibleDeaths: 2,
      censoredDeathsInKnownMatches: 1,
      matchesWithKnownFollowup: 3,
    });
    expect(aggregateDeathPattern([row({ eligible: false })]).value).toBeNull();
    expect(
      aggregateDeathPattern([row({ value: null, reason: 'missing_frame' })]),
    ).toMatchObject({ matchesWithUnknownFollowup: 1, value: null });
  });
  it('deduplicates identities and makes conflicts unavailable', () => {
    expect(uniqueEvolutionRows([row(), row()])).toMatchObject({
      duplicateRows: 1,
      conflictingIdentities: 0,
    });
    const conflict = uniqueEvolutionRows([row(), row({ value: 100 })]);
    expect(conflict.rows[0]).toMatchObject({
      value: null,
      reason: 'conflicting_contribution',
    });
    expect(aggregateDeathPattern(conflict.rows).value).toBeNull();
  });
  it('exposes absolute N, missing coverage, patch changes and never claims small-sample trend', () => {
    const a = calculateEvolutionWindow(
      q,
      q.baseline,
      [
        row(),
        row({
          id: 'b',
          matchId: 'b',
          value: null,
          validCount: 0,
          reason: 'missing_frame',
          gameCreation: 11n,
        }),
      ],
      [row()],
      1,
    );
    const b = calculateEvolutionWindow(
      q,
      q.recent,
      [
        row({
          id: 'c',
          matchId: 'c',
          gameCreation: 20n,
          value: 100,
          numerator: 2,
          patch: '16.3',
        }),
      ],
      [],
      0,
    );
    const r = calculateEvolution(q, a, b);
    expect(a.counts.valid.matches).toBe(1);
    expect(a.coverage.value).toBe(0.5);
    expect(a.unmaterializedMatches).toBe(1);
    expect(a.period?.firstGameCreationMs).toBe('10');
    expect(r.comparison).toMatchObject({
      pooledObservedDelta: { mean: 50 },
      pooledContext: 'patch_mixture_or_change',
      patchesOnlyInRecent: ['16.3'],
      trend: null,
      precision: null,
    });
    expect(a.precision.reason).toBe(
      'insufficient_sample_and_unmodelled_serial_dependence',
    );
    expect(() =>
      calculateEvolutionWindow(
        q,
        q.baseline,
        [row({ gameCreation: 20n })],
        [],
        0,
      ),
    ).toThrow('window');
    expect(() =>
      calculateEvolutionWindow(q, q.baseline, [row({ role: 'MIDDLE' })], [], 0),
    ).toThrow('context');
  });
  it('empty windows return absence and bounded observations expose truncation', () => {
    const empty = calculateEvolutionWindow(q, q.baseline, [], [], 0);
    expect(empty.observed.mean).toBeNull();
    expect(empty.coverage.value).toBeNull();
    const rows = Array.from({ length: 21 }, (_, i) =>
      row({ id: String(i), matchId: String(i) }),
    );
    expect(
      calculateEvolutionWindow(q, q.baseline, rows, [], 0).observations,
    ).toMatchObject({ total: 21, returned: 20, truncated: true });
  });
});
