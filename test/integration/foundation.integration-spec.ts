import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ProcessingService } from '../../src/core/processing/processing.service';
import { PROCESSING_VERSION } from '../../src/core/processing/processing.constants';
import { RebuildService } from '../../src/core/processing/rebuild.service';
import { PlayerStatsAggregationService } from '../../src/modules/stats/adapters/persistence/player-stats-writer';
import { TimelineParserService } from '../../src/modules/matches/adapters/riot/timeline-parser.service';
import { MatchPersistenceService } from '../../src/modules/worker/services/match-persistence.service';
import { WorkerService } from '../../src/modules/worker/services/worker.service';
import { MatchDto } from '../../src/core/riot/dto/match.dto';
import { TimelineDto } from '../../src/core/riot/dto/timeline.dto';
import { RiotService } from '../../src/core/riot/riot.service';

const summarySource = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
) as MatchDto;
const timelineSource = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
    'utf8',
  ),
) as TimelineDto;
let db: PrismaService;
let jobs: ProcessingService;
let worker: WorkerService;
let aggregates: PlayerStatsAggregationService;
const riot = { getMatchById: jest.fn(), getTimeline: jest.fn() };
const evidence: Record<string, unknown> = {
  task: 'MET-09',
  processingVersion: PROCESSING_VERSION,
  scope:
    'isolated local PostgreSQL; one real fixture plus renamed synthetic copies; no production changes',
  fixture: 'BR1_3200579475',
};
const tables = [
  'matches',
  'match_participants',
  'match_teams',
  'match_timeline_projections',
  'match_event_projections',
  'player_stats',
  'player_champion_stats',
  'champion_stats',
] as const;
const legacyTables = [
  'matches',
  'match_participants',
  'match_teams',
  'match_raw',
  'player_stats',
  'player_champion_stats',
  'champion_stats',
] as const;
const migrations = [
  '20260923020000_met04_normalized_events',
  '20260923030000_met05',
  '20260923040000_met06_final_inventory',
  '20260923120000_met03_timeline_snapshots',
];
function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
async function snapshot() {
  const result: Record<string, unknown[]> = {};
  for (const table of tables) {
    // Identifiers come exclusively from the constant allowlist above.
    result[table] = await db.$queryRawUnsafe(
      `SELECT to_jsonb(t) - 'id' - 'lastUpdated' - 'processedAt' AS row FROM "${table}" t ORDER BY (to_jsonb(t) - 'id' - 'lastUpdated' - 'processedAt')::text`,
    );
  }
  return result;
}
async function rawFingerprint() {
  return digest(
    await db.$queryRaw`SELECT "matchId", encode(summary, 'hex') AS summary, encode(timeline, 'hex') AS timeline FROM match_raw ORDER BY "matchId"`,
  );
}
async function seed(id: string) {
  const summary = structuredClone(summarySource),
    timeline = structuredClone(timelineSource);
  summary.metadata.matchId = timeline.metadata.matchId = id;
  await jobs.enqueue(id);
  await db.matchRaw.create({
    data: {
      matchId: id,
      summary: gzipSync(JSON.stringify(summary)),
      timeline: gzipSync(JSON.stringify(timeline)),
    },
  });
  await worker.processMatch({ matchId: id });
  expect(
    (await db.matchProcessing.findUniqueOrThrow({ where: { matchId: id } }))
      .status,
  ).toBe('COMPLETED');
}
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_integration'))
    throw new Error('Disposable *_integration database required');
  db = new PrismaService({ datasourceUrl: url });
  await db.$connect();
  jobs = new ProcessingService(db);
  aggregates = new PlayerStatsAggregationService();
  worker = new WorkerService(
    riot as unknown as RiotService,
    new TimelineParserService(),
    new MatchPersistenceService(db, jobs, aggregates),
    jobs,
    new PinoLogger({ pinoHttp: { level: 'silent' } }),
  );
});
beforeEach(async () => {
  jest.restoreAllMocks();
  riot.getMatchById
    .mockReset()
    .mockRejectedValue(new Error('Unexpected Riot request'));
  riot.getTimeline
    .mockReset()
    .mockRejectedValue(new Error('Unexpected Riot request'));
  await db.$transaction([
    db.discoveryObservation.deleteMany(),
    db.match.deleteMany(),
    db.playerStats.deleteMany(),
    db.playerChampionStats.deleteMany(),
    db.championStats.deleteMany(),
    db.matchProcessing.deleteMany(),
    db.processingMaintenance.deleteMany(),
  ]);
});
afterAll(async () => {
  await db?.$disconnect();
  if (process.env.MET09_EVIDENCE_PATH)
    writeFileSync(
      process.env.MET09_EVIDENCE_PATH,
      JSON.stringify(evidence, null, 2) + '\n',
    );
});

test('all four additive migrations preserve populated legacy columns and raw bytes', async () => {
  await seed('BR1_909001');
  const schema = `met09_migration_${process.pid}`;
  try {
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const result = await db.$transaction(
      async (tx) => {
        for (const table of legacyTables)
          await tx.$executeRawUnsafe(
            `CREATE TABLE "${schema}"."${table}" AS TABLE public."${table}"`,
          );
        await tx.$executeRawUnsafe(
          `ALTER TABLE "${schema}".matches ADD PRIMARY KEY ("matchId")`,
        );
        await tx.$executeRawUnsafe(
          `ALTER TABLE "${schema}".matches DROP COLUMN "finalContext"`,
        );
        await tx.$executeRawUnsafe(
          `ALTER TABLE "${schema}".match_participants DROP COLUMN "riotIdGameName", DROP COLUMN "riotIdTagline", DROP COLUMN "finalStats", DROP COLUMN "finalInventory"`,
        );
        await tx.$executeRawUnsafe(
          `ALTER TABLE "${schema}".match_teams DROP COLUMN "finalObjectives"`,
        );
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        const columns: Record<string, string> = {};
        const before: Record<string, unknown[]> = {};
        for (const table of legacyTables) {
          const names = await tx.$queryRawUnsafe<
            Array<{ column_name: string }>
          >(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${table}' ORDER BY ordinal_position`,
          );
          columns[table] = names.map((n) => `"${n.column_name}"`).join(', ');
          before[table] = await tx.$queryRawUnsafe(
            `SELECT to_jsonb(t) AS row FROM (SELECT ${columns[table]} FROM "${table}") t ORDER BY to_jsonb(t)::text`,
          );
        }
        const start = performance.now();
        for (const name of migrations) {
          const sql = readFileSync(
            join(__dirname, '../../prisma/migrations', name, 'migration.sql'),
            'utf8',
          );
          for (const statement of sql.split(';').filter((s) => s.trim()))
            await tx.$executeRawUnsafe(statement);
        }
        const migrationMs = performance.now() - start;
        const hashes: Record<string, unknown> = {};
        for (const table of legacyTables) {
          const after = await tx.$queryRawUnsafe<unknown[]>(
            `SELECT to_jsonb(t) AS row FROM (SELECT ${columns[table]} FROM "${table}") t ORDER BY to_jsonb(t)::text`,
          );
          expect(after).toEqual(before[table]);
          hashes[table] = {
            rows: after.length,
            before: digest(before[table]),
            after: digest(after),
          };
        }
        const [absence] = await tx.$queryRawUnsafe<
          Array<{
            participants: number;
            matches: number;
            teams: number;
            events: number;
            snapshots: number;
          }>
        >(
          `SELECT (SELECT count(*)::int FROM match_participants WHERE "finalStats" IS NULL AND "finalInventory" IS NULL AND "riotIdGameName" IS NULL AND "riotIdTagline" IS NULL) AS participants, (SELECT count(*)::int FROM matches WHERE "finalContext" IS NULL) AS matches, (SELECT count(*)::int FROM match_teams WHERE "finalObjectives" IS NULL) AS teams, (SELECT count(*)::int FROM match_event_projections) AS events, (SELECT count(*)::int FROM match_timeline_projections) AS snapshots`,
        );
        expect(absence).toEqual({
          participants: 10,
          matches: 1,
          teams: 2,
          events: 0,
          snapshots: 0,
        });
        return {
          migrationMs,
          migrations,
          legacyHashes: hashes,
          absentProjectionsBeforeRebuild: absence,
        };
      },
      { timeout: 30000 },
    );
    evidence.migration = result;
  } finally {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});

test('integrated projections and contributions survive redelivery, interrupted resume and two rebuilds', async () => {
  await seed('BR1_909001');
  await seed('BR1_909002');
  const expected = await snapshot(),
    rawBefore = await rawFingerprint();
  await worker.processMatch({ matchId: 'BR1_909001' });
  expect(await snapshot()).toEqual(expected);
  const rebuild = new RebuildService(db, worker);
  const start = performance.now();
  await expect(
    rebuild.run(false, () => {
      throw new Error('controlled interruption after first commit');
    }),
  ).rejects.toThrow('controlled interruption');
  const committed = await db.matchProcessing.findUniqueOrThrow({
    where: { matchId: 'BR1_909001' },
  });
  const event = await db.matchEventProjection.findFirstOrThrow({
    where: { matchId: 'BR1_909001' },
    orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
  });
  expect(committed.status).toBe('COMPLETED');
  expect(await db.match.count()).toBe(1);
  await expect(jobs.enqueue('BR1_909003')).rejects.toThrow('paused');
  expect(await jobs.claim('BR1_909002')).toBeNull();
  expect(await rebuild.run(true)).toBe(1);
  const resumed = await db.matchProcessing.findUniqueOrThrow({
    where: { matchId: 'BR1_909001' },
  });
  expect(resumed.completedAt).toEqual(committed.completedAt);
  expect(
    await db.matchEventProjection.findUniqueOrThrow({
      where: {
        matchId_frameIndex_eventIndex: {
          matchId: event.matchId,
          frameIndex: event.frameIndex,
          eventIndex: event.eventIndex,
        },
      },
    }),
  ).toEqual(event);
  expect(await snapshot()).toEqual(expected);
  const resumedMs = performance.now() - start;
  const fullStart = performance.now();
  expect(await rebuild.run()).toBe(2);
  expect(await snapshot()).toEqual(expected);
  expect(await rawFingerprint()).toBe(rawBefore);
  expect(
    await db.matchProcessing.count({
      where: { status: 'COMPLETED', processingVersion: PROCESSING_VERSION },
    }),
  ).toBe(2);
  expect(riot.getMatchById).not.toHaveBeenCalled();
  expect(riot.getTimeline).not.toHaveBeenCalled();
  const fullRebuildMs = performance.now() - fullStart;
  const storage: Record<string, unknown> = {};
  for (const table of [...tables, 'match_raw']) {
    const [size] = await db.$queryRawUnsafe<
      Array<{ rows: number; rowBytes: number }>
    >(
      `SELECT count(*)::int AS rows, coalesce(sum(pg_column_size(t)),0)::int AS "rowBytes" FROM "${table}" t`,
    );
    storage[table] = size;
  }
  evidence.rebuild = {
    syntheticMatchCopies: 2,
    sourceFramesPerMatch: 41,
    sourceSnapshotsPerMatch: 410,
    sourceEventsPerMatch: 1966,
    redeliveryIdentical: true,
    interruptedResumeMs: resumedMs,
    fullRebuildMs,
    beforeHash: digest(expected),
    afterHash: digest(await snapshot()),
    rawBefore,
    rawAfter: await rawFingerprint(),
    committedMatchRetained: true,
    storage,
    storageMethod:
      'sum(pg_column_size(row)); row payload only, excludes indexes and relation free space',
  };
});

test('failure after every projection and aggregate write rolls the entire match back and recovers', async () => {
  await seed('BR1_909001');
  const before = await snapshot();
  const summary = structuredClone(summarySource),
    timeline = structuredClone(timelineSource);
  const id = 'BR1_909002';
  summary.metadata.matchId = timeline.metadata.matchId = id;
  await jobs.enqueue(id);
  await db.matchRaw.create({
    data: {
      matchId: id,
      summary: gzipSync(JSON.stringify(summary)),
      timeline: gzipSync(JSON.stringify(timeline)),
    },
  });
  const original = aggregates.update.bind(aggregates);
  const fault = jest
    .spyOn(aggregates, 'update')
    .mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error('controlled post-aggregate failure');
    });
  await worker.processMatch({ matchId: id });
  expect(await snapshot()).toEqual(before);
  expect(await db.matchRaw.count()).toBe(2);
  expect(
    await db.matchProcessing.findUniqueOrThrow({ where: { matchId: id } }),
  ).toMatchObject({ status: 'RETRY_WAIT', processingVersion: null });
  fault.mockRestore();
  await db.matchProcessing.update({
    where: { matchId: id },
    data: { nextAttemptAt: new Date(0) },
  });
  await worker.processMatch({ matchId: id });
  expect(await db.match.count()).toBe(2);
  expect(await db.matchEventProjection.count()).toBe(3932);
  expect(await db.matchTimelineProjection.count()).toBe(2);
  const participants = await db.matchParticipant.findMany();
  expect(participants).toHaveLength(20);
  expect(
    participants.every(
      (p) => p.finalStats !== null && p.finalInventory !== null,
    ),
  ).toBe(true);
  const final = await snapshot();
  await worker.processMatch({ matchId: id });
  expect(await snapshot()).toEqual(final);
  evidence.rollback = {
    failureAfterAggregateWrite: true,
    allProjectionAndAggregateTablesUnchanged: true,
    rawRetained: true,
    recoveryComplete: true,
    recoveryRedeliveryIdentical: true,
  };
});
