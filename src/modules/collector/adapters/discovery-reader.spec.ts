import { DiscoveryPersistenceReader } from './discovery-reader';
import { ReadSnapshot } from '../../../core/prisma/read-snapshot';
describe('collector-owned discovery period', () => {
  it('deduplicates discovery IDs by observedAt without guessing gameCreation or queue', async () => {
    const table = { findMany: jest.fn().mockResolvedValue([{ matchId: 'm' }]) };
    const reader = new DiscoveryPersistenceReader({
      client: () => ({ matchDiscovery: table }),
    } as unknown as ReadSnapshot);
    expect(
      await reader.matchIds({ playerId: 'p', fromMs: 0, toMs: 100 }),
    ).toEqual(['m']);
    expect(table.findMany).toHaveBeenCalledWith({
      where: {
        observation: {
          queriedPuuid: 'p',
          observedAt: { gte: new Date(0), lt: new Date(100) },
        },
      },
      select: { matchId: true },
      distinct: ['matchId'],
    });
  });
});
