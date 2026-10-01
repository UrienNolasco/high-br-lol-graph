const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PrismaClient } = require(path.join(process.argv[2], 'node_modules/@prisma/client'));
const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical = value => {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().filter(k => k !== 'processedAt').map(k => [k, canonical(value[k])]),
  );
  return value;
};
(async () => {
  const result = { normalization: 'Sorted JSON keys and rows; bigint decimal; ISO dates. Omit processing wall-clock processedAt, playerStats.lastUpdated and surrogate IDs only on matchTeam/championStats/playerStats/playerChampionStats. Preserve match identities, event timestamps, values, nulls, versions and lastPlayedAt.', tables: {} };
  for (const name of ['match', 'matchTeam', 'matchParticipant', 'matchTimelineProjection', 'matchEventProjection', 'historicalMetricContribution', 'championStats', 'playerStats', 'playerChampionStats']) {
    const rows = await prisma[name].findMany();
    for (const row of rows) {
      if (['matchTeam', 'championStats', 'playerStats', 'playerChampionStats'].includes(name)) delete row.id;
      if (name === 'playerStats') delete row.lastUpdated;
    }
    const normalized = rows.map(canonical).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    result.tables[name] = { count: rows.length, sha256: sha(normalized) };
  }
  const raw = await prisma.matchRaw.findMany({ orderBy: { matchId: 'asc' } });
  result.raw = raw.map(r => ({ matchId: r.matchId, summary: sha(Buffer.from(r.summary).toString('hex')), timeline: sha(Buffer.from(r.timeline).toString('hex')) }));
  const jobs = await prisma.matchProcessing.findMany({ orderBy: { matchId: 'asc' } });
  result.jobs = jobs.map(j => ({ matchId:j.matchId, status:j.status, processingVersion:j.processingVersion, completed: j.completedAt !== null, leaseReleased:j.leaseToken === null }));
  fs.writeFileSync(process.argv[3], JSON.stringify(result,null,2)+'\n');
})().catch(e => { console.error(e); process.exitCode=1; }).finally(() => prisma.$disconnect());
