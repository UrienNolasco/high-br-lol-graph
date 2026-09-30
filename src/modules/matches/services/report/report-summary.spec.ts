import {
  reportFixture,
  reportCatalogs,
} from '../../../../../test/fixtures/report';
import { buildReportSummary } from './report-summary';
import { reportFamilies } from './report-families';
import { buildReportEpisodes } from './report-episodes';
import { DEFAULT_REPORT_OPTIONS } from './report.types';
import {
  REPORT_FAMILIES,
  REPORT_SECTIONS,
} from '../../contracts/calculations/report';
import { compactSection } from './report-navigation';
function context() {
  const input = reportFixture(),
    player = input.participants.find((p) => p.championName === 'Fiora')!;
  const catalogs = {
    items: reportCatalogs.getCachedItemCatalog(input.gameVersion),
    skills: reportCatalogs.getCachedSkillCatalog(
      input.gameVersion,
      player.championId,
    ),
  };
  return { input, player, catalogs };
}
describe('MET17 real projected player report', () => {
  it('presents four equal dimensions and compact factual totals without embedding full family reports', () => {
    const { input, player, catalogs } = context();
    const summary = buildReportSummary(
      input,
      player.puuid,
      DEFAULT_REPORT_OPTIONS,
      catalogs,
    );
    expect(summary.dimensions.map((d) => d.id)).toEqual([
      'resources',
      'combat',
      'vision',
      'structures',
    ]);
    expect(summary.dimensions.every((d) => d.presentationWeight === 1)).toBe(
      true,
    );
    expect(summary.dimensions[0].metrics[0].value).toBeCloseTo(28.0613, 3);
    expect(JSON.stringify(summary)).not.toContain('overallScore');
    expect(Buffer.byteLength(JSON.stringify(summary))).toBeLessThan(80000);
    expect(summary.context.historicalReferenceReason).toBe(
      'insufficient_sample',
    );
  });
  it('keeps support healing/shielding visible and distinguishes zero observations from a zero denominator', () => {
    const { input, catalogs } = context();
    const milio = input.participants.find((p) => p.championName === 'Milio')!;
    const summary = buildReportSummary(
      input,
      milio.puuid,
      DEFAULT_REPORT_OPTIONS,
      catalogs,
    );
    expect(summary.dimensions[1].metrics[1].value).toBe(13741);
    expect(summary.dimensions[1].metrics[2].value).toBe(19049);
    expect(summary.dimensions[2].metrics[0].value).toBe(46);
    const fiora = input.participants.find((p) => p.championName === 'Fiora')!;
    expect(
      buildReportSummary(input, fiora.puuid, DEFAULT_REPORT_OPTIONS, catalogs)
        .dimensions[1].metrics[2],
    ).toMatchObject({ value: 0, reason: null });
    for (const p of input.participants)
      (
        p.finalStats as unknown as { values: { goldEarned: number } }
      ).values.goldEarned = 0;
    const zero = buildReportSummary(
      input,
      milio.puuid,
      DEFAULT_REPORT_OPTIONS,
      catalogs,
    );
    expect(zero.dimensions[0].metrics[0]).toMatchObject({
      value: null,
      reason: 'zero_denominator',
    });
    expect(zero.dimensions[0].metrics[1]).toMatchObject({
      value: 0,
      reason: null,
    });
  });
  it('adapts every family and section without exposing unbounded arrays', () => {
    const { input, player, catalogs } = context();
    const families = reportFamilies(
      input,
      player.puuid,
      DEFAULT_REPORT_OPTIONS,
      catalogs,
    );
    for (const name of REPORT_FAMILIES) {
      const f = families.calculate(name);
      expect(f.reason).toBeNull();
      for (const section of REPORT_SECTIONS[name]) {
        const data = compactSection(
          f,
          section,
          f.sections[section],
          [],
          '/report',
          DEFAULT_REPORT_OPTIONS,
        );
        expect(Buffer.byteLength(JSON.stringify(data) ?? 'null')).toBeLessThan(
          300000,
        );
      }
    }
  });
  it('keeps one death with two capture evidences and stable distinct event links', () => {
    const { input, player, catalogs } = context();
    const f = reportFamilies(
      input,
      player.puuid,
      DEFAULT_REPORT_OPTIONS,
      catalogs,
    );
    const episodes = buildReportEpisodes(
      input,
      player.puuid,
      f.calculate('sequences'),
      f.calculate('objectives'),
    );
    const death = episodes.find(
      (e) =>
        e.kind === 'death' &&
        e.timestampMs! >= 1198000 &&
        e.timestampMs! < 1199000,
    )!;
    expect(death).toBeDefined();
    expect(death.occurrence.value).toBe(1);
    expect(death.associatedCaptures!.value).toBe(2);
    expect(death.eventIds).toHaveLength(3);
  });
  it('preserves final totals without timeline and publishes null provenance without processing metadata', () => {
    const { input, player, catalogs } = context();
    input.events = [];
    input.timelineProjection = null;
    const partial = buildReportSummary(
      input,
      player.puuid,
      DEFAULT_REPORT_OPTIONS,
      catalogs,
    );
    expect(partial.availability.status).toBe('partial');
    expect(partial.finalTotals[0].value).toBeGreaterThan(0);
    input.processing = null;
    const absent = buildReportSummary(
      input,
      player.puuid,
      DEFAULT_REPORT_OPTIONS,
      catalogs,
    );
    expect(absent.provenance).toMatchObject({
      known: false,
      processingVersion: null,
      processedAt: null,
    });
    expect(
      absent.dimensions.every((d) => d.metrics.every((m) => m.value === null)),
    ).toBe(true);
    expect(absent.finalTotals[0]).toMatchObject({
      value: partial.finalTotals[0].value,
      processingVersion: null,
      processedAt: null,
    });
  });
  it.each([1, 0])(
    'rejects legacy processing generation %s explicitly',
    (version) => {
      const { input, player, catalogs } = context();
      input.processing!.processingVersion = version;
      const f = reportFamilies(
        input,
        player.puuid,
        DEFAULT_REPORT_OPTIONS,
        catalogs,
      );
      for (const name of REPORT_FAMILIES.filter((f) => f !== 'progression'))
        expect(f.calculate(name)).toMatchObject({
          reason: 'unsupported_processing_version',
          processingVersion: null,
          processedAt: null,
        });
    },
  );
  it('does not label truncated events or frames complete', () => {
    const { input, player, catalogs } = context();
    input.readLimits.eventsTruncated = true;
    input.readLimits.framesTruncated = true;
    const summary = buildReportSummary(
      input,
      player.puuid,
      DEFAULT_REPORT_OPTIONS,
      catalogs,
    );
    expect(summary.availability).toMatchObject({
      eventsReason: 'event_read_limit_exceeded',
      framesReason: 'frame_read_limit_exceeded',
    });
    const families = reportFamilies(
      input,
      player.puuid,
      DEFAULT_REPORT_OPTIONS,
      catalogs,
    );
    expect(families.calculate('combat').reason).toBe(
      'event_read_limit_exceeded',
    );
    expect(families.calculate('economy').metadata.snapshotsUnavailable).toBe(
      'frame_read_limit_exceeded',
    );
  });
});
