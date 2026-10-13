// Compare all prepared projections and dataset rows with a preserved build.
// Usage: node scripts/architecture-study/identity.cjs corpus baseline-dist result.json
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (typeof value === 'bigint') return { bigint: value.toString() };
  if (value instanceof Map)
    return {
      map: [...value]
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
        .map(([k, v]) => [k, canonical(v)]),
    };
  if (value instanceof Date) return { date: value.toISOString() };
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
};
function child() {
  const { corpus, output } = JSON.parse(process.env.IDENTITY_COMPARISON_CHILD);
  const { prepare } = require('./adapters.cjs');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(corpus, 'manifest.json')),
  );
  const results = [];
  for (const match of manifest.matches) {
    const read = (field) => {
      const bytes = fs.readFileSync(path.join(corpus, match[field]));
      assert.equal(sha256(bytes), match[field + 'Sha256']);
      return JSON.parse(gunzipSync(bytes));
    };
    const summary = read('summary'),
      timeline = read('timeline');
    try {
      const data = prepare(summary, timeline);
      const identities = new Map(
        summary.info.participants.map((p) => [p.participantId, p.puuid]),
      );
      for (const frame of data.timeline.snapshotProjection.frames)
        for (const participant of Object.values(frame.participantFrames))
          assert.equal(
            participant.puuid,
            identities.get(participant.participantId),
          );
      for (const event of data.timeline.normalizedEvents) {
        assert.equal(
          event.actorPuuid,
          identities.get(event.actorParticipantId) ?? null,
        );
        assert.equal(
          event.victimPuuid,
          identities.get(event.victimParticipantId) ?? null,
        );
        if (event.assistingParticipantIds)
          assert.deepEqual(
            event.assistingPuuids,
            event.assistingParticipantIds.map(
              (id) => identities.get(id) ?? null,
            ),
          );
      }
      results.push({
        matchId: match.id,
        accepted: true,
        preparedSha256: sha256(JSON.stringify(canonical(data))),
        events: data.timeline.normalizedEvents.length,
        contributions: data.rows.length,
      });
    } catch (error) {
      if (error.name === 'AssertionError') throw error;
      results.push({
        matchId: match.id,
        accepted: false,
        error: error.message,
      });
    }
  }
  fs.writeFileSync(output, JSON.stringify(results));
}
function main() {
  const [corpus, baselineDist, output] = process.argv.slice(2);
  assert(
    corpus && baselineDist && output,
    'corpus, baseline-dist and output required',
  );
  const work = fs.mkdtempSync(
    path.join(require('node:os').tmpdir(), 'highbr-identity-'),
  );
  const dist = path.resolve('dist');
  const variants = {};
  for (const [name, compiled] of [
    ['baseline', path.resolve(baselineDist)],
    ['candidate', dist],
  ]) {
    const result = path.join(work, name + '.json');
    execFileSync(process.execPath, [__filename], {
      stdio: 'inherit',
      env: {
        ...process.env,
        STUDY_DIST: compiled,
        IDENTITY_COMPARISON_CHILD: JSON.stringify({
          corpus: path.resolve(corpus),
          output: result,
        }),
      },
    });
    variants[name] = JSON.parse(fs.readFileSync(result));
  }
  const changed = [],
    newlyAccepted = [];
  for (const previous of variants.baseline) {
    const current = variants.candidate.find(
      (m) => m.matchId === previous.matchId,
    );
    assert(current?.accepted, 'Candidate rejected ' + previous.matchId);
    if (!previous.accepted) newlyAccepted.push(previous.matchId);
    else if (previous.preparedSha256 !== current.preparedSha256)
      changed.push(previous.matchId);
  }
  assert.equal(
    changed.length,
    0,
    'Previously accepted prepared results changed',
  );
  assert.deepEqual(newlyAccepted, ['BR1_3283642155']);
  const modules = [
    'modules/matches/adapters/riot/match-preparer.js',
    'modules/matches/adapters/riot/match.parser.js',
  ];
  const report = {
    checkedAt: new Date().toISOString(),
    method:
      'All frozen raw hashes checked. Exact canonical comparison of complete prepared match/timeline and dataset rows; map/object key order ignored, numeric values preserved. Every snapshot, actor, victim and assist independently checked against explicit summary participant IDs.',
    compiledHashes: Object.fromEntries(
      [
        ['baseline', baselineDist],
        ['candidate', dist],
      ].map(([name, directory]) => [
        name,
        Object.fromEntries(
          modules.map((file) => [
            file,
            sha256(fs.readFileSync(path.join(directory, file))),
          ]),
        ),
      ]),
    ),
    compared: variants.baseline.length,
    unchangedPreviouslyAccepted: variants.baseline.filter((m) => m.accepted)
      .length,
    newlyAccepted,
    changed,
    variants,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      compared: report.compared,
      unchanged: report.unchangedPreviouslyAccepted,
      newlyAccepted,
    }),
  );
}
try {
  if (process.env.IDENTITY_COMPARISON_CHILD) child();
  else main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
