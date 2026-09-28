import { HistoricalMetricContribution } from '@prisma/client';
import {
  exportDatasetValue,
  splitForMatch,
  stableJson,
  validateTemporalSplit,
} from './dataset-export.adapter';
const split = { trainBeforeMs: 1000, validationBeforeMs: 2000 };
const row = {
  id: 'r',
  matchId: 'm',
  subjectId: 'p',
  subjectKind: 'participant',
  definitionId: 'snapshot.totalGold',
  definitionVersion: 1,
  usage: 'predictive',
  horizonMs: 900000,
  sourceMaxTimestampMs: 899900,
  value: 4500,
  validCount: 1,
  reason: null,
  numerator: null,
  denominatorValue: null,
  ratioScale: 1,
  gameCreation: 1000n,
  role: 'MIDDLE',
  eligible: false,
  exclusionReason: 'remake',
  lineage: { rankTier: 'CHALLENGER' },
  futureWin: true,
  finalGold: 19000,
} as unknown as HistoricalMetricContribution;
describe('historical dataset research export', () => {
  it('assigns all subjects and horizons of each match to one half-open temporal partition', () => {
    expect([999, 1000, 1999, 2000].map((t) => splitForMatch(t, split))).toEqual(
      ['train', 'validation', 'validation', 'test'],
    );
    expect(
      [
        row,
        { ...row, subjectId: 'team100', horizonMs: 1200000 },
        { ...row, usage: 'label', horizonMs: null },
      ].map((r) => exportDatasetValue(r, split).split),
    ).toEqual(['validation', 'validation', 'validation']);
    expect(() =>
      validateTemporalSplit({ trainBeforeMs: 1000, validationBeforeMs: 1000 }),
    ).toThrow();
  });
  it('exports only allowlisted temporal values and excludes retrospective/future metadata', () => {
    const first = exportDatasetValue(row, split);
    const poisoned = exportDatasetValue(
      {
        ...row,
        eligible: true,
        role: 'TOP',
        exclusionReason: null,
        lineage: { futureOutcome: 1 },
        quality: { futureGold: 99999 },
      },
      split,
    );
    expect(poisoned).toEqual(first);
    for (const key of [
      'role',
      'eligible',
      'lineage',
      'quality',
      'futureWin',
      'finalGold',
      'gameCreation',
    ])
      expect(first).not.toHaveProperty(key);
    expect(first).toMatchObject({ value: 4500, sourceMaxTimestampMs: 899900 });
  });
  it('rejects future or absent provenance for available predictions, preserves explicit unavailable', () => {
    expect(() =>
      exportDatasetValue({ ...row, sourceMaxTimestampMs: 900001 }, split),
    ).toThrow();
    expect(() =>
      exportDatasetValue({ ...row, sourceMaxTimestampMs: null }, split),
    ).toThrow();
    expect(
      exportDatasetValue(
        {
          ...row,
          value: null,
          validCount: 0,
          reason: 'missing_frame',
          sourceMaxTimestampMs: null,
        },
        split,
      ),
    ).toMatchObject({ value: null, validCount: 0 });
  });
  it('canonicalizes nested key order and bigint/date without run-clock data', () => {
    expect(stableJson({ z: 1, a: { t: 2n, d: new Date('2026-01-01Z') } })).toBe(
      stableJson({ a: { d: new Date('2026-01-01Z'), t: 2n }, z: 1 }),
    );
  });
});
