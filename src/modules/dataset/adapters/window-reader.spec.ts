import { DatasetWindowAdapter } from './window-reader';
import { ReadSnapshot } from '../../../core/prisma/read-snapshot';
import { normalizeDatasetFilters } from '../contracts/query';
it('queries only owned contributions, keeps exact subject/version and orders gameCreation/matchId/id', async () => {
  const findMany = jest
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ matchId: 'published' }]);
  const adapter = new DatasetWindowAdapter({
    client: () => ({ historicalMetricContribution: { findMany } }),
  } as unknown as ReadSnapshot);
  const filters = normalizeDatasetFilters({
    definitionId: 'final.deathsNearObjectives',
    playerId: 'p',
    subjectKind: 'participant',
    role: 'TOP',
    fromMs: 10,
    toMs: 20,
    eligibleOnly: false,
  });
  expect(await adapter.readWindow(filters, 'p', 1000)).toEqual({
    rows: [],
    publishedMatchIds: ['published'],
  });
  expect(findMany).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      where: expect.objectContaining({
        subjectId: 'p',
        definitionVersion: 1,
        gameCreation: { gte: 10n, lt: 20n },
      }),
      take: 1001,
      orderBy: [{ gameCreation: 'asc' }, { matchId: 'asc' }, { id: 'asc' }],
    }),
  );
  expect(findMany.mock.calls[1][0].where.definitionId).toBeUndefined();
  expect(findMany.mock.calls[1][0].distinct).toEqual(['matchId']);
});
