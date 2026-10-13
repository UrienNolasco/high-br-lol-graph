/* Experimental adapters, never loaded by production. Every trial rolls back.
 * Same prepared input, timestamp, indexes and transaction for each variant.
 * SQL equality checks include explicit SQL-null flags for nullable JSON fields.
 */
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { Prisma } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const from = (p) => require(path.join(root, 'dist', p));
const { PrismaService } = from('core/prisma/prisma.service');
const { RiotMatchPreparer } = from(
  'modules/matches/adapters/riot/match-preparer',
);
const { TimelineParserService } = from(
  'modules/matches/adapters/riot/timeline-parser.service',
);
const { MatchProjectionPersistenceAdapter } = from(
  'modules/matches/adapters/persistence/match-projection-writer',
);
const { DatasetPersistenceAdapter } = from(
  'modules/dataset/adapters/dataset-writer.adapter',
);
const { PlayerStatsAggregationService } = from(
  'modules/stats/adapters/persistence/player-stats-writer',
);
const { PROCESSING_VERSION } = from(
  'modules/processing/contracts/processing.constants',
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
const allowed = {
  matchEventProjection: 'match_event_projections',
  historicalMetricContribution: 'historical_metric_contributions',
};
const rollback = new Error('intentional audit rollback');
const id = 'AUDIT_WRITES_ROLLBACK_ONLY';
async function main() {
  const url = process.env.TEST_DATABASE_URL;
  assert(
    url &&
      /^\/highbr_processing_audit_[a-zA-Z0-9_]+_integration$/.test(
        new URL(url).pathname,
      ),
    'Use only a dedicated audit database',
  );
  const output = process.argv[2];
  assert(output, 'Pass JSON output path');
  const prisma = new PrismaService({ datasourceUrl: url });
  const summary = JSON.parse(
    fs.readFileSync(path.join(root, 'exemplo_partida_BR1_3200579475.json')),
  );
  const timeline = JSON.parse(
    fs.readFileSync(
      path.join(root, 'exemplo_partida_timeline_BR1_3200579475.json'),
    ),
  );
  summary.metadata.matchId = timeline.metadata.matchId = id;
  const prepared = new RiotMatchPreparer(new TimelineParserService()).prepare(
    id,
    summary,
    timeline,
    PROCESSING_VERSION,
  );
  const completedAt = new Date();
  const datasetInput = {
    ...prepared.matchData,
    projection: prepared.timeline.snapshotProjection,
    events: prepared.timeline.normalizedEvents,
    processingVersion: PROCESSING_VERSION,
    processedAt: completedAt,
    lineage: {
      observationIds: [],
      sources: [],
      status: 'unknown',
      reason: 'missing_discovery_observation',
    },
  };
  const matchWriter = new MatchProjectionPersistenceAdapter(),
    datasetWriter = new DatasetPersistenceAdapter(),
    statsWriter = new PlayerStatsAggregationService();
  const rows = datasetWriter.prepare(datasetInput);
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
  async function digest(tx) {
    const hashes = {};
    for (const table of tables) {
      // Drop surrogate IDs and transaction timestamps; all logical values remain.
      const filter = table.includes('stats')
        ? Prisma.empty
        : Prisma.sql`WHERE "matchId"=${id}`;
      const values = await tx.$queryRaw(
        Prisma.sql`SELECT to_jsonb(t) - 'id' - 'lastUpdated' AS value FROM ${Prisma.raw('"' + table + '"')} t ${filter}`,
      );
      // Compare parsed logical JSON (e.g. 1 and 1.0 are equal), not jsonb text scale.
      const canonical = values.map((row) => JSON.stringify(row.value)).sort();
      hashes[table] = {
        count: values.length,
        hash: createHash('sha256').update(canonical.join('\n')).digest('hex'),
      };
      if (table === 'historical_metric_contributions')
        hashes.datasetRows = values
          .map((row) => row.value)
          .sort((a, b) =>
            JSON.stringify([
              a.subjectKind,
              a.subjectId,
              a.definitionId,
              a.definitionVersion,
              a.horizonKey,
            ]).localeCompare(
              JSON.stringify([
                b.subjectKind,
                b.subjectId,
                b.definitionId,
                b.definitionVersion,
                b.horizonKey,
              ]),
            ),
          );
    }
    // Dataset IDs are deterministic and must also be identical.
    hashes.datasetIds = (
      await tx.$queryRaw`SELECT md5(string_agg(id,E'\n' ORDER BY id)) AS hash FROM historical_metric_contributions`
    )[0];
    hashes.datasetNulls = (
      await tx.$queryRaw`SELECT md5(string_agg(id || ':' || (denominator IS NULL)::text,E'\n' ORDER BY id)) AS hash FROM historical_metric_contributions`
    )[0];
    hashes.eventNulls = (
      await tx.$queryRaw`SELECT md5(string_agg("matchId" || ':' || "frameIndex"::text || ':' || "eventIndex"::text || ':' || ("assistingParticipantIds" IS NULL)::text || ':' || ("assistingPuuids" IS NULL)::text,E'\n' ORDER BY "matchId","frameIndex","eventIndex")) AS hash FROM match_event_projections`
    )[0];
    return hashes;
  }
  function proxy(tx, variant, timings) {
    return new Proxy(tx, {
      get(target, model) {
        const delegate = target[model];
        if (typeof delegate === 'function') return delegate.bind(target);
        if (
          ![
            'match',
            'matchTeam',
            'matchParticipant',
            'matchTimelineProjection',
            'matchEventProjection',
            'historicalMetricContribution',
          ].includes(model)
        )
          return delegate;
        return new Proxy(delegate, {
          get(d, method) {
            const original = d[method];
            if (typeof original !== 'function') return original;
            return async function (args) {
              const start = performance.now();
              try {
                if (
                  variant === 'chunk250' &&
                  method === 'createMany' &&
                  allowed[model]
                ) {
                  let count = 0;
                  for (let i = 0; i < args.data.length; i += 250)
                    count += (
                      await original.call(d, {
                        ...args,
                        data: args.data.slice(i, i + 250),
                      })
                    ).count;
                  return { count };
                }
                if (
                  (variant === 'jsonRecordsetSelect' ||
                    (variant === 'jsonEventsSelect' &&
                      model === 'matchEventProjection')) &&
                  method === 'createMany' &&
                  allowed[model]
                ) {
                  const payload = JSON.stringify(args.data, (_, v) => {
                    if (v === Prisma.DbNull) return null;
                    assert.notEqual(
                      v,
                      Prisma.JsonNull,
                      'Prototype does not implement root JSON-null semantics',
                    );
                    return typeof v === 'bigint' ? v.toString() : v;
                  });
                  const table = Prisma.raw('"' + allowed[model] + '"');
                  const count = await tx.$executeRaw(
                    Prisma.sql`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table},${payload}::jsonb)`,
                  );
                  return { count };
                }
                if (
                  [
                    'selectOnly',
                    'jsonEventsSelect',
                    'jsonRecordsetSelect',
                  ].includes(variant) &&
                  model === 'matchTimelineProjection' &&
                  method === 'create'
                )
                  return await original.call(d, {
                    ...args,
                    select: { matchId: true },
                  });
                return await original.call(d, args);
              } finally {
                (timings[`${model}.${method}`] ??= []).push(
                  performance.now() - start,
                );
              }
            };
          },
        });
      },
    });
  }
  try {
    await prisma.$connect();
    assert.equal(await prisma.match.count({ where: { matchId: id } }), 0);
    const before = await digest(prisma),
      samples = [],
      expected = {},
      equivalence = {};
    const variants = [
      'baseline',
      'chunk250',
      'selectOnly',
      'jsonEventsSelect',
      'jsonRecordsetSelect',
    ];
    const trial = async (variant, warmup) => {
      let row, actual;
      try {
        await prisma.$transaction(
          async (tx) => {
            const timings = {},
              client = proxy(tx, variant, timings),
              cpu = process.cpuUsage(),
              started = performance.now();
            await matchWriter.write(client, { ...prepared, completedAt });
            await datasetWriter.write(client, datasetInput, rows);
            await statsWriter.update(client, prepared);
            const wallMs = performance.now() - started,
              used = process.cpuUsage(cpu);
            row = {
              variant,
              wallMs,
              cpuMs: (used.user + used.system) / 1000,
              operations: Object.fromEntries(
                Object.entries(timings).map(([k, v]) => [
                  k,
                  { count: v.length, totalMs: v.reduce((a, b) => a + b, 0) },
                ]),
              ),
            };
            actual = await digest(tx);
            throw rollback;
          },
          { timeout: 30000 },
        );
      } catch (e) {
        if (e !== rollback) throw e;
      }
      if (!expected.value) expected.value = actual;
      const {
        datasetRows: actualRows,
        historical_metric_contributions: actualDataset,
        ...actualOther
      } = actual;
      const {
        datasetRows: expectedRows,
        historical_metric_contributions: expectedDataset,
        ...expectedOther
      } = expected.value;
      assert.deepEqual(
        actualOther,
        expectedOther,
        `Non-dataset rows differ in ${variant}`,
      );
      const diffs = [];
      function compare(a, b, key = '') {
        if (Object.is(a, b)) return;
        if (typeof a === 'number' && typeof b === 'number') {
          diffs.push({
            path: key,
            baseline: b,
            variant: a,
            absoluteDifference: Math.abs(a - b),
          });
          return;
        }
        if (a && b && typeof a === 'object' && typeof b === 'object') {
          assert.deepEqual(Object.keys(a), Object.keys(b));
          for (const k of Object.keys(a))
            compare(a[k], b[k], key ? `${key}.${k}` : k);
          return;
        }
        assert.deepEqual(a, b, `Non-numeric mismatch ${key}`);
      }
      compare(actualRows, expectedRows);
      if (variant !== 'jsonRecordsetSelect')
        assert.equal(
          diffs.length,
          0,
          `Exact equivalence required for ${variant}`,
        );
      equivalence[variant] = {
        exactLogicalEquality: diffs.length === 0,
        numericDifferences: diffs.length,
        maxAbsoluteDifference: Math.max(
          0,
          ...diffs.map((d) => d.absoluteDifference),
        ),
        examples: diffs.slice(0, 8),
        datasetHash: actualDataset.hash,
      };
      assert.equal(
        await prisma.match.count({ where: { matchId: id } }),
        0,
        'Rollback failed',
      );
      if (!warmup) samples.push(row);
    };
    for (const variant of variants) await trial(variant, true);
    // Alternate order so a single variant does not always get the warmest cache.
    for (let round = 0; round < 6; round++)
      for (const variant of round % 2 ? [...variants].reverse() : variants)
        await trial(variant, false);
    assert.deepEqual(
      await digest(prisma),
      before,
      'Logical database changed after rolled-back trials',
    );
    const result = {
      measuredAt: new Date().toISOString(),
      commit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      node: process.version,
      prisma: require('@prisma/client/package.json').version,
      method: {
        scope:
          'writers only; excludes preparation, lease, raw reads, commit and broker',
        independentMatches: 1,
        samplesPerVariant: 6,
        warmupsPerVariant: 1,
        transaction: 'same connection per trial, rollback after validation',
        notes:
          'Prototype uses database composite types. JSON-null/default/schema evolution require broader tests before adoption. Alternating order; no statistical production claim.',
      },
      invariant: {
        equivalence,
        deterministicDatasetIdsEqual: true,
        databaseLogicalStatePreserved: true,
        sequencesMayAdvance: true,
        rows: Object.fromEntries(
          Object.entries(expected.value).filter(([k]) => k !== 'datasetRows'),
        ),
      },
      variants: Object.fromEntries(
        variants.map((v) => {
          const s = samples.filter((x) => x.variant === v);
          return [
            v,
            {
              wallMs: quantiles(s.map((x) => x.wallMs)),
              cpuMs: quantiles(s.map((x) => x.cpuMs)),
              operations: Object.fromEntries(
                Object.keys(s[0].operations).map((k) => [
                  k,
                  quantiles(s.map((x) => x.operations[k].totalMs)),
                ]),
              ),
            },
          ];
        }),
      ),
      samples,
    };
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result.variants, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
