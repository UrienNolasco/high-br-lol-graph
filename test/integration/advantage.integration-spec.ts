import { PrismaService } from '../../src/core/prisma/prisma.service';
import { AdvantageRepository } from '../../src/modules/matches/repositories/advantage.repository';
const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('MET28 champion context snapshot SQL', () => {
  let prisma: PrismaService;
  const prefix = `MET28_${process.pid}_`;
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
  it('preserves real snapshot timestamps and normalized building attribution without legacy fallbacks', async () => {
    await prisma.matchTimelineProjection.create({
      data: {
        matchId: prefix + 'b',
        projectionVersion: 1,
        frames: [
          {
            timestamp: 900358,
            frameIndex: 15,
            participantFrames: { '1': { puuid: 'p', totalGold: null } },
          },
        ],
      },
    });
    await prisma.matchEventProjection.create({
      data: {
        matchId: prefix + 'b',
        frameIndex: 16,
        eventIndex: 0,
        type: 'BUILDING_KILL',
        metricVersion: 1,
        processingVersion: 1,
        timestampMs: 901234,
        beneficiaryTeamId: 100,
        payload: {},
        quality: {},
      },
    });
    const result = await new AdvantageRepository(prisma).read({
      patch: '16.2',
      queueId: 440,
      fromMs: 10,
      toMs: 30,
      limit: 1,
    });
    expect(result.matches[0].projection!.frames[0]).toMatchObject({
      timestamp: 900358,
      participantFrames: { '1': { totalGold: null } },
    });
    expect(result.matches[0].structures).toEqual([
      {
        metricVersion: 1,
        processingVersion: 1,
        timestampMs: 901234,
        beneficiaryTeamId: 100,
        frameIndex: 16,
        eventIndex: 0,
      },
    ]);
    await prisma.matchTimelineProjection.delete({
      where: { matchId: prefix + 'b' },
    });
    await prisma.matchEventProjection.deleteMany({
      where: { matchId: prefix + 'b' },
    });
  });
  it('applies exact patch boundary and half open date range before count/limit', async () => {
    const r = await new AdvantageRepository(prisma).read({
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
      durationMs: 1800000,
      processing: null,
      projection: null,
      structures: [],
    });
  });
});
