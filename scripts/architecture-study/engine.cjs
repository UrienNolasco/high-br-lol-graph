const {
  from,
  Prisma,
  stringify,
  prepare,
  proxy,
  pack,
  writePacked,
  statsDeltas,
  writeDeltas,
  projectionWriter,
  datasetWriter,
  statsWriter,
  writeNormalized,
  installNormalized,
  matchKeys,
  groupKeys,
} = require('./adapters.cjs');
const { PrismaService } = from('core/prisma/prisma.service');
const { ProcessingService } = from(
  'modules/processing/services/processing.service',
);
const { RiotMatchPreparer } = from(
  'modules/matches/adapters/riot/match-preparer',
);
const { TimelineParserService } = from(
  'modules/matches/adapters/riot/timeline-parser.service',
);
const { CollectorRepository } = from(
  'modules/collector/repositories/collector.repository',
);
const assert = require('node:assert/strict');

function client(database) {
  assert.match(database, /^highbr_architecture_study(?:_[a-z0-9_]+)?$/);
  return new PrismaService({
    datasourceUrl: `postgresql://integration:integration@127.0.0.1:55441/${database}?connection_limit=3&pool_timeout=30`,
  });
}
function composition(db, variant) {
  const logger = {
    info() {},
    warn() {},
    error(data) {
      console.error(JSON.stringify(data));
    },
  };
  const projection =
    variant === 'A'
      ? projectionWriter
      : { write: (tx, p) => projectionWriter.write(proxy(tx, 'events'), p) };
  let dataset = datasetWriter,
    stats = statsWriter;
  if (variant === 'B2')
    dataset = {
      prepare: (input) => datasetWriter.prepare(input),
      write: (tx, input, rows) =>
        datasetWriter.write(proxy(tx, 'bulkAll'), input, rows),
    };
  if (['B2', 'C', 'E'].includes(variant))
    stats = { update: async (tx, p) => writeDeltas(tx, await statsDeltas(p)) };
  if (['C', 'D', 'E'].includes(variant))
    dataset = {
      prepare: (input) => datasetWriter.prepare(input),
      write: async (tx, input, rows) => {
        const packed = pack({ rows, input, completedAt: input.processedAt });
        if (variant === 'E') await writeNormalized(tx, packed);
        else if (variant === 'C') await writePacked(tx, packed);
        else
          await tx.$executeRaw(Prisma.sql`INSERT INTO study_jobs ("matchId",stage,packed,facts_at)
        VALUES (${input.match.matchId},'metrics_pending',${stringify(packed)}::jsonb,clock_timestamp())`);
        return rows.length;
      },
    };
  if (variant === 'D')
    stats = {
      update: async (tx, p) => {
        const deltas = await statsDeltas(p);
        await tx.$executeRaw(
          Prisma.sql`UPDATE study_jobs SET deltas=${stringify(deltas)}::jsonb WHERE "matchId"=${p.matchData.match.matchId}`,
        );
      },
    };
  return new ProcessingService(
    db,
    {
      getMatchById() {
        throw Error('Network forbidden in processing benchmark');
      },
      getTimeline() {
        throw Error('Network forbidden');
      },
    },
    new RiotMatchPreparer(new TimelineParserService()),
    projection,
    dataset,
    stats,
    new CollectorRepository(db),
    logger,
  );
}

// Database-backed stage claims: lock, writes and completion share one transaction.
// hooks are exclusively for failure-injection tests, never enabled in measurements.
async function advanceMetrics(db, hooks = {}) {
  return db.$transaction(
    async (tx) => {
      const jobs =
        await tx.$queryRaw`SELECT * FROM study_jobs WHERE stage='metrics_pending' ORDER BY queued_at,"matchId" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!jobs.length) return 0;
      const job = jobs[0];
      await hooks.afterClaim?.(job);
      await writePacked(tx, job.packed);
      await hooks.afterWrite?.(job);
      await tx.$executeRaw(
        Prisma.sql`UPDATE study_jobs SET stage='aggregates_pending',packed=NULL,metrics_at=clock_timestamp() WHERE "matchId"=${job.matchId}`,
      );
      await hooks.beforeCommit?.(job);
      return 1;
    },
    { timeout: 30000, maxWait: 30000 },
  );
}
async function advanceAggregates(db, batch = 10, hooks = {}) {
  return db.$transaction(
    async (tx) => {
      const jobs = await tx.$queryRaw(
        Prisma.sql`SELECT * FROM study_jobs WHERE stage='aggregates_pending' ORDER BY queued_at,"matchId" FOR UPDATE SKIP LOCKED LIMIT ${batch}`,
      );
      if (!jobs.length) return 0;
      await hooks.afterClaim?.(jobs);
      await writeDeltas(
        tx,
        jobs.flatMap((j) => j.deltas),
      );
      await hooks.afterWrite?.(jobs);
      await tx.$executeRaw(
        Prisma.sql`UPDATE study_jobs SET stage='complete',deltas=NULL,completed_at=clock_timestamp() WHERE "matchId" IN (${Prisma.join(jobs.map((j) => j.matchId))})`,
      );
      await hooks.beforeCommit?.(jobs);
      return jobs.length;
    },
    { timeout: 30000, maxWait: 30000 },
  );
}
async function installView(db, variant, replace = false) {
  if (!['C', 'D', 'E'].includes(variant)) return;
  if (!replace)
    await db.$executeRawUnsafe(
      'ALTER TABLE historical_metric_contributions RENAME TO study_unused_eav',
    );
  if (variant === 'E') {
    await installNormalized(db);
    const model = Prisma.dmmf.datamodel.models.find(
      (m) => m.name === 'HistoricalMetricContribution',
    );
    const select = model.fields
      .filter((f) => f.kind !== 'object')
      .map((f) => {
        let value;
        if (
          ['matchId', 'patch', 'queueId', 'mapId', 'gameCreation'].includes(
            f.name,
          )
        )
          value = `m."${f.name}"`;
        else if (['datasetVersion', 'processingVersion'].includes(f.name))
          value = `(m.common->>'${f.name}')::integer`;
        else if (f.name === 'processedAt')
          value = `(m.common->>'processedAt')::timestamp(3)`;
        else if (f.name === 'lineage') value = `m.common->'lineage'`;
        else if (groupKeys.includes(f.name)) value = `s."${f.name}"`;
        else value = `v."${f.name}"`;
        return `${value} AS "${f.name}"`;
      });
    await db.$executeRawUnsafe(`CREATE OR REPLACE VIEW historical_metric_contributions AS SELECT ${select.join(',')}
      FROM study_metric_values v JOIN study_metric_subjects s ON s.id=v."groupId"
      JOIN study_metric_matches m ON m."matchId"=s."matchId" AND m.generation=s.generation WHERE m.generation=1`);
    return;
  }
  // Preserve native metadata columns in the view so cohort/player predicates can
  // reach indexes BEFORE JSON expansion. Metric rows are decoded once per group.
  const model = Prisma.dmmf.datamodel.models.find(
    (m) => m.name === 'HistoricalMetricContribution',
  );
  const fields = model.fields.filter((f) => f.kind !== 'object');
  const matchColumns = new Set([
    'matchId',
    'patch',
    'queueId',
    'mapId',
    'gameCreation',
  ]);
  const groupColumns = new Set([
    'subjectKind',
    'subjectId',
    'horizonKey',
    'championId',
    'role',
    'playerIds',
  ]);
  const matchJson = new Set([
    'datasetVersion',
    'processingVersion',
    'lineage',
    'processedAt',
  ]);
  const groupJson = new Set(['horizonMs', 'teamId']);
  const sqlType = (f) =>
    ({
      String: 'text',
      Int: 'integer',
      Float: 'double precision',
      Boolean: 'boolean',
      BigInt: 'bigint',
      DateTime: 'timestamp(3)',
      Json: 'jsonb',
    })[f.type] + (f.isList ? '[]' : '');
  const jsonColumn = (source, f) =>
    f.type === 'Json'
      ? `${source}->'${f.name}'`
      : `(${source}->>'${f.name}')::${sqlType(f)}`;
  const columns = fields.map((f) => {
    let value;
    if (matchColumns.has(f.name)) value = `m."${f.name}"`;
    else if (groupColumns.has(f.name)) value = `g."${f.name}"`;
    else if (matchJson.has(f.name)) value = jsonColumn('m.common', f);
    else if (groupJson.has(f.name)) value = jsonColumn('g.meta', f);
    else value = `r."${f.name}"`;
    return `${value} AS "${f.name}"`;
  });
  const metricFields = fields.filter(
    (f) =>
      ![matchColumns, groupColumns, matchJson, groupJson].some((s) =>
        s.has(f.name),
      ),
  );
  await db.$executeRawUnsafe(`CREATE OR REPLACE VIEW historical_metric_contributions AS
    SELECT ${columns.join(',')}
    FROM study_metric_matches m JOIN study_metric_groups g USING ("matchId",generation)
    ${variant === 'D' ? 'JOIN study_jobs j ON j."matchId"=m."matchId" AND j.stage=\'complete\'' : ''}
    CROSS JOIN LATERAL jsonb_to_recordset(g.metrics) AS r(${metricFields.map((f) => `"${f.name}" ${sqlType(f)}`).join(',')})
    WHERE m.generation=1`);
}
module.exports = {
  client,
  composition,
  advanceMetrics,
  advanceAggregates,
  installView,
};
