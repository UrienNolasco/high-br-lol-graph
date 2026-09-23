import {
  DEFAULT_PRECISION,
  dkwHalfWidth,
  empiricalDistribution,
  empiricalQuantile,
  precisionPolicy,
  ReferenceObservation,
  referenceStatistics,
  requiredReferenceUnits,
  selectRosterDisjoint,
} from './empirical-reference';
const observation = (i: number): ReferenceObservation => ({
  id: `id${i}`,
  matchId: `match${i}`,
  subjectId: `p${i}:0`,
  roster: Array.from({ length: 10 }, (_, j) => `p${i}:${j}`),
  gameCreation: BigInt(i),
  value: i,
  eligible: true,
  reason: null,
});
describe('MET20 empirical references', () => {
  it('derives configurable minimum from nominal CDF precision, never lowers it with a floor', () => {
    expect(requiredReferenceUnits(DEFAULT_PRECISION)).toBe(82);
    expect(
      requiredReferenceUnits({ ...DEFAULT_PRECISION, minimumUnits: 100 }),
    ).toBe(100);
    expect(
      requiredReferenceUnits({ ...DEFAULT_PRECISION, cdfHalfWidth: 0.1 }),
    ).toBe(185);
    expect(dkwHalfWidth(82, 0.95)).toBeLessThanOrEqual(0.15);
    expect(dkwHalfWidth(0, 0.95)).toBeNull();
  });
  it.each([
    { confidence: 1 },
    { confidence: NaN },
    { cdfHalfWidth: 0 },
    { minimumUnits: 1.5 },
    { minimumUnits: -1 },
  ])('rejects invalid precision %j', (p) =>
    expect(() => precisionPolicy(p)).toThrow(),
  );
  it('uses inverse empirical CDF, lower even median, and groups ties without mutating input', () => {
    const values = [4, 1, 1, 2];
    const result = empiricalDistribution(values);
    expect(values).toEqual([4, 1, 1, 2]);
    expect(result.groups).toEqual([
      { value: 1, count: 2, cdf: 0.5 },
      { value: 2, count: 1, cdf: 0.75 },
      { value: 4, count: 1, cdf: 1 },
    ]);
    expect(empiricalQuantile(result.sorted, 0.5)).toBe(1);
    expect(empiricalQuantile([], 1)).toBeNull();
    expect(() => empiricalQuantile([2, 1], 0.5)).toThrow();
    expect(() => empiricalDistribution([Infinity])).toThrow();
  });
  it('publishes midrank ties and nominal band for the exact same selected sample', () => {
    const result = referenceStatistics(
      [...Array<number>(41).fill(10), ...Array<number>(41).fill(20)],
      DEFAULT_PRECISION,
      10,
    );
    expect(result.median).toBe(10);
    expect(result.individualPercentile).toMatchObject({ value: 25, ties: 41 });
    expect(result.individualPercentile!.lower).toBeCloseTo(
      25 - 100 * dkwHalfWidth(82, 0.95)!,
    );
    expect(result.distribution![0].cdf).toBe(0.5);
  });
  it('does not clamp unidentified quantile tail bounds to observed extrema', () => {
    const result = referenceStatistics(
      Array.from({ length: 82 }, (_, i) => i),
      DEFAULT_PRECISION,
    );
    expect(result.quantiles![0].interval).toMatchObject({
      lower: null,
      lowerUnbounded: true,
      upperUnbounded: false,
    });
    expect(result.quantiles![4].interval).toMatchObject({
      upper: null,
      upperUnbounded: true,
    });
    expect(result.quantiles![2].interval.lower).not.toBeNull();
  });
  it('withholds population summaries and percentile when precision is insufficient', () => {
    expect(referenceStatistics([0], DEFAULT_PRECISION, 0)).toMatchObject({
      median: null,
      quantiles: null,
      distribution: null,
      individualPercentile: null,
      precision: { observedUnits: 1, sufficient: false },
    });
  });
  it('counts at most one unit per match and excludes reused teammates, including target roster', () => {
    const first = observation(0),
      same = {
        ...observation(1),
        matchId: first.matchId,
        roster: first.roster,
        subjectId: first.roster[1],
      };
    const shared = observation(2);
    shared.roster[9] = first.roster[9];
    const selected = selectRosterDisjoint([
      same,
      shared,
      first,
      observation(3),
    ]);
    expect(selected.selected.map((r) => r.id)).toEqual(['id0', 'id3']);
    expect(selected.excluded.map((r) => r.reason)).toEqual([
      'same_match',
      'overlapping_player',
    ]);
    expect(
      selectRosterDisjoint(
        [first, same, shared, observation(3)],
        first.roster,
      ).selected.map((r) => r.id),
    ).toEqual(['id3']);
  });
  it('does not turn repeated matches from the same ten players into independent evidence', () => {
    const rows = Array.from({ length: 82 }, (_, i) => ({
      ...observation(i),
      roster: observation(0).roster,
      subjectId: 'p0:0',
    }));
    const selected = selectRosterDisjoint(rows);
    expect(selected.selected).toHaveLength(1);
    expect(
      referenceStatistics(
        selected.selected.map((r) => r.value!),
        DEFAULT_PRECISION,
      ).precision.sufficient,
    ).toBe(false);
  });
  it('preserves zero, rejects missing/incomplete/conflicting rows and deduplicates identical replay', () => {
    const zero = observation(0),
      conflict = { ...observation(1), value: 999 };
    const rows = [
      zero,
      zero,
      observation(1),
      conflict,
      { ...observation(2), value: null, reason: 'missing_field' },
      { ...observation(3), roster: [] },
    ];
    const result = selectRosterDisjoint(rows);
    expect(result.selected).toEqual([zero]);
    expect(result.excluded.map((r) => r.reason)).toEqual([
      'duplicate_contribution',
      'conflicting_contribution',
      'conflicting_contribution',
      'missing_field',
      'incomplete_roster',
    ]);
    expect(selectRosterDisjoint([...rows].reverse()).selected).toEqual([zero]);
  });
});
