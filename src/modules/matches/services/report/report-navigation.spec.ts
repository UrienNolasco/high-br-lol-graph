import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  metricContext,
  metricQuality,
  ratioMetric,
} from '../../contracts/metric-contract';
import {
  collectEvidence,
  compactSection,
  evidenceId,
  metricKey,
  navigationPath,
  page,
  parseMetricKey,
  reportBase,
  reportMetric,
  selectPath,
} from './report-navigation';
import { ReportFamilyData } from './report-families';
import { DEFAULT_REPORT_OPTIONS } from './report.types';

// Synthetic navigation fixtures: values and identities do not represent additional matches.
const base = reportBase('synthetic/navigation', 'player+1');
const meta = {
  metricVersion: 1,
  processingVersion: 3,
  processedAt: '2026-09-23T00:00:00.000Z',
};
function metric(proofCount = 5) {
  return ratioMetric(
    metricContext({
      ...meta,
      metricId: 'E04',
      matchId: 'synthetic/navigation',
      subject: { kind: 'participant', id: 'player+1' },
      unit: 'percent',
      window: { startMs: 0, endMs: 60000, bounds: '[]' },
      denominator: {
        value: 20,
        unit: 'gold',
        population: 'synthetic team total',
      },
      quality: metricQuality(5, 5),
      evidence: Array.from({ length: proofCount }, (_, i) => ({
        source: 'synthetic',
        field: 'gold',
        value: i,
        eventId: `SYNTHETIC:1:${i}`,
        frameIndex: 1,
        timestampMs: i * 1000,
      })),
    }),
    5,
    20,
    100,
  );
}
const family: ReportFamilyData = {
  ...meta,
  family: 'economy',
  reason: null,
  metadata: {},
  sections: {},
};

describe('MET17 safe and bounded report navigation', () => {
  it('round-trips metric identifiers while rejecting foreign sections, malformed keys and prototype paths', () => {
    const paths = [
      ['resources', 'gold', 'teamShare'],
      ['combat', 'allyHealing', 'absolute'],
    ];
    for (const path of paths)
      expect(parseMetricKey(metricKey('contribution', path))).toEqual({
        family: 'contribution',
        path,
      });
    const episodePath = ['death:BR1_99:12:3:60000', 'associatedCaptures'];
    expect(parseMetricKey(metricKey('episodes', episodePath))).toEqual({
      family: 'episodes',
      path: episodePath,
    });
    for (const key of [
      metricKey('arbitrary', ['resources']),
      metricKey('economy', ['unknown']),
      metricKey('contribution', ['resources', 'constructor']),
      metricKey('totals', ['goldEarned', 'value']),
      metricKey('episodes', ['death:BR1_99:12:3:60000', 'arbitrary']),
      'contribution:not-json',
      'totals:',
    ])
      expect(() => parseMetricKey(key)).toThrow(BadRequestException);
  });

  it('reads only own properties and rejects traversal before object access', () => {
    const inherited = Object.create({ hidden: { value: 7 } }) as {
      visible?: { value: number };
    };
    inherited.visible = { value: 0 };
    expect(selectPath(inherited, navigationPath('visible.value'))).toBe(0);
    expect(() => selectPath(inherited, navigationPath('hidden.value'))).toThrow(
      NotFoundException,
    );
    expect(() => selectPath({ rows: [1] }, navigationPath('rows.2'))).toThrow(
      NotFoundException,
    );
    for (const path of [
      '__proto__.value',
      'visible.constructor',
      'prototype',
      'rows.-1',
      'rows.01',
      'rows[0]',
      Array(17).fill('a').join('.'),
    ])
      expect(() => navigationPath(path)).toThrow(BadRequestException);
    expect(base).toBe(
      '/api/v1/matches/synthetic%2Fnavigation/report/player%2B1',
    );
  });

  it('limits preview evidence while preserving the metric, denominator and access to omitted evidence', () => {
    const raw = metric(100),
      before = JSON.stringify(raw);
    const result = reportMetric(
      raw,
      'contribution',
      ['resources', 'gold', 'teamShare'],
      meta,
      base,
      2,
    );
    expect(result).toMatchObject({
      value: 25,
      unit: 'percent',
      denominator: { value: 20 },
      metricVersion: 1,
      processingVersion: 3,
    });
    expect(result.evidence).toMatchObject({
      total: 100,
      offset: 0,
      limit: 2,
      hasMore: true,
    });
    expect(result.evidence.items).toHaveLength(2);
    const next = new URL(result.evidence.next!, 'http://local');
    expect(next.searchParams.get('offset')).toBe('2');
    expect(
      parseMetricKey(decodeURIComponent(next.pathname.split('/').at(-1)!)),
    ).toEqual({
      family: 'contribution',
      path: ['resources', 'gold', 'teamShare'],
    });
    expect(
      collectEvidence(
        { metric: raw },
        'contribution',
        evidenceId('contribution', raw.evidence[99]),
      ),
    ).toEqual(raw.evidence[99]);
    expect(
      collectEvidence(
        { metric: raw },
        'economy',
        evidenceId('contribution', raw.evidence[99]),
      ),
    ).toBeUndefined();
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('uses original row identities after output filtering and exposes a navigable page for nested arrays', () => {
    const rows = [0, 10, 20].map((timestampMs) => ({
      timestampMs,
      metric: metric(),
      samples: [0, 1, 2, 3, 4],
    }));
    const options = {
      ...DEFAULT_REPORT_OPTIONS,
      limit: 1,
      fromMs: 10,
      toMs: 21,
      mode: 'nearest' as const,
    };
    const result = compactSection(
      family,
      'samples',
      rows,
      [],
      base,
      options,
    ) as {
      total: number;
      next: string;
      items: Array<{
        metric: ReturnType<typeof reportMetric>;
        samples: { items: number[]; total: number; next: string };
      }>;
    };
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(parseMetricKey(result.items[0].metric.key).path).toEqual([
      'samples',
      '1',
      'metric',
    ]);
    expect(result.items[0].metric).toMatchObject({
      value: 25,
      denominator: { value: 20 },
    });
    const nested = result.items[0].samples;
    expect(nested).toMatchObject({ items: [0], total: 5 });
    const url = new URL(nested.next, 'http://local');
    expect(url.searchParams.get('path')).toBe('1.samples');
    expect(url.searchParams.get('offset')).toBe('1');
    expect(url.searchParams.get('mode')).toBe('nearest');
    const selection = selectPath(
      rows,
      navigationPath(url.searchParams.get('path')!),
    );
    expect(
      compactSection(family, 'samples', selection, ['1', 'samples'], base, {
        ...options,
        offset: 1,
      }),
    ).toMatchObject({ items: [1], total: 5, hasMore: true });
    expect(rows[1].samples).toEqual([0, 1, 2, 3, 4]);
  });

  it('finishes pagination explicitly when offset is beyond available rows', () => {
    expect(
      page(
        [1, 2],
        5,
        10,
        (x) => x,
        (n) => String(n),
      ),
    ).toEqual({
      items: [],
      total: 2,
      offset: 5,
      limit: 10,
      hasMore: false,
      next: null,
    });
    const result = reportMetric(
      metric(0),
      'totals',
      ['goldEarned'],
      meta,
      base,
      0,
    );
    expect(result.evidence).toEqual({
      items: [],
      total: 0,
      offset: 0,
      limit: 0,
      hasMore: false,
      next: null,
    });
  });

  it('replaces deeply nested collections with a detail link and declares truncated text', () => {
    let deep: Record<string, unknown> = { payload: [1, 2, 3] };
    for (let i = 0; i < 8; i++) deep = { next: deep };
    const rendered = compactSection(
      family,
      'samples',
      deep,
      [],
      base,
      DEFAULT_REPORT_OPTIONS,
    );
    expect(selectPath(rendered, Array(8).fill('next'))).toMatchObject({
      kind: 'detail',
      reason: 'summary_depth_limit',
      href: expect.stringContaining(
        'path=next.next.next.next.next.next.next.next',
      ),
    });
    expect(
      compactSection(
        family,
        'samples',
        'x'.repeat(2001),
        [],
        base,
        DEFAULT_REPORT_OPTIONS,
      ),
    ).toMatchObject({
      kind: 'text',
      totalCharacters: 2001,
      truncated: true,
      reason: 'text_limit',
    });
  });
});
