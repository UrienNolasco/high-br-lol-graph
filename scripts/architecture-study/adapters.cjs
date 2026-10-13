/* Experimental adapters. Not imported by the application. */
require('reflect-metadata');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Prisma } = require('@prisma/client');
const root = path.resolve(__dirname, '../..');
const from = (p) => require(path.join(root, 'dist', p));
const { MatchProjectionPersistenceAdapter } = from(
  'modules/matches/adapters/persistence/match-projection-writer',
);
const { DatasetPersistenceAdapter } = from(
  'modules/dataset/adapters/dataset-writer.adapter',
);
const { PlayerStatsAggregationService } = from(
  'modules/stats/adapters/persistence/player-stats-writer',
);
const { RiotMatchPreparer } = from(
  'modules/matches/adapters/riot/match-preparer',
);
const { TimelineParserService } = from(
  'modules/matches/adapters/riot/timeline-parser.service',
);
const { PROCESSING_VERSION } = from(
  'modules/processing/contracts/processing.constants',
);
const stringify = (v) =>
  JSON.stringify(v, (_, x) => {
    if (x === Prisma.DbNull) return null;
    assert.notEqual(
      x,
      Prisma.JsonNull,
      'Root JSON null requires separate handling',
    );
    return typeof x === 'bigint' ? x.toString() : x;
  });
const ident = (s) => {
  assert.match(s, /^[A-Za-z_][A-Za-z_0-9]*$/);
  return Prisma.raw('"' + s + '"');
};
const preparer = new RiotMatchPreparer(new TimelineParserService());
const datasetWriter = new DatasetPersistenceAdapter();
const projectionWriter = new MatchProjectionPersistenceAdapter();
const statsWriter = new PlayerStatsAggregationService();
const lineage = {
  observationIds: [],
  sources: [],
  status: 'unknown',
  reason: 'missing_discovery_observation',
};

function prepare(summary, timeline) {
  const result = preparer.prepare(
    summary.metadata.matchId,
    summary,
    timeline,
    PROCESSING_VERSION,
  );
  const completedAt = new Date('2026-10-07T00:00:00Z'); // fixed benchmark input, NOT migration timestamp
  const input = {
    ...result.matchData,
    projection: result.timeline.snapshotProjection,
    events: result.timeline.normalizedEvents,
    processingVersion: PROCESSING_VERSION,
    processedAt: completedAt,
    lineage,
  };
  return { ...result, completedAt, input, rows: datasetWriter.prepare(input) };
}

// Explicit fields from the generated schema; no defaults or JSON root-null ambiguities in these rows.
const bulkModels = {
  matchEventProjection: 'MatchEventProjection',
  historicalMetricContribution: 'HistoricalMetricContribution',
};
async function recordset(tx, delegate, rows) {
  if (!rows.length) return { count: 0 };
  const model = Prisma.dmmf.datamodel.models.find(
    (m) => m.name === bulkModels[delegate],
  );
  assert(model);
  const columns = model.fields
    .filter((f) => f.kind !== 'object')
    .map((f) => f.name);
  assert(
    rows.every((row) =>
      columns.every(
        (k) =>
          k in row ||
          model.fields.find((f) => f.name === k).isRequired === false,
      ),
    ),
  );
  const table = ident(model.dbName);
  const names = Prisma.join(columns.map(ident));
  const count =
    await tx.$executeRaw(Prisma.sql`INSERT INTO ${table} (${names}) SELECT ${names}
    FROM jsonb_populate_recordset(NULL::${table},${stringify(rows)}::jsonb)`);
  return { count };
}

function proxy(tx, mode) {
  return new Proxy(tx, {
    get(target, model) {
      const delegate = target[model];
      if (typeof delegate === 'function') return delegate.bind(target);
      if (!bulkModels[model] && model !== 'matchTimelineProjection')
        return delegate;
      return new Proxy(delegate, {
        get(d, method) {
          const fn = d[method];
          if (typeof fn !== 'function') return fn;
          return (args) => {
            if (model === 'matchTimelineProjection' && method === 'create')
              return fn.call(d, { ...args, select: { matchId: true } });
            if (
              method === 'createMany' &&
              (model === 'matchEventProjection' || mode === 'bulkAll')
            )
              return recordset(tx, model, args.data);
            return fn.call(d, args);
          };
        },
      });
    },
  });
}

// Reuse the domain's exact aggregate definitions, intercepting only the private persistence method.
async function statsDeltas(prepared) {
  const writer = new PlayerStatsAggregationService();
  const deltas = [];
  writer.increment = async (
    _,
    table,
    keys,
    sums,
    extra,
    role,
    lastPlayedAt,
  ) => {
    deltas.push({
      table,
      keys,
      sums,
      extra,
      role,
      lastPlayedAt: lastPlayedAt?.toISOString(),
    });
  };
  await writer.update({}, prepared);
  return deltas;
}

async function writeDeltas(tx, deltas) {
  const grouped = new Map();
  for (const delta of deltas) {
    const id = delta.table + stringify(delta.keys);
    let row = grouped.get(id);
    if (!row) {
      row = { ...delta, sums: {}, roles: {}, lastPlayedAt: null };
      grouped.set(id, row);
    }
    for (const [key, value] of Object.entries(delta.sums))
      row.sums[key] = (row.sums[key] ?? 0) + value;
    if (delta.role !== undefined)
      row.roles[delta.role] = (row.roles[delta.role] ?? 0) + 1;
    if (
      delta.lastPlayedAt &&
      (!row.lastPlayedAt || delta.lastPlayedAt > row.lastPlayedAt)
    )
      row.lastPlayedAt = delta.lastPlayedAt;
  }
  for (const tableName of [
    'champion_stats',
    'player_stats',
    'player_champion_stats',
  ]) {
    const rows = [...grouped.values()]
      .filter((r) => r.table === tableName)
      .sort((a, b) => stringify(a.keys).localeCompare(stringify(b.keys)));
    if (!rows.length) continue;
    const table = ident(tableName),
      hasRoles = tableName !== 'champion_stats',
      hasDate = tableName === 'player_champion_stats';
    const keyCols = Object.keys(rows[0].keys),
      sumCols = Object.keys(rows[0].sums);
    const cols = [
      ...keyCols,
      ...sumCols,
      ...Object.keys(rows[0].extra),
      ...(hasRoles ? ['roleDistribution'] : []),
      ...(hasDate ? ['lastPlayedAt'] : []),
    ];
    const values = rows.map((row) => {
      const data = { ...row.keys, ...row.sums, ...row.extra };
      const vs = cols.map((col) =>
        col === 'roleDistribution'
          ? Prisma.sql`${stringify(row.roles)}::jsonb`
          : col === 'lastPlayedAt'
            ? Prisma.sql`${new Date(row.lastPlayedAt)}`
            : Prisma.sql`${data[col]}`,
      );
      return Prisma.sql`(${Prisma.join(vs)})`;
    });
    const updates = sumCols.map(
      (col) =>
        Prisma.sql`${ident(col)}=${table}.${ident(col)}+EXCLUDED.${ident(col)}`,
    );
    if (hasRoles)
      updates.push(Prisma.sql`"roleDistribution"=(SELECT jsonb_object_agg(k,n) FROM
      (SELECT k,sum(v::int) n FROM (SELECT key k,value v FROM jsonb_each_text(${table}."roleDistribution")
      UNION ALL SELECT key,value FROM jsonb_each_text(EXCLUDED."roleDistribution")) r GROUP BY k) s)`);
    if (tableName === 'player_stats')
      updates.push(Prisma.sql`"lastUpdated"=CURRENT_TIMESTAMP`);
    if (hasDate)
      updates.push(
        Prisma.sql`"lastPlayedAt"=GREATEST(${table}."lastPlayedAt",EXCLUDED."lastPlayedAt")`,
      );
    await tx.$executeRaw(Prisma.sql`INSERT INTO ${table} (${Prisma.join(cols.map(ident))}) VALUES ${Prisma.join(values)}
      ON CONFLICT (${Prisma.join(keyCols.map(ident))}) DO UPDATE SET ${Prisma.join(updates)}`);
  }
}

// Match-level metadata once; subject/horizon metadata once; metric-specific data stays lossless.
const matchKeys = [
  'matchId',
  'datasetVersion',
  'patch',
  'queueId',
  'mapId',
  'gameCreation',
  'processingVersion',
];
const groupKeys = [
  'subjectKind',
  'subjectId',
  'horizonKey',
  'horizonMs',
  'championId',
  'role',
  'teamId',
  'playerIds',
];
const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));
function pack(prepared) {
  const common = {
    ...pick(prepared.rows[0], matchKeys),
    lineage: prepared.input.lineage,
    processedAt: prepared.completedAt.toISOString(),
  };
  const groups = new Map();
  for (const row of prepared.rows) {
    assert.equal(
      stringify(pick(row, matchKeys)),
      stringify(pick(prepared.rows[0], matchKeys)),
    );
    const meta = pick(row, groupKeys),
      key = stringify(meta);
    const group = groups.get(key) ?? { ...meta, metrics: [] };
    group.metrics.push(
      Object.fromEntries(
        Object.entries(row).filter(
          ([k]) =>
            !matchKeys.includes(k) &&
            !groupKeys.includes(k) &&
            !['lineage', 'processedAt'].includes(k),
        ),
      ),
    );
    groups.set(key, group);
  }
  return { common, groups: [...groups.values()] };
}
function unpack(packed) {
  return packed.groups.flatMap(({ metrics, ...meta }) =>
    metrics.map((metric) => ({ ...packed.common, ...meta, ...metric })),
  );
}
async function writePacked(tx, packed, generation = 1) {
  const m = packed.common;
  await tx.$executeRaw(Prisma.sql`INSERT INTO study_metric_matches ("matchId",generation,patch,"queueId","mapId","gameCreation",common)
    VALUES (${m.matchId},${generation},${m.patch},${m.queueId},${m.mapId},${BigInt(m.gameCreation)},${stringify(m)}::jsonb)`);
  const payload = packed.groups.map((g) => ({
    ...g,
    matchId: m.matchId,
    generation,
    meta: pick(g, groupKeys),
  }));
  await tx.$executeRaw(Prisma.sql`INSERT INTO study_metric_groups ("matchId",generation,"subjectKind","subjectId","horizonKey","championId",role,"playerIds",meta,metrics)
    SELECT "matchId",generation,"subjectKind","subjectId","horizonKey","championId",role,"playerIds",meta,metrics
    FROM jsonb_to_recordset(${stringify(payload)}::jsonb) AS x("matchId" text,generation int,"subjectKind" text,"subjectId" text,"horizonKey" text,"championId" int,role text,"playerIds" text[],meta jsonb,metrics jsonb)`);
}

const metricModel = Prisma.dmmf.datamodel.models.find(
  (m) => m.name === 'HistoricalMetricContribution',
);
const metricFields = metricModel.fields.filter(
  (f) =>
    f.kind !== 'object' &&
    !matchKeys.includes(f.name) &&
    !groupKeys.includes(f.name) &&
    !['lineage', 'processedAt'].includes(f.name),
);
const typeSql = (f) =>
  ({
    String: 'text',
    Int: 'integer',
    Float: 'double precision',
    Boolean: 'boolean',
    BigInt: 'bigint',
    DateTime: 'timestamp(3)',
    Json: 'jsonb',
  })[f.type] + (f.isList ? '[]' : '');
async function installNormalized(db) {
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS study_metric_subjects (
    id bigserial PRIMARY KEY,"matchId" text NOT NULL,generation int NOT NULL,
    "subjectKind" text NOT NULL,"subjectId" text NOT NULL,"horizonKey" text NOT NULL,"horizonMs" integer,
    "championId" integer,role text,"teamId" integer,"playerIds" text[] NOT NULL,
    UNIQUE("matchId",generation,"subjectKind","subjectId","horizonKey"),
    FOREIGN KEY("matchId",generation) REFERENCES study_metric_matches("matchId",generation) ON DELETE CASCADE)`);
  await db.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS study_subject_champion ON study_metric_subjects("championId",role)',
  );
  await db.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS study_subject_player ON study_metric_subjects USING gin("playerIds")',
  );
  await db.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS study_subject_identity ON study_metric_subjects("subjectKind","subjectId","horizonKey")',
  );
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS study_metric_values (
    "groupId" bigint NOT NULL REFERENCES study_metric_subjects(id) ON DELETE CASCADE,
    ${metricFields.map((f) => `"${f.name}" ${typeSql(f)} ${f.isRequired ? 'NOT NULL' : ''}`).join(',')},
    PRIMARY KEY(id),UNIQUE("groupId","definitionId","definitionVersion"))`);
  await db.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS study_value_definition ON study_metric_values("definitionId","definitionVersion",eligible,"groupId")',
  );
}
async function writeNormalized(tx, packed, generation = 1) {
  const m = packed.common;
  await tx.$executeRaw(Prisma.sql`INSERT INTO study_metric_matches ("matchId",generation,patch,"queueId","mapId","gameCreation",common)
    VALUES (${m.matchId},${generation},${m.patch},${m.queueId},${m.mapId},${BigInt(m.gameCreation)},${stringify(m)}::jsonb)`);
  const groupFields = metricModel.fields.filter((f) =>
    groupKeys.includes(f.name),
  );
  const defs = Prisma.raw(
    groupFields.map((f) => `"${f.name}" ${typeSql(f)}`).join(','),
  );
  const columns = Prisma.join(groupFields.map((f) => ident(f.name)));
  const values = Prisma.join(
    metricFields.map((f) => Prisma.sql`r.${ident(f.name)}`),
  );
  const metricDefs = Prisma.raw(
    metricFields.map((f) => `"${f.name}" ${typeSql(f)}`).join(','),
  );
  await tx.$executeRaw(Prisma.sql`WITH incoming AS MATERIALIZED (
    SELECT * FROM jsonb_to_recordset(${stringify(packed.groups)}::jsonb) AS x(${defs},metrics jsonb)),
    subjects AS (INSERT INTO study_metric_subjects ("matchId",generation,${columns})
      SELECT ${m.matchId},${generation},${columns} FROM incoming RETURNING *)
    INSERT INTO study_metric_values ("groupId",${Prisma.join(metricFields.map((f) => ident(f.name)))})
      SELECT s.id,${values} FROM incoming i JOIN subjects s USING ("subjectKind","subjectId","horizonKey")
      CROSS JOIN LATERAL jsonb_to_recordset(i.metrics) AS r(${metricDefs})`);
}

async function writeAtomic(tx, prepared, variant) {
  const client =
    variant === 'A' ? tx : proxy(tx, variant === 'B2' ? 'bulkAll' : 'events');
  await projectionWriter.write(client, prepared);
  if (variant === 'E') await writeNormalized(tx, pack(prepared));
  else if (variant === 'C' || variant === 'D')
    await writePacked(tx, pack(prepared));
  else await datasetWriter.write(client, prepared.input, prepared.rows);
  if (variant === 'A' || variant === 'B')
    await statsWriter.update(tx, prepared);
  else await writeDeltas(tx, await statsDeltas(prepared));
}

module.exports = {
  root,
  from,
  Prisma,
  stringify,
  ident,
  prepare,
  proxy,
  recordset,
  pack,
  unpack,
  writePacked,
  installNormalized,
  writeNormalized,
  metricFields,
  matchKeys,
  groupKeys,
  statsDeltas,
  writeDeltas,
  writeAtomic,
  projectionWriter,
  datasetWriter,
  statsWriter,
  PROCESSING_VERSION,
};
