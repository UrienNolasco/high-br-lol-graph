import { ComparisonCohortRepository } from '../../src/modules/matches/repositories/comparison-cohort.repository';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { AnalyticsRepository } from '../../src/modules/analytics/repositories/analytics.repository';

// Synthetic records isolated by prefix; run serially with the processing suite.
describe('MET-08 filtered cohort SQL', () => {
  let prisma: PrismaService;
  let repo: AnalyticsRepository;
  const prefix = `MET08_${process.pid}_`;
  const puuid = `${prefix}subject`;
  beforeAll(async () => {
    const datasourceUrl = process.env.TEST_DATABASE_URL;
    if (
      !datasourceUrl ||
      !new URL(datasourceUrl).pathname.includes('integration')
    ) {
      throw new Error('An explicit integration database is required');
    }
    prisma = new PrismaService({ datasourceUrl });
    await prisma.$connect();
    repo = new AnalyticsRepository(
      prisma,
      new ComparisonCohortRepository(prisma),
    );
    const fixtures = [
      { id: 'b', date: 20, role: 'MID' },
      { id: 'a', date: 20, role: 'MIDDLE' },
      { id: 'old', date: 10, role: 'MIDDLE' },
      { id: 'end', date: 30, role: 'MIDDLE' },
      { id: 'before', date: 9, role: 'MIDDLE' },
      { id: 'patch', date: 25, role: 'MIDDLE', patch: '16.20.1' },
      { id: 'queue', date: 25, role: 'MIDDLE', queue: 420 },
      { id: 'role', date: 25, role: 'TOP' },
      { id: 'champion', date: 25, role: 'MIDDLE', champion: 2 },
    ];
    for (const fixture of fixtures) {
      await prisma.match.create({
        data: {
          matchId: prefix + fixture.id,
          gameCreation: BigInt(fixture.date),
          gameDuration: 1800,
          gameMode: 'CLASSIC',
          queueId: fixture.queue ?? 440,
          mapId: 11,
          gameVersion: fixture.patch ?? '16.2.1',
          participants: {
            create: {
              puuid,
              summonerName: 'Synthetic MET08',
              championId: fixture.champion ?? 1,
              championName: 'Annie',
              teamId: 100,
              role: fixture.role,
              lane: 'MIDDLE',
              win: true,
              kills: 1,
              deaths: 1,
              assists: 1,
              kda: 2,
              goldEarned: 10000,
              totalDamage: 20000,
              damageTaken: 1000,
              visionScore: 10,
              totalCs: 200,
              goldGraph: [],
              xpGraph: [],
              csGraph: [],
              damageGraph: [],
              deathPositions: [],
              killPositions: [],
              wardPositions: [],
              pathingSample: [],
              skillOrder: [],
              itemTimeline: [],
              runes: {},
              challenges: {},
              pings: {},
              spells: [],
            },
          },
        },
      });
    }
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.match.deleteMany({
        where: { matchId: { startsWith: prefix } },
      });
      await prisma.$disconnect();
    }
  });
  it('filters before limiting and preserves deterministic ties/count/alias without raw data', async () => {
    const filters = {
      championId: 1,
      role: 'MID',
      patch: '16.2',
      queueId: 440,
      startDate: 10,
      endDate: 30,
      limit: 2,
    };
    const cohort = await repo.findComparisonCohort(puuid, filters);
    expect(cohort.matches.map((m) => m.matchId)).toEqual([
      prefix + 'a',
      prefix + 'b',
    ]);
    expect(cohort).toMatchObject({
      eligibleN: 3,
      returnedN: 2,
      truncated: true,
      projections: [],
    });
    const canonical = await repo.findComparisonCohort(puuid, {
      ...filters,
      role: 'MIDDLE',
      limit: 100,
    });
    expect(canonical.matches.map((m) => m.matchId)).toEqual([
      prefix + 'a',
      prefix + 'b',
      prefix + 'old',
    ]);
    expect(canonical).toMatchObject({
      eligibleN: 3,
      returnedN: 3,
      truncated: false,
    });
  });
});
