/* MET33: compiled application + real disposable PostgreSQL, no external services. */
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { PinoLogger } = require('nestjs-pino');
const from = (file) => require(path.resolve(__dirname, '../dist', file));
const { PrismaService } = from('core/prisma/prisma.service');
const { PROCESSING_VERSION } = from(
  'modules/processing/contracts/processing.constants',
);
const { createProcessingComposition } = from(
  'composition/processing',
);
const {
  WorkerService,
  ReportRepository,
  MatchReportService,
  MatchReportController,
} = from('composition/study-api');
const { unavailableItemCatalog } = from('modules/matches/contracts/catalogs');
const { unavailableSkillCatalog } = from('modules/matches/contracts/catalogs');
const { VISION_WARD_TYPES } = from(
  'modules/matches/contracts/calculations/vision',
);
const root = path.resolve(__dirname, '..');
const option = (key) => {
  const i = process.argv.indexOf(key);
  if (i < 0) return null;
  assert(
    process.argv[i + 1] && !process.argv[i + 1].startsWith('--'),
    `Missing ${key} value`,
  );
  return process.argv[i + 1];
};
const baseline = option('--baseline')
  ? JSON.parse(fs.readFileSync(option('--baseline'), 'utf8'))
  : null;
const outputPath = path.resolve(
  option('--output') ||
    path.join(root, 'docs/analysis/met33-release-benchmark.json'),
);
if (option('--baseline'))
  assert.notEqual(
    path.resolve(option('--baseline')),
    outputPath,
    'Choose --output different from the baseline; it must be preserved',
  );
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const json = (value) =>
  JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : json(value))
    .digest('hex');
const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return {
    n: sorted.length,
    min: sorted[0],
    p50: q(0.5),
    p95: q(0.95),
    max: sorted.at(-1),
    samples: values,
  };
};
async function main() {
  const loadAverageAtStart = os.loadavg();
  const url = process.env.TEST_DATABASE_URL;
  assert(
    url && new URL(url).pathname.endsWith('_integration'),
    'Requires disposable *_integration database',
  );
  assert(
    PROCESSING_VERSION >= 4,
    'Build generation4+ before measuring dataset',
  );
  assert(
    process.argv.includes('--reset-disposable'),
    'Explicit --reset-disposable required; clears test matches/jobs/aggregates',
  );
  const prisma = new PrismaService({ datasourceUrl: url });
  let app;
  let networkCalls = 0;
  let rawReads = 0;
  const forbidden = () => {
    networkCalls++;
    throw Error('External network is forbidden in benchmark');
  };
  try {
    await prisma.$connect();
    await prisma.$transaction([
      prisma.discoveryObservation.deleteMany(),
      prisma.match.deleteMany(),
      prisma.playerStats.deleteMany(),
      prisma.playerChampionStats.deleteMany(),
      prisma.championStats.deleteMany(),
      prisma.matchProcessing.deleteMany(),
      prisma.processingMaintenance.deleteMany(),
    ]);
    const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
    const { processing: jobs, rebuild } = createProcessingComposition({
      prisma,
      source: { getMatchById: forbidden, getTimeline: forbidden },
      logger,
    });
    const worker = new WorkerService(jobs, logger);
    const sourceSummary = read('exemplo_partida_BR1_3200579475.json');
    const sourceTimeline = read('exemplo_partida_timeline_BR1_3200579475.json');
    const ids = ['MET33_0', 'MET33_1', 'MET33_2'];
    const puuid = sourceSummary.info.participants.find(
      (p) => p.championName === 'Fiora',
    ).puuid;
    for (const [i, matchId] of ids.entries()) {
      const summary = structuredClone(sourceSummary),
        timeline = structuredClone(sourceTimeline);
      summary.metadata.matchId = timeline.metadata.matchId = matchId;
      summary.info.gameCreation += i * 86400000;
      await jobs.enqueue(matchId);
      await prisma.matchRaw.create({
        data: {
          matchId,
          summary: gzipSync(json(summary)),
          timeline: gzipSync(json(timeline)),
        },
      });
    }
    const ingestMs = [];
    for (const matchId of ids) {
      const start = performance.now();
      await worker.processMatch({ matchId });
      ingestMs.push(performance.now() - start);
      assert.equal(
        (await prisma.matchProcessing.findUniqueOrThrow({ where: { matchId } }))
          .status,
        'COMPLETED',
      );
    }
    const rawHashes = async () =>
      (await prisma.matchRaw.findMany({ orderBy: { matchId: 'asc' } })).map(
        (r) => ({
          matchId: r.matchId,
          summary: hash(Buffer.from(r.summary).toString('hex')),
          timeline: hash(Buffer.from(r.timeline).toString('hex')),
        }),
      );
    const durable = async () =>
      (
        await prisma.historicalMetricContribution.findMany({
          orderBy: { id: 'asc' },
        })
      ).map(({ processedAt, ...row }) => row);
    const initialDataset = await durable();
    for (const matchId of ids) {
      const rows = initialDataset.filter((r) => r.matchId === matchId);
      assert(rows.length > 0, `Missing materialization: ${matchId}`);
      for (const usage of ['predictive', 'descriptive', 'label'])
        assert(
          rows.some((r) => r.usage === usage),
          `Missing ${usage}: ${matchId}`,
        );
      assert(rows.every((r) => r.processingVersion === PROCESSING_VERSION));
    }
    const beforeRaw = await rawHashes(),
      beforeDataset = hash(initialDataset);
    const startRebuild = performance.now();
    const rebuilt = await rebuild.run();
    const rebuildMs = performance.now() - startRebuild;
    assert.equal(rebuilt, ids.length);
    assert.deepEqual(await rawHashes(), beforeRaw);
    assert.equal(
      hash(await durable()),
      beforeDataset,
      'Rebuild must preserve logical contributions',
    );
    const storage = await prisma.$queryRawUnsafe(`SELECT
      (SELECT coalesce(sum(octet_length(summary)+octet_length(timeline)),0)::text FROM "match_raw") AS "rawGzipBytes",
      (SELECT coalesce(sum(pg_column_size(t)),0)::text FROM "matches" t) AS "matchRowBytes",
      (SELECT coalesce(sum(pg_column_size(t)),0)::text FROM "match_participants" t) AS "participantRowBytes",
      (SELECT coalesce(sum(pg_column_size(t)),0)::text FROM "match_teams" t) AS "teamRowBytes",
      (SELECT coalesce(sum(pg_column_size(t)),0)::text FROM "match_timeline_projections" t) AS "timelineRowBytes",
      (SELECT coalesce(sum(pg_column_size(t)),0)::text FROM "match_event_projections" t) AS "eventRowBytes",
      (SELECT coalesce(sum(pg_column_size(t)),0)::text FROM "historical_metric_contributions" t) AS "datasetRowBytes"`);
    const events = await prisma.matchEventProjection.groupBy({
      by: ['type'],
      _count: true,
    });
    const sourceEvents = await prisma.matchEventProjection.findMany({
      where: { matchId: ids[0] },
      select: { type: true, payload: true, quality: true },
    });
    const unknownEvents = sourceEvents.filter(
      (e) => e.quality.unknownType,
    ).length;
    const wards = sourceEvents.filter((e) =>
      ['WARD_PLACED', 'WARD_KILL'].includes(e.type),
    );
    const unknownWards = wards.filter(
      (e) => !VISION_WARD_TYPES.includes(e.payload.wardType),
    ).length;
    const featureCoverage = await prisma.historicalMetricContribution.groupBy({
      by: [
        'definitionId',
        'definitionVersion',
        'usage',
        'horizonKey',
        'eligible',
        'reason',
      ],
      _count: true,
      _sum: { validCount: true, sampleCount: true },
    });
    const projection = await prisma.matchTimelineProjection.findFirstOrThrow();
    const datasetRows = await prisma.historicalMetricContribution.count();
    // Intercepts every Prisma operation, including transactions used by GET.
    let reading = false;
    const readPrisma = prisma.$extends({
      query: {
        $allModels: {
          $allOperations({ model, args, query }) {
            if (reading && model === 'MatchRaw') {
              rawReads++;
              throw Error('GET must not read MatchRaw');
            }
            return query(args);
          },
        },
      },
    });
    const service = new MatchReportService(new ReportRepository(readPrisma), {
      getCachedItemCatalog: unavailableItemCatalog,
      getCachedSkillCatalog: unavailableSkillCatalog,
      getItemCatalogForGameVersion: forbidden,
      getSkillCatalogForGameVersion: forbidden,
    });
    class BenchmarkModule {}
    Module({
      controllers: [MatchReportController],
      providers: [{ provide: MatchReportService, useValue: service }],
    })(BenchmarkModule);
    app = await NestFactory.create(BenchmarkModule, { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const base = `/api/v1/matches/${ids[0]}/report/${puuid}`;
    reading = true;
    const get = async (route) => {
      const started = performance.now();
      const response = await fetch(origin + route);
      const body = await response.text();
      assert.equal(response.status, 200, body.slice(0, 200));
      return {
        ms: performance.now() - started,
        bytes: Buffer.byteLength(body),
        body: JSON.parse(body),
      };
    };
    const initial = await get(base),
      metric = initial.body.dimensions[0].metrics[0];
    const detail = await get(metric.href);
    const routes = {
      summary: base,
      metric: metric.href,
      evidence: detail.body.evidence.items[0].href,
      episodes: base + '/episodes?kind=death&limit=10',
      economy: base + '/families/economy?section=checkpoints',
      vision: base + '/families/vision?section=objectiveWindows',
    };
    const timings = {};
    for (const [name, route] of Object.entries(routes)) {
      for (let i = 0; i < 2; i++) await get(route);
      const samples = [];
      for (let i = 0; i < 20; i++) {
        const { ms, bytes } = await get(route);
        samples.push({ ms, bytes });
      }
      timings[name] = {
        route,
        latencyMs: stats(samples.map((s) => s.ms)),
        payloadBytes: stats(samples.map((s) => s.bytes)),
      };
    }
    reading = false;
    assert.equal(networkCalls, 0);
    assert.equal(rawReads, 0);
    assert.deepEqual(await rawHashes(), beforeRaw);
    const result = {
      schemaVersion: 1,
      measuredAt: new Date().toISOString(),
      processingVersion: PROCESSING_VERSION,
      environment: {
        loadAverageAtStart,
        loadAverageAtEnd: os.loadavg(),
        isolation: 'shared local workstation; CPU not pinned',
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu: os.cpus()[0]?.model,
        logicalCpus: os.cpus().length,
        totalMemoryBytes: os.totalmem(),
        postgres: (await prisma.$queryRawUnsafe('SHOW server_version'))[0]
          .server_version,
      },
      corpus: {
        sourceMatchId: sourceSummary.metadata.matchId,
        independentRealMatches: 1,
        syntheticLoadCopies: ids.length,
        mutation: 'match IDs and creation day only',
        patch: sourceSummary.info.gameVersion,
        queueId: sourceSummary.info.queueId,
        mapId: sourceSummary.info.mapId,
        fixtureSummarySha256: hash(
          fs.readFileSync(
            path.join(root, 'exemplo_partida_BR1_3200579475.json'),
            'utf8',
          ),
        ),
        fixtureTimelineSha256: hash(
          fs.readFileSync(
            path.join(root, 'exemplo_partida_timeline_BR1_3200579475.json'),
            'utf8',
          ),
        ),
      },
      method: {
        execution:
          'compiled dist; real Nest HTTP and PostgreSQL; sequential requests; cached catalogs unavailable',
        concurrency: 1,
        warmupsPerRoute: 2,
        measuredRequestsPerRoute: 20,
        quantile: 'nearest rank ceil(p*N), no interpolation',
        scope:
          'local fixture benchmark; not production capacity or multiversion coverage',
        ingestion:
          'offline raw already present; excludes Riot/RabbitMQ/download and raw seeding',
      },
      ingestion: {
        latencyMs: stats(ingestMs),
        matchesPerSecond:
          ids.length / (ingestMs.reduce((a, b) => a + b, 0) / 1000),
      },
      rebuild: {
        matches: rebuilt,
        durationMs: rebuildMs,
        rawHashesPreserved: true,
        logicalDatasetPreserved: true,
        duplicateRows: 0,
      },
      storage: {
        measurement:
          'pg_column_size(row) sampled summed stored tuple bytes; excludes indexes/free space; raw exact gzip bytes separately. Not disk-capacity estimate.',
        matches: ids.length,
        totals: Object.fromEntries(
          Object.entries(storage[0]).map(([k, v]) => [k, Number(v)]),
        ),
        perMatch: Object.fromEntries(
          Object.entries(storage[0]).map(([k, v]) => [
            k,
            Number(v) / ids.length,
          ]),
        ),
        datasetRows,
        datasetRowsPerMatch: datasetRows / ids.length,
      },
      coverage: {
        sourceMatchEvents: sourceEvents.length,
        unknownEvents,
        wardEvents: wards.length,
        unknownWardEvents: unknownWards,
        featureVersions: featureCoverage,
        eventTypes: events,
        projectionVersion: projection.projectionVersion,
        frameCount: Array.isArray(projection.frames)
          ? projection.frames.length
          : null,
        report: initial.body.availability,
        provenance: initial.body.provenance,
        dimensions: initial.body.dimensions.map((d) => ({
          id: d.id,
          metricVersions: [...new Set(d.metrics.map((m) => m.metricVersion))],
        })),
      },
      invariants: {
        externalNetworkCalls: networkCalls,
        getRawReads: rawReads,
        rawHashesPreservedAfterGets: true,
      },
      routes: timings,
    };
    const output = outputPath;
    if (baseline) {
      assert.equal(
        baseline.processingVersion,
        PROCESSING_VERSION,
        'Rebaseline explicitly after generation changes',
      );
      assert.equal(
        baseline.corpus.fixtureSummarySha256,
        result.corpus.fixtureSummarySha256,
        'Cannot compare different fixtures',
      );
      assert.equal(
        baseline.corpus.fixtureTimelineSha256,
        result.corpus.fixtureTimelineSha256,
        'Cannot compare different timelines',
      );
      const failures = [];
      for (const [name, route] of Object.entries(timings)) {
        const previous = baseline.routes[name];
        if (!previous || route.latencyMs.p95 > previous.latencyMs.p95 * 2)
          failures.push(`${name}: p95 exceeds measured baseline x2`);
        if (
          !previous ||
          route.payloadBytes.max > previous.payloadBytes.max * 1.05
        )
          failures.push(`${name}: bytes exceed measured baseline x1.05`);
      }
      if (result.ingestion.latencyMs.p95 > baseline.ingestion.latencyMs.p95 * 2)
        failures.push('Ingestion p95 exceeds baseline x2');
      if (rebuildMs > baseline.rebuild.durationMs * 2)
        failures.push('Rebuild exceeds baseline x2');
      if (
        result.storage.perMatch.datasetRowBytes >
        baseline.storage.perMatch.datasetRowBytes * 1.1
      )
        failures.push('Dataset tuple bytes exceed baseline x1.1');
      result.regressionGate = {
        policy:
          'Local engineering review trigger: latency x2, payload x1.05, dataset tuple storage x1.1; no production SLA',
        failures,
      };
    }
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    assert(
      !result.regressionGate?.failures.length,
      json(result.regressionGate),
    );
    console.log(
      JSON.stringify(
        {
          output,
          processingVersion: PROCESSING_VERSION,
          ingestion: result.ingestion,
          rebuild: result.rebuild,
          routes: Object.fromEntries(
            Object.entries(timings).map(([k, v]) => [
              k,
              {
                p50: v.latencyMs.p50,
                p95: v.latencyMs.p95,
                bytes: v.payloadBytes.max,
              },
            ]),
          ),
        },
        null,
        2,
      ),
    );
  } finally {
    if (app) await app.close();
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
