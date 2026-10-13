/* Independent Node processes, existing application composition, no broker/Riot.
 * Adds uniquely named fixture copies only in a dedicated audit database.
 */
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { fork, execFileSync } = require('node:child_process');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { gzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const from = (p) => require(path.join(root, 'dist', p));
const { PrismaService } = from('core/prisma/prisma.service');
const url = process.env.TEST_DATABASE_URL;
assert(
  url &&
    /^\/highbr_processing_audit_[a-zA-Z0-9_]+_integration$/.test(
      new URL(url).pathname,
    ),
  'Use only a dedicated audit database',
);
const summarize = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    p50: s[Math.ceil(s.length * 0.5) - 1],
    p95: s[Math.ceil(s.length * 0.95) - 1],
    max: s.at(-1),
  };
};
async function child() {
  const { createProcessingComposition } = from('composition/processing');
  const { PinoLogger } = require('nestjs-pino');
  const prisma = new PrismaService({ datasourceUrl: url });
  const { processing } = createProcessingComposition({
    prisma,
    logger: new PinoLogger({ pinoHttp: { level: 'silent' } }),
    source: {
      getMatchById() {
        throw Error('External call forbidden');
      },
      getTimeline() {
        throw Error('External call forbidden');
      },
    },
  });
  await prisma.$connect();
  process.on('message', async (message) => {
    try {
      if (message.stop) {
        await prisma.$disconnect();
        process.disconnect();
        return;
      }
      const delay = monitorEventLoopDelay({ resolution: 10 });
      delay.enable();
      const cpu = process.cpuUsage(),
        start = performance.now(),
        latencies = [];
      for (const matchId of message.ids) {
        const t = performance.now();
        await processing.processMatch({ matchId });
        latencies.push(performance.now() - t);
      }
      const elapsedMs = performance.now() - start,
        used = process.cpuUsage(cpu);
      delay.disable();
      process.send({
        latencies,
        elapsedMs,
        cpuMs: (used.user + used.system) / 1000,
        rssBytes: process.memoryUsage().rss,
        delayMaxMs: delay.max / 1e6,
      });
    } catch (e) {
      process.send({ error: String(e) });
    }
  });
  process.send({ ready: true });
}
async function parent() {
  const output = process.argv[2];
  assert(output, 'Pass output JSON path');
  const prisma = new PrismaService({ datasourceUrl: url });
  const [summary, timeline] = [
    'exemplo_partida_BR1_3200579475.json',
    'exemplo_partida_timeline_BR1_3200579475.json',
  ].map((f) => JSON.parse(fs.readFileSync(path.join(root, f))));
  const runId = `AUDIT_WORKERS_${Date.now()}`;
  const result = {
    measuredAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    environment: {
      node: process.version,
      cpu: os.cpus()[0].model,
      logicalCpus: os.cpus().length,
      loadStart: os.loadavg(),
    },
    method: {
      independentMatches: 1,
      measuredMatchesPerScenario: 8,
      warmupsPerProcess: 1,
      processes: [1, 2, 4],
      prefetchEquivalent: 1,
      broker: false,
      externalNetwork: false,
      includesClaimAndCommit: true,
      rawSeedingExcluded: true,
      resources:
        'unlimited host processes, not production 1 CPU / 1 GiB cgroups',
      players: 'same ten players and champions, contention-heavy fixture',
    },
    scenarios: [],
  };
  const seed = async (id) => {
    const s = structuredClone(summary),
      t = structuredClone(timeline);
    s.metadata.matchId = t.metadata.matchId = id;
    await prisma.matchProcessing.create({ data: { matchId: id } });
    await prisma.matchRaw.create({
      data: {
        matchId: id,
        summary: gzipSync(JSON.stringify(s)),
        timeline: gzipSync(JSON.stringify(t)),
      },
    });
  };
  const receive = (p) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(Error('Worker response timeout'));
      }, 60000);
      const message = (m) => {
        cleanup();
        m.error ? reject(Error(m.error)) : resolve(m);
      };
      const failed = (code) => {
        cleanup();
        reject(Error(`Child exited ${code}`));
      };
      function cleanup() {
        clearTimeout(timer);
        p.off('message', message);
        p.off('exit', failed);
      }
      p.once('message', message);
      p.once('exit', failed);
    });
  const clients = [];
  try {
    await prisma.$connect();
    for (const count of [1, 2, 4]) {
      const ids = Array.from(
          { length: 8 },
          (_, i) => `${runId}_C${count}_${i}`,
        ),
        warm = Array.from(
          { length: count },
          (_, i) => `${runId}_C${count}_W${i}`,
        );
      for (const id of [...ids, ...warm]) await seed(id);
      const active = [];
      for (let i = 0; i < count; i++) {
        const p = fork(__filename, ['--child'], {
          stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
          env: process.env,
        });
        clients.push(p);
        active.push(p);
        await receive(p);
      }
      await Promise.all(
        active.map((p, i) => {
          const wait = receive(p);
          p.send({ ids: [warm[i]] });
          return wait;
        }),
      );
      const start = performance.now();
      const workers = await Promise.all(
        active.map((p, i) => {
          const wait = receive(p);
          p.send({ ids: ids.filter((_, j) => j % count === i) });
          return wait;
        }),
      );
      const elapsedMs = performance.now() - start;
      const status = await prisma.matchProcessing.groupBy({
        by: ['status'],
        where: { matchId: { in: ids } },
        _count: true,
      });
      assert.deepEqual(status, [{ _count: 8, status: 'COMPLETED' }]);
      const row = {
        processes: count,
        elapsedMs,
        matchesPerSecond: 8000 / elapsedMs,
        latencyMs: summarize(workers.flatMap((w) => w.latencies)),
        totalCpuCores: workers.reduce((s, w) => s + w.cpuMs, 0) / elapsedMs,
        rssBytesSum: workers.reduce((s, w) => s + w.rssBytes, 0),
        workers,
        status,
      };
      result.scenarios.push(row);
      console.log(
        JSON.stringify({
          processes: count,
          matchesPerSecond: row.matchesPerSecond,
          cpuCores: row.totalCpuCores,
          rssBytesSum: row.rssBytesSum,
        }),
      );
      await Promise.all(
        active.map(
          (p) =>
            new Promise((resolve) => {
              p.once('exit', resolve);
              p.send({ stop: true });
            }),
        ),
      );
    }
    result.environment.loadEnd = os.loadavg();
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  } finally {
    for (const p of clients) if (p.exitCode === null) p.kill();
    await prisma.$disconnect();
  }
}
(process.argv.includes('--child') ? child() : parent()).catch((e) => {
  console.error(e);
  process.exitCode = 1;
  if (process.send) {
    process.send({ error: String(e) });
    process.disconnect();
  }
});
