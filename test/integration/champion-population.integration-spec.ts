import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { parseMatchData } from '../../src/modules/matches/adapters/riot/match.parser';
import { ChampionStatsRepository } from '../../src/modules/stats/repositories/champion-stats.repository';
import { prismaJson } from '../helpers/prisma-json';

describe('MET23 distinct match popularity SQL', () => {
  let prisma: PrismaService;
  let repo: ChampionStatsRepository;
  const prefix = `MET23_${process.pid}_`;
  // An artificial patch isolates SQL fixtures from other suites' real-fixture copies.
  const patch = '99.23';
  const summary = JSON.parse(
    readFileSync(
      join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
      'utf8',
    ),
  );
  async function seed(
    suffix: string,
    options: {
      pick?: boolean;
      duplicate?: boolean;
      bans?: number[][];
      missingBans?: boolean;
      eligible?: boolean | null;
      queue?: number;
      map?: number;
      version?: string;
    } = {},
  ) {
    const raw = structuredClone(summary);
    raw.metadata.matchId = prefix + suffix;
    raw.info.gameVersion = options.version ?? `${patch}.1`;
    raw.info.queueId = options.queue ?? 420;
    raw.info.mapId = options.map ?? 11;
    raw.info.participants.forEach((p, i) => (p.championId = i + 10));
    if (options.pick) raw.info.participants[0].championId = 1;
    if (options.duplicate) raw.info.participants[1].championId = 1;
    raw.info.teams.forEach(
      (team, i) =>
        (team.bans = (options.bans?.[i] ?? []).map((championId) => ({
          championId,
        }))),
    );
    if (options.missingBans) delete raw.info.teams[0].bans;
    const parsed = parseMatchData(raw);
    // Deliberately set eligibility for synthetic SQL fixtures; this does not claim patch99.23 is supported.
    const eligible = options.eligible === undefined ? true : options.eligible;
    await prisma.$transaction(async (tx) => {
      await tx.match.create({
        data: {
          ...parsed.match,
          finalContext: prismaJson(parsed.match.finalContext),
          populationEligible: eligible,
          populationExclusionReason: eligible
            ? null
            : eligible === null
              ? null
              : 'unknown_remake',
        },
      });
      await tx.matchTeam.createMany({
        data: parsed.teams.map((team) => ({
          ...team,
          bans: team.bans,
          objectivesTimeline: prismaJson(team.objectivesTimeline),
          finalObjectives: prismaJson(team.finalObjectives),
        })),
      });
      await tx.matchParticipant.createMany({
        data: parsed.participants.map((p) => ({
          ...p,
          finalStats: prismaJson(p.finalStats),
          finalInventory: prismaJson(p.finalInventory),
          runes: prismaJson(p.runes),
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
        })),
      });
    });
  }
  beforeAll(async () => {
    const datasourceUrl = process.env.TEST_DATABASE_URL;
    if (
      !datasourceUrl ||
      !new URL(datasourceUrl).pathname.includes('integration')
    )
      throw new Error('Explicit isolated database required');
    prisma = new PrismaService({ datasourceUrl });
    await prisma.$connect();
    repo = new ChampionStatsRepository(prisma);
    await seed('a', { pick: true, duplicate: true, bans: [[99, 99], [99]] });
    await seed('b', { pick: true, bans: [[99], []] });
    await seed('c', { bans: [[100], []] });
    await seed('unknown', { eligible: null, pick: true });
    await seed('early', { eligible: false, pick: true });
    await seed('queue', { queue: 440, bans: [[555], []] });
    await seed('map', { map: 12, bans: [[555], []] });
    await seed('version', { version: '99.230.1', bans: [[555], []] });
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.match.deleteMany({
        where: { matchId: { startsWith: prefix } },
      });
      await prisma.$disconnect();
    }
  });
  it('deduplicates picks and cross-team bans with exact patch/queue/map denominators', async () => {
    const population = await repo.findPopulation(patch);
    expect(population.cohort).toMatchObject({
      eligibleN: 3,
      selectedN: 5,
      excludedN: 2,
      bansObservedN: 3,
      excludedReasons: { missing_eligibility_projection: 1, unknown_remake: 1 },
    });
    const picked = population.champions.find((c) => c.championId === 1)!;
    expect(picked).toMatchObject({
      gamesPlayed: 2,
      pickedMatches: 2,
      performanceN: 1,
      bannedMatches: 0,
      banRate: 0,
    });
    expect(picked.pickRate).toBeCloseTo(200 / 3, 10);
    const bannedOnly = population.champions.find((c) => c.championId === 99)!;
    expect(bannedOnly).toMatchObject({
      pickedMatches: 0,
      gamesPlayed: 0,
      performanceN: 0,
      pickRate: 0,
      bannedMatches: 2,
      wins: null,
      losses: null,
      winRate: null,
      kda: null,
      dpm: null,
    });
    expect(bannedOnly.banRate).toBeCloseTo(200 / 3, 10);
    expect(population.champions.some((c) => c.championId === 555)).toBe(false);
    expect((await repo.findPopulation(patch, 440)).cohort.eligibleN).toBe(1);
  });
  it('returns null ban rates when any eligible match has unknown bans, retaining observed evidence', async () => {
    await seed('missing', { missingBans: true });
    const first = await repo.findPopulation(patch);
    const second = await repo.findPopulation(patch);
    expect(second).toEqual(first);
    expect(first.cohort).toMatchObject({ eligibleN: 4, bansObservedN: 3 });
    expect(first.champions.every((c) => c.banRate === null)).toBe(true);
    expect(
      first.champions.find((c) => c.championId === 99)?.bannedMatches,
    ).toBe(2);
    expect(first.champions.find((c) => c.championId === 1)?.pickRate).toBe(50);
  });
  it('returns zero population with no fabricated champions or rates', async () => {
    expect(await repo.findPopulation('98.98')).toMatchObject({
      champions: [],
      cohort: { eligibleN: 0, selectedN: 0, bansObservedN: 0 },
    });
  });
});
