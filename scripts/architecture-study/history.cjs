/* Inflate a measured corpus to a declared SYNTHETIC dense history outside timers.
 * Preserves per-match rows and totals; new IDs distinguish replay copies. Not new independent games.
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { gzipSync, gunzipSync } = require('node:zlib');
const { client, installView } = require('./engine.cjs');
const {
  Prisma,
  ident,
  metricFields,
  PROCESSING_VERSION,
} = require('./adapters.cjs');
async function main() {
  const [input, output, multiplierText = '5'] = process.argv.slice(2),
    multiplier = Number(multiplierText);
  assert(Number.isInteger(multiplier) && multiplier >= 2 && multiplier <= 20);
  const bench = JSON.parse(fs.readFileSync(input)),
    report = {
      createdAt: new Date().toISOString(),
      source: input,
      multiplier,
      kind: 'synthetic dense replay history; independent match count unchanged',
      templates: {},
      databases: [],
    };
  for (const source of bench.runs.filter((r) =>
    ['A', 'B2', 'C', 'E'].includes(r.variant),
  )) {
    const database = `highbr_architecture_study_history_${source.variant.toLowerCase()}_${Date.now()}`;
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
      `CREATE DATABASE ${database} TEMPLATE ${source.database}`,
    ]);
    const db = client(database),
      ids = (await db.match.findMany({ select: { matchId: true } })).map(
        (x) => x.matchId,
      );
    const raws = await db.matchRaw.findMany();
    if (['C', 'E'].includes(source.variant))
      await installView(db, source.variant, true);
    for (let generation = 1; generation < multiplier; generation++) {
      const prefix = `HIST${generation}_`;
      for (const name of [
        'Match',
        'MatchTeam',
        'MatchParticipant',
        'MatchTimelineProjection',
        'MatchEventProjection',
        ...(['C', 'E'].includes(source.variant)
          ? []
          : ['HistoricalMetricContribution']),
      ]) {
        const model = Prisma.dmmf.datamodel.models.find((m) => m.name === name),
          table = ident(model.dbName);
        const fields = model.fields.filter(
          (f) => f.kind !== 'object' && !(f.name === 'id' && f.hasDefaultValue),
        );
        const columns = Prisma.join(fields.map((f) => ident(f.name)));
        const select = Prisma.join(
          fields.map((f) =>
            [
              'matchId',
              ...(name === 'HistoricalMetricContribution' ? ['id'] : []),
            ].includes(f.name)
              ? Prisma.sql`${prefix}||t.${ident(f.name)}`
              : Prisma.sql`t.${ident(f.name)}`,
          ),
        );
        await db.$executeRaw(
          Prisma.sql`INSERT INTO ${table} (${columns}) SELECT ${select} FROM ${table} t WHERE "matchId" IN (${Prisma.join(ids)})`,
        );
      }
      if (['C', 'E'].includes(source.variant)) {
        await db.$executeRaw(
          Prisma.sql`INSERT INTO study_metric_matches SELECT ${prefix}||"matchId",generation,patch,"queueId","mapId","gameCreation",common||jsonb_build_object('matchId',${prefix}||"matchId") FROM study_metric_matches WHERE "matchId" IN (${Prisma.join(ids)})`,
        );
        if (source.variant === 'C')
          await db.$executeRaw(Prisma.sql`INSERT INTO study_metric_groups SELECT ${prefix}||"matchId",generation,"subjectKind","subjectId","horizonKey","championId",role,"playerIds",meta,
      (SELECT jsonb_agg(value||jsonb_build_object('id',${prefix}||(value->>'id')) ORDER BY ord) FROM jsonb_array_elements(metrics) WITH ORDINALITY x(value,ord))
      FROM study_metric_groups WHERE "matchId" IN (${Prisma.join(ids)})`);
        else {
          await db.$executeRaw(Prisma.sql`INSERT INTO study_metric_subjects ("matchId",generation,"subjectKind","subjectId","horizonKey","horizonMs","championId",role,"teamId","playerIds")
            SELECT ${prefix}||"matchId",generation,"subjectKind","subjectId","horizonKey","horizonMs","championId",role,"teamId","playerIds" FROM study_metric_subjects WHERE "matchId" IN (${Prisma.join(ids)})`);
          const values = Prisma.join(
            metricFields.map((f) =>
              f.name === 'id'
                ? Prisma.sql`${prefix}||v.id`
                : Prisma.sql`v.${ident(f.name)}`,
            ),
          );
          await db.$executeRaw(Prisma.sql`INSERT INTO study_metric_values ("groupId",${Prisma.join(metricFields.map((f) => ident(f.name)))})
            SELECT n.id,${values} FROM study_metric_values v JOIN study_metric_subjects s ON s.id=v."groupId"
            JOIN study_metric_subjects n ON n."matchId"=${prefix}||s."matchId" AND n.generation=s.generation AND n."subjectKind"=s."subjectKind" AND n."subjectId"=s."subjectId" AND n."horizonKey"=s."horizonKey"
            WHERE s."matchId" IN (${Prisma.join(ids)})`);
        }
      }
      for (const raw of raws) {
        const matchId = prefix + raw.matchId,
          s = JSON.parse(gunzipSync(raw.summary)),
          t = JSON.parse(gunzipSync(raw.timeline));
        s.metadata.matchId = t.metadata.matchId = matchId;
        await db.matchProcessing.create({
          data: {
            matchId,
            status: 'COMPLETED',
            processingVersion: PROCESSING_VERSION,
          },
        });
        await db.matchRaw.create({
          data: {
            matchId,
            summary: gzipSync(JSON.stringify(s)),
            timeline: gzipSync(JSON.stringify(t)),
          },
        });
      }
    }
    for (const name of [
      'ChampionStats',
      'PlayerStats',
      'PlayerChampionStats',
    ]) {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === name),
        table = ident(model.dbName);
      const updates = model.fields
        .filter(
          (f) =>
            f.name.startsWith('sum') ||
            ['gamesPlayed', 'wins', 'losses', 'laningSamples'].includes(f.name),
        )
        .map(
          (f) => Prisma.sql`${ident(f.name)}=${ident(f.name)}*${multiplier}`,
        );
      if (name !== 'ChampionStats')
        updates.push(
          Prisma.sql`"roleDistribution"=(SELECT jsonb_object_agg(key,value::int*${multiplier}) FROM jsonb_each_text("roleDistribution"))`,
        );
      await db.$executeRaw(
        Prisma.sql`UPDATE ${table} SET ${Prisma.join(updates)}`,
      );
    }
    await db.$executeRawUnsafe('ANALYZE');
    const [size] =
      await db.$queryRaw`SELECT pg_database_size(current_database())::text bytes`;
    const matches = await db.match.count();
    assert.equal(matches, ids.length * multiplier);
    report.templates[source.variant] = database;
    report.databases.push({
      variant: source.variant,
      database,
      matches,
      independentMatches: ids.length,
      bytes: Number(size.bytes),
    });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report.databases.at(-1)));
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
