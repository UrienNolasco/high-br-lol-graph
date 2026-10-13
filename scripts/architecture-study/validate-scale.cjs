/* Compare the same variant across concurrency configurations, including stored floats. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { client } = require('./engine.cjs');
const { Prisma, ident } = require('./adapters.cjs');
const { normalize, comparison, diff } = require('./validate.cjs');
const projections = {
  matches: '"matchId"',
  match_teams: '"matchId","teamId"',
  match_participants: '"matchId",puuid',
  match_timeline_projections: '"matchId"',
  match_event_projections: '"matchId","frameIndex","eventIndex"',
  historical_metric_contributions: 'id',
};
const aggregates = {
  champion_stats: '"championId",patch,"queueId"',
  player_stats: 'puuid,patch,"queueId"',
  player_champion_stats: 'puuid,"championId",patch,"queueId"',
};
async function main() {
  const [first, second, output] = process.argv.slice(2);
  const reference = JSON.parse(fs.readFileSync(first));
  const candidate = JSON.parse(fs.readFileSync(second));
  const result = {
    measuredAt: new Date().toISOString(),
    first,
    second,
    variants: [],
  };
  for (const run of reference.runs) {
    const other = candidate.runs.find((r) => r.variant === run.variant);
    assert(other);
    const a = client(run.database),
      b = client(other.database);
    const ids = (
      await a.match.findMany({
        select: { matchId: true },
        orderBy: { matchId: 'asc' },
      })
    ).map((r) => r.matchId);
    assert.deepEqual(
      (
        await b.match.findMany({
          select: { matchId: true },
          orderBy: { matchId: 'asc' },
        })
      ).map((r) => r.matchId),
      ids,
    );
    const record = { variant: run.variant, matches: ids.length, tables: {} };
    for (const [table, order] of Object.entries({
      ...projections,
      ...aggregates,
    })) {
      const check = comparison();
      for (const matchId of table in aggregates ? [null] : ids) {
        const read = async (db) =>
          (
            await db.$queryRaw(
              Prisma.sql`SELECT row_to_json(t)::text value FROM ${ident(table)} t ${matchId ? Prisma.sql`WHERE "matchId"=${matchId}` : Prisma.empty} ORDER BY ${Prisma.raw(order)}`,
            )
          ).map((r) => {
            const value = JSON.parse(r.value);
            if (table === 'match_teams' || table in aggregates) delete value.id;
            return normalize(value);
          });
        diff(
          await read(a),
          await read(b),
          check,
          table + '.' + (matchId || 'all'),
        );
      }
      record.tables[table] = check;
      assert.equal(check.nonNumericDifferences, 0);
      assert(check.withinDiagnosticTolerance);
      if (!(table in aggregates))
        assert(
          check.exact,
          'Same writer and input must preserve projection values',
        );
    }
    result.variants.push(record);
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    console.log(
      JSON.stringify({
        variant: run.variant,
        matches: ids.length,
        passed: true,
      }),
    );
    await a.$disconnect();
    await b.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
