import {
  FINAL_STAT_UNITS,
  FINAL_FLAG_FIELDS,
} from '../../src/modules/matches/contracts/final-stats';
import { DiscoveryReportService } from '../../src/modules/collector/services/discovery-report.service';
import { DiscoveryService } from '../../src/modules/collector/services/discovery.service';
import { CollectorRepository } from '../../src/modules/collector/repositories/collector.repository';
import { DiscoveryContext } from '../../src/modules/collector/contracts/discovery';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { connect, ChannelWrapper } from 'amqp-connection-manager';
import * as amqp from 'amqplib';
import { HttpException } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ProcessingService } from '../../src/modules/processing/services/processing.service';
import { RebuildService } from '../../src/modules/processing/services/rebuild.service';
import { PlayerStatsAggregationService } from '../../src/modules/stats/adapters/persistence/player-stats-writer';
import { WorkerService } from '../../src/modules/worker/services/worker.service';
import { WorkerController } from '../../src/modules/worker/worker.controller';
import { RiotService } from '../../src/core/riot/riot.service';
import { QueueService } from '../../src/core/queue/queue.service';
import { MatchDto } from '../../src/core/riot/dto/match.dto';
import { TimelineDto } from '../../src/core/riot/dto/timeline.dto';
import { playerChampionAverages } from '../../src/modules/stats/contracts/aggregate.mapper';
import { PlayerStatsReaderAdapter } from '../../src/modules/stats/adapters/persistence/player-stats-reader';
import { ChampionStatsRepository } from '../../src/modules/stats/repositories/champion-stats.repository';
import { MAX_ATTEMPTS } from '../../src/lib/processing-policy';
import { LeaseLostError } from '../../src/lib/processing-errors';
import { createProcessingService } from '../helpers/processing';

const summaryTemplate = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
) as MatchDto;
const timelineTemplate = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
    'utf8',
  ),
) as TimelineDto;
const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
const originalMode = process.env.APP_MODE;
const originalQueue = process.env.RABBITMQ_QUEUE;
let prisma: PrismaService;
let secondPrisma: PrismaService;
let jobs: ProcessingService;
let discovery: DiscoveryService;
let worker: WorkerService;
let otherWorker: WorkerService;
let aggregates: PlayerStatsAggregationService;
const riot = { getMatchById: jest.fn(), getTimeline: jest.fn() };
let rabbit: Awaited<ReturnType<typeof amqp.connect>>;
let broker: amqp.Channel;
let publisher: ReturnType<typeof connect>;
let channel: ChannelWrapper;
let queue: QueueService;
const queueName = `high-br-integration-${process.pid}`;

function makeWorker(db: PrismaService) {
  const aggregation = new PlayerStatsAggregationService();
  const processing = createProcessingService(
    db,
    riot as unknown as RiotService,
    logger,
    aggregation,
  );
  const service = new WorkerService(processing, logger);
  return { service, aggregation };
}
function fixture(id = 'BR1_3200579475', queueId = 420) {
  const summary = structuredClone(summaryTemplate);
  const timeline = structuredClone(timelineTemplate);
  summary.metadata.matchId = timeline.metadata.matchId = id;
  summary.info.queueId = queueId;
  return { summary, timeline };
}
async function seed(summary: MatchDto, timeline: TimelineDto) {
  await jobs.enqueue(summary.metadata.matchId);
  await prisma.matchRaw.create({
    data: {
      matchId: summary.metadata.matchId,
      summary: gzipSync(JSON.stringify(summary)),
      timeline: gzipSync(JSON.stringify(timeline)),
    },
  });
}
async function due(matchId: string) {
  await prisma.matchProcessing.update({
    where: { matchId },
    data: { nextAttemptAt: new Date(0) },
  });
}
async function snapshot() {
  const [players, champions, playerChampions] = await Promise.all([
    prisma.playerStats.findMany({
      orderBy: [{ puuid: 'asc' }, { patch: 'asc' }, { queueId: 'asc' }],
    }),
    prisma.championStats.findMany({
      orderBy: [{ championId: 'asc' }, { patch: 'asc' }, { queueId: 'asc' }],
    }),
    prisma.playerChampionStats.findMany({
      orderBy: [
        { puuid: 'asc' },
        { championId: 'asc' },
        { patch: 'asc' },
        { queueId: 'asc' },
      ],
    }),
  ]);
  const strip = (row: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(row).filter(
        ([key]) => !['id', 'lastUpdated'].includes(key),
      ),
    );
  return {
    historical: (
      await prisma.historicalMetricContribution.findMany({
        orderBy: { id: 'asc' },
      })
    ).map(({ processedAt, ...row }) => row),
    popularity: await new ChampionStatsRepository(prisma).findPopulation(
      '16.2',
    ),
    players: players.map(strip),
    champions: champions.map(strip),
    playerChampions: playerChampions.map(strip),
  };
}
async function getDelivery() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const message = await broker.get(queueName, { noAck: false });
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Expected RabbitMQ delivery did not arrive');
}

beforeAll(async () => {
  const db = process.env.TEST_DATABASE_URL;
  const rmq = process.env.TEST_RABBITMQ_URL;
  if (!db || !new URL(db).pathname.endsWith('_integration') || !rmq) {
    throw new Error(
      'Set TEST_DATABASE_URL to a disposable *_integration database and TEST_RABBITMQ_URL',
    );
  }
  process.env.APP_MODE = 'WORKER';
  process.env.RABBITMQ_QUEUE = queueName;
  prisma = new PrismaService({ datasourceUrl: db });
  secondPrisma = new PrismaService({ datasourceUrl: db });
  await Promise.all([prisma.$connect(), secondPrisma.$connect()]);
  jobs = createProcessingService(
    prisma,
    riot as unknown as RiotService,
    logger,
  );
  discovery = new DiscoveryService(jobs, new CollectorRepository(prisma));
  ({ service: worker, aggregation: aggregates } = makeWorker(prisma));
  otherWorker = makeWorker(secondPrisma).service;
  rabbit = await amqp.connect(rmq);
  broker = await rabbit.createChannel();
  await broker.assertQueue(queueName, {
    durable: true,
    arguments: { 'x-max-priority': 10 },
  });
  publisher = connect([rmq]);
  channel = publisher.createChannel({ confirm: true, publishTimeout: 2000 });
  await channel.waitForConnect();
  queue = new QueueService(channel, logger, jobs);
});
beforeEach(async () => {
  jest.restoreAllMocks();
  riot.getMatchById
    .mockReset()
    .mockRejectedValue(new Error('Unexpected Riot request'));
  riot.getTimeline
    .mockReset()
    .mockRejectedValue(new Error('Unexpected Riot request'));
  await prisma.$transaction([
    prisma.discoveryObservation.deleteMany(),
    prisma.match.deleteMany(),
    prisma.playerStats.deleteMany(),
    prisma.playerChampionStats.deleteMany(),
    prisma.championStats.deleteMany(),
    prisma.matchProcessing.deleteMany(),
    prisma.processingMaintenance.deleteMany(),
  ]);
  await broker.purgeQueue(queueName);
});
afterAll(async () => {
  if (broker) await broker.deleteQueue(queueName);
  await publisher?.close();
  await rabbit?.close();
  await Promise.all([prisma?.$disconnect(), secondPrisma?.$disconnect()]);
  if (originalMode === undefined) delete process.env.APP_MODE;
  else process.env.APP_MODE = originalMode;
  if (originalQueue === undefined) delete process.env.RABBITMQ_QUEUE;
  else process.env.RABBITMQ_QUEUE = originalQueue;
});

test('two workers and concurrent enqueue apply one complete match exactly once', async () => {
  const { summary, timeline } = fixture();
  await Promise.all(
    Array.from({ length: 8 }, () => jobs.enqueue(summary.metadata.matchId)),
  );
  await prisma.matchRaw.create({
    data: {
      matchId: summary.metadata.matchId,
      summary: gzipSync(JSON.stringify(summary)),
      timeline: gzipSync(JSON.stringify(timeline)),
    },
  });
  await Promise.all([
    worker.processMatch({ matchId: summary.metadata.matchId }),
    otherWorker.processMatch({ matchId: summary.metadata.matchId }),
  ]);
  await worker.processMatch({ matchId: summary.metadata.matchId });
  expect(await prisma.match.count()).toBe(1);
  expect(await prisma.matchParticipant.count()).toBe(10);
  expect(await prisma.matchTeam.count()).toBe(2);
  expect(
    (
      await prisma.matchProcessing.findUniqueOrThrow({
        where: { matchId: summary.metadata.matchId },
      })
    ).status,
  ).toBe('COMPLETED');
  for (const p of summary.info.participants) {
    const stat = await prisma.playerStats.findUniqueOrThrow({
      where: {
        puuid_patch_queueId: { puuid: p.puuid, patch: 'ALL', queueId: 420 },
      },
    });
    expect(stat.gamesPlayed).toBe(1);
    expect(stat.wins).toBe(Number(p.win));
    expect(stat.sumDpm).toBeCloseTo(
      p.totalDamageDealtToChampions / (summary.info.gameDuration / 60),
      8,
    );
    expect(stat.sumCspm).toBeCloseTo(
      (p.totalMinionsKilled + p.neutralMinionsKilled) /
        (summary.info.gameDuration / 60),
      8,
    );
    expect(stat.sumKda).toBeCloseTo(
      (p.kills + p.assists) / Math.max(p.deaths, 1),
      8,
    );
  }
  const fiora = summary.info.participants[0];
  const stat = await prisma.playerChampionStats.findUniqueOrThrow({
    where: {
      puuid_championId_patch_queueId: {
        puuid: fiora.puuid,
        championId: fiora.championId,
        patch: 'ALL',
        queueId: 420,
      },
    },
  });
  expect(stat.sumGd15).toBe(3088);
  expect(stat.sumCsd15).toBe(38);
  expect(stat.sumXpd15).toBe(3318);
  const team = await prisma.matchTeam.findUniqueOrThrow({
    where: {
      matchId_teamId: { matchId: summary.metadata.matchId, teamId: 100 },
    },
  });
  expect(
    (team.objectivesTimeline as Array<{ type: string }>).filter(
      (event) => event.type === 'TOWER',
    ),
  ).toHaveLength(7);
});

test('different concurrent matches retain every shared aggregate increment and latest played date', async () => {
  const matches = Array.from({ length: 6 }, (_, i) => {
    const value = fixture(`BR1_${100 + i}`);
    value.summary.info.gameCreation -= i * 1_000_000;
    value.summary.info.gameDuration += i * 300;
    return value;
  });
  for (const item of matches) await seed(item.summary, item.timeline);
  const outcomes = await Promise.allSettled(
    matches.map((item, i) =>
      (i % 2 ? worker : otherWorker).processMatch({
        matchId: item.summary.metadata.matchId,
      }),
    ),
  );
  expect(outcomes).toEqual(
    matches.map(() => ({ status: 'fulfilled', value: undefined })),
  );
  const publications = await prisma.matchProcessing.findMany({
    where: {
      matchId: { in: matches.map((item) => item.summary.metadata.matchId) },
    },
    select: { matchId: true, status: true, lastError: true },
    orderBy: { matchId: 'asc' },
  });
  expect(publications).toEqual(
    matches
      .map((item) => ({
        matchId: item.summary.metadata.matchId,
        status: 'COMPLETED',
        lastError: null,
      }))
      .sort((a, b) => a.matchId.localeCompare(b.matchId)),
  );
  expect(await prisma.match.count()).toBe(6);
  const p = summaryTemplate.info.participants[0];
  const stat = await prisma.playerChampionStats.findUniqueOrThrow({
    where: {
      puuid_championId_patch_queueId: {
        puuid: p.puuid,
        championId: p.championId,
        patch: 'ALL',
        queueId: 420,
      },
    },
  });
  expect(stat.gamesPlayed).toBe(6);
  expect(stat.sumDpm).toBeCloseTo(
    matches.reduce(
      (sum, item) =>
        sum +
        p.totalDamageDealtToChampions / (item.summary.info.gameDuration / 60),
      0,
    ),
    8,
  );
  expect(stat.roleDistribution).toEqual({ TOP: 6 });
  expect(stat.lastPlayedAt?.getTime()).toBe(summaryTemplate.info.gameCreation);
});

test('a failure after all aggregate writes rolls back everything except retained raw payloads', async () => {
  const { summary, timeline } = fixture();
  await seed(summary, timeline);
  const original = new PlayerStatsAggregationService();
  jest.spyOn(aggregates, 'update').mockImplementationOnce(async (...args) => {
    await original.update(...args);
    throw new Error('injected transaction failure');
  });
  await worker.processMatch({ matchId: summary.metadata.matchId });
  expect(await prisma.match.count()).toBe(0);
  expect(await prisma.matchParticipant.count()).toBe(0);
  expect(await prisma.championStats.count()).toBe(0);
  expect(await prisma.playerStats.count()).toBe(0);
  expect(await prisma.matchRaw.count()).toBe(1);
  expect(
    (
      await prisma.matchProcessing.findUniqueOrThrow({
        where: { matchId: summary.metadata.matchId },
      })
    ).status,
  ).toBe('RETRY_WAIT');
  await due(summary.metadata.matchId);
  await otherWorker.processMatch({ matchId: summary.metadata.matchId });
  expect(await prisma.match.count()).toBe(1);
  expect(
    (await prisma.championStats.findMany()).every(
      (stat) => stat.gamesPlayed === 1,
    ),
  ).toBe(true);
});

// PostgreSQL faults run after real writes, so these assertions exercise rollback
// rather than only proving that a mocked writer stopped the call sequence.
const publicationFaults = [
  'matches',
  'match_teams',
  'match_participants',
  'match_timeline_projections',
  'match_event_projections',
  'historical_metric_contributions',
  'champion_stats',
  'player_stats',
  'player_champion_stats',
  'match_processing',
] as const;

test.each(publicationFaults)(
  'a PostgreSQL fault at %s rolls back every projection and permits exactly-once recovery',
  async (table) => {
    const { summary, timeline } = fixture();
    await seed(summary, timeline);
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION arq14_fail_publication() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'ARQ14 injected publication fault'; END $$
    `);
    try {
      const event =
        table === 'match_processing'
          ? `UPDATE ON "${table}" FOR EACH ROW WHEN (NEW.status = 'COMPLETED')`
          : `INSERT ON "${table}" FOR EACH ROW`;
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER arq14_publication_fault AFTER ${event}
        EXECUTE FUNCTION arq14_fail_publication()
      `);
      await worker.processMatch({ matchId: summary.metadata.matchId });
      for (const count of await Promise.all([
        prisma.match.count(),
        prisma.matchTeam.count(),
        prisma.matchParticipant.count(),
        prisma.matchTimelineProjection.count(),
        prisma.matchEventProjection.count(),
        prisma.historicalMetricContribution.count(),
        prisma.championStats.count(),
        prisma.playerStats.count(),
        prisma.playerChampionStats.count(),
      ]))
        expect(count).toBe(0);
      const job = await prisma.matchProcessing.findUniqueOrThrow({
        where: { matchId: summary.metadata.matchId },
      });
      expect(job.status).toBe('RETRY_WAIT');
      expect(job.completedAt).toBeNull();
      expect(job.leaseToken).toBeNull();
      expect(job.lastError).toContain('ARQ14 injected publication fault');
      const raw = await prisma.matchRaw.findUniqueOrThrow({
        where: { matchId: summary.metadata.matchId },
      });
      expect(Buffer.from(raw.summary!)).toEqual(
        gzipSync(JSON.stringify(summary)),
      );
      expect(Buffer.from(raw.timeline!)).toEqual(
        gzipSync(JSON.stringify(timeline)),
      );
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS arq14_publication_fault ON "${table}"`,
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION arq14_fail_publication()');
    }
    await due(summary.metadata.matchId);
    await otherWorker.processMatch({ matchId: summary.metadata.matchId });
    const recovered = await snapshot();
    await worker.processMatch({ matchId: summary.metadata.matchId });
    expect(await snapshot()).toEqual(recovered);
    expect(await prisma.match.count()).toBe(1);
    expect(await prisma.matchTeam.count()).toBe(2);
    expect(await prisma.matchParticipant.count()).toBe(10);
    expect(await prisma.matchTimelineProjection.count()).toBe(1);
    expect(await prisma.matchEventProjection.count()).toBeGreaterThan(0);
    expect(await prisma.historicalMetricContribution.count()).toBeGreaterThan(
      0,
    );
    const patch = summary.info.gameVersion.split('.').slice(0, 2).join('.');
    for (const { rows, patches } of [
      { rows: recovered.players, patches: [patch, 'ALL'] },
      { rows: recovered.champions, patches: [patch] },
      { rows: recovered.playerChampions, patches: [patch, 'ALL'] },
    ]) {
      expect(rows).toHaveLength(10 * patches.length);
      for (const expectedPatch of patches) {
        expect(rows.filter((row) => row.patch === expectedPatch)).toHaveLength(
          10,
        );
      }
      expect(rows.every((row) => row.gamesPlayed === 1)).toBe(true);
    }
    expect(
      (
        await prisma.matchProcessing.findUniqueOrThrow({
          where: { matchId: summary.metadata.matchId },
        })
      ).status,
    ).toBe('COMPLETED');
    expect(riot.getMatchById).not.toHaveBeenCalled();
    expect(riot.getTimeline).not.toHaveBeenCalled();
  },
);

test('timeline unavailability retains summary, then fetches only the missing payload', async () => {
  const { summary, timeline } = fixture();
  riot.getMatchById.mockResolvedValue(summary);
  riot.getTimeline.mockResolvedValueOnce(null).mockResolvedValueOnce(timeline);
  await worker.processMatch({ matchId: summary.metadata.matchId });
  expect(await prisma.match.count()).toBe(0);
  expect(await jobs.readRaw(summary.metadata.matchId, 'summary')).toEqual(
    summary,
  );
  await due(summary.metadata.matchId);
  await worker.processMatch({ matchId: summary.metadata.matchId });
  expect(riot.getMatchById).toHaveBeenCalledTimes(1);
  expect(riot.getTimeline).toHaveBeenCalledTimes(2);
  expect(await jobs.readRaw(summary.metadata.matchId, 'timeline')).toEqual(
    timeline,
  );
  expect(await prisma.match.count()).toBe(1);
});

const invalidPayloads: Array<
  [string, (summary: MatchDto, timeline: TimelineDto) => void]
> = [
  [
    'missing teams',
    (summary) => {
      Object.assign(summary.info, { teams: undefined });
    },
  ],
  [
    'empty teams',
    (summary) => {
      summary.info.teams = [];
    },
  ],
  [
    'unknown participant team',
    (summary) => {
      summary.info.participants[0].teamId = 999;
    },
  ],
  [
    'invalid patch',
    (summary) => {
      summary.info.gameVersion = 'invalid';
    },
  ],
  [
    'missing timeline identities',
    (_summary, timeline) => {
      Object.assign(timeline.metadata, { participants: undefined });
    },
  ],
  [
    'invalid participant counters',
    (summary) => {
      summary.info.participants[0].kills = -1;
    },
  ],
  [
    'negative frame counters',
    (_summary, timeline) => {
      Object.assign(timeline.info.frames[0].participantFrames[1], {
        totalGold: -1,
      });
    },
  ],
  [
    'missing frame events',
    (_summary, timeline) => {
      Object.assign(timeline.info.frames[0], { events: undefined });
    },
  ],
];

test('optional frame counters persist as null without corrupting lane aggregates', async () => {
  const { summary, timeline } = fixture();
  Object.assign(timeline.info.frames[15].participantFrames[1], {
    totalGold: null,
  });
  await seed(summary, timeline);
  await worker.processMatch({ matchId: summary.metadata.matchId });
  const projection = await prisma.matchTimelineProjection.findUniqueOrThrow({
    where: { matchId: summary.metadata.matchId },
  });
  expect(
    (projection.frames as any)[15].participantFrames['1'].totalGold,
  ).toBeNull();
  expect(
    await prisma.matchProcessing.findUnique({
      where: { matchId: summary.metadata.matchId },
    }),
  ).toMatchObject({ status: 'COMPLETED' });
  const stats = await prisma.playerChampionStats.findMany({
    where: { puuid: summary.info.participants[0].puuid },
  });
  expect(stats.every((s) => s.laningSamples === 0 && s.sumGd15 === 0)).toBe(
    true,
  );
});

test.each(invalidPayloads)(
  'invalid payload (%s) fails permanently without partial statistics',
  async (_name, mutate) => {
    const { summary, timeline } = fixture();
    mutate(summary, timeline);
    await seed(summary, timeline);
    await worker.processMatch({ matchId: summary.metadata.matchId });
    const job = await prisma.matchProcessing.findUniqueOrThrow({
      where: { matchId: summary.metadata.matchId },
    });
    expect(job.status).toBe('FAILED');
    expect(job.attempts).toBe(1);
    expect(job.lastError).toContain('Invalid match/timeline');
    expect(await prisma.match.count()).toBe(0);
    expect(await prisma.matchTeam.count()).toBe(0);
    expect(await prisma.matchParticipant.count()).toBe(0);
    expect(await prisma.championStats.count()).toBe(0);
    expect(await prisma.playerStats.count()).toBe(0);
    expect(await prisma.playerChampionStats.count()).toBe(0);
    expect(await prisma.matchRaw.count()).toBe(1);
  },
);

test('missing samples do not become zero, while queues stay separate', async () => {
  const full = fixture('BR1_100');
  const short = fixture('BR1_101');
  short.summary.info.gameDuration = 600;
  short.timeline.info.frames = short.timeline.info.frames.filter(
    (f) => f.timestamp < 600_000,
  );
  const differentQueue = fixture('BR1_102', 440);
  const noRole = fixture('BR1_103');
  noRole.summary.info.participants[0].teamPosition = '';
  noRole.summary.info.participants[0].individualPosition = '';
  for (const item of [full, short, differentQueue, noRole]) {
    await seed(item.summary, item.timeline);
    await worker.processMatch({ matchId: item.summary.metadata.matchId });
  }
  const p = summaryTemplate.info.participants[0];
  const row = await prisma.playerChampionStats.findUniqueOrThrow({
    where: {
      puuid_championId_patch_queueId: {
        puuid: p.puuid,
        championId: p.championId,
        patch: 'ALL',
        queueId: 420,
      },
    },
  });
  expect(row.gamesPlayed).toBe(3);
  expect(row.laningSamples).toBe(1);
  expect(playerChampionAverages(row).avgGd15).toBe(3088);
  const list = await new ChampionStatsRepository(prisma).findManyByPatch(
    '16.2',
  );
  expect(list.filter((row) => row.gamesPlayed > 0)).toHaveLength(10);
  expect(
    list
      .filter((row) => row.gamesPlayed > 0)
      .every(
        (row) =>
          row.queueId === 420 && row.gamesPlayed === 3 && row.pickRate === 100,
      ),
  ).toBe(true);
  expect(
    await prisma.playerStats.count({ where: { queueId: 440, patch: 'ALL' } }),
  ).toBe(10);
  const laning = await prisma.playerChampionStats.findFirstOrThrow({
    where: { puuid: p.puuid },
  });
  expect(
    playerChampionAverages({ ...laning, laningSamples: 0 }).avgGd15,
  ).toBeNull();
});

test('activity and role statistics isolate the exact patch', async () => {
  for (const [id, version] of [
    ['BR1_201', '16.2.1'],
    ['BR1_202', '16.20.1'],
  ]) {
    const { summary, timeline } = fixture(id);
    summary.info.gameVersion = version;
    await seed(summary, timeline);
    await worker.processMatch({ matchId: id });
  }
  const repository = new PlayerStatsReaderAdapter(prisma);
  const puuid = summaryTemplate.info.participants[0].puuid;
  const roles = await repository.getRoleDistribution(puuid, '16.2');
  const activity = await repository.getActivityData(puuid, '16.2');
  expect(roles.reduce((sum, row) => sum + Number(row.gamesplayed), 0)).toBe(1);
  expect(activity.reduce((sum, row) => sum + Number(row.games), 0)).toBe(1);
  const all = await repository.getRoleDistribution(puuid, 'ALL');
  expect(all.reduce((sum, row) => sum + Number(row.gamesplayed), 0)).toBe(2);
});

test('the last expired attempt becomes terminal and cannot be renewed by its old worker', async () => {
  const id = 'BR1_66';
  await jobs.enqueue(id);
  await prisma.matchProcessing.update({
    where: { matchId: id },
    data: { attempts: MAX_ATTEMPTS - 1 },
  });
  const lease = (await jobs.claim(id))!;
  await prisma.matchProcessing.update({
    where: { matchId: id },
    data: { leaseUntil: new Date(0) },
  });
  await queue.recover();
  const job = await prisma.matchProcessing.findUniqueOrThrow({
    where: { matchId: id },
  });
  expect(job.status).toBe('FAILED');
  expect(job.attempts).toBe(MAX_ATTEMPTS);
  expect(await jobs.claim(id)).toBeNull();
  await expect(jobs.renew(lease)).rejects.toBeInstanceOf(LeaseLostError);
  expect(await broker.get(queueName, { noAck: false })).toBe(false);
});

test('expired worker ownership is recovered and cannot overwrite raw payloads', async () => {
  const { summary, timeline } = fixture();
  await seed(summary, timeline);
  const stale = (await jobs.claim(summary.metadata.matchId))!;
  await prisma.matchProcessing.update({
    where: { matchId: stale.matchId },
    data: { leaseUntil: new Date(0) },
  });
  await queue.recover();
  const message = await getDelivery();
  await otherWorker.processMatch(JSON.parse(message.content.toString()).data);
  broker.ack(message);
  await expect(jobs.saveRaw(stale, 'summary', {})).rejects.toBeInstanceOf(
    LeaseLostError,
  );
  expect(await jobs.readRaw(stale.matchId, 'summary')).toEqual(summary);
  expect(await prisma.match.count()).toBe(1);
});

test('durable retry respects Retry-After, caps attempts and supports manual recovery', async () => {
  const id = 'BR1_88';
  riot.getMatchById.mockRejectedValue(
    new HttpException({ retryAfter: '300' }, 429),
  );
  const before = Date.now();
  await worker.processMatch({ matchId: id });
  const waiting = await prisma.matchProcessing.findUniqueOrThrow({
    where: { matchId: id },
  });
  expect(waiting.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
    before + 300_000,
  );
  await prisma.matchProcessing.update({
    where: { matchId: id },
    data: { attempts: MAX_ATTEMPTS - 1, nextAttemptAt: new Date(0) },
  });
  await worker.processMatch({ matchId: id });
  expect(
    (await prisma.matchProcessing.findUniqueOrThrow({ where: { matchId: id } }))
      .status,
  ).toBe('FAILED');
  expect((await jobs.retryFailed(id)).count).toBe(1);
  expect(
    (await prisma.matchProcessing.findUniqueOrThrow({ where: { matchId: id } }))
      .attempts,
  ).toBe(0);
});

test('confirmed broker delivery can be redelivered after commit without counting it twice', async () => {
  const { summary, timeline } = fixture();
  await seed(summary, timeline);
  await queue.publishUserRequestedMatch(summary.metadata.matchId);
  const message = await getDelivery();
  await worker.processMatch(JSON.parse(message.content.toString()).data);
  // Closing the consumer channel before ACK is the crash window after commit.
  await broker.close();
  broker = await rabbit.createChannel();
  const redelivered = await getDelivery();
  expect(redelivered.fields.redelivered).toBe(true);
  await otherWorker.processMatch(
    JSON.parse(redelivered.content.toString()).data,
  );
  broker.ack(redelivered);
  expect(await prisma.match.count()).toBe(1);
  expect(
    (await prisma.championStats.findMany()).every(
      (row) => row.gamesPlayed === 1,
    ),
  ).toBe(true);
});

test('publication failure leaves durable work for a later confirmed recovery', async () => {
  const broken = new QueueService(
    {
      sendToQueue: () => Promise.reject(new Error('connection interrupted')),
    } as unknown as ChannelWrapper,
    logger,
    jobs,
  );
  await broken.publishUserRequestedMatch('BR1_99');
  const job = await prisma.matchProcessing.findUniqueOrThrow({
    where: { matchId: 'BR1_99' },
  });
  expect(job.status).toBe('PENDING');
  expect(job.publishedAt).toBeNull();
  expect(job.priority).toBe(10);
  await queue.recover();
  const message = await getDelivery();
  expect(JSON.parse(message.content.toString()).data.matchId).toBe('BR1_99');
  broker.ack(message);
});

test('database failure before durable handling requeues the original broker message', async () => {
  await queue.publishBackgroundMatch('BR1_77');
  const message = await getDelivery();
  const controller = new WorkerController(
    {
      processMatch: () => Promise.reject(new Error('database unavailable')),
    } as unknown as WorkerService,
    logger,
  );
  const context = new RmqContext([message, broker, 'match.collect']);
  await expect(
    controller.handleMatchCollect({ matchId: 'BR1_77' }, context),
  ).rejects.toThrow('database unavailable');
  const redelivered = await getDelivery();
  expect(redelivered.fields.redelivered).toBe(true);
  broker.ack(redelivered);
});

test('offline rebuild can resume after interruption and reproduce the entire aggregate dataset twice', async () => {
  for (const id of ['BR1_100', 'BR1_101']) {
    const { summary, timeline } = fixture(id);
    await seed(summary, timeline);
    await worker.processMatch({ matchId: id });
  }
  const expected = await snapshot();
  const rebuild = new RebuildService(prisma, jobs);
  await expect(
    rebuild.run(false, () => {
      throw new Error('operator interruption');
    }),
  ).rejects.toThrow('operator interruption');
  expect(
    (await prisma.processingMaintenance.findUniqueOrThrow({ where: { id: 1 } }))
      .rebuilding,
  ).toBe(true);
  await expect(jobs.enqueue('BR1_555')).rejects.toThrow('paused');
  await expect(jobs.retryFailed()).rejects.toThrow('Resume the rebuild first');
  expect(await jobs.claim('BR1_101')).toBeNull();
  expect(await rebuild.run(true)).toBe(1);
  expect(await snapshot()).toEqual(expected);
  expect(await rebuild.run()).toBe(2);
  expect(await snapshot()).toEqual(expected);
  expect(riot.getMatchById).not.toHaveBeenCalled();
  expect(riot.getTimeline).not.toHaveBeenCalled();
});

test('top five champions are selected from full history, including a previously sixth champion', async () => {
  const base = fixture();
  for (let i = 0; i < 8; i++) {
    const { summary, timeline } = fixture(`BR1_${200 + i}`);
    summary.info.participants[0].championId = i < 6 ? i + 1000 : 1005;
    await seed(summary, timeline);
    await worker.processMatch({ matchId: summary.metadata.matchId });
  }
  const summary = await new PlayerStatsReaderAdapter(prisma).getAggregatedStats(
    base.summary.info.participants[0].puuid,
    'ALL',
    420,
  );
  expect(summary?.topChampions).toHaveLength(5);
  expect(summary?.topChampions[0]).toEqual({
    championId: 1005,
    games: 3,
    winRate: 100,
  });
});

test('multiple discovery paths preserve lineage but contribute once, including two offline rebuilds', async () => {
  const { summary, timeline } = fixture();
  const matchId = summary.metadata.matchId;
  const base: DiscoveryContext = {
    observationId: 'collector-one',
    source: 'collector',
    observedAt: new Date('2026-09-23T12:00:00Z'),
    region: 'br1',
    queriedPuuid: summary.info.participants[0].puuid,
    queueFilter: null,
    requestedCount: 20,
    startIndex: 0,
    rank: {
      tier: 'MASTER',
      division: 'I',
      leaguePoints: 0,
      queue: 'RANKED_SOLO_5x5',
      observedAt: new Date('2026-09-23T11:59:00Z'),
    },
  };
  await discovery.recordObservation([matchId, matchId], base);
  await discovery.recordObservation([matchId], base); // Same API observation retried.
  await discovery.recordObservation([matchId], {
    ...base,
    source: 'search',
    observationId: 'search-two',
  });
  await seed(summary, timeline);
  await worker.processMatch({ matchId });
  await queue.publishUserRequestedMatch(matchId);
  await worker.processMatch({ matchId });
  expect(await prisma.match.count()).toBe(1);
  expect(await prisma.matchDiscovery.count()).toBe(2);
  expect(await prisma.discoveryObservation.count()).toBe(2);
  const before = await snapshot();
  expect(before.champions.every((row) => row.gamesPlayed === 1)).toBe(true);
  const report = new DiscoveryReportService(prisma);
  const lineage = await report.lineage(matchId);
  expect(lineage.observations.map((o) => o.source)).toEqual([
    'collector',
    'search',
  ]);
  expect(lineage.observations[0].rankLeaguePoints).toBe(0);
  const coverage = await report.coverage();
  expect(coverage.population).toMatchObject({
    distinctKnownMatches: 1,
    queriedAccounts: 1,
    participantAccounts: 10,
  });
  expect(coverage.rawPair).toMatchObject({
    complete: 1,
    denominator: 1,
    coverage: 1,
  });
  expect(coverage.lineage).toMatchObject({
    knownMatches: 1,
    unknownMatches: 0,
  });
  for (let i = 0; i < 2; i++) {
    expect(await new RebuildService(prisma, jobs).run()).toBe(1);
    expect(await snapshot()).toEqual(before);
    expect(await report.lineage(matchId)).toEqual(lineage);
  }
});

test('legacy origins stay unknown and report accounts for incomplete raw pairs and empty queries', async () => {
  const { summary, timeline } = fixture();
  await seed(summary, timeline);
  await worker.processMatch({ matchId: summary.metadata.matchId });
  await jobs.enqueue('BR1_900', 10); // Priority is never provenance.
  await prisma.matchRaw.create({
    data: { matchId: 'BR1_900', summary: gzipSync('{}') },
  });
  await jobs.enqueue('BR1_901', 1);
  await prisma.matchRaw.create({
    data: { matchId: 'BR1_901', timeline: gzipSync('{}') },
  });
  await jobs.enqueue('BR1_902', 5);
  await discovery.recordObservation([], {
    observationId: 'empty-sync',
    source: 'sync',
    observedAt: new Date(),
    region: null,
    queriedPuuid: 'unranked-query-account',
    queueFilter: 420,
    requestedCount: 100,
    startIndex: 0,
    rank: null,
  });
  const report = new DiscoveryReportService(prisma);
  expect(await report.lineage(summary.metadata.matchId)).toMatchObject({
    source: 'unknown',
    reason: 'missing_discovery_observation',
    observations: [],
  });
  const coverage = await report.coverage();
  expect(coverage.rawPair).toMatchObject({
    complete: 1,
    summaryOnly: 1,
    timelineOnly: 1,
    neither: 1,
    denominator: 4,
    coverage: 0.25,
  });
  expect(coverage.lineage.unknownMatches).toBe(4);
  expect(coverage.population).toMatchObject({
    queriedAccounts: 1,
    discoveryObservations: 1,
    observationsWithNoMatches: 1,
    historicalParticipantRank: 'unavailable',
  });
  expect(coverage.importedGamePeriod).toMatchObject({
    knownN: 1,
    unknownN: 3,
    first: new Date(summary.info.gameCreation).toISOString(),
  });
});

test('final summary projections reconcile ten participants, remain nullable, retain raw and rebuild twice', async () => {
  const { summary, timeline } = fixture();
  const matchId = summary.metadata.matchId;
  await seed(summary, timeline);
  await worker.processMatch({ matchId });
  const persisted = await prisma.match.findUniqueOrThrow({
    where: { matchId },
    include: { participants: true, teams: true },
  });
  expect(persisted.participants).toHaveLength(10);
  for (const participant of persisted.participants) {
    const original = summary.info.participants.find(
      (p) => p.puuid === participant.puuid,
    )!;
    const stats = participant.finalStats as any;
    for (const field of [
      ...Object.keys(FINAL_STAT_UNITS),
      ...FINAL_FLAG_FIELDS,
    ]) {
      expect(stats.values[field]).toEqual(original[field] ?? null);
    }
    expect(participant.riotIdGameName).toBe(original.riotIdGameName);
    expect(participant.riotIdTagline).toBe(original.riotIdTagline);
    expect(stats.quality.coverage).toBe(1);
  }
  for (const team of persisted.teams) {
    const original = summary.info.teams.find((t) => t.teamId === team.teamId)!;
    const totals = team.finalObjectives as any;
    for (const [type, value] of Object.entries(original.objectives!)) {
      expect(totals.values[type].kills).toBe(value!.kills);
      expect(totals.values[type].first).toBe(value!.first);
    }
    expect(Array.isArray(team.objectivesTimeline)).toBe(true);
    expect((team.objectivesTimeline as any[]).length).toBeGreaterThan(0);
  }
  expect(await jobs.readRaw(matchId, 'summary')).toEqual(summary);
  const legacy = fixture('BR1_505');
  delete legacy.summary.info.participants[0].totalHealsOnTeammates;
  delete legacy.summary.info.participants[0].riotIdGameName;
  delete legacy.summary.info.teams[0].objectives;
  await seed(legacy.summary, legacy.timeline);
  await worker.processMatch({ matchId: 'BR1_505' });
  const projection = async () =>
    prisma.match.findMany({
      orderBy: { matchId: 'asc' },
      select: {
        matchId: true,
        finalContext: true,
        participants: {
          orderBy: { puuid: 'asc' },
          select: {
            puuid: true,
            riotIdGameName: true,
            riotIdTagline: true,
            finalStats: true,
          },
        },
        teams: {
          orderBy: { teamId: 'asc' },
          select: {
            teamId: true,
            finalObjectives: true,
            objectivesTimeline: true,
          },
        },
      },
    });
  const projected = await projection();
  const missing = projected.find((m) => m.matchId === 'BR1_505')!;
  const missingParticipant = missing.participants.find(
    (p) => p.puuid === legacy.summary.info.participants[0].puuid,
  )!;
  expect(
    (missingParticipant.finalStats as any).values.totalHealsOnTeammates,
  ).toBeNull();
  expect(
    (missingParticipant.finalStats as any).missingReasons.totalHealsOnTeammates,
  ).toBe('missing_field');
  expect(missingParticipant.riotIdGameName).toBeNull();
  expect((missing.teams[0].finalObjectives as any).values.dragon).toBeNull();
  const aggregateBefore = await snapshot();
  for (let i = 0; i < 2; i++) {
    expect(await new RebuildService(prisma, jobs).run()).toBe(2);
    expect(await projection()).toEqual(projected);
    expect(await snapshot()).toEqual(aggregateBefore);
    expect(await jobs.readRaw('BR1_505', 'summary')).toEqual(legacy.summary);
  }
});
