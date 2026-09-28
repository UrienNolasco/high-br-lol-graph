import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ProcessingService } from '../../src/core/processing/processing.service';
import { RebuildService } from '../../src/core/processing/rebuild.service';
import { PROCESSING_VERSION } from '../../src/core/processing/processing.constants';
import { PlayerStatsAggregationService } from '../../src/modules/stats/adapters/persistence/player-stats-writer';
import { TimelineParserService } from '../../src/modules/matches/adapters/riot/timeline-parser.service';
import { MatchPersistenceService } from '../../src/modules/worker/services/match-persistence.service';
import { WorkerService } from '../../src/modules/worker/services/worker.service';
import { RiotService } from '../../src/core/riot/riot.service';
import { MatchDto } from '../../src/core/riot/dto/match.dto';
import { TimelineDto } from '../../src/core/riot/dto/timeline.dto';

const summary = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
) as MatchDto;
const timeline = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
    'utf8',
  ),
) as TimelineDto;
const matchId = summary.metadata.matchId;
let prisma: PrismaService;
let jobs: ProcessingService;
let parser: TimelineParserService;
let worker: WorkerService;

beforeAll(async () => {
  const datasourceUrl = process.env.TEST_DATABASE_URL;
  if (
    !datasourceUrl ||
    !new URL(datasourceUrl).pathname.includes('integration')
  )
    throw new Error('Explicit disposable integration database required');
  prisma = new PrismaService({ datasourceUrl });
  await prisma.$connect();
  jobs = new ProcessingService(prisma);
  parser = new TimelineParserService();
  worker = new WorkerService(
    {
      getMatchById: jest.fn(() => {
        throw new Error('Unexpected network read');
      }),
      getTimeline: jest.fn(() => {
        throw new Error('Unexpected network read');
      }),
    } as unknown as RiotService,
    parser,
    new MatchPersistenceService(
      prisma,
      jobs,
      new PlayerStatsAggregationService(),
    ),
    jobs,
    new PinoLogger({ pinoHttp: { level: 'silent' } }),
  );
});
beforeEach(async () => {
  jest.restoreAllMocks();
  await prisma.$transaction([
    prisma.match.deleteMany(),
    prisma.playerStats.deleteMany(),
    prisma.playerChampionStats.deleteMany(),
    prisma.championStats.deleteMany(),
    prisma.matchProcessing.deleteMany(),
    prisma.processingMaintenance.deleteMany(),
  ]);
  await jobs.enqueue(matchId);
  await prisma.matchRaw.create({
    data: {
      matchId,
      summary: gzipSync(JSON.stringify(summary)),
      timeline: gzipSync(JSON.stringify(timeline)),
    },
  });
});
afterAll(async () => {
  await prisma?.$disconnect();
});

test('real events round-trip transactionally, redelivery is idempotent and repeated offline rebuild does not double count', async () => {
  await worker.processMatch({ matchId });
  const rows = await prisma.matchEventProjection.findMany({
    where: { matchId },
    orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
  });
  expect(rows).toHaveLength(1966);
  for (const row of rows) {
    expect(row.payload).toEqual(
      timeline.info.frames[row.frameIndex].events[row.eventIndex],
    );
    expect(row.processingVersion).toBe(PROCESSING_VERSION);
    expect(row.metricVersion).toBe(1);
    expect(row.processedAt).toBeInstanceOf(Date);
  }
  const ward = rows.find((e) => e.type === 'WARD_PLACED')!;
  expect(ward.positionX).toBeNull();
  expect(ward.positionY).toBeNull();
  const absentAssist = rows.find(
    (e) =>
      e.type === 'BUILDING_KILL' && !(e.payload as any).assistingParticipantIds,
  )!;
  expect(absentAssist.assistingParticipantIds).toBeNull();
  await worker.processMatch({ matchId });
  expect(await prisma.matchEventProjection.count()).toBe(1966);
  const rebuild = new RebuildService(prisma, worker);
  const stable = (events: typeof rows) =>
    events.map((event) => ({ ...event, processedAt: null }));
  for (let iteration = 0; iteration < 2; iteration++) {
    expect(await rebuild.run()).toBe(1);
    const rebuilt = await prisma.matchEventProjection.findMany({
      where: { matchId },
      orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
    });
    expect(stable(rebuilt)).toEqual(stable(rows));
    const stats = await prisma.playerStats.findMany();
    expect(stats.length).toBeGreaterThan(0);
    expect(stats.every((p) => p.gamesPlayed === 1)).toBe(true);
  }
});

test('duplicate source identity aborts participants/events/aggregates atomically and never publishes COMPLETED', async () => {
  jest.spyOn(parser, 'parseTimeline').mockImplementationOnce((...args) => {
    const data = new TimelineParserService().parseTimeline(...args);
    data.normalizedEvents.push({ ...data.normalizedEvents[0] });
    return data;
  });
  await worker.processMatch({ matchId });
  expect(await prisma.match.count()).toBe(0);
  expect(await prisma.matchParticipant.count()).toBe(0);
  expect(await prisma.matchEventProjection.count()).toBe(0);
  expect(await prisma.playerStats.count()).toBe(0);
  expect(
    (await prisma.matchProcessing.findUniqueOrThrow({ where: { matchId } }))
      .status,
  ).not.toBe('COMPLETED');
});

test('unknown event types and equal timestamps survive the database without invented actors or teams', async () => {
  const synthetic = structuredClone(timeline);
  synthetic.info.frames[0].events.push(
    {
      type: 'FUTURE_EVENT',
      timestamp: 0,
      participantId: 0,
      teamId: 0,
      extra: { zero: 0, absent: null },
    },
    {
      type: 'FUTURE_EVENT',
      timestamp: 0,
      participantId: 0,
      teamId: 0,
      extra: { zero: 1 },
    },
  );
  await prisma.matchRaw.update({
    where: { matchId },
    data: { timeline: gzipSync(JSON.stringify(synthetic)) },
  });
  await worker.processMatch({ matchId });
  const events = await prisma.matchEventProjection.findMany({
    where: { matchId, type: 'FUTURE_EVENT' },
    orderBy: { eventIndex: 'asc' },
  });
  expect(events).toHaveLength(2);
  expect(events[0].eventIndex).not.toBe(events[1].eventIndex);
  expect(events[0]).toMatchObject({
    timestampMs: 0,
    actorParticipantId: null,
    actorPuuid: null,
    sourceTeamId: null,
    beneficiaryTeamId: null,
    quality: expect.objectContaining({ unknownType: true }),
    payload: expect.objectContaining({ extra: { zero: 0, absent: null } }),
  });
});
