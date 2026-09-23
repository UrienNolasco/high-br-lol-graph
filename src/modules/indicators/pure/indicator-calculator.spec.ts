import { indicatorFixture } from '../../../../test/fixtures/indicators';
import { calculateIndicators } from './indicator-calculator';
import { summarizeIndicatorHistory } from './indicator-history';
import { INDICATOR_CATALOG } from './indicator-catalog';
import { IndicatorOptions, object } from './indicator.types';
const options: IndicatorOptions = {
  limit: 100,
  groupLimit: 10,
  groupOffset: 0,
  evidenceLimit: 3,
};
describe('MET29 optional literal indicators', () => {
  it('reconciles all24 fields in the real fixture with explicit units and challenge restrictions', () => {
    const input = indicatorFixture(),
      report = calculateIndicators(input);
    expect(INDICATOR_CATALOG).toHaveLength(24);
    expect(report.coverage).toEqual({
      validCounters: 24,
      totalCounters: 24,
      validRates: 20,
      totalRates: 20,
    });
    expect(
      report.metrics.find((m) => m.id === 'execution.skillshotsHit'),
    ).toMatchObject({
      count: { value: 23, unit: 'count', origin: 'observed' },
      perMinute: null,
    });
    expect(
      report.metrics.find((m) => m.id === 'execution.saveAllyFromDeath')!.count,
    ).toMatchObject({ value: 0, reason: null });
    expect(
      report.metrics.find((m) => m.id === 'pings.onMyWayPings')!.count.value,
    ).toBe(7);
    const cast = report.metrics.find((m) => m.id === 'casts.spell1Casts')!;
    expect(cast.count.value).toBe(
      object(object(input.participant.finalStats).values).spell1Casts,
    );
    expect(cast.perMinute!.value).toBe(
      cast.count.value! / (report.duration.value! / 60),
    );
    expect(cast.count.window).toBeNull();
    expect(report.catalogValidation.status).toBe('fixture_validated');
  });
  it.each([undefined, null, -1, 0.5, NaN, Infinity, '0'])(
    'does not coerce invalid/absent optional counter %s to zero',
    (raw) => {
      const input = indicatorFixture();
      input.participant.pings = { onMyWayPings: raw };
      const r = calculateIndicators(input, 'pings');
      expect(
        r.metrics.find((m) => m.id === 'pings.onMyWayPings')!.count,
      ).toMatchObject({
        value: null,
        reason: raw == null ? 'missing_field' : 'invalid_value',
      });
    },
  );
  it('preserves valid zero and unknown catalog keys without promoting them', () => {
    const input = indicatorFixture();
    input.participant.pings = {
      onMyWayPings: 0,
      ...Object.fromEntries(
        Array.from({ length: 25 }, (_, i) => [`future${i}Pings`, i]),
      ),
    };
    const r = calculateIndicators(input, 'pings');
    expect(
      r.metrics.find((m) => m.id === 'pings.onMyWayPings')!.perMinute!.value,
    ).toBe(0);
    expect(r.unknownFields.pings).toMatchObject({ total: 25, truncated: true });
    expect(r.unknownFields.pings.fields).toHaveLength(20);
    expect(r.metrics).toHaveLength(14);
  });
  it.each([null, 0, -1, '60'])(
    'requires observed timePlayed (%s), never match duration fallback',
    (duration) => {
      const input = indicatorFixture();
      object(object(input.participant.finalStats).values).timePlayed = duration;
      const r = calculateIndicators(input, 'casts');
      expect(r.metrics[0].count.value).not.toBeNull();
      expect(r.metrics[0].perMinute!.value).toBeNull();
      expect(r.metrics[0].perMinute!.reason).toBe(
        duration === 0
          ? 'zero_denominator'
          : duration === null
            ? 'missing_field'
            : 'invalid_value',
      );
    },
  );
  it('keeps unknown provenance explicit while preserving literal observations, and does not validate unseen patches', () => {
    const input = indicatorFixture();
    input.processing = null;
    input.match.gameVersion = '99.1.1';
    const r = calculateIndicators(input, 'casts');
    expect(r.provenance).toMatchObject({
      known: false,
      processingVersion: null,
      processedAt: null,
    });
    expect(r.metrics[0].count.value).not.toBeNull();
    expect(r.metrics[0].perMinute).toMatchObject({
      value: null,
      reason: 'missing_processing_metadata',
    });
    expect(r.catalogValidation).toMatchObject({
      status: 'unvalidated_patch',
      reason: 'patch_not_in_validation_corpus',
    });
  });
  it('distinguishes unsupported finalStats projection and invalid projected fields', () => {
    const input = indicatorFixture();
    input.participant.finalStats = {
      projectionVersion: 2,
      values: { spell1Casts: 10, timePlayed: 60 },
    };
    expect(calculateIndicators(input, 'casts').metrics[0].count.reason).toBe(
      'unsupported_version',
    );
    input.participant.finalStats = {
      projectionVersion: 1,
      values: { spell1Casts: null, timePlayed: 60 },
      missingReasons: { spell1Casts: 'invalid_value' },
    };
    expect(calculateIndicators(input, 'casts').metrics[0].count.reason).toBe(
      'invalid_value',
    );
  });
  it('uses matching valid counter-duration pairs for weighted rate and distinct identities for N', () => {
    const a = indicatorFixture(),
      b = structuredClone(a),
      missing = structuredClone(a);
    b.match.matchId = 'second';
    missing.match.matchId = 'missing';
    a.participant.pings = { onMyWayPings: 10 };
    b.participant.pings = { onMyWayPings: 40 };
    missing.participant.pings = {};
    object(object(a.participant.finalStats).values).timePlayed = 60;
    object(object(b.participant.finalStats).values).timePlayed = 120;
    object(object(missing.participant.finalStats).values).timePlayed = 10000;
    const report = summarizeIndicatorHistory([a, b, missing, a], {
        ...options,
        family: 'pings',
      }),
      metric = report.groups.items[0].metrics.find(
        (m) => m.id === 'pings.onMyWayPings',
      )!;
    expect(report.sample).toEqual({
      observations: 3,
      distinctMatches: 3,
      distinctPlayers: 1,
      duplicateObservationsIgnored: 1,
    });
    expect(metric.count).toMatchObject({
      value: 25,
      sum: 50,
      quality: { validSamples: 2, totalSamples: 3 },
    });
    expect(metric.perMinute).toMatchObject({
      value: 50 / 3,
      sumCounters: 50,
      denominator: { value: 3 },
      quality: { validSamples: 2, totalSamples: 3 },
    });
    expect(report.groups.items[0].reference.percentile).toBeNull();
  });
  it('splits cohorts by champion, normalized role, patch/full version and generation and never compares unknown roles', () => {
    const a = indicatorFixture(),
      variants = ['champion', 'role', 'patch', 'version', 'processing'].map(
        (dimension) => {
          const b = structuredClone(a);
          b.match.matchId = dimension;
          if (dimension === 'champion') b.participant.championId++;
          if (dimension === 'role') b.participant.role = 'UTILITY';
          if (dimension === 'patch') b.match.gameVersion = '16.3.1';
          if (dimension === 'version') b.match.gameVersion = '16.2.999';
          if (dimension === 'processing') b.processing!.processingVersion = 3;
          return b;
        },
      );
    const r = summarizeIndicatorHistory([a, ...variants], options);
    expect(r.groups.total).toBe(6);
    a.participant.role = '';
    const unknown = summarizeIndicatorHistory([a], options);
    expect(unknown.groups.items[0].metrics[0].count).toMatchObject({
      value: null,
      reason: 'ambiguous_role',
    });
  });
  it('excludes unavailable provenance from historical arithmetic instead of guessing a processing generation', () => {
    const input = indicatorFixture();
    input.processing = null;
    const r = summarizeIndicatorHistory([input], options);
    expect(r.groups.items[0].metrics[0].count).toMatchObject({
      value: null,
      sum: null,
      quality: { validSamples: 0, totalSamples: 1 },
      missingReasons: { missing_processing_metadata: 1 },
    });
  });
});
