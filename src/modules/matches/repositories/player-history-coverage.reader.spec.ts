import { PlayerHistoryCoveragePersistenceReader } from './player-history-coverage.reader';
import { ReadSnapshot } from '../../../core/prisma/read-snapshot';
describe('matches-owned history coverage', () => {
  const table = { count: jest.fn(), findMany: jest.fn() };
  const reader = new PlayerHistoryCoveragePersistenceReader({
    client: () => ({ match: table }),
  } as unknown as ReadSnapshot);
  it('counts imported cohort outside owner-provided materialized IDs', async () => {
    table.count.mockResolvedValue(2);
    expect(
      await reader.countWithoutAnchors(
        { playerId: 'p', queueId: 420, mapId: 11, fromMs: 0, toMs: 100 },
        ['m'],
      ),
    ).toBe(2);
    expect(table.count).toHaveBeenCalledWith({
      where: {
        queueId: 420,
        mapId: 11,
        gameCreation: { gte: 0n, lt: 100n },
        participants: { some: { puuid: 'p' } },
        matchId: { notIn: ['m'] },
      },
    });
  });
  it('reads duration and existence from matches without accessing historical metrics or discovery', async () => {
    table.findMany.mockResolvedValue([{ matchId: 'm', gameDuration: 1200 }]);
    expect(await reader.durations(['m'])).toEqual([
      { matchId: 'm', durationSeconds: 1200 },
    ]);
    expect(await reader.existingIds(['m'])).toEqual(['m']);
  });
});
