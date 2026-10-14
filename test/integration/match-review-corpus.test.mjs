import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import {
  validateIdentity,
  readPair,
  rawResources,
  rawDamage,
} from './match-review-corpus.mjs';

function fixture() {
  const participants = Array.from({ length: 10 }, (_, i) => ({
    participantId: i + 1,
    puuid: `synthetic-${i + 1}`,
    teamId: i < 5 ? 100 : 200,
    teamPosition: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][i % 5],
  }));
  const death = {
    type: 'CHAMPION_KILL',
    timestamp: 330000,
    killerId: 6,
    victimId: 1,
  };
  const summary = {
    metadata: { matchId: 'SYNTHETIC' },
    info: { participants },
  };
  const timeline = {
    metadata: {
      matchId: 'SYNTHETIC',
      participants: participants.map((p) => p.puuid).reverse(),
    },
    info: {
      participants: participants.map(({ participantId, puuid }) => ({
        participantId,
        puuid,
      })),
      frames: Array.from({ length: 12 }, (_, i) => ({
        timestamp: i * 60000,
        participantFrames: Object.fromEntries(
          participants.map((p) => [
            String(p.participantId),
            {
              participantId: p.participantId,
              totalGold: i * (p.participantId === 1 ? 110 : 100),
              xp: i * 100,
              minionsKilled: i * 4,
              jungleMinionsKilled: 0,
              damageStats: { totalDamageDoneToChampions: i * 10 },
            },
          ]),
        ),
        events:
          i === 6
            ? [death]
            : i === 11
              ? [{ type: 'GAME_END', timestamp: 660000 }]
              : [],
      })),
    },
  };
  return { summary, timeline, death };
}

test('explicit participant identity ignores metadata order and accepts shuffled explicit rows', () => {
  const { summary, timeline } = fixture();
  timeline.info.participants.reverse();
  assert.equal(
    validateIdentity(summary, timeline, 'SYNTHETIC').get(1),
    'synthetic-1',
  );
});
test('identity conflict and duplicate participant IDs fail without printing player identifiers', () => {
  const { summary, timeline } = fixture();
  timeline.info.participants[0].puuid = 'wrong';
  assert.throws(
    () => validateIdentity(summary, timeline, 'SYNTHETIC'),
    /explicit summary\/timeline identity match/,
  );
  timeline.info.participants[0] = timeline.info.participants[1];
  assert.throws(
    () => validateIdentity(summary, timeline, 'SYNTHETIC'),
    /participant IDs unique/,
  );
});
test('original gzip bytes must match manifest SHA before parsing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'match-review-validation-'));
  try {
    const { summary, timeline } = fixture();
    const entry = { id: 'SYNTHETIC' };
    for (const [kind, data] of Object.entries({ summary, timeline })) {
      const bytes = gzipSync(JSON.stringify(data));
      entry[kind] = `${kind}.json.gz`;
      entry[kind + 'Sha256'] = createHash('sha256').update(bytes).digest('hex');
      writeFileSync(join(dir, entry[kind]), bytes);
    }
    assert.equal(readPair(dir, entry).length, 2);
    writeFileSync(join(dir, entry.timeline), gzipSync('{}'));
    assert.throws(() => readPair(dir, entry), /timeline SHA-256/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('resource oracle preserves zero and missingness with independent past selection', () => {
  const { summary, timeline, death } = fixture();
  const result = rawResources(summary, timeline, death, 1);
  assert.deepEqual(result.timestamps, [120000, 300000, 480000]);
  assert.equal(result.metrics.gold.postRelativeGain, 30);
  assert.equal(result.metrics.cs.postRelativeGain, 0);
  delete timeline.info.frames[8].participantFrames['1'].xp;
  assert.equal(
    rawResources(summary, timeline, death, 1).metrics.xp.focalPostGain,
    null,
  );
});
test('resource oracle excludes short follow-up and repeated deaths without inventing recovery', () => {
  const { summary, timeline, death } = fixture();
  timeline.info.frames[7].events.push({ ...death, timestamp: 400000 });
  assert.equal(
    rawResources(summary, timeline, death, 1).reason,
    'repeated_death',
  );
  timeline.info.frames[11].events[0].timestamp = 500000;
  assert.equal(
    rawResources(summary, timeline, death, 1).reason,
    'censored_followup',
  );
});
test('damage oracle verifies monotonic counters and death boundaries', () => {
  const { summary, timeline } = fixture();
  const rows = rawDamage(summary, timeline);
  assert.equal(rows[0].global, 100);
  assert.equal(rows[0].personal.get(1), 10);
  assert.equal(rows[4].noDeaths, true);
  assert.equal(rows[5].noDeaths, false);
  timeline.info.frames[8].participantFrames[
    '1'
  ].damageStats.totalDamageDoneToChampions = 0;
  assert.throws(() => rawDamage(summary, timeline), /complete and monotone/);
});

test('wrapper help succeeds without needing a corpus and rejects unknown flags', () => {
  const wrapper = fileURLToPath(
    new URL(
      '../../scripts/validation/validate-match-review.mjs',
      import.meta.url,
    ),
  );
  const help = spawnSync(process.execPath, [wrapper, '--help'], {
    encoding: 'utf8',
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
  assert.equal(help.stderr, '');
  const bad = spawnSync(process.execPath, [wrapper, '--unknown'], {
    encoding: 'utf8',
  });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Usage:/);
});
