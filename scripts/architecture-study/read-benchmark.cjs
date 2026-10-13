/* Same DatasetQueryRepository contract, alternative SQL for distinct-player counts.
 * Removes correlated rescans of the selected cohort, without precomputed aggregates.
 */
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { client, installView } = require('./engine.cjs');
const { Prisma, from } = require('./adapters.cjs');
const { normalize, diff, comparison } = require('./validate.cjs');
const { DatasetQueryRepository, datasetSqlWhere } = from(
  'modules/dataset/adapters/dataset-query.repository',
);
function groupSql(filters, settings = {}) {
  const columns = Prisma.raw(
    settings.lean
      ? '"definitionId","definitionVersion","subjectKind","horizonKey",usage,unit,"matchId","playerIds","validCount","sumValue",numerator,"denominatorValue","ratioScale"'
      : '*',
  );
  return Prisma.sql`WITH selected AS MATERIALIZED (SELECT ${columns} FROM historical_metric_contributions WHERE ${datasetSqlWhere(filters)}),
 players AS (SELECT "definitionId","definitionVersion","subjectKind","horizonKey",count(DISTINCT p)::int players
   FROM selected,unnest("playerIds") p GROUP BY "definitionId","definitionVersion","subjectKind","horizonKey"),
 aggregates AS (SELECT "definitionId","definitionVersion","subjectKind","horizonKey",usage,unit,
   count(*)::int rows,count(DISTINCT "matchId")::int matches,sum("validCount")::int "validRows",sum("sumValue") "sumValue",
   sum("sumValue")/nullif(sum("validCount"),0) mean,
   sum(numerator) FILTER(WHERE "validCount"=1 AND "denominatorValue">0 AND numerator IS NOT NULL) "numeratorSum",
   sum("denominatorValue") FILTER(WHERE "validCount"=1 AND "denominatorValue">0 AND numerator IS NOT NULL) "denominatorSum",
   sum(numerator) FILTER(WHERE "validCount"=1 AND "denominatorValue">0 AND numerator IS NOT NULL)/nullif(sum("denominatorValue") FILTER(WHERE "validCount"=1 AND "denominatorValue">0 AND numerator IS NOT NULL),0)*min("ratioScale") "ratioOfSums",
   count(*) FILTER(WHERE "validCount"=1 AND "denominatorValue">0 AND numerator IS NOT NULL)::int "ratioRows"
   FROM selected GROUP BY "definitionId","definitionVersion","subjectKind","horizonKey",usage,unit)
 SELECT a.*,coalesce(p.players,0)::int players FROM aggregates a LEFT JOIN players p USING ("definitionId","definitionVersion","subjectKind","horizonKey")
 ORDER BY "definitionId","subjectKind","horizonKey"`;
}
function reader(db, filters, optimized = true, settings = {}) {
  const wrapped = new Proxy(db, {
    get(target, key) {
      if (key === '$transaction')
        return (callback, options) =>
          target.$transaction(async (tx) => {
            await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20000ms'");
            if (settings.jitOff)
              await tx.$executeRawUnsafe('SET LOCAL jit=off');
            const view = new Proxy(tx, {
              get(t, k) {
                if (k === '$queryRaw')
                  return (...args) => {
                    const sql = args[0]?.sql || '';
                    if (optimized && sql.includes('AS "ratioOfSums"'))
                      return t.$queryRaw(groupSql(filters, settings));
                    if (
                      optimized &&
                      settings.lean &&
                      sql.includes(
                        'coalesce(sum("validCount"),0)::int AS "validRows" FROM selected',
                      )
                    )
                      return t.$queryRaw(Prisma.sql`WITH selected AS MATERIALIZED (SELECT "matchId","playerIds","validCount" FROM historical_metric_contributions WHERE ${datasetSqlWhere(filters)})
                        SELECT count(*)::int rows,count(DISTINCT "matchId")::int matches,(SELECT count(DISTINCT p)::int FROM selected,unnest("playerIds") p) players,coalesce(sum("validCount"),0)::int "validRows" FROM selected`);
                    return t.$queryRaw(...args);
                  };
                const value = t[k];
                return typeof value === 'function' ? value.bind(t) : value;
              },
            });
            return callback(view);
          }, options);
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return new DatasetQueryRepository(wrapped);
}
async function main() {
  const [input, output] = process.argv.slice(2),
    runs = JSON.parse(fs.readFileSync(input)).runs;
  const result = {
    measuredAt: new Date().toISOString(),
    input,
    scope:
      'actual dataset query response, 20 rows plus full cohort summary; one old query then three optimized repeats',
    runs: [],
  };
  const save = () =>
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  for (const run of runs.filter((r) =>
    ['A', 'B2', 'C', 'D', 'E'].includes(r.variant),
  )) {
    const db = client(run.database);
    if (['C', 'D', 'E'].includes(run.variant))
      await installView(db, run.variant, true);
    const sample = await db.historicalMetricContribution.findFirstOrThrow({
      where: { subjectKind: 'participant' },
      orderBy: { id: 'asc' },
    });
    const cases = [
      { eligibleOnly: false, queueId: 420, patch: '16.19' },
      { eligibleOnly: true, championId: sample.championId, role: sample.role },
      {
        eligibleOnly: false,
        definitionId: sample.definitionId,
        horizonKey: sample.horizonKey,
      },
      { eligibleOnly: false, playerId: sample.playerIds[0] },
    ];
    const record = { variant: run.variant, database: run.database, cases: [] };
    result.runs.push(record);
    save();
    for (const filters of cases) {
      const entry = { filters, optimizedMs: [] },
        get = async (optimized) => {
          const t = performance.now();
          try {
            return {
              value: await reader(db, filters, optimized).query(filters, 20),
              ms: performance.now() - t,
            };
          } catch (e) {
            return {
              error: String(e).slice(0, 500),
              ms: performance.now() - t,
            };
          }
        };
      const original = await get(false);
      entry.originalMs = original.ms;
      entry.originalError = original.error;
      for (let repeat = 0; repeat < 3; repeat++) {
        const candidate = await get(true);
        entry.optimizedMs.push(candidate.ms);
        if (candidate.error) entry.optimizedError = candidate.error;
        if (original.value && candidate.value) {
          entry.comparison = comparison();
          diff(
            normalize(original.value),
            normalize(candidate.value),
            entry.comparison,
            'query',
          );
        }
      }
      record.cases.push(entry);
      save();
      console.log(
        JSON.stringify({
          variant: run.variant,
          filters,
          oldMs: entry.originalMs,
          newMs: entry.optimizedMs,
          nonNumeric: entry.comparison?.nonNumericDifferences,
          error: entry.optimizedError,
        }),
      );
    }
    await db.$disconnect();
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
module.exports = { reader, groupSql };
