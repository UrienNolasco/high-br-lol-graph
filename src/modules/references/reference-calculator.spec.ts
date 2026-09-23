import { calculateReference } from './reference-calculator';
import { normalizeReferenceQuery } from './reference-contract';
import {
  referenceQueryFixture,
  referenceRowFixture,
} from '../../../test/fixtures/references';
const query = () => normalizeReferenceQuery(referenceQueryFixture);
describe('MET20 homogeneous reference calculator', () => {
  it('reports selected N, coverage, exact period and real provenance with a separate target', () => {
    const rows = Array.from({ length: 83 }, (_, i) => referenceRowFixture(i));
    const result = calculateReference(query(), rows, rows[0], 2);
    expect(result.status).toBe('available');
    expect(result.counts).toMatchObject({
      eligibleRows: 83,
      eligibleMatches: 83,
      eligiblePlayers: 83,
      selectedRows: 82,
      selectedMatches: 82,
      selectedRosterPlayers: 820,
    });
    expect(result.median).toBe(41);
    expect(result.individual!.percentile!.value).toBe(0);
    expect(result.coverage).toMatchObject({
      value: 1,
      unmaterializedMatches: 2,
    });
    expect(result.period.selected).toEqual({
      firstGameCreationMs: '1001',
      lastGameCreationMs: '1082',
    });
    expect(result.provenance.processedAt!.latest).toBe(
      '2026-09-23T00:00:00.000Z',
    );
    expect(
      calculateReference(query(), rows, rows[0], 2).selection.fingerprint,
    ).toBe(result.selection.fingerprint);
  });
  it('preserves individual data without a target while withholding insufficient summaries', () => {
    const missing = {
      ...referenceRowFixture(1),
      value: null,
      reason: 'missing_frame',
    };
    const result = calculateReference(
      query(),
      [referenceRowFixture(0), missing],
      null,
      0,
    );
    expect(result).toMatchObject({
      status: 'insufficient',
      median: null,
      quantiles: null,
      distribution: null,
      individual: null,
      coverage: { value: 0.5, missingReasons: { missing_frame: 1 } },
    });
    expect(result.observations.items.map((r) => r.value)).toEqual([0, null]);
  });
  it('does not publish percentile for missing target values or unknown target roster', () => {
    const rows = Array.from({ length: 83 }, (_, i) => referenceRowFixture(i));
    expect(
      calculateReference(query(), rows, { ...rows[0], value: null }, 0)
        .individual!.percentile,
    ).toBeNull();
    expect(
      calculateReference(query(), rows, { ...rows[0], roster: [] }, 0),
    ).toMatchObject({
      status: 'insufficient',
      reason: 'target_roster_unknown',
      median: null,
      individual: { value: 0, percentile: null },
    });
  });
  it('over-limit queries do not describe a silently truncated sample', () => {
    const result = calculateReference(
      query(),
      [],
      referenceRowFixture(0),
      0,
      true,
      10001,
    );
    expect(result).toMatchObject({
      status: 'insufficient',
      reason: 'cohort_too_large',
      counts: { candidateRows: 10001, eligibleRows: null },
      individual: { value: 0, percentile: null },
      provenance: { processedAt: null },
    });
  });
  it.each([
    'patch',
    'queueId',
    'mapId',
    'championId',
    'role',
    'horizonKey',
    'definitionVersion',
  ] as const)('rejects mixing %s', (field) => {
    const row = referenceRowFixture(0);
    (row.context as Record<string, unknown>)[field] = 'wrong';
    expect(() => calculateReference(query(), [row], null, 0)).toThrow(
      'Mixed reference',
    );
  });
  it.each([
    { role: undefined },
    { patch: undefined },
    { definitionId: 'label.win' },
    { horizonKey: 'final' },
    { eligibleOnly: true },
    { fromMs: 20, toMs: 10 },
    { confidence: 1 },
  ])('rejects invalid cohort %j', (change) =>
    expect(() =>
      normalizeReferenceQuery({ ...referenceQueryFixture, ...change }),
    ).toThrow(),
  );
  it.each(['queueId', 'mapId', 'championId'] as const)(
    'rejects out-of-Int32 %s before querying Prisma',
    (field) => {
      expect(() =>
        normalizeReferenceQuery({
          ...referenceQueryFixture,
          [field]: 2147483648,
        }),
      ).toThrow('Int32');
      expect(
        normalizeReferenceQuery({
          ...referenceQueryFixture,
          [field]: 2147483647,
        }).filters[field],
      ).toBe(2147483647);
    },
  );
  it('normalizes MID, keeps patch16.20 separate and virtual V08 final definitions explicit', () => {
    expect(
      normalizeReferenceQuery({
        ...referenceQueryFixture,
        role: 'MID',
        patch: '16.20',
      }).filters,
    ).toMatchObject({ role: 'MIDDLE', patch: '16.20' });
    expect(
      normalizeReferenceQuery({
        ...referenceQueryFixture,
        definitionId: 'vision.controlWardsBought',
        horizonKey: 'final',
      }).definition,
    ).toMatchObject({
      anchorDefinitionId: 'final.visionScore',
      metricId: 'V08',
    });
  });
});
