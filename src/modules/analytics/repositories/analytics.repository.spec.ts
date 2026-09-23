import { AnalyticsRepository } from './analytics.repository';
import { COMBAT_EVENT_FILTER } from '../../matches/repositories/combat.repository';

describe('comparison cohort query', () => {
  const tx = {
    matchParticipant: { count: jest.fn(), findMany: jest.fn() },
    matchTimelineProjection: { findMany: jest.fn() },
    matchEventProjection: { findMany: jest.fn().mockResolvedValue([]) },
    matchProcessing: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
    user: { findUnique: jest.fn() },
  };
  const repo = new AnalyticsRepository(prisma as any);
  beforeEach(() => {
    jest.clearAllMocks();
    tx.matchParticipant.count.mockResolvedValue(102);
    tx.matchParticipant.findMany.mockResolvedValue([
      { matchId: 'BR1_2' },
      { matchId: 'BR1_1' },
    ]);
    tx.matchTimelineProjection.findMany.mockResolvedValue([]);
  });
  it.each(['MID', 'MIDDLE'])(
    'uses all filters and stable ordering with alias %s for one cohort',
    async (role) => {
      const result = await repo.findComparisonCohort('p1', {
        championId: 1,
        role,
        patch: '16.2',
        queueId: 440,
        startDate: 0,
        endDate: 1000,
        limit: 2,
      });
      const where = {
        puuid: 'p1',
        championId: 1,
        role: { in: ['MID', 'MIDDLE'] },
        match: {
          queueId: 440,
          mapId: 11,
          OR: [
            { gameVersion: '16.2' },
            { gameVersion: { startsWith: '16.2.' } },
          ],
          gameCreation: { gte: 0n, lt: 1000n },
        },
      };
      expect(tx.matchParticipant.count).toHaveBeenCalledWith({ where });
      expect(tx.matchParticipant.findMany).toHaveBeenCalledWith({
        where,
        orderBy: [{ match: { gameCreation: 'desc' } }, { matchId: 'asc' }],
        take: 2,
        include: { match: { include: { participants: true } } },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
      });
      expect(result).toMatchObject({
        eligibleN: 102,
        returnedN: 2,
        limit: 2,
        truncated: true,
      });
      expect(tx.matchTimelineProjection.findMany).toHaveBeenCalledWith({
        where: { matchId: { in: ['BR1_2', 'BR1_1'] } },
      });
      expect(tx.matchEventProjection.findMany).toHaveBeenCalledWith({
        where: { matchId: { in: ['BR1_2', 'BR1_1'] }, ...COMBAT_EVENT_FILTER },
        orderBy: [
          { matchId: 'asc' },
          { frameIndex: 'asc' },
          { eventIndex: 'asc' },
        ],
      });
      expect(tx.matchProcessing.findMany).toHaveBeenCalledWith({
        where: { matchId: { in: ['BR1_2', 'BR1_1'] } },
        select: {
          matchId: true,
          status: true,
          processingVersion: true,
          completedAt: true,
        },
      });
    },
  );
  it('defaults to ranked solo/all patches and reports empty population', async () => {
    tx.matchParticipant.count.mockResolvedValue(0);
    tx.matchParticipant.findMany.mockResolvedValue([]);
    const result = await repo.findComparisonCohort('p1', {});
    expect(tx.matchParticipant.count).toHaveBeenCalledWith({
      where: { puuid: 'p1', match: { queueId: 420, mapId: 11 } },
    });
    expect(result).toMatchObject({
      eligibleN: 0,
      returnedN: 0,
      limit: 100,
      truncated: false,
    });
  });
});
