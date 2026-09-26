import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ProcessingService } from '../../src/core/processing/processing.service';
import { PlayerStatsAggregationService } from '../../src/core/stats/player-stats-aggregation.service';
import { TimelineParserService } from '../../src/modules/matches/adapters/riot/timeline-parser.service';
import { MatchPersistenceService } from '../../src/modules/worker/services/match-persistence.service';
import { WorkerService } from '../../src/modules/worker/services/worker.service';
import { RiotService } from '../../src/core/riot/riot.service';
import { MatchVisionService } from '../../src/modules/matches/services/match-vision.service';
const summary = JSON.parse(
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
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_integration'))
    throw new Error('Disposable *_integration database required');
  db = new PrismaService({ datasourceUrl: url });
  await db.$connect();
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
afterAll(async () => db?.$disconnect());
it('reads persisted ward/final projections, reconciles all participants and degrades missing event coverage', async () => {
  const riot = { getMatchById: jest.fn(), getTimeline: jest.fn() };
  const jobs = new ProcessingService(db),
    id = summary.metadata.matchId;
  const worker = new WorkerService(
    riot as unknown as RiotService,
    new TimelineParserService(),
    new MatchPersistenceService(db, jobs, new PlayerStatsAggregationService()),
    jobs,
    new PinoLogger({ pinoHttp: { level: 'silent' } }),
  );
  await jobs.enqueue(id);
  await db.matchRaw.create({
    data: {
      matchId: id,
      summary: gzipSync(JSON.stringify(summary)),
      timeline: gzipSync(JSON.stringify(timeline)),
    },
  });
  await worker.processMatch({ matchId: id });
  const service = new MatchVisionService(db);
  const reports = await Promise.all(
    summary.info.participants.map((p: { puuid: string }) =>
      service.getVision(id, p.puuid),
    ),
  );
  expect(
    reports.reduce((n, r) => n + r.metrics!.recognizedPlacements.value!, 0),
  ).toBe(196);
  expect(
    reports.reduce((n, r) => n + r.metrics!.unknownPlacements.value!, 0),
  ).toBe(556);
  expect(
    reports.every(
      (r) =>
        r.reconciliation?.placementDifference === 0 &&
        r.reconciliation?.removalDifference === 0,
    ),
  ).toBe(true);
  const puuid = summary.info.participants[0].puuid;
  const report = await service.getVision(id, puuid);
  const sources = await db.matchEventProjection.findMany({
    where: { matchId: id, type: 'WARD_PLACED', actorPuuid: puuid },
  });
  const ids = new Set(
    sources.map((e) => `${id}:${e.frameIndex}:${e.eventIndex}`),
  );
  expect(
    report.metrics!.recognizedPlacements.evidence.every((e) =>
      ids.has(e.eventId!),
    ),
  ).toBe(true);
  expect(riot.getMatchById).not.toHaveBeenCalled();
  expect(riot.getTimeline).not.toHaveBeenCalled();
  await db.matchEventProjection.deleteMany({
    where: { matchId: id, type: 'GAME_END' },
  });
  const incomplete = await service.getVision(id, puuid);
  expect(incomplete.metrics!.recognizedPlacements).toMatchObject({
    value: null,
    reason: 'missing_field',
  });
  expect(incomplete.metrics!.visionScore.value).toBe(28);
});
