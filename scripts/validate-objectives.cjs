const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeTimelineEvents,
} = require('../dist/core/riot/normalized-events');
const { parseMatchData } = require('../dist/modules/worker/pure/match.parser');
const {
  calculateObjectives,
} = require('../dist/modules/matches/pure/objectives-calculator');
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
const parsed = parseMatchData(summary);
const events = normalizeTimelineEvents(
  timeline,
  new Map(summary.info.participants.map((p) => [p.participantId, p.puuid])),
  new Map(summary.info.participants.map((p) => [p.participantId, p.teamId])),
  { processingVersion: PROCESSING_VERSION },
);
const result = calculateObjectives({
  matchId: summary.metadata.matchId,
  gameVersion: summary.info.gameVersion,
  mapId: summary.info.mapId,
  participants: parsed.participants,
  teams: parsed.teams,
  events,
  processing: {
    status: 'COMPLETED',
    processingVersion: events[0].processingVersion,
    completedAt: new Date('2026-09-23T00:00:00Z'),
  },
});
const report = result.report;
assert.equal(report.reconciliation.length, 12);
for (const row of report.reconciliation) {
  assert.equal(row.matches, true);
  assert.equal(row.difference, 0);
}
assert.equal(report.structures.towers.value, 13);
assert.equal(report.structures.inhibitors.value, 2);
assert.equal(report.plates.total.value, 74);
assert.equal(report.plates.killerIdZero.value, 28);
const soul = report.chronology.find((e) => e.objective === 'soul');
assert.equal(soul.beneficiaryTeamId, null);
const fiora = report.participantContributions.find(
  (p) => p.championName === 'Fiora',
);
assert.ok(Math.abs(fiora.turretDamageShare.value - 79.14) < 0.005);
const output = {
  source:
    'exemplo_partida_BR1_3200579475.json + exemplo_partida_timeline_BR1_3200579475.json',
  processingMetadata:
    'Synthetic offline metadata; API reads actual MatchProcessing metadata.',
  matchId: result.matchId,
  gameVersion: result.gameVersion,
  metricVersion: result.metricVersion,
  processingVersion: result.processingVersion,
  processedAt: result.processedAt,
  coverage: report.coverage,
  reconciliation: report.reconciliation.map((r) => ({
    teamId: r.teamId,
    objective: r.objective,
    final: r.finalCount.value,
    timeline: r.timelineCount.value,
    matches: r.matches,
  })),
  structures: {
    towers: report.structures.towers.value,
    inhibitors: report.structures.inhibitors.value,
  },
  plates: {
    total: report.plates.total.value,
    killerIdZero: report.plates.killerIdZero.value,
    atOrAfter14Minutes: report.chronology.filter(
      (e) => e.objective === 'plate' && e.timestampMs >= 840000,
    ).length,
  },
  soul,
  firstTower: report.chronology.find((e) => e.objective === 'tower'),
  fiora: {
    turretDamage: fiora.turretDamage,
    turretDamageShare: fiora.turretDamageShare,
    turretKills: fiora.turretKills,
    turretTakedowns: fiora.turretTakedowns,
  },
};
fs.writeFileSync(
  path.join(__dirname, '../docs/analysis/met14-objectives-examples.json'),
  JSON.stringify(output, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    reconciliations: 12,
    towers: 13,
    inhibitors: 2,
    plates: 74,
    killerIdZero: 28,
    platesAtOrAfter14Minutes: output.plates.atOrAfter14Minutes,
    fioraTurretShare: fiora.turretDamageShare.value,
    failures: 0,
  }),
);
