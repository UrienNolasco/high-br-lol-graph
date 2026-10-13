// Compare stored aggregate values with the same match order, independently of
// concurrent replay ordering. Requires a preserved baseline dist directory.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { gunzipSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { PrismaClient, Prisma } = require('@prisma/client');
const {
  normalize,
  comparison,
  diff,
} = require('../architecture-study/validate.cjs');
const root = path.resolve(__dirname, '../..');
const tables = ['champion_stats', 'player_stats', 'player_champion_stats'];
const databaseClient = (database) =>
  new PrismaClient({
    datasourceUrl: `postgresql://integration:integration@127.0.0.1:55441/${database}?connection_limit=3`,
  });
async function child() {
  const {
    prepare,
    statsWriter,
  } = require('../architecture-study/adapters.cjs');
  const { directory, database } = JSON.parse(process.env.WRITE_STATS_CHILD);
  const db = databaseClient(database);
  const matches = JSON.parse(
    fs.readFileSync(path.join(directory, 'manifest.json')),
  ).matches.filter((m) => m.id !== 'BR1_3283642155');
  for (const match of matches) {
    const read = (field) =>
      JSON.parse(
        gunzipSync(fs.readFileSync(path.join(directory, match[field]))),
      );
    const prepared = prepare(read('summary'), read('timeline'));
    await db.$transaction((tx) => statsWriter.update(tx, prepared), {
      timeout: 30000,
    });
  }
  // Second pass also exercises addition to existing aggregates and overlapping keys.
  for (const match of matches.slice().reverse()) {
    const read = (field) =>
      JSON.parse(
        gunzipSync(fs.readFileSync(path.join(directory, match[field]))),
      );
    const prepared = prepare(read('summary'), read('timeline'));
    await db.$transaction((tx) => statsWriter.update(tx, prepared), {
      timeout: 30000,
    });
  }
  await db.$disconnect();
}
async function main() {
  const [directory, baselineDist, output] = process.argv.slice(2);
  assert(directory && baselineDist && output);
  const databases = [];
  for (const [label, dist] of [
    ['baseline', baselineDist],
    ['candidate', path.join(root, 'dist')],
  ]) {
    const database = `highbr_architecture_study_write_${Date.now()}_stats_${label}`;
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
    execFileSync(process.execPath, [__filename], {
      stdio: 'inherit',
      env: {
        ...process.env,
        STUDY_DIST: path.resolve(dist),
        WRITE_STATS_CHILD: JSON.stringify({ directory, database }),
      },
    });
    databases.push(database);
  }
  const clients = databases.map(databaseClient),
    report = {
      measuredAt: new Date().toISOString(),
      databases,
      contract:
        'Strict stored equality, ignoring surrogate IDs and lastUpdated; identical ordered forward and reverse passes over 119 games',
      tables: {},
    };
  for (const table of tables) {
    const read = async (db) =>
      (
        await db.$queryRaw(
          Prisma.sql`SELECT (to_jsonb(t)-'id'-'lastUpdated')::text value FROM ${Prisma.raw(table)} t`,
        )
      )
        .map((r) => normalize(JSON.parse(r.value)))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const a = await read(clients[0]),
      b = await read(clients[1]),
      result = comparison();
    diff(a, b, result, table);
    report.tables[table] = { rows: a.length, ...result };
  }
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  await Promise.all(clients.map((db) => db.$disconnect()));
  assert(
    Object.values(report.tables).every((t) => t.exact),
    'Stored aggregate mismatch',
  );
  console.log(JSON.stringify(report));
}
(process.env.WRITE_STATS_CHILD ? child() : main()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
