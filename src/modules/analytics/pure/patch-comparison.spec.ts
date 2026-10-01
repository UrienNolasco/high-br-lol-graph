import { patchComparison } from './patch-comparison';
import type { DatasetQueryRow } from '../../dataset/contracts/query';
const row = (
  matchId: string,
  patch: string,
  value: number | null,
  extra: Partial<DatasetQueryRow> = {},
): DatasetQueryRow =>
  ({
    matchId,
    patch,
    value,
    subjectId: matchId,
    definitionId: 'final.gold',
    horizonKey: 'final',
    eligible: true,
    championId: 1,
    role: 'TOP',
    gameCreation: patch === '99.1' ? '1577836800000' : '1580515200000',
    definitionVersion: 1,
    datasetVersion: 1,
    processingVersion: 4,
    unit: 'gold',
    reason: value === null ? 'missing_field' : null,
    ...extra,
  }) as DatasetQueryRow;
describe('observed patch comparison', () => {
  it('resolves observed chronology independently of numeric labels, deduplicates and stratifies ALL', () => {
    const first = row('a', '99.1', 0),
      second = row('b', '1.2', 10);
    const r = patchComparison(
      [
        first,
        first,
        second,
        row('c', '1.2', 100, { role: 'UTILITY', championId: 2 }),
      ],
      '99.1',
      '1.2',
      false,
    );
    expect(r.sequence.patches.map((p) => p.patch)).toEqual(['99.1', '1.2']);
    expect(r.sequence.adjacentObserved).toBe(true);
    expect(r.before.matches).toBe(1);
    expect(r.before.cells[0].distribution.mean).toBe(0);
    expect(r.after.cells).toHaveLength(2);
    expect(r.changes[0].meanDelta).toBe(10);
    expect(r.changes[0].pickRateDelta).toBe(-0.5);
    expect(r.changes[1].meanDelta).toBeNull();
  });
  it('keeps null out of metric denominator while preserving observed choices and missingness', () => {
    const r = patchComparison(
      [row('a', '99.1', null), row('b', '1.2', 10)],
      '99.1',
      '1.2',
      false,
    );
    expect(r.before.cells[0].distribution).toMatchObject({
      n: 0,
      missing: 1,
      mean: null,
    });
    expect(r.before.cells[0].pickRate).toBe(1);
    expect(r.before.missingReasons).toEqual({ missing_field: 1 });
    expect(r.changes[0]).toMatchObject({
      meanDelta: null,
      reason: 'no_valid_values',
      beforeN: 0,
    });
  });
  it.each([
    'definitionVersion',
    'datasetVersion',
    'processingVersion',
    'unit',
  ] as const)('suppresses incompatible %s deltas', (field) => {
    const r = patchComparison(
      [
        row('a', '99.1', 1),
        row('b', '1.2', 2, { [field]: field === 'unit' ? 'xp' : 2 }),
      ],
      '99.1',
      '1.2',
      false,
    );
    expect(r.changes[0]).toMatchObject({
      meanDelta: null,
      reason: 'incompatible_versions_or_units',
    });
  });
  it('marks overlapping dates and bounded sequence incompleteness; excludes ineligible rows', () => {
    const r = patchComparison(
      [
        row('a', '99.1', 1),
        row('b', '1.2', 2, { gameCreation: '1577836800000' }),
        row('c', '1.2', 3, { eligible: false }),
      ],
      '99.1',
      '1.2',
      true,
    );
    expect(r.sequence.chronologyAmbiguous).toBe(true);
    expect(r.sequence.complete).toBe(false);
    expect(r.after.participants).toBe(1);
  });
  it('returns empty periods and unavailable deltas without invented zero distributions', () => {
    const r = patchComparison([], '99.1', '1.2', false);
    expect(r.before.matches).toBe(0);
    expect(r.before.cells).toEqual([]);
    expect(r.changes).toEqual([]);
    expect(r.sequence.chronologyAmbiguous).toBe(true);
  });
  it('computes interpolated quantiles and publishes both sample sizes and repeated players', () => {
    const r = patchComparison(
      [
        row('a', '99.1', 0),
        row('b', '99.1', 10, { subjectId: 'a' }),
        row('c', '1.2', 10),
      ],
      '99.1',
      '1.2',
      false,
    );
    expect(r.before.cells[0].distribution).toMatchObject({
      n: 2,
      p25: 2.5,
      median: 5,
      p75: 7.5,
    });
    expect(r.before.players).toBe(1);
    expect(r.changes[0]).toMatchObject({
      beforeN: 2,
      afterN: 1,
      precision: 'insufficient_sample',
    });
  });
});

describe('unavailable conflicting observations', () => {
  it.each([
    'definitionVersion',
    'datasetVersion',
    'processingVersion',
    'unit',
    'value',
  ] as const)(
    'never arbitrates duplicate identity with conflicting %s',
    (field) => {
      const a = row('a', '99.1', 10);
      const b = row('a', '99.1', 20, { [field]: field === 'unit' ? 'xp' : 2 });
      const c = row('b', '1.2', 30);
      const result = patchComparison([a, b, c], '99.1', '1.2', false);
      expect(result).toEqual(patchComparison([c, b, a], '99.1', '1.2', false));
      expect(result.coverage.unavailableObservations).toEqual([
        expect.objectContaining({
          value: null,
          reason: 'conflicting_duplicate_identity',
          rows: 2,
        }),
      ]);
      expect(result.before.participants).toBe(0);
      expect(result.sequence.complete).toBe(false);
      expect(result.changes[0].meanDelta).toBeNull();
    },
  );
  it.each([
    'definitionVersion',
    'datasetVersion',
    'processingVersion',
    'unit',
  ] as const)('does not pool within-period heterogeneous %s', (field) => {
    const a = row('a', '99.1', 10),
      b = row('b', '99.1', 100, { [field]: field === 'unit' ? 'xp' : 2 }),
      c = row('c', '1.2', 30);
    const result = patchComparison([a, b, c], '99.1', '1.2', false);
    expect(result).toEqual(patchComparison([c, b, a], '99.1', '1.2', false));
    expect(result.before.cells[0].distribution).toMatchObject({
      n: 0,
      observedValidN: 2,
      mean: null,
      median: null,
      p25: null,
      p75: null,
      reason: 'incompatible_versions_or_units',
    });
    expect(result.before.cells[0].signatures).toHaveLength(2);
    expect(result.changes[0]).toMatchObject({
      meanDelta: null,
      reason: 'incompatible_versions_or_units',
    });
  });
});
