/** Offline fixture audit. Processing metadata below is explicitly synthetic. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportFixture, reportCatalogs } from '../../src/composition/study-fixtures';
import {
  MatchReportService,
  ReportRepository,
  MatchReportQueryDto,
} from '../../src/composition/study-api';
import {
  REPORT_FAMILIES,
  REPORT_SECTIONS,
} from '../../src/modules/matches/contracts/calculations/report';
async function main() {
  const input = reportFixture(),
    query = new MatchReportQueryDto();
  const service = new MatchReportService(
    { findReport: () => Promise.resolve(input) } as unknown as ReportRepository,
    reportCatalogs as any,
  );
  const examples: unknown[] = [],
    sizes: unknown[] = [];
  for (const name of ['Fiora', 'Milio']) {
    const player = input.participants.find((p) => p.championName === name)!;
    const summary = await service.summary(input.matchId, player.puuid, query);
    const episodes = await service.episodes(input.matchId, player.puuid, {
      ...query,
      kind: 'death',
      fromMs: 1198000,
      toMs: 1200000,
    });
    const familySizes: Record<string, number> = {};
    for (const family of REPORT_FAMILIES)
      for (const section of REPORT_SECTIONS[family])
        familySizes[`${family}.${section}`] = Buffer.byteLength(
          JSON.stringify(
            await service.family(input.matchId, player.puuid, family, {
              ...query,
              section,
            }),
          ),
        );
    examples.push({ champion: name, summary, episodes });
    sizes.push({
      champion: name,
      summaryBytes: Buffer.byteLength(JSON.stringify(summary)),
      familyDefaultPageBytes: familySizes,
    });
  }
  const p = input.participants[0].puuid;
  input.events = [];
  input.timelineProjection = null;
  const partial = await service.summary(input.matchId, p, query);
  input.processing = null;
  const unknown = await service.summary(input.matchId, p, query);
  const artifact = {
    fixture: 'BR1_3200579475',
    frames: 41,
    schemaVersion: 1,
    processingMetadata:
      'Synthetic fixture generation=2 and timestamp=2026-09-23T00:00:00Z, not an actual database job timestamp',
    catalogs: 'Offline cached-only; unavailable',
    sizes,
    examples,
    partialExcerpt: {
      provenance: partial.provenance,
      availability: partial.availability,
      firstFinalTotal: partial.finalTotals[0],
    },
    unknownProvenanceExcerpt: {
      provenance: unknown.provenance,
      availability: unknown.availability,
      firstFinalTotal: unknown.finalTotals[0],
      firstDimension: unknown.dimensions[0],
    },
  };
  writeFileSync(
    join(__dirname, '../../docs/analysis/met17-report-examples.json'),
    JSON.stringify(artifact, null, 2) + '\n',
  );
  console.log(JSON.stringify(sizes, null, 2));
}
void main();
