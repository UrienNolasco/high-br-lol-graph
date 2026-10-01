import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { BuildChoiceRepository } from '../../src/modules/matches/repositories/build-choice.repository';
import { calculateBuildChoices } from '../../src/modules/analytics/contracts/build-choices';
import {
  choiceMatch,
  choiceFilters,
  choiceCatalogs,
} from '../../src/modules/analytics/pure/build-choices.fixture';
const describeIntegration = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;
describeIntegration(
  'MET26 contextual choices PostgreSQL snapshot and normalized projections',
  () => {
    let prisma: PrismaService;
    let repo: BuildChoiceRepository;
    const prefix = `MET26_${process.pid}_`;
    const filters = {
      ...choiceFilters,
      role: 'MIDDLE' as const,
      queueId: 440,
      fromMs: 98000,
      toMs: 99000,
      limit: 10,
    };
    beforeAll(async () => {
      const datasourceUrl = process.env.TEST_DATABASE_URL!;
      if (!new URL(datasourceUrl).pathname.includes('integration'))
        throw new Error('Explicit disposable integration database required');
      prisma = new PrismaService({ datasourceUrl });
      await prisma.$connect();
      repo = new BuildChoiceRepository(prisma);
      for (const variant of ['a', 'b', 'unknown', 'short', 'patch', 'role']) {
        const m = choiceMatch(prefix + variant);
        m.participants[0].role =
          variant === 'role' ? 'TOP' : variant === 'b' ? 'MID' : 'MIDDLE';
        m.participants[1].role = 'MIDDLE';
        if (variant === 'b') {
          m.participants[0].win = false;
          m.events = m.events.filter((e) => e.type === 'GAME_END');
          m.events[0].payload = { winningTeam: 200 };
        }
        if (variant === 'unknown')
          m.events.push({
            ...m.events[0],
            eventIndex: 1,
            type: 'UNKNOWN_ITEM_ACTION',
            quality: { unknownType: true },
          });
        if (variant === 'short') m.gameDuration = 899;
        if (variant === 'patch') m.gameVersion = '16.20.1';
        await prisma.match.create({
          data: {
            matchId: m.matchId,
            gameVersion: m.gameVersion,
            gameCreation: 98010n,
            gameDuration: m.gameDuration,
            gameMode: 'CLASSIC',
            queueId: 440,
            mapId: 11,
            populationEligible: true,
            participants: {
              create: m.participants.map((p) => ({
                ...p,
                runes: p.runes as Prisma.InputJsonValue,
                summonerName: 'Synthetic MET26',
                championName: 'Synthetic',
                lane: p.role,
                kills: 1,
                deaths: 1,
                assists: 1,
                kda: 2,
                goldEarned: 10000,
                totalDamage: 20000,
                damageTaken: 1000,
                visionScore: 10,
                totalCs: 100,
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
                challenges: {},
                pings: {},
              })),
            },
            timelineProjection: {
              create: {
                projectionVersion: 1,
                frameIntervalMs: 60000,
                observedEndMs: 1800000,
                frames: m.timelineProjection!
                  .frames as unknown as Prisma.InputJsonValue,
              },
            },
            events: {
              create: m.events.map(({ matchId, ...e }) => ({
                ...e,
                payload: e.payload as Prisma.InputJsonValue,
                quality: e.quality as Prisma.InputJsonValue,
              })),
            },
          },
        });
        await prisma.matchProcessing.create({
          data: {
            matchId: m.matchId,
            status: 'COMPLETED',
            processingVersion: 5,
            completedAt: new Date('2026-10-01T00:00:00Z'),
          },
        });
      }
    });
    afterAll(async () => {
      if (prisma) {
        await prisma.match.deleteMany({
          where: { matchId: { startsWith: prefix } },
        });
        await prisma.matchProcessing.deleteMany({
          where: { matchId: { startsWith: prefix } },
        });
        await prisma.$disconnect();
      }
    });
    it('applies exact patch/role aliases and dates before limiting; includes unknown events in item missingness', async () => {
      const cohort = await repo.findBuildChoiceCohort(filters);
      expect(cohort.totalMatches).toBe(4);
      expect(cohort.truncated).toBe(false);
      expect(cohort.matches.map((m) => m.matchId)).toEqual(
        ['a', 'b', 'short', 'unknown'].map((id) => prefix + id),
      );
      const response = calculateBuildChoices(cohort, filters, choiceCatalogs());
      expect(response.coverage).toMatchObject({
        eligibleMatches: 3,
        exclusions: { short_or_unknown_duration: 1 },
        missingness: { items_unknown_catalog_or_trajectory: 1 },
      });
      expect(response.contexts[0].denominators).toEqual({
        items: 2,
        runes: 3,
        summoners: 3,
      });
      expect(response.contexts[0].alternatives.items[0]).toMatchObject({
        n: 1,
        denominatorN: 2,
        share: 0.5,
        comparison: { n: 1, wins: 0 },
      });
    });
    it('publishes truncation and deterministic ties without applying a post-limit count', async () => {
      const cohort = await repo.findBuildChoiceCohort({ ...filters, limit: 1 });
      expect(cohort).toMatchObject({ totalMatches: 4, truncated: true });
      expect(cohort.matches.map((m) => m.matchId)).toEqual([prefix + 'a']);
    });
  },
);
