/* Exercise the existing rebuild coordinator with the experimental atomic adapters. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const { client, composition, installView } = require('./engine.cjs');
const { from, Prisma, ident } = require('./adapters.cjs');
const { normalize, comparison, diff } = require('./validate.cjs');
const { RebuildService } = from('modules/processing/services/rebuild.service');
const tables = [
  'matches',
  'match_teams',
  'match_participants',
  'match_timeline_projections',
  'match_event_projections',
  'historical_metric_contributions',
  'champion_stats',
  'player_stats',
  'player_champion_stats',
];
async function snapshot(db) {
  const result = {};
  for (const table of tables) {
    const rows = (
      await db.$queryRaw(
        Prisma.sql`SELECT row_to_json(t)::text value FROM ${ident(table)} t`,
      )
    ).map((r) => JSON.parse(r.value));
    const normalized = rows
      .map((r) => {
        if (table.endsWith('_stats') || table === 'match_teams') delete r.id;
        return normalize(r);
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    result[table] = normalized;
  }
  return result;
}
async function main() {
  const [input, output, selectedVariants = 'A,B2,C,E'] = process.argv.slice(2),
    bench = JSON.parse(fs.readFileSync(input));
  const source = client(bench.runs.find((r) => r.variant === 'A').database);
  const raws = await source.matchRaw.findMany({ orderBy: { matchId: 'asc' } });
  // Different patches/queues plus a short game, selected from retained raw pairs.
  const indices = [0, 10, 30, Math.max(0, raws.length - 2), raws.length - 1];
  const selected = [...new Set(indices)].map((i) => raws[i]);
  await source.$disconnect();
  const report = {
    measuredAt: new Date().toISOString(),
    matches: selected.map((r) => r.matchId),
    variants: [],
  };
  for (const variant of selectedVariants.split(',')) {
    assert(['A', 'B2', 'C', 'E'].includes(variant));
    const database = `highbr_architecture_study_rebuild_${variant.toLowerCase()}_${Date.now()}`;
    execFileSync('docker', [
      'exec',
      'highbr-architecture-study-pg',
      'psql',
      '-U',
      'integration',
      '-p',
      '55441',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `CREATE DATABASE ${database} TEMPLATE highbr_architecture_study`,
    ]);
    const db = client(database);
    await installView(db, variant);
    const processing = composition(db, variant),
      rebuild = new RebuildService(db, processing);
    for (const raw of selected) {
      await db.matchProcessing.create({ data: { matchId: raw.matchId } });
      await db.matchRaw.create({
        data: {
          matchId: raw.matchId,
          summary: raw.summary,
          timeline: raw.timeline,
        },
      });
    }
    const ordered = selected.map((r) => r.matchId).sort();
    for (const matchId of ordered) await processing.processMatch({ matchId });
    assert.equal(await db.match.count(), selected.length);
    const before = await snapshot(db),
      record = { variant, database, rounds: [] };
    const injected = new Error('Deliberately interrupted rebuild');
    const t = performance.now();
    await assert.rejects(
      rebuild.run(false, (n) => {
        if (n === 2) throw injected;
      }),
      (e) => e === injected,
    );
    assert.equal(
      (await db.processingMaintenance.findUnique({ where: { id: 1 } }))
        .rebuilding,
      true,
    );
    const resumed = await rebuild.run(true),
      after = await snapshot(db),
      check = comparison();
    diff(before, after, check, 'resume');
    assert.equal(resumed, selected.length - 2);
    assert.equal(check.nonNumericDifferences, 0);
    assert(check.withinDiagnosticTolerance);
    record.rounds.push({
      kind: 'interrupt after two then resume',
      ms: performance.now() - t,
      resumed,
      comparison: check,
    });
    const t2 = performance.now(),
      completed = await rebuild.run(),
      twice = await snapshot(db),
      check2 = comparison();
    diff(after, twice, check2, 'second');
    assert.equal(completed, selected.length);
    assert.equal(
      check2.differences,
      0,
      'Identical sorted rebuild must be exact on stored logical data',
    );
    record.rounds.push({
      kind: 'second complete rebuild',
      ms: performance.now() - t2,
      completed,
      comparison: check2,
    });
    assert.equal(
      (await db.processingMaintenance.findUnique({ where: { id: 1 } }))
        .rebuilding,
      false,
    );
    assert.equal(await db.matchRaw.count(), selected.length);
    record.digest = createHash('sha256')
      .update(JSON.stringify(twice))
      .digest('hex');
    report.variants.push(record);
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(
      JSON.stringify({
        variant,
        rounds: record.rounds.map((r) => ({
          kind: r.kind,
          ms: r.ms,
          exact: r.comparison.exact,
        })),
      }),
    );
    await db.$disconnect();
  }
  report.scope =
    'Existing offline rebuild, five real matches, interruption/resume and a second full rebuild. Does not prove online generation swapping or large-history rebuild duration.';
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
