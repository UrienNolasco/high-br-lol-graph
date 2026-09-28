import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ProcessingService } from '../../src/core/processing/processing.service';
import { RebuildService } from '../../src/core/processing/rebuild.service';
import { PlayerStatsAggregationService } from '../../src/modules/stats/adapters/persistence/player-stats-writer';
import { TimelineParserService } from '../../src/modules/matches/adapters/riot/timeline-parser.service';
import { MatchPersistenceService } from '../../src/modules/worker/services/match-persistence.service';
import { WorkerService } from '../../src/modules/worker/services/worker.service';
import { readFinalInventory } from '../../src/modules/matches/contracts/final-inventory';
const source = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
);
const timeline = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
    'utf8',
  ),
);
let db: PrismaService;
let jobs: ProcessingService;
let worker: WorkerService;
let aggregates: PlayerStatsAggregationService;
const riot = { getMatchById: jest.fn(), getTimeline: jest.fn() };
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_integration'))
    throw new Error('Disposable *_integration database required');
  db = new PrismaService({ datasourceUrl: url });
  await db.$connect();
  jobs = new ProcessingService(db);
  aggregates = new PlayerStatsAggregationService();
  worker = new WorkerService(
    riot as any,
    new TimelineParserService(),
    new MatchPersistenceService(db, jobs, aggregates),
    jobs,
    new PinoLogger({ pinoHttp: { level: 'silent' } }),
  );
});
beforeEach(async () => {
  jest.restoreAllMocks();
  await db.$transaction([
    db.match.deleteMany(),
    db.playerStats.deleteMany(),
    db.playerChampionStats.deleteMany(),
    db.championStats.deleteMany(),
    db.matchProcessing.deleteMany(),
    db.processingMaintenance.deleteMany(),
  ]);
});
afterAll(async () => db?.$disconnect());
async function seed(summary = structuredClone(source)) {
  const id = summary.metadata.matchId;
  await jobs.enqueue(id);
  await db.matchRaw.create({
    data: {
      matchId: id,
      summary: gzipSync(JSON.stringify(summary)),
      timeline: gzipSync(JSON.stringify(timeline)),
    },
  });
  return id;
}
async function snapshot() {
  return db.matchParticipant.findMany({
    select: { puuid: true, finalInventory: true },
    orderBy: { puuid: 'asc' },
  });
}
test('all 70 slots and quest slots survive persistence, redelivery and two rebuilds', async () => {
  const id = await seed();
  await worker.processMatch({ matchId: id });
  const expected = await snapshot();
  expect(expected).toHaveLength(10);
  for (const row of expected) {
    const player = source.info.participants.find((p) => p.puuid === row.puuid);
    const inventory = readFinalInventory(row.finalInventory)!;
    expect(inventory.slots.map((s) => s.itemId)).toEqual(
      Array.from({ length: 7 }, (_, i) => player[`item${i}`]),
    );
    expect(inventory.roleBoundItem.itemId).toBe(player.roleBoundItem);
  }
  await worker.processMatch({ matchId: id });
  expect(await snapshot()).toEqual(expected);
  const rebuild = new RebuildService(db, worker);
  expect(await rebuild.run()).toBe(1);
  expect(await snapshot()).toEqual(expected);
  expect(await rebuild.run()).toBe(1);
  expect(await snapshot()).toEqual(expected);
  expect(riot.getMatchById).not.toHaveBeenCalled();
});
test('inventory rolls back with the match and missing fields remain null on recovery', async () => {
  const summary = structuredClone(source);
  delete summary.info.participants[0].item0;
  delete summary.info.participants[0].roleBoundItem;
  const id = await seed(summary);
  const fail = jest
    .spyOn(aggregates, 'update')
    .mockRejectedValueOnce(new Error('failure after participant write'));
  await worker.processMatch({ matchId: id });
  expect(await db.matchParticipant.count()).toBe(0);
  expect(await db.matchRaw.count()).toBe(1);
  fail.mockRestore();
  await db.matchProcessing.update({
    where: { matchId: id },
    data: { nextAttemptAt: new Date(0) },
  });
  await worker.processMatch({ matchId: id });
  const row = await db.matchParticipant.findUniqueOrThrow({
    where: {
      matchId_puuid: { matchId: id, puuid: summary.info.participants[0].puuid },
    },
  });
  const inventory = readFinalInventory(row.finalInventory)!;
  expect(inventory.slots[0]).toMatchObject({
    itemId: null,
    reason: 'missing_field',
  });
  expect(inventory.roleBoundItem).toEqual({
    itemId: null,
    reason: 'missing_field',
  });
});
