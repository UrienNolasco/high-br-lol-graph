/** Offline MET20 examples. Source observations are real; job metadata is the fixture's declared synthetic metadata. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildHistoricalDataset } from '../src/modules/dataset/pure/dataset-builder';
import {
  calculateReference,
  ReferenceRow,
} from '../src/modules/references/reference-calculator';
import { normalizeReferenceQuery } from '../src/modules/references/reference-contract';
import { historicalDatasetFixture } from '../test/fixtures/historical-dataset';
import {
  referenceQueryFixture,
  referenceRowFixture,
} from '../test/fixtures/references';
import { visionInvestmentContext } from '../src/modules/references/contracts/statistics';
const fixture = historicalDatasetFixture();
const source = buildHistoricalDataset(fixture).find(
  (r) =>
    r.definitionId === 'snapshot.totalGold' &&
    r.horizonKey === 't:900000' &&
    r.subjectId === fixture.participants[0].puuid,
)!;
const row: ReferenceRow = {
  id: source.id,
  matchId: source.matchId,
  subjectId: source.subjectId,
  gameCreation: BigInt(source.gameCreation),
  value: source.value,
  roster: fixture.participants.map((p) => p.puuid),
  eligible: source.eligible,
  reason: source.reason,
  processedAt: source.processedAt,
  lineage: source.lineage,
  origin: source.origin,
  source: { datasetContributionId: source.id, evidence: source.evidence },
  context: {
    patch: source.patch,
    queueId: source.queueId,
    mapId: source.mapId,
    championId: source.championId,
    role: source.role,
    horizonKey: source.horizonKey,
    definitionVersion: source.definitionVersion,
  },
};
const { definitionVersion: _version, ...context } = row.context;
const real = calculateReference(
  normalizeReferenceQuery({
    ...context,
    definitionId: source.definitionId,
  }),
  [row],
  row,
  0,
);
const syntheticRows = Array.from({ length: 83 }, (_, i) =>
  referenceRowFixture(i),
);
const synthetic = calculateReference(
  normalizeReferenceQuery(referenceQueryFixture),
  syntheticRows,
  syntheticRows[0],
  0,
);
const fragment = (r: ReturnType<typeof calculateReference>) => ({
  status: r.status,
  reason: r.reason,
  filters: r.filters,
  counts: r.counts,
  coverage: r.coverage,
  period: r.period,
  precision: r.precision,
  median: r.median,
  quantiles: r.quantiles,
  individual: r.individual,
  selection: { ...r.selection, selectedContributionIds: undefined },
  provenance: r.provenance,
});
writeFileSync(
  resolve('docs/analysis/met20-examples.json'),
  JSON.stringify(
    {
      methodVersion: 1,
      scope: 'Illustrative response fragments, not complete endpoint responses',
      realFixture: {
        matchId: source.matchId,
        coverage:
          'One real match/patch16.2/queue420/map11; processedAt and discovery metadata explicitly synthetic',
        response: fragment(real),
      },
      controlledSynthetic: {
        coverage:
          '83 fabricated values, matches and disjoint ten-player rosters; no population evidence',
        response: fragment(synthetic),
      },
      visionInvestment: visionInvestmentContext(
        fixture.participants[0].finalStats,
        '16.2',
        11,
      ),
    },
    null,
    2,
  ) + '\n',
);
