import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ProcessingService } from '../../src/core/processing/processing.service';
import { ReportRepository } from '../../src/modules/matches/repositories/report.repository';
import { MatchReportService } from '../../src/modules/matches/services/match-report.service';
import { MatchReportQueryDto } from '../../src/modules/matches/dto/match-report-query.dto';
import type { CatalogReader } from '../../src/modules/matches/ports/catalog-reader';
import { unavailableItemCatalog } from '../../src/modules/matches/contracts/catalogs';
import { unavailableSkillCatalog } from '../../src/modules/matches/contracts/catalogs';
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

test('one report snapshot uses persisted projections after raw deletion and retains final observations without timeline/provenance', async () => {
  await worker.processMatch({ matchId });
  await prisma.matchRaw.deleteMany({ where: { matchId } });
  const catalogs: CatalogReader = {
    getCachedItemCatalog: jest.fn(unavailableItemCatalog),
    getCachedSkillCatalog: jest.fn(unavailableSkillCatalog),
  };
  const service = new MatchReportService(
    new ReportRepository(prisma),
    catalogs,
  );
  const puuid = summary.info.participants.find(
    (p) => p.championName === 'Fiora',
  )!.puuid;
  const query = new MatchReportQueryDto();
  const report = await service.summary(matchId, puuid, query);
  expect(report.provenance.processingVersion).toBe(PROCESSING_VERSION);
  expect(report.provenance.processedAt).not.toBeNull();
  expect(report.dimensions[0].metrics[0].value).toBeCloseTo(28.0613, 3);
  expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThan(80000);
  const selected = report.dimensions[0].metrics[0];
  const metric = await service.metric(matchId, puuid, selected.key, query);
  expect(metric.value).toBe(selected.value);
  const evidence = await service.evidence(
    matchId,
    puuid,
    metric.evidence.items[0].id,
    query,
  );
  expect(evidence).toMatchObject({
    source: 'MatchParticipant',
    processingVersion: PROCESSING_VERSION,
  });
  const episodes = (await service.episodes(matchId, puuid, {
    ...query,
    kind: 'death',
    fromMs: 1198000,
    toMs: 1199000,
  })) as any;
  expect(episodes.page.total).toBe(1);
  const death = episodes.page.items[0];
  expect(death.associatedCaptures.value).toBe(2);
  const event = await service.evidence(
    matchId,
    puuid,
    `event:${death.events.items[0].eventId}`,
    query,
  );
  expect(event).toMatchObject({ type: 'CHAMPION_KILL', victimPuuid: puuid });
  await prisma.matchTimelineProjection.deleteMany({ where: { matchId } });
  await prisma.matchEventProjection.deleteMany({ where: { matchId } });
  const partial = await service.summary(matchId, puuid, query);
  expect(partial.availability.status).toBe('partial');
  expect(partial.finalTotals[0].value).toBe(report.finalTotals[0].value);
  await prisma.matchProcessing.update({
    where: { matchId },
    data: { completedAt: null },
  });
  const unknown = await service.summary(matchId, puuid, query);
  expect(unknown.provenance).toMatchObject({
    known: false,
    processingVersion: null,
    processedAt: null,
  });
  expect(unknown.finalTotals[0]).toMatchObject({
    value: report.finalTotals[0].value,
    processingVersion: null,
    processedAt: null,
  });
  await expect(service.summary(matchId, 'absent', query)).rejects.toMatchObject(
    { status: 404 },
  );
});
