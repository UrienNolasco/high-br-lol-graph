const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {
  normalizeTimelineEvents,
} = require('../dist/core/riot/normalized-events');
const { parseMatchData } = require('../dist/modules/worker/pure/match.parser');
const {
  calculateBountiesSteals,
  STEAL_CHALLENGES,
} = require('../dist/modules/matches/pure/bounties-steals-calculator');
const summary = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
);
const timeline = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../exemplo_partida_timeline_BR1_3200579475.json'),
    'utf8',
  ),
);
const events = normalizeTimelineEvents(
  timeline,
  new Map(summary.info.participants.map((p) => [p.participantId, p.puuid])),
  new Map(summary.info.participants.map((p) => [p.participantId, p.teamId])),
);
const input = {
  matchId: summary.metadata.matchId,
  gameVersion: summary.info.gameVersion,
  participants: parseMatchData(summary).participants,
  events,
  processing: {
    status: 'COMPLETED',
    processingVersion: events[0].processingVersion,
    completedAt: new Date('2026-09-23T00:00:00Z'),
  },
};
const result = calculateBountiesSteals(input),
  report = result.report;
assert.equal(report.windows.length, 1);
assert.equal(report.windows[0].announcementTimestampMs, 1245318);
assert.equal(report.windows[0].startMs, 1260000);
assert.equal(report.windows[0].endMs, 1555457);
assert.equal(report.windows[0].observedDuration.value, 295457);
let participantChecks = 0,
  eventChecks = 0;
for (const p of summary.info.participants) {
  const actual = report.participants.find((row) => row.puuid === p.puuid);
  for (const field of ['objectivesStolen', 'objectivesStolenAssists']) {
    assert.equal(actual[field].value, p[field] ?? null);
    participantChecks++;
  }
  for (const field of Object.keys(STEAL_CHALLENGES)) {
    assert.equal(
      actual.challenges[field].metric.value,
      p.challenges[field] ?? null,
    );
    participantChecks++;
  }
  assert.equal(actual.bountyGold.value, p.challenges.bountyGold ?? null);
  participantChecks++;
}
assert.equal(report.literalRewards.length, 119);
for (const row of report.literalRewards) {
  const source = events.find(
    (e) => `${e.matchId}:${e.frameIndex}:${e.eventIndex}` === row.eventId,
  );
  for (const field of ['bounty', 'shutdownBounty']) {
    assert.equal(row[field].value, source.payload[field] ?? null);
    eventChecks++;
  }
}
const censored = calculateBountiesSteals({
  ...input,
  events: events.filter((e) => e.type !== 'OBJECTIVE_BOUNTY_FINISH'),
}).report.windows[0];
assert.equal(censored.censoredEnd, true);
assert.equal(censored.endMs, null);
const output = {
  source:
    'exemplo_partida_BR1_3200579475.json + exemplo_partida_timeline_BR1_3200579475.json',
  processingMetadata:
    'Synthetic offline processing metadata; API reads real committed metadata.',
  matchId: result.matchId,
  gameVersion: result.gameVersion,
  metricVersion: result.metricVersion,
  processingVersion: result.processingVersion,
  processedAt: result.processedAt,
  contracts: report.contracts,
  coverage: report.coverage,
  window: report.windows[0],
  karthus: report.participants.find((p) => p.championName === 'Karthus'),
  fioraBountyGold: report.participants.find((p) => p.championName === 'Fiora')
    .bountyGold,
  exampleSeparateBountyShutdown: report.literalRewards.find(
    (e) => e.shutdownBounty.value > 0,
  ),
  syntheticCensoredExample: {
    synthetic: true,
    change: 'Removed recorded FINISH event from fixture copy',
    window: censored,
  },
  checks: {
    participantChecks,
    eventChecks,
    literalRewardEvents: 119,
    failures: 0,
  },
};
fs.writeFileSync(
  path.join(__dirname, '../docs/analysis/met30-bounties-steals-examples.json'),
  JSON.stringify(output, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    windowStart: 1260000,
    windowEnd: 1555457,
    observedDurationMs: 295457,
    participantChecks,
    eventChecks,
    literalRewardEvents: 119,
    failures: 0,
  }),
);
