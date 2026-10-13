const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const { client, installView } = require('./engine.cjs');
const { from, Prisma, stringify } = require('./adapters.cjs');
const { DatasetQueryRepository } = from(
  'modules/dataset/adapters/dataset-query.repository',
);
const { exportHistoricalDataset } = from(
  'modules/dataset/adapters/dataset-export.adapter',
);
const { PlayerStatsReaderAdapter } = from(
  'modules/stats/adapters/persistence/player-stats-reader',
);
const ignored = new Set(['processedAt', 'lastUpdated']);
function normalize(v) {
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .filter((k) => !ignored.has(k))
        .map((k) => [k, normalize(v[k])]),
    );
  return v;
}
function comparison() {
  return {
    exact: true,
    differences: 0,
    numericDifferences: 0,
    nonNumericDifferences: 0,
    maxAbs: 0,
    maxRel: 0,
    withinDiagnosticTolerance: true,
    examples: [],
  };
}
function diff(a, b, result, at = '') {
  if (Object.is(a, b)) return;
  if (
    typeof a === 'number' &&
    typeof b === 'number' &&
    Number.isFinite(a) &&
    Number.isFinite(b)
  ) {
    const abs = Math.abs(a - b),
      rel = abs / Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE);
    result.exact = false;
    result.differences++;
    result.numericDifferences++;
    result.maxAbs = Math.max(result.maxAbs, abs);
    result.maxRel = Math.max(result.maxRel, rel);
    // Diagnostic only. Does NOT approve a new numeric contract for production.
    if (abs > 1e-9 + 1e-12 * Math.max(Math.abs(a), Math.abs(b)))
      result.withinDiagnosticTolerance = false;
    if (result.examples.length < 8) result.examples.push({ at, a, b });
    return;
  }
  if (
    a &&
    b &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    Array.isArray(a) === Array.isArray(b)
  ) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
      diff(a[k], b[k], result, at + '.' + k);
    return;
  }
  result.exact = false;
  result.differences++;
  result.nonNumericDifferences++;
  result.withinDiagnosticTolerance = false;
  if (result.examples.length < 8) result.examples.push({ at, a, b });
}
const tables = {
  match: { orderBy: { matchId: 'asc' } },
  matchTeam: { orderBy: [{ matchId: 'asc' }, { teamId: 'asc' }] },
  matchParticipant: { orderBy: [{ matchId: 'asc' }, { puuid: 'asc' }] },
  matchTimelineProjection: { orderBy: { matchId: 'asc' } },
  matchEventProjection: {
    orderBy: [{ matchId: 'asc' }, { frameIndex: 'asc' }, { eventIndex: 'asc' }],
  },
  historicalMetricContribution: { orderBy: { id: 'asc' } },
};
const stats = {
  championStats: [{ championId: 'asc' }, { patch: 'asc' }, { queueId: 'asc' }],
  playerStats: [{ puuid: 'asc' }, { patch: 'asc' }, { queueId: 'asc' }],
  playerChampionStats: [
    { puuid: 'asc' },
    { championId: 'asc' },
    { patch: 'asc' },
    { queueId: 'asc' },
  ],
};
async function main() {
  const [input, output, only] = process.argv.slice(2);
  const bench = JSON.parse(fs.readFileSync(input)),
    baseline = bench.runs.find((r) => r.variant === 'A');
  assert(baseline, 'A reference required');
  const a = client(baseline.database),
    ids = (
      await a.match.findMany({
        select: { matchId: true },
        orderBy: { matchId: 'asc' },
      })
    ).map((x) => x.matchId);
  const report = {
    measuredAt: new Date().toISOString(),
    input,
    reference: baseline.database,
    matches: ids.length,
    contract:
      'Exact equality excluding operational timestamps and surrogate stats IDs; numeric tolerance is diagnostic, never substitutes exact gate',
    variants: [],
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const save = () =>
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  for (const candidate of bench.runs.filter(
    (r) => r.variant !== 'A' && (!only || only.split(',').includes(r.variant)),
  )) {
    const b = client(candidate.database),
      record = {
        variant: candidate.variant,
        database: candidate.database,
        tables: {},
        storage: {},
        queries: [],
        exports: {},
      };
    if (['C', 'D', 'E'].includes(candidate.variant))
      await installView(b, candidate.variant, true);
    report.variants.push(record);
    save();
    for (const [name, args] of Object.entries(tables)) {
      const result = comparison();
      let rows = 0;
      for (const matchId of ids) {
        const av = await a[name].findMany({ ...args, where: { matchId } }),
          bv = await b[name].findMany({ ...args, where: { matchId } });
        const logical = (xs) =>
          name === 'matchTeam' ? xs.map(({ id, ...row }) => row) : xs;
        diff(
          normalize(logical(av)),
          normalize(logical(bv)),
          result,
          `${name}.${matchId}`,
        );
        rows += av.length;
      }
      record.tables[name] = { rows, ...result };
      save();
    }
    // Text transport bypasses Prisma's float/JSON decoding. Compare the actual
    // persisted representation as well as the application-visible values above.
    const stored = comparison();
    let storedRows = 0;
    for (const matchId of ids) {
      const read = async (db) =>
        (
          await db.$queryRaw(
            Prisma.sql`SELECT row_to_json(t)::text value FROM historical_metric_contributions t WHERE "matchId"=${matchId} ORDER BY id`,
          )
        ).map((r) => JSON.parse(r.value));
      const av = await read(a),
        bv = await read(b);
      storedRows += av.length;
      diff(normalize(av), normalize(bv), stored, `storedDataset.${matchId}`);
    }
    record.storage.dataset = { rows: storedRows, ...stored };
    save();
    for (const [name, orderBy] of Object.entries(stats)) {
      const dropId = (xs) => normalize(xs.map(({ id, ...x }) => x));
      const av = await a[name].findMany({ orderBy }),
        bv = await b[name].findMany({ orderBy }),
        result = comparison();
      diff(dropId(av), dropId(bv), result, name);
      record.tables[name] = { rows: av.length, ...result };
      save();
    }
    const sample = await a.historicalMetricContribution.findFirstOrThrow({
      where: { subjectKind: 'participant' },
      orderBy: { id: 'asc' },
    });
    const cases = [
      { eligibleOnly: false, queueId: sample.queueId, patch: sample.patch },
      { eligibleOnly: true, championId: sample.championId, role: sample.role },
      {
        eligibleOnly: false,
        definitionId: sample.definitionId,
        horizonKey: sample.horizonKey,
      },
      { eligibleOnly: false, playerId: sample.playerIds[0] },
    ];
    for (const filters of cases) {
      const entry = { filters };
      for (const [label, db] of [
        ['baseline', a],
        ['candidate', b],
      ]) {
        const t = performance.now();
        try {
          entry[label] = {
            value: await new DatasetQueryRepository(db).query(filters, 20),
            ms: performance.now() - t,
          };
        } catch (e) {
          entry[label] = {
            error: String(e).slice(0, 900),
            ms: performance.now() - t,
          };
        }
      }
      entry.comparison = comparison();
      if (entry.baseline.value && entry.candidate.value)
        diff(
          normalize(entry.baseline.value),
          normalize(entry.candidate.value),
          entry.comparison,
          'query',
        );
      else entry.comparison = { available: false };
      delete entry.baseline.value;
      delete entry.candidate.value;
      record.queries.push(entry);
      save();
    }
    // Actual export implementation, bounded to the first match's timestamp; byte differences are reported.
    const match = await a.match.findUniqueOrThrow({
        where: { matchId: ids[0] },
      }),
      time = Number(match.gameCreation);
    const filters = { eligibleOnly: false, fromMs: time, toMs: time + 1 },
      split = { trainBeforeMs: time + 1, validationBeforeMs: time + 2 };
    const dirs = {};
    for (const [label, db] of [
      ['baseline', a],
      ['candidate', b],
    ]) {
      dirs[label] = fs.mkdtempSync('/tmp/highbr-study-export-') + '/output';
      const t = performance.now();
      try {
        await exportHistoricalDataset(db, { filters, split, out: dirs[label] });
        record.exports[label] = { ms: performance.now() - t };
      } catch (e) {
        record.exports[label] = {
          error: String(e).slice(0, 900),
          ms: performance.now() - t,
        };
      }
    }
    if (!record.exports.baseline.error && !record.exports.candidate.error) {
      record.exports.files = {};
      for (const file of [
        'features.jsonl',
        'labels.jsonl',
        'descriptive.jsonl',
        'metadata.jsonl',
        'observations.jsonl',
      ]) {
        const av = fs.readFileSync(path.join(dirs.baseline, file), 'utf8'),
          bv = fs.readFileSync(path.join(dirs.candidate, file), 'utf8'),
          result = comparison();
        const parse = (s) =>
          s.trim() ? s.trim().split('\n').map(JSON.parse) : [];
        diff(normalize(parse(av)), normalize(parse(bv)), result, file);
        record.exports.files[file] = { byteIdentical: av === bv, ...result };
      }
    }
    await b.$disconnect();
    save();
    console.log(
      JSON.stringify({
        variant: candidate.variant,
        tables: Object.fromEntries(
          Object.entries(record.tables).map(([k, v]) => [
            k,
            {
              exact: v.exact,
              differences: v.differences,
              nonNumeric: v.nonNumericDifferences,
              maxAbs: v.maxAbs,
            },
          ]),
        ),
      }),
    );
  }
  await a.$disconnect();
}
if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
module.exports = { normalize, comparison, diff };
