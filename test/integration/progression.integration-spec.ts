import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ProcessingService } from '../../src/modules/processing/services/processing.service';
import { ProgressionRepository } from '../../src/modules/matches/repositories/progression.repository';
import { MatchProgressionService } from '../../src/modules/matches/services/match-progression.service';
import type { CatalogReader } from '../../src/modules/matches/ports/catalog-reader';
import { unavailableItemCatalog } from '../../src/modules/matches/contracts/catalogs';
import { unavailableSkillCatalog } from '../../src/modules/matches/contracts/catalogs';
import { PROCESSING_VERSION } from '../../src/lib/processing-policy';
import { PlayerStatsAggregationService } from '../../src/modules/stats/adapters/persistence/player-stats-writer';
import { TimelineParserService } from '../../src/modules/matches/adapters/riot/timeline-parser.service';
import { WorkerService } from '../../src/modules/worker/services/worker.service';
import { createProcessingService } from '../helpers/processing';
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
  const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
  const source = {
    getMatchById: jest.fn(() => { throw new Error('Unexpected network read'); }),
    getTimeline: jest.fn(() => { throw new Error('Unexpected network read'); }),
  };
  jobs = createProcessingService(prisma, source, logger);
  worker = new WorkerService(jobs, logger);
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

test('real purchase/skill projections remain queryable after deleting raw bytes and do not need network catalogs', async () => {
  await worker.processMatch({ matchId });
  await prisma.matchRaw.deleteMany({ where: { matchId } });
  const catalogs: CatalogReader = {
    getCachedItemCatalog: jest.fn(unavailableItemCatalog),
    getCachedSkillCatalog: jest.fn(unavailableSkillCatalog),
  };
  const service = new MatchProgressionService(
    new ProgressionRepository(prisma),
    catalogs,
  );
  let purchases = 0,
    skills = 0,
    undo = 0;
  for (const participant of summary.info.participants) {
    const result = await service.getProgression(matchId, participant.puuid);
    expect(result.quality.available).toBe(true);
    expect(result.processingVersion).toBe(PROCESSING_VERSION);
    expect(result.processedAt).not.toBeNull();
    purchases += result.originalItemEvents.length;
    skills += result.originalSkillEvents.length;
    undo += result.originalItemEvents.filter(
      (event) => event.type === 'ITEM_UNDO',
    ).length;
    expect(result.finalInventory.finalBuild.map((slot) => slot.itemId)).toEqual(
      Array.from({ length: 7 }, (_, i) => (participant as any)[`item${i}`]),
    );
    expect(
      result.skillSequence!.every(
        (event) =>
          event.allocationAt.evidence[0].source === 'MatchEventProjection',
      ),
    ).toBe(true);
    expect(
      result.skillSequence!.every(
        (event) => event.validation.reason === 'catalog_unavailable',
      ),
    ).toBe(true);
    expect(result.unattributedEvents).toHaveLength(2);
  }
  expect({ purchases, skills, undo }).toEqual({
    purchases: 604,
    skills: 177,
    undo: 18,
  });
  await prisma.matchProcessing.update({
    where: { matchId },
    data: { completedAt: null },
  });
  const absent = await service.getProgression(
    matchId,
    summary.info.participants[0].puuid,
  );
  expect(absent).toMatchObject({
    processedAt: null,
    trajectory: null,
    skillSequence: null,
    quality: { reason: 'missing_projection' },
  });
});
