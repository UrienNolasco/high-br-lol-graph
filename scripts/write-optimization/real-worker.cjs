/* Dedicated PostgreSQL on 55441, RabbitMQ on 55442, Redis on 55444.
 * Creates its own database/queue/containers; never resets an application DB.
 * node scripts/write-optimization/real-worker.cjs corpus output.json --seconds=1800 --rates=1,1.5,2 --workers=2 --slots=2
 * --count=119 --rates=0 runs a bounded saturation replay of the real transport.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');
const { spawn, execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const amqp = require('amqplib');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function deadline(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(label)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
let pgCgroupPath;
function pgResources() {
  if (!pgCgroupPath) {
    const pid = execFileSync(
      'docker',
      ['inspect', 'highbr-architecture-study-pg', '--format', '{{.State.Pid}}'],
      { encoding: 'utf8' },
    ).trim();
    const group = fs
      .readFileSync(`/proc/${pid}/cgroup`, 'utf8')
      .split('\n')
      .find((line) => line.startsWith('0::'));
    assert(group, 'cgroup v2 required for resource sampling');
    pgCgroupPath = path.join('/sys/fs/cgroup', group.slice(3));
  }
  const counters = Object.fromEntries(
    fs
      .readFileSync(path.join(pgCgroupPath, 'cpu.stat'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const [key, value] = line.split(/\s+/);
        return [key, Number(value)];
      }),
  );
  return {
    ...counters,
    memoryBytes: Number(
      fs.readFileSync(path.join(pgCgroupPath, 'memory.current'), 'utf8'),
    ),
  };
}
const pgCpu = () => pgResources().usage_usec / 1000;
const quantiles = (values) => {
  const xs = values.slice().sort((a, b) => a - b);
  const at = (fraction) =>
    xs[Math.max(0, Math.ceil(xs.length * fraction) - 1)] ?? null;
  return {
    n: xs.length,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: xs.at(-1) ?? null,
  };
};
async function main() {
  const [directory, output, ...args] = process.argv.slice(2);
  assert(directory && output, 'corpus and output required');
  const options = Object.fromEntries(
    args.map((s) => s.replace(/^--/, '').split('=')),
  );
  const seconds = Number(options.seconds || 1800),
    workers = Number(options.workers || 2),
    slots = Number(options.slots || 2);
  const rates = (options.rates || '1,1.5,2').split(',').map(Number);
  assert(
    seconds > 0 && workers >= 1 && workers <= 4 && slots >= 1 && slots <= 4,
  );
  assert(rates.every((n) => Number.isFinite(n) && n >= 0));
  const scheduled = [];
  if (options.count)
    for (let i = 0; i < Number(options.count); i++)
      scheduled.push(rates[0] ? (i * 1000) / rates[0] : 0);
  else
    rates.forEach((rate, stage) => {
      for (let i = 0; i < Math.floor((seconds / rates.length) * rate); i++)
        scheduled.push(
          (stage * seconds * 1000) / rates.length + (i * 1000) / rate,
        );
    });
  assert(scheduled.length > 0, 'Non-empty schedule required');
  assert(
    [seconds, workers, slots].every(Number.isInteger),
    'Integer limits required',
  );
  const stamp = Date.now(),
    database = `highbr_architecture_study_write_${stamp}_real`,
    queue = `highbr_write_${stamp}`;
  const report = {
    startedAt: new Date().toISOString(),
    runtimeImageId: execFileSync(
      'docker',
      ['image', 'inspect', 'highbr-write-runtime', '--format', '{{.Id}}'],
      { encoding: 'utf8' },
    ).trim(),
    compiledHashes: Object.fromEntries(
      [
        'main.js',
        'modules/worker/worker.controller.js',
        'modules/worker/delivery-gate.js',
        'modules/matches/adapters/persistence/event-recordset.js',
        'modules/dataset/adapters/dataset-recordset.js',
        'modules/stats/adapters/persistence/player-stats-writer.js',
        'core/prisma/recordset-json.js',
        'core/queue/queue.service.js',
        'core/queue/queue.module.js',
      ].map((file) => [
        file,
        createHash('sha256')
          .update(fs.readFileSync(path.join(root, 'dist', file)))
          .digest('hex'),
      ]),
    ),
    database,
    queue,
    options: { seconds, workers, slots, rates, count: scheduled.length },
    method: {
      scope:
        'Real dist/main.js AppModule + Nest RMQ transport in containers; preloaded raw; HTTP reads during growing database',
      workerCpuTotal: 2,
      workerAffinity: '0,2',
      memoryBytesPerWorker: (2 * 1073741824) / workers,
      postgresAffinity: '4,5',
      postgresMemoryBytes: 2147483648,
      poolPerWorker: 3,
      excluded: ['BR1_3283642155'],
      syntheticReplayIds: true,
    },
    arrivals: {},
    samples: [],
    reads: [],
    runtime: [],
    errors: [],
    completed: [],
    deliveries: [],
    containers: [],
    shutdown: [],
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const save = () =>
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  save();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, 'manifest.json')),
  );
  const sources = manifest.matches
    .filter(
      (m) =>
        m.mapId === 11 &&
        [420, 440].includes(m.queueId) &&
        !report.method.excluded.includes(m.id),
    )
    .slice(0, 119)
    .map((m) => {
      const read = (field) => {
        const bytes = fs.readFileSync(path.join(directory, m[field]));
        assert.equal(
          createHash('sha256').update(bytes).digest('hex'),
          m[field + 'Sha256'],
        );
        return JSON.parse(gunzipSync(bytes));
      };
      return { id: m.id, summary: read('summary'), timeline: read('timeline') };
    });
  assert.equal(sources.length, 119);
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
  const url = `postgresql://integration:integration@127.0.0.1:55441/${database}?connection_limit=3&pool_timeout=30`;
  const db = new PrismaClient({ datasourceUrl: url });
  const ids = scheduled.map(
    (_, i) =>
      `WOPT_${String(i).padStart(6, '0')}_${sources[i % sources.length].id}`,
  );
  report.ids = ids;
  // Raw has a job FK. Defer the job while preloading, so the real recovery
  // scheduler cannot dispatch it before the offered arrival.
  const heldUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  report.method.admission =
    'Preloaded jobs held with future nextAttemptAt; each arrival activates the job, confirms RMQ publication and records publishedAt; recovery stays enabled.';
  for (let offset = 0; offset < ids.length; offset += 20) {
    const batch = ids.slice(offset, offset + 20);
    await db.matchProcessing.createMany({
      data: batch.map((matchId) => ({ matchId, nextAttemptAt: heldUntil })),
    });
    await db.matchRaw.createMany({
      data: batch.map((matchId, j) => {
        const source = sources[(offset + j) % sources.length];
        return {
          matchId,
          summary: gzipSync(
            JSON.stringify({
              ...source.summary,
              metadata: { ...source.summary.metadata, matchId },
            }),
          ),
          timeline: gzipSync(
            JSON.stringify({
              ...source.timeline,
              metadata: { ...source.timeline.metadata, matchId },
            }),
          ),
        };
      }),
    });
    if (offset % 200 === 0)
      console.log('seeded', offset, batch.length, ids.length);
  }
  report.seedFinishedAt = new Date().toISOString();
  save();
  const broker = await amqp.connect('amqp://guest:guest@127.0.0.1:55442');
  const channel = await broker.createConfirmChannel();
  await channel.assertQueue(queue, {
    durable: true,
    arguments: { 'x-max-priority': 10 },
  });
  const offer = async (matchId, pattern, traceId) => {
    await db.matchProcessing.update({
      where: { matchId },
      data: { nextAttemptAt: new Date() },
    });
    const publishedAt = new Date();
    await new Promise((resolve, reject) =>
      channel.sendToQueue(
        queue,
        Buffer.from(
          JSON.stringify({
            pattern,
            data: { matchId, ...(traceId ? { traceId } : {}) },
          }),
        ),
        { persistent: true, priority: 1, timestamp: publishedAt.getTime() },
        (error) => (error ? reject(error) : resolve()),
      ),
    );
    await db.matchProcessing.updateMany({
      where: { matchId, status: { in: ['PENDING', 'RETRY_WAIT'] } },
      data: { publishedAt },
    });
  };
  const children = [];
  const logdir = path.join(root, '.tmp/write-optimization', queue);
  fs.mkdirSync(logdir, { recursive: true });
  const completion = new Map(),
    arrival = new Map(),
    active = new Map();
  const deliveryPeaks = new Map();
  let measuredAt = 0,
    stopReaders = false,
    readsPromise = Promise.resolve();
  const spawnApp = (index, api = false) => {
    const name = `highbr-write-${stamp}-${api ? 'api' : index}`;
    const env = {
      APP_MODE: api ? 'API' : 'WORKER',
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      DATABASE_URL: url,
      RABBITMQ_URL: 'amqp://guest:guest@127.0.0.1:55442',
      RABBITMQ_QUEUE: queue,
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '55444',
      COLLECTOR_ENABLED: 'false',
      RIOT_API_KEY: 'offline-validation-no-key',
      WORKER_CONCURRENCY: String(slots),
      PORT: '55445',
      NODE_OPTIONS: `--max-old-space-size=${api ? 768 : Math.floor(1536 / workers)}`,
    };
    const dockerArgs = [
      'run',
      '--rm',
      '--name',
      name,
      '--network',
      'host',
      '--cpuset-cpus',
      api ? '6' : '0,2',
      '--cpus',
      String(api ? 1 : 2 / workers),
      '--memory',
      `${api ? 1024 : Math.floor(2048 / workers)}m`,
      '--memory-swap',
      `${api ? 1024 : Math.floor(2048 / workers)}m`,
    ];
    for (const item of [
      'dist',
      'node_modules',
      'champions.json',
      'scripts/write-optimization/worker-telemetry.cjs',
    ])
      dockerArgs.push('-v', `${path.join(root, item)}:/app/${item}:ro`);
    for (const [key, value] of Object.entries(env))
      dockerArgs.push('-e', `${key}=${value}`);
    dockerArgs.push(
      'highbr-write-runtime',
      'node',
      '--require',
      './scripts/write-optimization/worker-telemetry.cjs',
      'dist/main.js',
    );
    const proc = spawn('docker', dockerArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const log = fs.createWriteStream(path.join(logdir, name + '.log'));
    let resolveReady, rejectReady, resolveExit;
    const ready = new Promise((r, j) => {
      resolveReady = r;
      rejectReady = j;
    });
    ready.catch(() => {});
    const exited = new Promise((r) => (resolveExit = r));
    const child = { name, proc, ready, exited, api };
    children.push(child);
    report.containers.push({ name, api, cpus: api ? 1 : 2 / workers });
    active.set(name, new Set());
    deliveryPeaks.set(name, 0);
    let buffer = '';
    proc.stdout.on('data', (chunk) => {
      log.write(chunk);
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let value;
        try {
          value = JSON.parse(line);
        } catch {
          continue;
        }
        if (value.event === 'app_started') resolveReady();
        if (value.event === 'validation_runtime')
          report.runtime.push({ ...value, container: name });
        if (value.event === 'match_received') {
          active.get(name).add(value.matchId);
          deliveryPeaks.set(
            name,
            Math.max(deliveryPeaks.get(name), active.get(name).size),
          );
          report.deliveries.push({
            event: 'received',
            container: name,
            matchId: value.matchId,
            time: value.time,
          });
        }
        if (value.event === 'match_failed')
          active.get(name).delete(value.matchId);
        if (value.event === 'match_delivery_handled') {
          active.get(name).delete(value.matchId);
          report.deliveries.push({
            event: 'ack',
            container: name,
            matchId: value.matchId,
            time: value.time,
          });
        }
        if (value.event === 'match_processing_completed') {
          completion.set(value.matchId, value.time);
          report.completed.push({
            matchId: value.matchId,
            time: value.time,
            duration: value.duration,
            attempts: value.attempts,
          });
        }
        if (['error', 'fatal', 'warn'].includes(value.level))
          report.errors.push({ container: name, ...value });
      }
    });
    proc.stderr.on('data', (chunk) => {
      log.write(chunk);
      report.errors.push({
        container: name,
        stderr: String(chunk).slice(0, 1000),
      });
    });
    proc.on('close', (code, signal) => {
      log.end();
      rejectReady(Error(`${name} exited before ready: ${code}/${signal}`));
      resolveExit({ code, signal });
    });
    return child;
  };
  const terminate = async (child) => {
    const started = Date.now(),
      inFlight = [...active.get(child.name)];
    try {
      execFileSync('docker', ['kill', '--signal=SIGTERM', child.name], {
        stdio: 'ignore',
      });
    } catch {}
    const result = await deadline(
      child.exited,
      60000,
      'shutdown timeout',
    ).catch(() => ({ timeout: true }));
    if (result.timeout) {
      try {
        execFileSync('docker', ['kill', child.name], { stdio: 'ignore' });
      } catch {}
    }
    report.shutdown.push({
      name: child.name,
      started,
      inFlight,
      ms: Date.now() - started,
      result,
      completedAtExit: inFlight.filter((id) => completion.has(id)),
    });
  };
  try {
    for (let i = 0; i < workers; i++) spawnApp(i);
    if (options.reads !== '0') spawnApp(0, true);
    await deadline(
      Promise.all(children.map((c) => c.ready)),
      60000,
      'App startup timed out',
    );
    // Warm all consumers using a real message; repeat IDs later exercises redelivery.
    for (let i = 0; i < Math.min(4, ids.length); i++)
      await offer(ids[i], 'match.collect');
    const warmDeadline = Date.now() + 60000;
    while (completion.size < Math.min(4, ids.length)) {
      assert(Date.now() < warmDeadline, 'warmup failed');
      await pause(100);
    }
    const warmIds = [...completion.keys()];
    report.warmup = { ids: warmIds };
    completion.clear();
    report.completed = [];
    report.deliveries = [];
    report.runtime = [];
    for (const [name, set] of active) {
      set.clear();
      deliveryPeaks.set(name, 0);
    }
    // Warm IDs are already committed and are excluded from throughput numerator.
    measuredAt = Date.now();
    report.measuredAt = measuredAt;
    report.postgresCpuBefore = pgCpu();
    const [before] =
      await db.$queryRaw`SELECT wal_bytes::text FROM pg_stat_wal`;
    report.walBefore = before.wal_bytes;
    const sample = async () => {
      const now = Date.now(),
        pending = [...arrival].filter(
          ([id]) => !completion.has(id) && !warmIds.includes(id),
        );
      const [state] =
        await db.$queryRaw`SELECT count(*) FILTER(WHERE wait_event_type='Lock')::int locks,count(*) FILTER(WHERE state='active')::int active FROM pg_stat_activity WHERE datname=current_database()`;
      report.samples.push({
        atMs: now - measuredAt,
        offered: arrival.size,
        completed: completion.size,
        oldestPendingMs: pending.length
          ? now - Math.min(...pending.map(([, at]) => at))
          : 0,
        active: Object.fromEntries(
          [...active].map(([name, set]) => [name, set.size]),
        ),
        database: state,
        postgresResources: pgResources(),
        queue: await channel.checkQueue(queue),
      });
      save();
    };
    if (options.reads !== '0')
      readsPromise = (async () => {
        const sample = sources[0].summary.info.participants[0];
        let turn = 0;
        while (!stopReaders) {
          const params =
            turn++ % 2
              ? {
                  playerId: sample.puuid,
                  definitionId: 'snapshot.totalGold',
                  eligibleOnly: 'false',
                  limit: '20',
                }
              : {
                  championId: String(sample.championId),
                  role: sample.teamPosition,
                  eligibleOnly: 'false',
                  limit: '20',
                };
          const started = Date.now();
          try {
            const response = await fetch(
              'http://127.0.0.1:55445/api/v1/dataset?' +
                new URLSearchParams(params),
              { signal: AbortSignal.timeout(35000) },
            );
            const body = await response.json();
            report.reads.push({
              atMs: started - measuredAt,
              params,
              ms: Date.now() - started,
              status: response.status,
              rows: body.rows?.length,
              error: body.message,
            });
          } catch (error) {
            report.reads.push({
              atMs: started - measuredAt,
              params,
              ms: Date.now() - started,
              error: String(error),
            });
          }
          await pause(10000);
        }
      })();
    let sampling = false;
    const interval = setInterval(() => {
      if (!sampling) {
        sampling = true;
        sample()
          .catch((error) => report.errors.push({ sampling: String(error) }))
          .finally(() => (sampling = false));
      }
    }, 10000);
    try {
      for (let i = 0; i < ids.length; i++) {
        const at = measuredAt + scheduled[i];
        if (Date.now() < at) await pause(at - Date.now());
        arrival.set(ids[i], Date.now());
        report.arrivals[ids[i]] = arrival.get(ids[i]);
        assert(
          [...completion.keys()].every((id) => arrival.has(id)),
          'A job completed before its offered arrival',
        );
        await offer(
          ids[i],
          i % 2 ? 'user.update' : 'match.collect',
          `write-validation-${stamp}-${i}`,
        );
      }
      await channel.waitForConfirms();
      if (!options.count && Date.now() < measuredAt + seconds * 1000)
        await pause(measuredAt + seconds * 1000 - Date.now());
      report.offeringFinishedAt = Date.now();
      const deadline = Date.now() + 300000;
      while (completion.size < ids.length - warmIds.length) {
        assert(Date.now() < deadline, 'Queue did not drain');
        await pause(1000);
      }
      report.drainedAt = Date.now();
      await sample();
    } finally {
      clearInterval(interval);
      stopReaders = true;
      await readsPromise;
    }
    const [after] = await db.$queryRaw`SELECT wal_bytes::text FROM pg_stat_wal`;
    report.walAfter = after.wal_bytes;
    report.postgresCpuMs = pgCpu() - report.postgresCpuBefore;
    assert(
      [...completion.keys()].every((id) => arrival.has(id)),
      'A job completed before its offered arrival',
    );
    report.arrivals = Object.fromEntries(arrival);
    report.jobStates = await db.matchProcessing.groupBy({
      by: ['status', 'attempts'],
      _count: true,
    });
    const [counts] =
      await db.$queryRaw`SELECT (SELECT count(*)::int FROM matches) matches,(SELECT count(*)::int FROM historical_metric_contributions) contributions,(SELECT sum("gamesPlayed")::int FROM champion_stats) "championGames",(SELECT sum("gamesPlayed")::int FROM player_stats WHERE patch='ALL') "playerGames"`;
    report.counts = counts;
    assert.equal(counts.matches, ids.length);
    assert.equal(counts.contributions, ids.length * 877);
    assert.equal(counts.championGames, ids.length * 10);
    assert.equal(counts.playerGames, ids.length * 10);
    assert(
      report.jobStates.every(
        (s) => s.status === 'COMPLETED' && s.attempts === 1,
      ),
      'unexpected retries/failures',
    );
    report.throughput =
      ((ids.length - warmIds.length) * 1000) / (report.drainedAt - measuredAt);
    report.responseMs = quantiles(
      report.completed.map((s) => s.time - arrival.get(s.matchId)),
    );
    report.serviceMs = quantiles(report.completed.map((s) => s.duration));
    report.readMs = quantiles(report.reads.map((s) => s.ms));
    report.maxActive = Object.fromEntries(
      children
        .filter((c) => !c.api)
        .map((c) => [c.name, deliveryPeaks.get(c.name)]),
    );
    assert(
      Object.values(report.maxActive).every((n) => n <= slots),
      'execution limit exceeded',
    );
    // Graceful shutdown under new, real work; leave a second consumer available.
    if (options['shutdown-probe'] === '1') {
      const matchId = `WOPT_SHUTDOWN_${stamp}`,
        source = sources[0];
      await db.matchProcessing.create({
        data: { matchId, nextAttemptAt: heldUntil },
      });
      await db.matchRaw.create({
        data: {
          matchId,
          summary: gzipSync(
            JSON.stringify({
              ...source.summary,
              metadata: { ...source.summary.metadata, matchId },
            }),
          ),
          timeline: gzipSync(
            JSON.stringify({
              ...source.timeline,
              metadata: { ...source.timeline.metadata, matchId },
            }),
          ),
        },
      });
      await offer(matchId, 'match.collect');
      let target;
      const deadline = Date.now() + 10000;
      while (!target) {
        target = children.find((c) => active.get(c.name).has(matchId));
        assert(Date.now() < deadline, 'shutdown probe not received');
        if (!target) await pause(5);
      }
      await terminate(target);
      const job = await db.matchProcessing.findUniqueOrThrow({
        where: { matchId },
      });
      report.shutdownProbe = {
        matchId,
        status: job.status,
        attempts: job.attempts,
      };
      assert.equal(job.status, 'COMPLETED');
      assert.equal(job.attempts, 1);
    }
  } catch (error) {
    report.failure = String(error.stack || error);
    throw error;
  } finally {
    stopReaders = true;
    for (const child of children)
      if (!report.shutdown.some((s) => s.name === child.name))
        await terminate(child);
    await channel.deleteQueue(queue);
    await broker.close();
    await db.$disconnect();
    report.finishedAt = new Date().toISOString();
    save();
  }
  console.log(
    JSON.stringify({
      output,
      database,
      throughput: report.throughput,
      responseMs: report.responseMs,
      readMs: report.readMs,
      errors: report.errors.length,
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
