import {
  metricContext,
  metricQuality,
  metricValue,
  ratioMetric,
  unavailableMetric,
} from './metric-contract';
import { METRIC_RESPONSE_EXAMPLES } from '../dto/metric-examples';
import {
  selectCheckpoint,
  temporalWindow,
  containsTimestamp,
  LEGACY_LANE_CHECKPOINT,
} from './temporal';
import {
  assessRemake,
  gameVersionPatch,
  normalizeRole,
  selectUniqueOpponent,
} from './eligibility';

const context = METRIC_RESPONSE_EXAMPLES.observed;
describe('metric contract', () => {
  it('serializes all four origins without fabricating zero for missing observations', () => {
    const roundTrip = JSON.parse(JSON.stringify(METRIC_RESPONSE_EXAMPLES));
    for (const origin of ['observed', 'derived', 'estimated', 'unavailable'])
      expect(roundTrip[origin].origin).toBe(origin);
    expect(roundTrip.observed).toMatchObject({ value: 0, reason: null });
    expect(roundTrip.derived).toMatchObject({
      value: 50,
      denominator: { value: 10 },
      unit: 'percent',
    });
    expect(roundTrip.estimated.method).toContain('not duration');
    expect(roundTrip.unavailable).toMatchObject({
      value: null,
      reason: 'missing_field',
      quality: { coverage: 0 },
    });
  });
  it('preserves precise ratios and makes missing/zero/invalid denominators distinct', () => {
    const ratioContext = {
      ...context,
      denominator: { value: null, unit: 'kills', population: 'team kills' },
    };
    expect(ratioMetric(ratioContext, 1, 3).value).toBe(1 / 3);
    expect(ratioMetric(ratioContext, 0, 3).value).toBe(0);
    expect(ratioMetric(ratioContext, 1, 0)).toMatchObject({
      value: null,
      reason: 'zero_denominator',
      denominator: { value: 0 },
    });
    expect(ratioMetric(ratioContext, null, 3).reason).toBe('missing_field');
    for (const bad of [NaN, Infinity, -1])
      expect(ratioMetric(ratioContext, 1, bad)).toMatchObject({
        value: null,
        reason: 'invalid_value',
        denominator: { value: null },
      });
    expect(() => ratioMetric(context, 1, 3)).toThrow('named denominator');
    expect(metricValue(context, Infinity, 'derived', 'sum').reason).toBe(
      'invalid_value',
    );
    expect(metricValue(context, undefined, 'observed', 'field').reason).toBe(
      'missing_field',
    );
    expect(unavailableMetric(context, 'not_calculated').value).toBeNull();
  });
  it('validates counts, processing time, and denominator while permitting zero coverage', () => {
    expect(metricQuality(0, 0).coverage).toBeNull();
    expect(metricQuality(0, 3).coverage).toBe(0);
    expect(() => metricQuality(2, 1)).toThrow();
    expect(() =>
      metricContext({ ...context, processedAt: 'yesterday' }),
    ).toThrow();
    expect(() =>
      metricContext({
        ...context,
        denominator: { value: Infinity, unit: 'kills', population: 'team' },
      }),
    ).toThrow();
  });
});

describe('temporal eligibility', () => {
  const frames = [
    { timestamp: 900358, frameIndex: 15 },
    { timestamp: 840000, frameIndex: 14 },
  ];
  it('uses future frames only in descriptive nearest mode and exposes signed offset', () => {
    expect(selectCheckpoint(frames, 900000, 1000000)).toMatchObject({
      timestampMs: 900358,
      offsetMs: 358,
    });
    expect(selectCheckpoint(frames, 900000, 1000000, 'pastOnly')).toMatchObject(
      { timestampMs: 840000, offsetMs: -60000 },
    );
    expect(selectCheckpoint(frames, 900000, 899999).reason).toBe('short_match');
    expect(
      selectCheckpoint(frames, 900000, 1000000, 'pastOnly', 59999).reason,
    ).toBe('missing_frame');
    expect(selectCheckpoint([], 900000, 1000000).reason).toBe('missing_frame');
    expect(LEGACY_LANE_CHECKPOINT).toMatchObject({
      metricVersion: 0,
      mode: 'first_in_window',
    });
  });
  it('breaks ties by earlier timestamp then frame index without mutating inputs', () => {
    const tied = [
      { timestamp: 110, frameIndex: 3 },
      { timestamp: 90, frameIndex: 2 },
      { timestamp: 90, frameIndex: 1 },
    ];
    expect(selectCheckpoint(tied, 100, 200, 'nearest').frame?.frameIndex).toBe(
      1,
    );
    expect(tied[0].timestamp).toBe(110);
    expect(selectCheckpoint([{ timestamp: 201 }], 200, 200).reason).toBe(
      'missing_frame',
    );
  });
  it('keeps captures out of pre/post windows, includes final phase end and marks censoring', () => {
    const pre = temporalWindow(0, 60000, '[)', 100000);
    const post = temporalWindow(60000, 120000, '(]', 100000);
    expect(containsTimestamp(pre, 0)).toBe(true);
    expect(containsTimestamp(pre, 60000)).toBe(false);
    expect(containsTimestamp(post, 60000)).toBe(false);
    expect(containsTimestamp(post, 100000)).toBe(true);
    expect(post).toMatchObject({ censored: true, effectiveDurationMs: 40000 });
    expect(
      containsTimestamp(temporalWindow(60000, 100000, '[]', 100000), 100000),
    ).toBe(true);
    expect(temporalWindow(-30000, 10000, '[)', 100000)).toMatchObject({
      censored: true,
      effectiveDurationMs: 10000,
    });
  });
});

describe('role and remake eligibility', () => {
  const middle = { teamId: 100, role: 'MID' };
  it('canonicalizes aliases without inventing roles or opponents', () => {
    expect(normalizeRole('mid')).toBe('MIDDLE');
    expect(normalizeRole('UNKNOWN')).toBeNull();
    expect(
      selectUniqueOpponent(middle, [{ teamId: 200, role: 'MIDDLE' }]).opponent,
    ).not.toBeNull();
    expect(selectUniqueOpponent(middle, []).reason).toBe('missing_opponent');
    expect(
      selectUniqueOpponent(middle, [
        { teamId: 200, role: 'MID' },
        { teamId: 200, role: 'MIDDLE' },
      ]).reason,
    ).toBe('ambiguous_role');
    expect(
      selectUniqueOpponent({ teamId: 0, role: 'MID' }, [middle]).reason,
    ).toBe('ambiguous_role');
  });
  it('keeps surrender and short games distinct from remake and leaves unsupported rules explicit', () => {
    const input = {
      gameVersion: '16.2.741.3171',
      durationSeconds: 2368,
      earlySurrenderFlags: Array(10).fill(false),
      surrender: true,
    };
    expect(assessRemake(input)).toMatchObject({
      status: 'not_remake',
      eligible: true,
    });
    expect(assessRemake({ ...input, durationSeconds: 90 })).toMatchObject({
      status: 'not_remake',
    });
    expect(
      assessRemake({ ...input, earlySurrenderFlags: [true] }),
    ).toMatchObject({
      status: 'unknown',
      eligible: false,
      reason: 'unknown_remake',
    });
    expect(assessRemake({ ...input, earlySurrenderFlags: [] }).reason).toBe(
      'unknown_remake',
    );
    expect(assessRemake({ ...input, gameVersion: '16.20.123' }).reason).toBe(
      'unsupported_version',
    );
    expect(
      assessRemake(input, [
        {
          patch: '16.2',
          version: 2,
          evidence: 'synthetic positive policy',
          classify: () => 'remake',
        },
      ]),
    ).toMatchObject({ status: 'remake', eligible: false, ruleVersion: 2 });
  });
});
