/* Reproducible multi-process replay against a disposable dedicated PostgreSQL.
 * node scripts/architecture-study/run.cjs /corpus /output --variants=A,B,B2,C,D --count=120 --workers=2 --round=1
 * Databases are unique per run; no application database is reset.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { fork, execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { gunzipSync, gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const {
  root,
  Prisma,
  prepare,
  writeAtomic,
  stringify,
} = require('./adapters.cjs');
const {
  client,
  composition,
  advanceMetrics,
  advanceAggregates,
  installView,
} = require('./engine.cjs');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quantiles = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return {
    n: s.length,
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    p50: s[Math.ceil(s.length * 0.5) - 1],
    p95: s[Math.ceil(s.length * 0.95) - 1],
    max: s.at(-1),
  };
};
async function child() {
  const config = JSON.parse(process.env.STUDY_CHILD);
  const db = client(config.database),
    processing = composition(db, config.variant);
  await db.$connect();
  const summary = JSON.parse(
    fs.readFileSync(path.join(root, 'exemplo_partida_BR1_3200579475.json')),
  );
  const timeline = JSON.parse(
    fs.readFileSync(
      path.join(root, 'exemplo_partida_timeline_BR1_3200579475.json'),
    ),
  );
  summary.metadata.matchId = timeline.metadata.matchId =
    'STUDY_WARM_' + process.pid;
  const prepared = prepare(summary, timeline),
    rollback = new Error('warmup');
  try {
    await db.$transaction(
      async (tx) => {
        await writeAtomic(
          tx,
          prepared,
          config.variant === 'D' ? 'C' : config.variant,
        );
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (e) {
    if (e !== rollback) throw e;
  }
  let stopping = false;
  let rssPeak = 0;
  const sampler = setInterval(
    () => (rssPeak = Math.max(rssPeak, process.memoryUsage().rss)),
    100,
  );
  const run = async (msg) => {
    const cpu = process.cpuUsage(),
      started = performance.now(),
      samples = [],
      batches = [];
    if (config.role === 'facts') {
      await Promise.all(
        Array.from({ length: config.slots || 1 }, async (_, slot) => {
          for (const matchId of msg.ids.filter(
            (_, i) => i % (config.slots || 1) === slot,
          )) {
            const arrivalAt = msg.arrivals?.[matchId] ?? msg.startedAt;
            if (arrivalAt > Date.now()) await pause(arrivalAt - Date.now());
            const t = performance.now();
            await processing.processMatch({ matchId });
            samples.push({
              matchId,
              arrivalAt,
              serviceMs: performance.now() - t,
              finishedAt: Date.now(),
            });
          }
        }),
      );
    } else {
      while (!stopping) {
        const n =
          config.role === 'metrics'
            ? await advanceMetrics(db)
            : await advanceAggregates(db, 10);
        if (n) batches.push(n);
        else await pause(20);
      }
    }
    const used = process.cpuUsage(cpu);
    clearInterval(sampler);
    await db.$disconnect();
    process.send({
      done: true,
      role: config.role,
      samples,
      batches,
      wallMs: performance.now() - started,
      cpuMs: (used.user + used.system) / 1000,
      rssPeak,
    });
    process.disconnect();
  };
  process.on('message', (msg) => {
    if (msg.stop) stopping = true;
    else
      run(msg).catch((e) => {
        console.error(e);
        process.exit(1);
      });
  });
  process.send({ ready: true });
}
function spawn(config) {
  const proc = fork(__filename, [], {
    env: { ...process.env, STUDY_CHILD: JSON.stringify(config) },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  let readyResolve, doneResolve, rejectReady, rejectDone;
  const ready = new Promise((r, j) => {
    readyResolve = r;
    rejectReady = j;
  });
  const done = new Promise((r, j) => {
    doneResolve = r;
    rejectDone = j;
  });
  // Attach handlers immediately to prevent unhandled rejection while awaiting siblings.
  ready.catch(() => {});
  done.catch(() => {});
  proc.on('message', (msg) => {
    if (msg.ready) readyResolve();
    if (msg.done) doneResolve(msg);
  });
  proc.on('exit', (code) => {
    if (code !== 0) {
      const e = Error('Child exited ' + code);
      rejectReady(e);
      rejectDone(e);
    }
  });
  return { proc, ready, done };
}
function pgCpu() {
  const value = execFileSync(
    'docker',
    ['exec', 'highbr-architecture-study-pg', 'cat', '/sys/fs/cgroup/cpu.stat'],
    { encoding: 'utf8' },
  );
  return Number(value.match(/usage_usec (\d+)/)[1]) / 1000;
}
async function pgSnapshot(db) {
  const [wal] =
    await db.$queryRaw`SELECT wal_bytes::text,wal_records::text,wal_fpi::text FROM pg_stat_wal`;
  return {
    walBytes: Number(wal.wal_bytes),
    walRecords: Number(wal.wal_records),
    walFpi: Number(wal.wal_fpi),
    cpuMs: pgCpu(),
  };
}
async function main() {
  const [directory, output, ...opts] = process.argv.slice(2);
  assert(directory && output, 'Pass corpus directory and output JSON');
  const options = Object.fromEntries(
    opts.map((o) => o.replace(/^--/, '').split('=')),
  );
  const variants = (options.variants || 'A,B,B2,C,D').split(',');
  const workers = Number(options.workers || 2),
    count = Number(options.count || 120),
    round = Number(options.round || 1);
  const slots = Number(options.slots || 1);
  assert(Number.isInteger(slots) && slots >= 1 && slots <= 4);
  const arrivalRate = Number(options['arrival-rate'] || 0);
  const templates = options.templates
    ? JSON.parse(fs.readFileSync(options.templates)).templates
    : null;
  assert(variants.every((v) => ['A', 'B', 'B2', 'C', 'D', 'E'].includes(v)));
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, 'manifest.json')),
  );
  const selected = manifest.matches
    .filter((m) => m.mapId === 11 && [420, 440].includes(m.queueId))
    .slice(0, count);
  if (options.fixture) {
    selected.length = 0;
    selected.push({
      id: 'BR1_3200579475',
      summary: path.join(root, 'exemplo_partida_BR1_3200579475.json'),
      timeline: path.join(root, 'exemplo_partida_timeline_BR1_3200579475.json'),
    });
  }
  assert(selected.length);
  let pairs = selected.map((m) => {
    const read = (f) => {
      const b = fs.readFileSync(path.resolve(directory, f));
      return f.endsWith('.gz') ? b : gzipSync(b);
    };
    let summaryBytes = read(m.summary),
      timelineBytes = read(m.timeline),
      id = m.id;
    if (options['id-prefix']) {
      id = options['id-prefix'] + m.id;
      const s = JSON.parse(gunzipSync(summaryBytes)),
        t = JSON.parse(gunzipSync(timelineBytes));
      s.metadata.matchId = t.metadata.matchId = id;
      summaryBytes = gzipSync(JSON.stringify(s));
      timelineBytes = gzipSync(JSON.stringify(t));
    }
    return { ...m, id, sourceId: m.id, summaryBytes, timelineBytes };
  });
  // Preparation screening is recorded; unsupported real matches are not silently discarded.
  const screen = pairs.map((m) => {
    try {
      const p = prepare(
        JSON.parse(gunzipSync(m.summaryBytes)),
        JSON.parse(gunzipSync(m.timelineBytes)),
      );
      return {
        id: m.id,
        events: p.timeline.normalizedEvents.length,
        rows: p.rows.length,
      };
    } catch (e) {
      return { id: m.id, error: String(e) };
    }
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const result = {
    startedAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    experimentalHashes: Object.fromEntries(
      ['adapters.cjs', 'engine.cjs', 'run.cjs'].map((name) => [
        name,
        createHash('sha256')
          .update(fs.readFileSync(path.join(__dirname, name)))
          .digest('hex'),
      ]),
    ),
    environment: {
      node: process.version,
      cpu: os.cpus()[0].model,
      logicalCpus: os.cpus().length,
      slotsPerWorker: slots,
      load: os.loadavg(),
      workers,
      postgresCpus: 2,
      postgresMemory: '2GiB',
      nodeAffinity: execFileSync('taskset', ['-pc', String(process.pid)], {
        encoding: 'utf8',
      }).trim(),
    },
    method: {
      scope:
        'production ProcessingService from stored gzip through committed outputs; D includes both durable downstream stages; excludes acquisition and RabbitMQ delivery',
      round,
      arrivalRate,
      arrivalDispatch:
        'fixed round-robin assignment; scheduled timestamps independent of service speed',
      requested: count,
      selected: pairs.length,
      screen,
    },
    runs: [],
  };
  fs.writeFileSync(output, stringify(result) + '\n');
  const rejected = screen.filter((s) => s.error);
  if (rejected.length && options['exclude-rejected'] !== '1')
    throw Error(
      'Corpus preparation failed; inspect screen. Explicit --exclude-rejected=1 required to benchmark supported cohort.',
    );
  pairs = pairs.filter((p) => !rejected.some((r) => r.id === p.id));
  result.method.excluded = rejected;
  result.method.measured = pairs.length;
  for (const variant of variants) {
    const database = `highbr_architecture_study_${Date.now()}_${variant.toLowerCase()}_${round}`;
    const template = templates?.[variant] ?? 'highbr_architecture_study';
    assert.match(template, /^highbr_architecture_study(?:_[a-z0-9_]+)?$/);
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
      `CREATE DATABASE ${database} TEMPLATE ${template}`,
    ]);
    const db = client(database);
    await db.$connect();
    for (const m of pairs) {
      await db.matchProcessing.create({ data: { matchId: m.id } });
      await db.matchRaw.create({
        data: {
          matchId: m.id,
          summary: m.summaryBytes,
          timeline: m.timelineBytes,
        },
      });
    }
    await installView(db, variant, Boolean(templates));
    const children = Array.from({ length: workers }, () =>
      spawn({ database, variant, role: 'facts', slots }),
    );
    const downstream =
      variant === 'D'
        ? ['metrics', 'aggregates'].map((role) =>
            spawn({ database, variant, role }),
          )
        : [];
    await Promise.all([...children, ...downstream].map((c) => c.ready));
    await db.$queryRaw`SELECT pg_stat_statements_reset()::text`;
    const before = await pgSnapshot(db),
      started = performance.now(),
      startedAt = Date.now();
    const arrivals = Object.fromEntries(
      pairs.map((p, i) => [
        p.id,
        startedAt + (arrivalRate ? (i * 1000) / arrivalRate : 0),
      ]),
    );
    downstream.forEach((c) => c.proc.send({ start: true }));
    children.forEach((c, index) =>
      c.proc.send({
        ids: pairs.filter((_, i) => i % workers === index).map((p) => p.id),
        startedAt,
        arrivals,
      }),
    );
    const facts = await Promise.all(children.map((c) => c.done));
    const failed = await db.matchProcessing.findMany({
      where: {
        matchId: { in: pairs.map((p) => p.id) },
        status: { not: 'COMPLETED' },
      },
      select: { matchId: true, status: true, lastError: true },
    });
    assert.equal(failed.length, 0, stringify(failed));
    let stageRows = [];
    if (variant === 'D') {
      const deadline = Date.now() + 120000;
      while (true) {
        const [{ remaining }] =
          await db.$queryRaw`SELECT count(*)::int remaining FROM study_jobs WHERE stage<>'complete'`;
        if (!remaining) break;
        assert(Date.now() < deadline, 'Downstream did not drain');
        await pause(50);
      }
      downstream.forEach((c) => c.proc.send({ stop: true }));
      stageRows =
        await db.$queryRaw`SELECT "matchId",extract(epoch FROM (completed_at-facts_at))*1000 AS "lagMs",completed_at FROM study_jobs`;
    }
    const stages = await Promise.all(downstream.map((c) => c.done));
    const wallMs = performance.now() - started;
    await pause(1100); // PostgreSQL stats flush, excluded from measured wall time
    const after = await pgSnapshot(db);
    const relations =
      await db.$queryRaw`SELECT c.relname name,pg_total_relation_size(c.oid)::text bytes,pg_indexes_size(c.oid)::text "indexBytes" FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`;
    const sql =
      await db.$queryRaw`SELECT calls::text,total_exec_time,rows::text,wal_bytes::text,left(query,180) query FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) ORDER BY total_exec_time DESC LIMIT 20`;
    const all = [...facts, ...stages],
      cpuMs = all.reduce((s, x) => s + x.cpuMs, 0);
    const finishes =
      variant === 'D'
        ? stageRows.map((s) => ({
            matchId: s.matchId,
            finishedAt: new Date(s.completed_at).getTime(),
          }))
        : facts.flatMap((x) => x.samples);
    const backlog = [];
    for (let offsetMs = 0; offsetMs <= wallMs; offsetMs += 1000) {
      const now = startedAt + offsetMs;
      backlog.push({
        offsetMs,
        due: Object.values(arrivals).filter((t) => t <= now).length,
        completed: finishes.filter((s) => s.finishedAt <= now).length,
      });
    }
    const run = {
      variant,
      database,
      template,
      wallMs,
      matches: pairs.length,
      matchesPerSecond: (pairs.length * 1000) / wallMs,
      nodeCpuMs: cpuMs,
      postgresCpuMs: after.cpuMs - before.cpuMs,
      walBytes: after.walBytes - before.walBytes,
      responseMs: quantiles(
        finishes.map((s) => s.finishedAt - arrivals[s.matchId]),
      ),
      backlog,
      sumWorkerPeakRss: all.reduce((s, x) => s + x.rssPeak, 0),
      serviceMs: quantiles(
        facts.flatMap((x) => x.samples.map((s) => s.serviceMs)),
      ),
      availabilityMs: quantiles(
        variant === 'D'
          ? stageRows.map((s) => new Date(s.completed_at).getTime() - startedAt)
          : facts.flatMap((x) =>
              x.samples.map((s) => s.finishedAt - startedAt),
            ),
      ),
      downstreamLagMs: stageRows.length
        ? quantiles(stageRows.map((s) => Number(s.lagMs)))
        : null,
      aggregateBatchSizes: stages.find((s) => s.role === 'aggregates')?.batches,
      relations,
      sql,
      workers: all,
    };
    result.runs.push(run);
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    console.log(
      JSON.stringify({
        variant,
        database,
        matches: pairs.length,
        matchesPerSecond: run.matchesPerSecond,
        cpuMs,
        walBytes: run.walBytes,
      }),
    );
    await db.$disconnect();
  }
}
(process.env.STUDY_CHILD ? child() : main()).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
