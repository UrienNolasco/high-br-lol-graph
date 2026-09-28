import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ProcessingService } from '../../src/core/processing/processing.service';
import { IndicatorRepository } from '../../src/modules/indicators/indicator.repository';
import { IndicatorService } from '../../src/modules/indicators/indicator.service';

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

test('optional indicators query only persisted final projections, cursor-match history, and retain genuine zero after raw deletion', async () => {
  await worker.processMatch({ matchId });
  await prisma.matchRaw.deleteMany({ where: { matchId } });
  const player = summary.info.participants.find(
    (p) => p.championName === 'Fiora',
  )!;
  const service = new IndicatorService(new IndicatorRepository(prisma));
  const match = await service.match(matchId, player.puuid, {});
  expect(match.provenance).toMatchObject({
    known: true,
    processingVersion: PROCESSING_VERSION,
  });
  expect(match.coverage).toEqual({
    validCounters: 24,
    totalCounters: 24,
    validRates: 20,
    totalRates: 20,
  });
  expect(
    match.metrics.find((m) => m.id === 'execution.skillshotsHit'),
  ).toMatchObject({ count: { value: 23 }, perMinute: null });
  const history = await service.history(player.puuid, {
    patch: '16.2',
    role: 'TOP',
    championId: player.championId,
    limit: 1,
  });
  expect(history.sample).toMatchObject({
    observations: 1,
    distinctMatches: 1,
    distinctPlayers: 1,
  });
  expect(history.selection).toMatchObject({
    totalMatchingMatchPlayers: 1,
    selectedMatchPlayers: 1,
    truncated: false,
    hasMore: false,
  });
  expect(
    history.groups.items[0].metrics.find(
      (m) => m.id === 'execution.skillshotsHit',
    )!.count.value,
  ).toBe(23);
  expect(
    (await service.history(player.puuid, { patch: '16.20' })).sample
      .observations,
  ).toBe(0);
  expect(
    (await service.history(player.puuid, { role: 'MID' })).sample.observations,
  ).toBe(0);
  // Synthetic load copy only: same creation time exercises matchId tie-break.
  const copyId = 'MET29_CURSOR_COPY';
  const copySummary = structuredClone(summary),
    copyTimeline = structuredClone(timeline);
  copySummary.metadata.matchId = copyTimeline.metadata.matchId = copyId;
  await jobs.enqueue(copyId);
  await prisma.matchRaw.create({
    data: {
      matchId: copyId,
      summary: gzipSync(JSON.stringify(copySummary)),
      timeline: gzipSync(JSON.stringify(copyTimeline)),
    },
  });
  await worker.processMatch({ matchId: copyId });
  await prisma.matchRaw.deleteMany({ where: { matchId: copyId } });
  const cursorFilters = {
    patch: '16.2',
    role: 'TOP',
    championId: player.championId,
    limit: 1,
  };
  const firstPage = await service.history(player.puuid, cursorFilters);
  expect(firstPage.selection).toMatchObject({
    totalMatchingMatchPlayers: 2,
    selectedMatchPlayers: 1,
    hasMore: true,
  });
  expect(firstPage.groups.items[0].matches[0].matchId).toBe(matchId);
  const secondPage = await service.history(player.puuid, {
    ...cursorFilters,
    after: firstPage.selection.nextAfter!,
  });
  expect(secondPage.selection).toMatchObject({
    totalMatchingMatchPlayers: 2,
    selectedMatchPlayers: 1,
    hasMore: false,
  });
  expect(secondPage.groups.items[0].matches[0].matchId).toBe(copyId);
  await prisma.match.delete({ where: { matchId: copyId } });
  await prisma.matchProcessing.delete({ where: { matchId: copyId } });
  await prisma.matchParticipant.update({
    where: { matchId_puuid: { matchId, puuid: player.puuid } },
    data: { pings: { onMyWayPings: 0 }, challenges: { skillshotsHit: 0 } },
  });
  await prisma.matchProcessing.update({
    where: { matchId },
    data: { completedAt: null },
  });
  const absent = await service.match(matchId, player.puuid, {
    family: 'pings',
  });
  expect(
    absent.metrics.find((m) => m.id === 'pings.onMyWayPings'),
  ).toMatchObject({
    count: { value: 0, processingVersion: null, processedAt: null },
    perMinute: { value: null, reason: 'missing_processing_metadata' },
  });
  expect(absent.metrics[0].count).toMatchObject({
    value: null,
    reason: 'missing_field',
  });
  const unknown = await service.history(player.puuid, { family: 'pings' });
  expect(
    unknown.groups.items[0].metrics.find((m) => m.id === 'pings.onMyWayPings')!
      .count,
  ).toMatchObject({
    value: null,
    quality: { validSamples: 0, totalSamples: 1 },
  });
  await expect(service.match(matchId, 'missing', {})).rejects.toMatchObject({
    status: 404,
  });
});
