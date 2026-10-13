/* Kill actual child processes while PostgreSQL transactions are open. Disposable DB only. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { fork, execFileSync } = require('node:child_process');
const { gzipSync } = require('node:zlib');
const { root, Prisma, stringify } = require('./adapters.cjs');
const {
  client,
  composition,
  advanceMetrics,
  advanceAggregates,
  installView,
} = require('./engine.cjs');
async function child() {
  const { database, stage } = JSON.parse(process.env.STUDY_FAILURE_CHILD),
    db = client(database);
  const stop = async () => {
    setInterval(() => {}, 1000);
    process.send({ atCrashPoint: true });
    await new Promise(() => {});
  };
  if (stage === 'metricsBeforeCommit')
    await advanceMetrics(db, { afterWrite: stop });
  else if (stage === 'aggregatesBeforeCommit')
    await advanceAggregates(db, 10, { afterWrite: stop });
  else {
    await advanceAggregates(db, 10);
    await stop();
  }
}
async function killAt(database, stage) {
  const p = fork(__filename, [], {
    env: {
      ...process.env,
      STUDY_FAILURE_CHILD: JSON.stringify({ database, stage }),
    },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(Error('Crash point not reached'));
    }, 30000);
    p.once('message', (m) => {
      clearTimeout(timer);
      assert(m.atCrashPoint);
      resolve();
    });
    p.once('error', reject);
  });
  const exited = new Promise((resolve) =>
    p.once('exit', (code, signal) => resolve({ code, signal })),
  );
  assert(p.kill('SIGKILL'), 'Child must still be alive at kill point');
  const terminal = await exited;
  assert.equal(terminal.signal, 'SIGKILL');
}
async function main() {
  const output = process.argv[2];
  assert(output);
  const database = `highbr_architecture_study_failures_${Date.now()}`;
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
  await installView(db, 'D');
  const summary = JSON.parse(
      fs.readFileSync(path.join(root, 'exemplo_partida_BR1_3200579475.json')),
    ),
    timeline = JSON.parse(
      fs.readFileSync(
        path.join(root, 'exemplo_partida_timeline_BR1_3200579475.json'),
      ),
    );
  const id = summary.metadata.matchId;
  await db.matchProcessing.create({ data: { matchId: id } });
  await db.matchRaw.create({
    data: {
      matchId: id,
      summary: gzipSync(JSON.stringify(summary)),
      timeline: gzipSync(JSON.stringify(timeline)),
    },
  });
  const result = { measuredAt: new Date().toISOString(), database, tests: [] };
  const pass = (name, details = {}) => {
    result.tests.push({ name, passed: true, ...details });
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    console.log(name);
  };
  const stage = async () => {
    const [r] = await db.$queryRaw`SELECT stage FROM study_jobs`;
    return r?.stage;
  };
  const p = composition(db, 'D'),
    original = p.matchWriter;
  p.matchWriter = {
    write: async (tx, input) => {
      await original.write(tx, input);
      throw Error('Injected projection failure');
    },
  };
  await p.processMatch({ matchId: id });
  assert.equal(await db.match.count(), 0);
  assert.equal(await db.matchRaw.count(), 1);
  assert.equal(
    await db.$queryRaw`SELECT count(*)::int n FROM study_jobs`.then(
      (r) => r[0].n,
    ),
    0,
  );
  pass('facts rollback retains raw and no downstream job');
  await db.matchProcessing.update({
    where: { matchId: id },
    data: { nextAttemptAt: new Date(0) },
  });
  const good = composition(db, 'D');
  await Promise.all([
    good.processMatch({ matchId: id }),
    composition(db, 'D').processMatch({ matchId: id }),
  ]);
  assert.equal(await db.match.count(), 1);
  assert.equal(await stage(), 'metrics_pending');
  assert.equal(await db.historicalMetricContribution.count(), 0);
  assert.equal(await db.championStats.count(), 0);
  pass('duplicate facts publication creates one durable metrics job');
  assert.equal(await advanceAggregates(db), 0);
  pass('out-of-order aggregate delivery has no effects');
  await killAt(database, 'metricsBeforeCommit');
  assert.equal(await stage(), 'metrics_pending');
  assert.equal(
    await db.$queryRaw`SELECT count(*)::int n FROM study_metric_matches`.then(
      (r) => r[0].n,
    ),
    0,
  );
  pass('SIGKILL inside metric write rolls back and leaves recoverable job');
  const results = await Promise.all([advanceMetrics(db), advanceMetrics(db)]);
  assert.equal(
    results.reduce((a, b) => a + b, 0),
    1,
  );
  assert.equal(await stage(), 'aggregates_pending');
  assert.equal(await db.historicalMetricContribution.count(), 0);
  pass(
    'competing metric consumers publish once; compatibility dataset remains hidden',
  );
  await killAt(database, 'aggregatesBeforeCommit');
  assert.equal(await stage(), 'aggregates_pending');
  assert.equal(await db.championStats.count(), 0);
  pass(
    'SIGKILL after aggregate writes rolls back counters and keeps retryable job',
  );
  await killAt(database, 'aggregatesAfterCommit');
  assert.equal(await stage(), 'complete');
  assert.equal(await db.historicalMetricContribution.count(), 877);
  const before = await db.championStats.aggregate({
    _sum: { gamesPlayed: true },
  });
  assert.equal(before._sum.gamesPlayed, 10);
  await good.processMatch({ matchId: id });
  assert.equal(await advanceMetrics(db), 0);
  assert.equal(await advanceAggregates(db), 0);
  assert.deepEqual(
    await db.championStats.aggregate({ _sum: { gamesPlayed: true } }),
    before,
  );
  pass('redelivery after committed aggregate stage does not double count');
  result.limitations = [
    'No broker acknowledgement exercised here; real database-backed stage recovery is exercised.',
    'Existing match endpoints are not gated by downstream completion. D requires an explicit API readiness contract before adoption.',
    'Generation replacement and correction of already-aggregated matches are evaluated separately; these tests cover a single generation.',
  ];
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  await db.$disconnect();
}
(process.env.STUDY_FAILURE_CHILD ? child() : main()).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
