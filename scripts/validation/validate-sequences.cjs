const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeTimelineEvents,
} = require('../../dist/composition/study-api');
const {
  projectTimelineSnapshots,
} = require('../../dist/composition/study-api');
const {
  calculateSequences,
} = require('../../dist/composition/study-api');
const { PROCESSING_VERSION } = require('../../dist/modules/processing/contracts/processing.constants');
const summary = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
);
const timeline = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
    'utf8',
  ),
);
const puuids = new Map(
  summary.info.participants.map((p) => [p.participantId, p.puuid]),
);
const teams = new Map(
  summary.info.participants.map((p) => [p.participantId, p.teamId]),
);
const events = normalizeTimelineEvents(timeline, puuids, teams, {
  processingVersion: PROCESSING_VERSION,
});
const result = calculateSequences({
  matchId: summary.metadata.matchId,
  gameVersion: summary.info.gameVersion,
  mapId: summary.info.mapId,
  participants: summary.info.participants,
  teams: summary.info.teams,
  events,
  projection: projectTimelineSnapshots(timeline, puuids),
  processing: {
    status: 'COMPLETED',
    processingVersion: events[0].processingVersion,
    completedAt: new Date('2026-09-23T00:00:00Z'),
  },
});
const rawEvents = timeline.info.frames.flatMap((f) => f.events);
const firstBaron = rawEvents.find(
  (e) => e.type === 'ELITE_MONSTER_KILL' && e.monsterType === 'BARON_NASHOR',
);
const rawKills = rawEvents.filter(
  (e) =>
    e.type === 'CHAMPION_KILL' &&
    teams.get(e.killerId) === 200 &&
    e.timestamp < firstBaron.timestamp &&
    e.timestamp >= firstBaron.timestamp - 60000,
);
assert.equal(rawKills.length, 5);
const report = result.report;
const baron = report.goldChanges.find(
  (e) => e.objective.objective === 'BARON_NASHOR',
);
const linked = report.killEpisodes.filter(
  (e) =>
    e.subjectId === '200' &&
    e.windowMs === 60000 &&
    e.objectives.some((o) => o.eventId === baron.objective.eventId),
);
assert.equal(linked.length, 5);
assert.deepEqual(
  linked.map((e) => e.event.timestampMs).sort((a, b) => a - b),
  rawKills.map((e) => e.timestamp).sort((a, b) => a - b),
);
// Independent raw snapshot sums, using the official winner.
const winner = summary.info.teams.find((t) => t.win).teamId;
const differences = timeline.info.frames.map((f, i) => ({
  frameIndex: i,
  timestampMs: f.timestamp,
  value: Object.values(f.participantFrames).reduce(
    (sum, p) =>
      sum + p.totalGold * (teams.get(p.participantId) === winner ? 1 : -1),
    0,
  ),
}));
const persistent = differences.find(
  (f, i) => f.value > 0 && differences.slice(i).every((g) => g.value > 0),
);
assert.equal(persistent.frameIndex, 28);
assert.equal(
  report.comeback.firstPersistentLead.timestampMs,
  persistent.timestampMs,
);
assert.equal(
  report.comeback.largestObservedDeficit.value,
  Math.max(0, -Math.min(...differences.map((f) => f.value))),
);
assert.equal(report.comeback.largestObservedDeficit.value, 4750);
assert.equal(baron.delta.value, 2606);
const output = {
  source:
    'exemplo_partida_BR1_3200579475.json + exemplo_partida_timeline_BR1_3200579475.json',
  processingMetadata:
    'Synthetic offline metadata; API reads committed MatchProcessing.',
  matchId: result.matchId,
  metricVersion: result.metricVersion,
  processingVersion: result.processingVersion,
  processedAt: result.processedAt,
  parameters: result.parameters,
  coverage: report.coverage,
  firstBaron: baron,
  precedingRedKills: linked.map((e) => e.event),
  comeback: report.comeback,
  deathRateExample: report.deathRates[0],
  censoredEpisodeExample: report.killEpisodes.find(
    (e) => e.reason === 'short_match',
  ),
};
fs.writeFileSync(
  path.join(__dirname, '../../docs/analysis/met15-sequences-examples.json'),
  JSON.stringify(output, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    precedingRedKills: linked.length,
    persistentLeadFrame: persistent.frameIndex,
    largestObservedDeficit: 4750,
    firstBaronGoldChange: baron.delta.value,
    failures: 0,
  }),
);
