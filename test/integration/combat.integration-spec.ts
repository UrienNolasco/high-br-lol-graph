import { ComparisonCohortRepository } from '../../src/modules/matches/repositories/comparison-cohort.repository';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ProcessingService } from '../../src/modules/processing/services/processing.service';
import { CombatRepository } from '../../src/modules/matches/repositories/combat.repository';
import { MatchCombatService } from '../../src/modules/matches/services/match-combat.service';
import { AnalyticsRepository } from '../../src/modules/analytics/repositories/analytics.repository';
import { historicalSolo } from '../../src/modules/analytics/pure/historical-solo';
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

test('reads real persisted combat and historical solo projections without MatchRaw or network', async () => {
  await worker.processMatch({ matchId });
  await prisma.matchRaw.deleteMany({ where: { matchId } });
  const rawSpy = jest
    .spyOn(prisma.matchRaw, 'findUnique')
    .mockImplementation(() => {
      throw new Error('Raw GET forbidden');
    });
  const combat = await new MatchCombatService(
    new CombatRepository(prisma),
  ).getCombat(matchId);
  expect(combat.quality).toMatchObject({
    available: true,
    uniqueKillEvents: 92,
    unknownAssistanceEvents: 26,
  });
  expect(combat.processingVersion).toBe(PROCESSING_VERSION);
  for (const participant of combat.participants)
    for (const field of ['kills', 'deaths', 'assists'])
      expect(participant.reconciliation[field]).toMatchObject({
        matches: true,
        difference: 0,
      });
  expect(
    combat.participants.reduce(
      (sum, p) => sum + p.rewards.bountyReceived.value!,
      0,
    ),
  ).toBe(27478);
  expect(
    combat.participants.reduce(
      (sum, p) => sum + p.rewards.shutdownReceived.value!,
      0,
    ),
  ).toBe(2917);
  const subject = summary.info.participants[0];
  const cohort = await new AnalyticsRepository(
    prisma,
    new ComparisonCohortRepository(prisma),
  ).findComparisonCohort(subject.puuid, {
    queueId: summary.info.queueId,
    championId: subject.championId,
    limit: 1,
  });
  expect(cohort.matches).toHaveLength(1);
  const solo = historicalSolo(
    cohort.matches,
    cohort.events,
    cohort.eventSources,
  );
  expect(solo.soloEvidence[0].matchId).toBe(matchId);
  const reported = combat.participants.find((p) => p.puuid === subject.puuid)!;
  expect(solo.soloEvidence[0].soloKills15).toBe(reported.soloKills15.value);
  expect(solo.soloEvidence[0].soloKills15Reason).toBe(
    reported.soloKills15.reason,
  );
  expect(rawSpy).not.toHaveBeenCalled();
});

test('missing projection rows fail reconciliation and unavailable generation cannot become zero solo', async () => {
  await worker.processMatch({ matchId });
  await prisma.matchEventProjection.deleteMany({ where: { matchId } });
  const service = new MatchCombatService(new CombatRepository(prisma));
  let result = await service.getCombat(matchId);
  expect(result.quality).toEqual(
    expect.objectContaining({ summaryKillDeathMismatch: true }),
  );
  expect(
    result.participants.every(
      (p) => p.soloKills15.reason === 'incomplete_events',
    ),
  ).toBe(true);
  await prisma.matchProcessing.update({
    where: { matchId },
    data: { processingVersion: 1 },
  });
  result = await service.getCombat(matchId);
  expect(result.quality.available).toBe(false);
  expect(result.participants.every((p) => p.soloKills15.value === null)).toBe(
    true,
  );
  await prisma.matchProcessing.update({
    where: { matchId },
    data: { processingVersion: PROCESSING_VERSION, completedAt: null },
  });
  result = await service.getCombat(matchId);
  expect(result).toMatchObject({
    processedAt: null,
    quality: { available: false, reason: 'missing_projection' },
    participants: [],
  });
});
