const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { client } = require('./engine.cjs');
const { Prisma } = require('./adapters.cjs');
const { reader, groupSql } = require('./read-benchmark.cjs');
const { normalize, diff, comparison } = require('./validate.cjs');
async function main() {
  const [input, output] = process.argv.slice(2),
    runs = JSON.parse(fs.readFileSync(input)).runs;
  const result = {
    measuredAt: new Date().toISOString(),
    input,
    filters: { eligibleOnly: false, queueId: 420, patch: '16.19' },
    runs: [],
  };
  const save = () =>
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  for (const run of runs.filter((r) => ['A', 'C', 'E'].includes(r.variant))) {
    const db = client(run.database),
      record = { variant: run.variant, database: run.database, settings: [] };
    result.runs.push(record);
    save();
    await db.$executeRawUnsafe('ANALYZE');
    let reference;
    for (const settings of [
      { lean: false, jitOff: false },
      { lean: true, jitOff: false },
      { lean: true, jitOff: true },
    ]) {
      const entry = { settings, timesMs: [] };
      record.settings.push(entry);
      for (let repeat = 0; repeat < 2; repeat++) {
        const t = performance.now();
        try {
          const value = await reader(db, result.filters, true, settings).query(
            result.filters,
            20,
          );
          entry.timesMs.push(performance.now() - t);
          if (!reference) reference = value;
          const check = comparison();
          diff(normalize(reference), normalize(value), check, 'query');
          entry.comparison = check;
        } catch (e) {
          entry.error = String(e).slice(0, 700);
          entry.timesMs.push(performance.now() - t);
          break;
        }
      }
      try {
        const plan = await db.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20000ms'");
            if (settings.jitOff)
              await tx.$executeRawUnsafe('SET LOCAL jit=off');
            return tx.$queryRaw(
              Prisma.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${groupSql(result.filters, settings)}`,
            );
          },
          { timeout: 30000 },
        );
        const document = plan[0]['QUERY PLAN'][0];
        entry.plan = document;
      } catch (e) {
        entry.planError = String(e).slice(0, 700);
      }
      save();
      console.log(
        JSON.stringify({
          variant: run.variant,
          settings,
          times: entry.timesMs,
          executionMs: entry.plan?.['Execution Time'],
          jit: entry.plan?.JIT,
          error: entry.error,
        }),
      );
    }
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
