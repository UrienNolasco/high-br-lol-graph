/** Regression checks for the offline corpus auditor. Node standard library only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ROOT,
  audit,
  variations,
  syntheticAssertions,
  buildReport,
} from './audit-metrics-corpus.mjs';
const load = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const match = load('exemplo_partida_BR1_3200579475.json');
const timeline = load('exemplo_partida_timeline_BR1_3200579475.json');
const manifest = resolve(ROOT, 'docs/analysis/corpus-manifest.json');

test('real fixture has 112 independent reconciliations', () => {
  const result = audit(match, timeline);
  assert.deepEqual(result.summary, {
    playerChecks: 100,
    objectiveChecks: 12,
    pass: 112,
    fail: 0,
    unavailable: 0,
  });
  assert.equal(result.coverage.frames, 41);
  assert.equal(result.coverage.snapshots, 410);
  assert.deepEqual(result.coverage.duplicateMinutes, { 39: 2 });
  assert.equal(result.coverage.recognizedWardPlacements, 196);
  assert.equal(
    Object.values(result.coverage.unknownWardTypes).reduce((a, b) => a + b, 0),
    556,
  );
  assert.deepEqual(result.integrityIssues, []);
});
test('independent summary corruption is detected', () => {
  const m = structuredClone(match);
  m.info.participants[0].kills += 1;
  m.info.teams[0].objectives.dragon.kills += 1;
  const result = audit(m, timeline);
  assert.equal(result.summary.fail, 2);
  assert.deepEqual(
    result.playerChecks.filter((c) => c.status === 'fail').map((c) => c.metric),
    ['kills'],
  );
  assert.deepEqual(
    result.objectiveChecks
      .filter((c) => c.status === 'fail')
      .map((c) => c.metric),
    ['DRAGON'],
  );
});
test('all controlled mutations pass expectations and leave sources immutable', () => {
  const original = JSON.stringify([match, timeline]);
  const cases = [...variations(match, timeline)];
  assert.equal(cases.length, 9);
  for (const [name, m, t] of cases)
    assert.equal(syntheticAssertions(name, audit(m, t)), true, name);
  assert.equal(JSON.stringify([match, timeline]), original);
});
test('missing fields are unavailable and observed zero stays zero', () => {
  const m = structuredClone(match);
  delete m.info.participants[0].wardsKilled;
  const result = audit(m, timeline);
  const missing = result.playerChecks.find(
    (c) => c.subject === 1 && c.metric === 'wardsKilled',
  );
  assert.equal(missing.status, 'unavailable');
  assert.equal(missing.expectedSummary, null);
  const zero = result.objectiveChecks.find((c) => c.expectedSummary === 0);
  assert.equal(zero.observedTimeline, 0);
  assert.equal(zero.status, 'pass');
});
test('empty timeline does not claim zero observations', () => {
  const t = structuredClone(timeline);
  t.info.frames = [];
  const result = audit(match, t);
  assert.equal(result.summary.unavailable, 112);
  assert.ok(result.checkpoints.every((c) => c.reason === 'missing_frame'));
});
test('checkpoint pastOnly prevents future leakage and retains the final timestamp', () => {
  const result = audit(match, timeline),
    at15 = result.checkpoints.filter((c) => c.targetMs === 900000);
  assert.equal(at15[0].timestampMs, 900358);
  assert.equal(at15[1].timestampMs, 840357);
  assert.ok(
    result.checkpoints
      .filter((c) => c.mode === 'pastOnly' && c.timestampMs !== null)
      .every((c) => c.timestampMs <= c.targetMs),
  );
  assert.equal(result.coverage.frameTimestampMs.at(-1), 2368922);
});
test('determinism and synthetic patches never inflate real sample coverage', () => {
  const report = buildReport(manifest);
  assert.deepEqual(report, buildReport(manifest));
  assert.equal(report.realSampleN, 1);
  assert.equal(report.syntheticSampleN, 9);
  assert.deepEqual(report.coverageByVersionQueueMap, [
    {
      gameVersion: '16.2.741.3171',
      patch: '16.2',
      queueId: 420,
      mapId: 11,
      realN: 1,
    },
  ]);
  assert.equal(report.matchRawAvailability.status, 'not_measured');
  assert.equal(report.matchRawAvailability.rows, null);
});
test('identity and frame ordering divergences are reported independently', () => {
  const t = structuredClone(timeline);
  t.metadata.matchId = 'wrong';
  t.metadata.participants.pop();
  t.info.frames.reverse();
  assert.deepEqual(audit(match, t).integrityIssues, [
    'match_id_mismatch',
    'participant_identity_mismatch',
    'frame_order_mismatch',
  ]);
});
test('CLI keeps options, custom MatchRaw evidence, failure exit and nested output creation', () => {
  mkdirSync(resolve(ROOT, '.tmp'), { recursive: true });
  const directory = mkdtempSync(resolve(ROOT, '.tmp/node-corpus-test-'));
  try {
    const evidence = {
      status: 'measured',
      rows: 1,
      summaryAvailable: 1,
      timelineAvailable: 0,
    };
    writeFileSync(
      resolve(directory, 'evidence.json'),
      JSON.stringify(evidence),
    );
    const output = resolve(directory, 'nested/audit.json');
    const script = resolve(ROOT, 'scripts/validation/audit-metrics-corpus.mjs');
    const success = spawnSync(
      process.execPath,
      [
        script,
        '--output',
        output,
        '--match-raw-evidence',
        resolve(directory, 'evidence.json'),
      ],
      { encoding: 'utf8' },
    );
    assert.equal(success.status, 0, success.stderr);
    assert.deepEqual(
      JSON.parse(readFileSync(output)).matchRawAvailability,
      evidence,
    );
    assert.equal(JSON.parse(success.stdout).unexpectedFailures, 0);
    const m = structuredClone(match);
    m.info.participants[0].kills++;
    const summaryPath = resolve(directory, 'summary.json');
    writeFileSync(summaryPath, JSON.stringify(m));
    const config = load('docs/analysis/corpus-manifest.json');
    config.realSamples[0].summary = relative(ROOT, summaryPath);
    config.realSamples[0].generateSynthetic = false;
    const manifestPath = resolve(directory, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(config));
    const failed = spawnSync(
      process.execPath,
      [script, '--manifest', manifestPath, '--output', output],
      { encoding: 'utf8' },
    );
    assert.equal(failed.status, 1, failed.stderr);
    assert.equal(JSON.parse(failed.stdout).unexpectedFailures, 1);
    assert.equal(
      JSON.parse(readFileSync(output)).real[0].audit.summary.fail,
      1,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
