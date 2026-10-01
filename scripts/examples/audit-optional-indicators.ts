/** Offline audit of observed fixture counters; publication timestamps are synthetic. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  contributionFixture,
  indicatorFixture,
} from '../../src/composition/study-fixtures';
import {
  calculateIndicators,
  indicatorCatalog,
  INDICATOR_CATALOG,
  summarizeIndicatorHistory,
} from '../../src/composition/study-api';
const fixture = contributionFixture();
const reports = fixture.match.participants.map((player) =>
  calculateIndicators(indicatorFixture(player.championName)),
);
const selected = ['Fiora', 'Milio'].map(
  (champion) => reports.find((r) => r.participant.championName === champion)!,
);
const coverage = INDICATOR_CATALOG.map((definition) => {
  const values = reports.map(
    (r) => r.metrics.find((m) => m.id === definition.id)!,
  );
  return {
    id: definition.id,
    source: definition.source,
    field: definition.field,
    name: definition.name,
    unit: definition.unit,
    gameVersion: fixture.match.gameVersion,
    patch: '16.2',
    participants: 10,
    validCounters: values.filter((m) => m.count.value !== null).length,
    zeroCounters: values.filter((m) => m.count.value === 0).length,
    validRates: values.filter((m) => m.perMinute?.value != null).length,
    rawValues: values.map((m, index) => ({
      champion: reports[index].participant.championName,
      value: m.count.value,
      reason: m.count.reason,
    })),
  };
});
const one = indicatorFixture(),
  missing = structuredClone(one);
missing.match.matchId = 'SYNTHETIC_MISSING_OPTIONAL';
missing.participant.pings = {};
missing.participant.challenges = {};
missing.processing = null;
const history = summarizeIndicatorHistory([one, missing], {
  limit: 30,
  groupLimit: 5,
  groupOffset: 0,
  evidenceLimit: 3,
  family: 'pings',
});
const result = {
  task: 'MET-29',
  catalog: indicatorCatalog(),
  fixture: {
    matchId: fixture.match.matchId,
    independentRealMatches: 1,
    participants: 10,
    gameVersion: fixture.match.gameVersion,
    processingMetadata:
      'Synthetic generation4 and timestamp2026-09-23T00:00:00Z for reproducible examples; not a historical processing job',
  },
  coverage,
  examples: selected,
  payloadBytes: selected.map((r) => ({
    champion: r.participant.championName,
    bytes: Buffer.byteLength(JSON.stringify(r)),
  })),
  syntheticHistoryExample: {
    description:
      'One real-fixture observation and one synthetic missing/provenance-unknown copy; not two independent real matches',
    report: history,
  },
};
writeFileSync(
  join(__dirname, '../../docs/analysis/met29-optional-indicators-examples.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      catalogFields: coverage.length,
      coverage: coverage.map(
        ({ id, validCounters, zeroCounters, validRates }) => ({
          id,
          validCounters,
          zeroCounters,
          validRates,
        }),
      ),
      payloadBytes: result.payloadBytes,
    },
    null,
    2,
  ),
);
