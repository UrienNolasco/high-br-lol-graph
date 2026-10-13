// Distinguish changed stored floats from ordinary unordered SUM variation.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PrismaClient, Prisma } = require('@prisma/client');
const {
  normalize,
  comparison,
  diff,
} = require('../architecture-study/validate.cjs');
async function main() {
  const [input, output] = process.argv.slice(2);
  const runs = JSON.parse(fs.readFileSync(input)).runs;
  const clients = runs.map((run) => {
    assert.match(run.database, /^highbr_architecture_study_[a-z0-9_]+$/);
    return new PrismaClient({
      datasourceUrl: `postgresql://integration:integration@127.0.0.1:55441/${run.database}?connection_limit=3`,
    });
  });
  const read = async (db, order) => {
    assert(['ASC', 'DESC'].includes(order));
    const direction = Prisma.raw(order);
    return (
      await db.$queryRaw(Prisma.sql`
      SELECT row_to_json(a)::text value FROM (
        SELECT "subjectKind","definitionId","definitionVersion","horizonKey",
          sum("sumValue" ORDER BY id ${direction}) AS "sumValue",
          sum(numerator ORDER BY id ${direction}) numerator,
          sum("denominatorValue" ORDER BY id ${direction}) denominator,
          sum("validCount") AS "validCount",sum("sampleCount") AS "sampleCount",count(*) rows
        FROM historical_metric_contributions WHERE "queueId"=420 AND patch='16.19'
        GROUP BY "subjectKind","definitionId","definitionVersion","horizonKey"
        ORDER BY "subjectKind","definitionId","definitionVersion","horizonKey"
      ) a`)
    ).map((row) => normalize(JSON.parse(row.value)));
  };
  try {
    const baseline = await read(clients[0], 'ASC'),
      candidate = await read(clients[1], 'ASC'),
      reversed = await read(clients[0], 'DESC');
    const sameOrder = comparison(),
      differentOrder = comparison();
    diff(baseline, candidate, sameOrder, 'orderedSum');
    diff(baseline, reversed, differentOrder, 'baselineAscVersusDesc');
    const report = {
      measuredAt: new Date().toISOString(),
      databases: runs.map((run) => run.database),
      groups: baseline.length,
      method:
        'Same persisted rows, explicit SUM input ordering. Ascending ID compared across writers; ascending versus descending ID compared inside baseline DB.',
      sameOrder,
      differentOrder,
    };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    assert(sameOrder.exact, 'Ordered sums differ between writers');
    assert.equal(differentOrder.nonNumericDifferences, 0);
    console.log(JSON.stringify(report));
  } finally {
    await Promise.all(clients.map((db) => db.$disconnect()));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
