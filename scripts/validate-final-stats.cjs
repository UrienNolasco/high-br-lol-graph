// Offline validation of literal final projections against the single real fixture.
// Run npm run build first; this script never opens network/database connections.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { projectFinalStats, projectFinalObjectives, FINAL_STAT_UNITS, FINAL_FLAG_FIELDS } = require('../dist/core/riot/final-stats');
const input = JSON.parse(fs.readFileSync(path.join(__dirname, '../exemplo_partida_BR1_3200579475.json'), 'utf8'));
const fields = [...Object.keys(FINAL_STAT_UNITS), ...FINAL_FLAG_FIELDS];
let checks = 0;
const participants = input.info.participants.map((p) => {
  const projected = projectFinalStats(p);
  for (const field of fields) { assert.deepEqual(projected.values[field], p[field] ?? null); checks++; }
  return { puuid: p.puuid, championName: p.championName, checkedFields: fields.length, coverage: projected.quality.coverage };
});
let objectiveChecks = 0;
for (const team of input.info.teams) {
  const projected = projectFinalObjectives(team.objectives);
  for (const [type, value] of Object.entries(team.objectives)) {
    assert.equal(projected.values[type].kills, value.kills);
    assert.equal(projected.values[type].first, value.first);
    objectiveChecks += 2;
  }
}
const report = {
  task: 'MET-05', fixture: input.metadata.matchId, gameVersion: input.info.gameVersion,
  source: 'one real repository fixture; no additional patch representativeness claim',
  projectionVersion: 1, numericUnits: FINAL_STAT_UNITS, booleanFields: FINAL_FLAG_FIELDS,
  participants, participantChecks: checks, objectiveChecks, failures: 0,
};
const output = path.join(__dirname, '../docs/analysis/met05-final-stats-reconciliation.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ participantChecks: checks, objectiveChecks, failures: 0, output }));
