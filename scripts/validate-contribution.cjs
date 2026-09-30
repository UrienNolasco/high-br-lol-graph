// Run npm run build first. Only the repository fixture is read; no network/DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseMatchData } = require('../dist/composition/study-api');
const {
  computeContribution,
} = require('../dist/modules/matches/contracts/calculations/contribution');
const raw = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
);
const parsed = parseMatchData(raw);
const input = {
  ...parsed.match,
  participants: parsed.participants,
  processingVersion: 2,
  processedAt: '2026-09-23T00:00:00.000Z',
};
const fiora = parsed.participants.find((p) => p.championName === 'Fiora');
const milio = parsed.participants.find((p) => p.championName === 'Milio');
const f = computeContribution(input, fiora);
const m = computeContribution(input, milio);
assert.ok(
  Math.abs(f.dimensions.structures.turretDamage.teamShare.value - 79.14) <
    0.005,
);
assert.equal(m.dimensions.combat.allyShielding.absolute.value, 19049);
const realSamples = parsed.participants.map((p) => {
  const result = computeContribution(input, p);
  const source = raw.info.participants.find((row) => row.puuid === p.puuid);
  const team = raw.info.participants.filter((row) => row.teamId === p.teamId);
  const sum = (key) => team.reduce((total, row) => total + row[key], 0);
  assert.equal(
    result.dimensions.combat.killParticipation.value,
    ((source.kills + source.assists) / sum('kills')) * 100,
  );
  assert.equal(
    result.dimensions.combat.damage.teamShare.value,
    (source.totalDamageDealtToChampions / sum('totalDamageDealtToChampions')) *
      100,
  );
  assert.equal(
    result.dimensions.resources.gold.teamShare.value,
    (source.goldEarned / sum('goldEarned')) * 100,
  );
  assert.equal(
    result.dimensions.combat.deadTimePercent.value,
    (source.totalTimeSpentDead / source.timePlayed) * 100,
  );
  return {
    puuid: p.puuid,
    championName: p.championName,
    role: result.role,
    checkedFormulas: 4,
  };
});
const synthetic = structuredClone(input);
const syntheticPlayer = synthetic.participants.find(
  (p) => p.puuid === fiora.puuid,
);
for (const p of synthetic.participants.filter((p) => p.teamId === fiora.teamId))
  p.kills = 0;
const zero = computeContribution(synthetic, syntheticPlayer).dimensions.combat
  .killParticipation;
assert.equal(zero.value, null);
assert.equal(zero.reason, 'zero_denominator');
const output = {
  task: 'MET-10',
  fixture: raw.metadata.matchId,
  examplesAreResponseExcerpts: true,
  processingMetadataIsSyntheticForOfflineExamples: true,
  realFixtureChecks: realSamples,
  totalFormulaChecks: realSamples.length * 4,
  fiora: {
    roleExplanation: f.roleExplanation,
    turretDamage: f.dimensions.structures.turretDamage,
    deadTimePercent: f.dimensions.combat.deadTimePercent,
  },
  milio: {
    roleExplanation: m.roleExplanation,
    allyHealing: m.dimensions.combat.allyHealing,
    allyShielding: m.dimensions.combat.allyShielding,
  },
  syntheticZeroTeamKills: zero,
};
fs.writeFileSync(
  path.join(__dirname, '../docs/analysis/met10-contribution-examples.json'),
  JSON.stringify(output, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    checkedParticipants: realSamples.length,
    formulaChecks: realSamples.length * 4,
    fioraTurretSharePercent:
      f.dimensions.structures.turretDamage.teamShare.value,
    milioAllyShielding: m.dimensions.combat.allyShielding.absolute.value,
    failures: 0,
  }),
);
