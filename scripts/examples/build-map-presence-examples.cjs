const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  projectTimelineSnapshots,
} = require('../../dist/composition/study-api');
const {
  calculateMapPresence,
} = require('../../dist/modules/matches/contracts/calculations/map-presence');
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
const input = {
  matchId: summary.metadata.matchId,
  gameVersion: summary.info.gameVersion,
  gameDuration: summary.info.gameDuration,
  mapId: summary.info.mapId,
  participants: summary.info.participants.map((p) => ({
    puuid: p.puuid,
    teamId: p.teamId,
  })),
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
const observedFixture = calculateMapPresence(input, puuid);
const changed = structuredClone(input);
const snapshot = Object.values(
  changed.projection.frames[0].participantFrames,
).find((p) => p.puuid === puuid);
snapshot.position = null;
const missing = calculateMapPresence(changed, puuid);
const output = {
  provenance:
    'Real patch16.2 positions; processing timestamp is synthetic and explicitly supplied for reproducible offline examples. Missing-position case is a labeled controlled variation, not production evidence.',
  fullResponseBytes: Buffer.byteLength(JSON.stringify(observedFixture)),
  observedFixture,
  syntheticMissingPositionExcerpt: {
    quality: missing.quality,
    excludedReasons: missing.excludedReasons,
    firstSample: missing.samples[0],
    absolute: missing.absolute,
  },
};
writeFileSync(
  join(__dirname, '../../docs/analysis/met25-presence-examples.json'),
  JSON.stringify(output, null, 2) + '\n',
);
