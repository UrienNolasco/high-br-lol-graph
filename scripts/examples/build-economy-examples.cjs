const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  projectTimelineSnapshots,
} = require('../../dist/composition/study-api');
const { parseMatchData } = require('../../dist/composition/study-api');
const { calculateEconomy } = require('../../dist/composition/study-api');
const summary = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
);
const timeline = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
    'utf8',
  ),
);
const parsed = parseMatchData(summary);
const input = {
  ...parsed.match,
  participants: parsed.participants,
  projection: projectTimelineSnapshots(
    timeline,
    new Map(timeline.info.participants.map((p) => [p.participantId, p.puuid])),
  ),
  processing: {
    status: 'COMPLETED',
    processingVersion: 2,
    completedAt: new Date('2026-09-23T00:00:00Z'),
  },
};
const puuid = input.participants[0].puuid;
const report = calculateEconomy(input, puuid);
const output = {
  provenance:
    'Offline real patch16.2 source observations with explicitly synthetic processing timestamp for reproducible examples. Excerpts, not a complete HTTP response or production evidence.',
  fullResponseBytes: Buffer.byteLength(JSON.stringify(report)),
  excerpt: {
    matchId: report.matchId,
    puuid,
    metricVersion: report.metricVersion,
    processedAt: report.processedAt,
    processingVersion: report.processingVersion,
    eligibility: report.eligibility,
    checkpointContract: report.checkpointContract,
    checkpoint15: report.checkpoints[2],
    lastInterval: report.intervals.at(-1),
    lastPhase: report.phases.at(-1),
    finalResources: report.finalResources,
  },
  pastOnlyCheckpoint15: calculateEconomy(input, puuid, 'pastOnly')
    .checkpoints[2],
  missingProvenance: ((r) => ({
    processedAt: r.processedAt,
    processingVersion: r.processingVersion,
    reason: r.reason,
    samples: r.samples,
    checkpoint5: r.checkpoints[0],
  }))(calculateEconomy({ ...input, processing: null }, puuid)),
};
writeFileSync(
  join(__dirname, '../../docs/analysis/met12-economy-examples.json'),
  JSON.stringify(output, null, 2) + '\n',
);
