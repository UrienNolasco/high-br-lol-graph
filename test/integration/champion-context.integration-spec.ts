import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ChampionContextRepository } from '../../src/modules/matches/repositories/champion-context.repository';
const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('MET27 champion context snapshot SQL', () => {
  let prisma: PrismaService;
  const prefix = `MET27_${process.pid}_`;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL!;
    if (!new URL(url).pathname.includes('integration'))
      throw new Error('Explicit disposable integration database required');
    prisma = new PrismaService({ datasourceUrl: url });
    await prisma.$connect();
    for (const [id, date, patch] of [
      ['a', 10, '16.2.1'],
      ['b', 20, '16.2.2'],
      ['end', 30, '16.2.1'],
      ['other', 20, '16.20.1'],
    ] as const)
      await prisma.match.create({
        data: {
          matchId: prefix + id,
          gameCreation: BigInt(date),
          gameDuration: 1800,
          gameMode: 'CLASSIC',
          queueId: 440,
          mapId: 11,
          gameVersion: patch,
          populationEligible: true,
        },
      });
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.match.deleteMany({
        where: { matchId: { startsWith: prefix } },
      });
      await prisma.$disconnect();
    }
  });
  it('applies exact patch boundary and half open date range before count/limit', async () => {
    const r = await new ChampionContextRepository(prisma).read({
      patch: '16.2',
      queueId: 440,
      fromMs: 10,
      toMs: 30,
      limit: 1,
    });
    expect(r.availableMatches).toBe(2);
    expect(r.truncated).toBe(true);
    expect(r.matches.map((m) => m.matchId)).toEqual([prefix + 'b']);
    expect(r.matches[0]).toEqual({
      matchId: prefix + 'b',
      populationEligible: true,
      participants: [],
    });
  });
});
