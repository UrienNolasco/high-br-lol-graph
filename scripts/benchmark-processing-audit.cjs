/* Investigation harness: compiled processing, isolated PostgreSQL, no external API.
 * Requires an EMPTY database named highbr_processing_audit_*_integration.
 * Does not reset/delete data. See docs/analysis/processing-performance-audit.md.
 */
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { gzipSync, gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const from = (name) => require(path.join(root, 'dist', name));
const { PrismaService } = from('core/prisma/prisma.service');
const { createProcessingComposition } = from('composition/processing');
const { PROCESSING_VERSION } = from(
  'modules/processing/contracts/processing.constants',
);
const { PinoLogger } = require('nestjs-pino');
const { RiotMatchPreparer } = from(
  'modules/matches/adapters/riot/match-preparer',
);
const { TimelineParserService } = from(
  'modules/matches/adapters/riot/timeline-parser.service',
);
const { DatasetPersistenceAdapter } = from(
  'modules/dataset/adapters/dataset-writer.adapter',
);
const { MatchProjectionPersistenceAdapter } = from(
  'modules/matches/adapters/persistence/match-projection-writer',
);
const { PlayerStatsAggregationService } = from(
  'modules/stats/adapters/persistence/player-stats-writer',
);
const quantiles = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    p50: s[Math.ceil(s.length * 0.5) - 1],
    p95: s[Math.ceil(s.length * 0.95) - 1],
    max: s.at(-1),
  };
};
let phases = {},
  queries = {},
  recording = false;
function wrap(proto, method, label, sync = false) {
  const original = proto[method];
  const record = (start) => {
    if (recording) (phases[label] ??= []).push(performance.now() - start);
  };
  proto[method] = sync
    ? function (...args) {
        const start = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          record(start);
        }
      }
    : async function (...args) {
        const start = performance.now();
        try {
          return await original.apply(this, args);
        } finally {
          record(start);
        }
      };
}
wrap(RiotMatchPreparer.prototype, 'prepare', 'prepareMatch', true);
wrap(DatasetPersistenceAdapter.prototype, 'prepare', 'prepareDataset', true);
wrap(MatchProjectionPersistenceAdapter.prototype, 'write', 'writeProjection');
wrap(DatasetPersistenceAdapter.prototype, 'write', 'writeDataset');
wrap(PlayerStatsAggregationService.prototype, 'update', 'writeStats');
const { ProcessingService } = from(
  'modules/processing/services/processing.service',
);
for (const name of ['enqueue', 'claim', 'readRaw', 'publish'])
  wrap(ProcessingService.prototype, name, name);
async function main() {
  const url = process.env.TEST_DATABASE_URL;
  assert(
    url &&
      /^\/highbr_processing_audit_[a-zA-Z0-9_]+_integration$/.test(
        new URL(url).pathname,
      ),
    'Use a dedicated audit integration database',
  );
  const output = process.argv[2];
  assert(output, 'Pass JSON output path');
  const prisma = new PrismaService({
    datasourceUrl: url,
    log: [{ emit: 'event', level: 'query' }],
  });
  prisma.$on('query', (e) => {
    if (!recording) return;
    const normalized = e.query.replace(/\s+/g, ' ').trim();
    const table = normalized.match(
      /(?:INTO|UPDATE|FROM)\s+(?:"public"\.)?"?([a-z_]+)"?/i,
    )?.[1];
    const key = `${normalized.split(' ')[0]} ${table ?? (normalized.includes('pg_advisory') ? 'advisory' : 'control')}`;
    const entry = (queries[key] ??= {
      count: 0,
      engineDurationMs: 0,
      sqlBytes: 0,
    });
    entry.count++;
    entry.engineDurationMs += e.duration;
    entry.sqlBytes += Buffer.byteLength(e.query);
  });
  try {
    await prisma.$connect();
    assert.equal(
      await prisma.matchProcessing.count(),
      0,
      'Database must be empty; this script never resets it',
    );
    assert.equal(await prisma.match.count(), 0, 'Database must be empty');
    const files = [
      'exemplo_partida_BR1_3200579475.json',
      'exemplo_partida_timeline_BR1_3200579475.json',
    ];
    const buffers = files.map((f) => fs.readFileSync(path.join(root, f)));
    const [summary, timeline] = buffers.map((b) => JSON.parse(b));
    const result = {
      measuredAt: new Date().toISOString(),
      commit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      environment: {
        node: process.version,
        prisma: require('@prisma/client/package.json').version,
        cpu: os.cpus()[0].model,
        logicalCpus: os.cpus().length,
        memoryBytes: os.totalmem(),
        loadStart: os.loadavg(),
        postgres: (await prisma.$queryRawUnsafe('SHOW server_version'))[0]
          .server_version,
      },
      method: {
        independentRealMatches: 1,
        fixtureHashes: buffers.map((b) =>
          createHash('sha256').update(b).digest('hex'),
        ),
        concurrency:
          'one Node process; concurrent calls, NOT independent worker processes',
        samplesPerScenario: 8,
        warmups: 2,
        rawSeedExcluded: true,
        externalNetwork: false,
        queryInstrumentation: true,
        phaseTimingsOverlap:
          'publish contains dataset preparation and all writers; do not sum it with nested phases',
        quantile: 'nearest rank; n=8 p95 is max; exploratory only',
      },
      pure: {},
      scenarios: [],
    };
    for (const [name, fn] of Object.entries({
      gzipSummary: () => gzipSync(buffers[0]),
      gzipTimeline: () => gzipSync(buffers[1]),
      readTimeline: (() => {
        const zipped = gzipSync(buffers[1]);
        return () => JSON.parse(gunzipSync(zipped).toString('utf8'));
      })(),
    })) {
      for (let i = 0; i < 5; i++) fn();
      const samples = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        fn();
        samples.push(performance.now() - start);
      }
      result.pure[name] = quantiles(samples);
    }
    const { processing } = createProcessingComposition({
      prisma,
      logger: new PinoLogger({ pinoHttp: { level: 'silent' } }),
      source: {
        getMatchById() {
          throw Error('No external calls');
        },
        getTimeline() {
          throw Error('No external calls');
        },
      },
    });
    const seed = async (id, distinct) => {
      const s = structuredClone(summary),
        t = structuredClone(timeline);
      s.metadata.matchId = t.metadata.matchId = id;
      if (distinct) {
        const mapping = new Map(
          s.info.participants.map((p, i) => [p.puuid, `${id}_p${i}`]),
        );
        s.info.participants.forEach((p) => (p.puuid = mapping.get(p.puuid)));
        s.metadata.participants = s.metadata.participants.map((p) =>
          mapping.get(p),
        );
        t.metadata.participants = t.metadata.participants.map((p) =>
          mapping.get(p),
        );
      }
      await processing.enqueue(id);
      await prisma.matchRaw.create({
        data: {
          matchId: id,
          summary: gzipSync(JSON.stringify(s)),
          timeline: gzipSync(JSON.stringify(t)),
        },
      });
    };
    for (let i = 0; i < 2; i++) {
      await seed(`AUDIT_WARM_${i}`, false);
      await processing.processMatch({ matchId: `AUDIT_WARM_${i}` });
    }
    for (const [concurrency, distinct] of [
      [1, false],
      [2, false],
      [4, false],
      [4, true],
    ]) {
      const ids = Array.from(
        { length: 8 },
        (_, i) =>
          `AUDIT_C${concurrency}_${distinct ? 'DISTINCT' : 'SHARED'}_${i}`,
      );
      for (const id of ids) await seed(id, distinct);
      phases = {};
      queries = {};
      const times = [];
      let next = 0;
      const delay = monitorEventLoopDelay({ resolution: 10 });
      delay.enable();
      const elu = performance.eventLoopUtilization(),
        cpu = process.cpuUsage(),
        started = performance.now();
      recording = true;
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (next < ids.length) {
            const id = ids[next++],
              start = performance.now();
            await processing.processMatch({ matchId: id });
            times.push(performance.now() - start);
          }
        }),
      );
      const elapsedMs = performance.now() - started,
        usedCpu = process.cpuUsage(cpu),
        usedElu = performance.eventLoopUtilization(elu);
      recording = false;
      delay.disable();
      const status = await prisma.matchProcessing.groupBy({
        by: ['status'],
        where: { matchId: { in: ids } },
        _count: true,
      });
      assert.deepEqual(status, [{ _count: 8, status: 'COMPLETED' }]);
      const row = {
        concurrency,
        distinctPlayers: distinct,
        elapsedMs,
        matchesPerSecond: 8000 / elapsedMs,
        latencyMs: quantiles(times),
        cpuMs: { user: usedCpu.user / 1000, system: usedCpu.system / 1000 },
        processCpuCores: (usedCpu.user + usedCpu.system) / (elapsedMs * 1000),
        eventLoopUtilization: usedElu.utilization,
        eventLoopDelayMs: {
          p95: delay.percentile(95) / 1e6,
          max: delay.max / 1e6,
        },
        rssBytes: process.memoryUsage().rss,
        phases: Object.fromEntries(
          Object.entries(phases).map(([k, v]) => [k, quantiles(v)]),
        ),
        queries,
        status,
      };
      result.scenarios.push(row);
      console.log(
        JSON.stringify({
          concurrency,
          distinctPlayers: distinct,
          matchesPerSecond: row.matchesPerSecond,
          phases: row.phases,
        }),
      );
    }
    result.rows = {
      matches: await prisma.match.count(),
      events: await prisma.matchEventProjection.count(),
      dataset: await prisma.historicalMetricContribution.count(),
    };
    result.relationSizes = await prisma.$queryRawUnsafe(
      `SELECT relname,pg_relation_size(relid)::float8 AS heap_bytes,pg_indexes_size(relid)::float8 AS index_bytes,pg_total_relation_size(relid)::float8 AS total_bytes FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC`,
    );
    result.environment.loadEnd = os.loadavg();
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
