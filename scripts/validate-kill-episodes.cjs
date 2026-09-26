const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {
  normalizeTimelineEvents,
} = require('../dist/core/riot/normalized-events');
const {
  projectTimelineSnapshots,
} = require('../dist/core/riot/timeline-snapshots');
const {
  calculateKillEpisodes,
} = require('../dist/modules/matches/pure/kill-episodes-calculator');
const { PROCESSING_VERSION } = require('../dist/core/processing/processing.constants');
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
const puuids = new Map(
  summary.info.participants.map((p) => [p.participantId, p.puuid]),
);
const events = normalizeTimelineEvents(
  timeline,
  puuids,
  new Map(summary.info.participants.map((p) => [p.participantId, p.teamId])),
  { processingVersion: PROCESSING_VERSION },
);
const result = calculateKillEpisodes({
  matchId: summary.metadata.matchId,
  gameVersion: summary.info.gameVersion,
  mapId: summary.info.mapId,
  gameDuration: summary.info.gameDuration,
  participants: summary.info.participants,
  events,
  snapshotProjection: projectTimelineSnapshots(timeline, puuids),
  processingVersion: events[0].processingVersion,
  processedAt: '2026-09-23T00:00:00.000Z',
  projectionComplete: true,
});
const report = result.report;
assert.equal(report.coverage.assignedKillEvents, 92);
assert.equal(report.coverage.unassignedKillEvents, 0);
assert.equal(report.coverage.reason, null);
const ids = report.episodes.flatMap((e) => e.eventIds);
assert.equal(ids.length, 92);
assert.equal(new Set(ids).size, 92);
let checkedSnapshots = 0;
for (const e of report.episodes) {
  assert.ok(e.resources.snapshotTimestampMs < e.startMs);
  assert.equal(e.resources.ageMs, e.startMs - e.resources.snapshotTimestampMs);
  for (const participant of e.resources.participants) {
    for (const evidence of participant.currentGold.evidence)
      assert.ok(evidence.timestampMs < e.startMs);
    checkedSnapshots++;
  }
}
const paired = report.quickTrades.flatMap((t) => [
  t.deathEventId,
  t.responseEventId,
]);
assert.equal(new Set(paired).size, paired.length);
for (const t of report.quickTrades) {
  assert.ok(t.latencyMs > 0 && t.latencyMs <= 10000);
  assert.ok(t.distanceUnits <= 2000);
}
const example = {
  source:
    'exemplo_partida_BR1_3200579475.json + exemplo_partida_timeline_BR1_3200579475.json',
  processingMetadata:
    'Synthetic offline timestamp/generation from fixture projections; API uses actual committed processing metadata.',
  matchId: result.matchId,
  gameVersion: result.gameVersion,
  metricVersion: result.metricVersion,
  processingVersion: result.processingVersion,
  processedAt: result.processedAt,
  definition: report.definition,
  coverage: report.coverage,
  episodeCount: report.episodeCount.value,
  quickTradeCount: report.quickTradeCount.value,
  sensitivity: report.sensitivity,
  exampleEpisode: report.episodes.find((e) => e.eventIds.length > 1),
  exampleTrade: report.quickTrades[0] ?? null,
  checks: {
    uniqueAssignedKills: 92,
    participantSnapshotsChecked: checkedSnapshots,
    futureResourceReads: 0,
    reusedTradeEvents: 0,
  },
};
fs.writeFileSync(
  path.join(__dirname, '../docs/analysis/met24-kill-episodes-examples.json'),
  JSON.stringify(example, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    assignedKills: 92,
    episodes: report.episodes.length,
    quickTrades: report.quickTrades.length,
    participantSnapshotsChecked: checkedSnapshots,
    sensitivity: report.sensitivity.map((s) => ({
      profile: s.thresholds.profile,
      episodes: s.observedEpisodeCount,
      trades: s.observedQuickTradeCount,
      coClusterPairChanges: s.coClusterPairChangesFromDefault,
    })),
    failures: 0,
  }),
);
