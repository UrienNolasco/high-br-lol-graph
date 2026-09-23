import { ChampionStatsRepository } from './champion-stats.repository';

describe('champion population repository contract', () => {
  const prisma = { $queryRaw: jest.fn() };
  const repo = new ChampionStatsRepository(prisma as any);
  it('keeps metadata when no champion has eligible observations', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        championId: null,
        selectedN: 2,
        eligibleN: 0,
        excludedN: 2,
        bansObservedN: 0,
        excludedReasons: { missing_eligibility_projection: 2 },
      },
    ]);
    expect(await repo.findPopulation('16.2', 420)).toEqual({
      champions: [],
      cohort: {
        patch: '16.2',
        queueId: 420,
        mapId: 11,
        selectedN: 2,
        eligibleN: 0,
        excludedN: 2,
        bansObservedN: 0,
        excludedReasons: { missing_eligibility_projection: 2 },
      },
    });
  });
  it('binds an exact patch boundary and independent queue; rejects unsupported filters', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await repo.findPopulation('16.2', 440);
    const sql = prisma.$queryRaw.mock.calls.at(-1)![0];
    expect(sql.values).toEqual([440, '16.2', '16.2.%']);
    await expect(repo.findPopulation('16.2%')).rejects.toThrow();
    await expect(repo.findPopulation('16.2', 450)).rejects.toThrow();
  });
});
