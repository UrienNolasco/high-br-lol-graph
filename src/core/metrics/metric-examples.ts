import {
  metricContext,
  metricQuality,
  metricValue,
  ratioMetric,
  unavailableMetric,
} from './metric-contract';

const context = metricContext({
  metricId: 'V03',
  matchId: 'synthetic-contract-fixture',
  subject: { kind: 'participant', id: 'fixture-player' },
  unit: 'count',
  processedAt: '2026-09-22T00:00:00.000Z',
  window: null,
  denominator: null,
  quality: metricQuality(1, 1),
  evidence: [{ source: 'match', field: 'wardsKilled', value: 0 }],
});
/** Synthetic examples, not additional observed matches. */
export const METRIC_RESPONSE_EXAMPLES = {
  observed: metricValue(context, 0, 'observed', 'summary.wardsKilled'),
  derived: ratioMetric(
    {
      ...context,
      metricId: 'C01',
      unit: 'percent',
      denominator: {
        value: 10,
        unit: 'kills',
        population: 'participant team kills',
      },
      evidence: [
        { source: 'match', field: 'kills+assists', value: 5 },
        { source: 'match', field: 'team.kills', value: 10 },
      ],
    },
    5,
    10,
    100,
  ),
  estimated: metricValue(
    {
      ...context,
      metricId: 'B08',
      unit: 'percent',
      denominator: {
        value: 10,
        unit: 'snapshots',
        population: 'valid position snapshots',
      },
      evidence: [
        { source: 'timeline', field: 'position.regionCount', value: 4 },
        { source: 'timeline', field: 'position.validSnapshots', value: 10 },
      ],
    },
    40,
    'estimated',
    'region snapshots / valid snapshots * 100; sampled presence, not duration',
  ),
  unavailable: unavailableMetric(
    {
      ...context,
      quality: metricQuality(0, 1),
      evidence: [{ source: 'match', field: 'wardsKilled', value: null }],
    },
    'missing_field',
  ),
};
