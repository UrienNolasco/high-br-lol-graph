import { DiscoveryService } from './discovery.service';

describe('DiscoveryService', () => {
  it('maps the processing observation DTO and writes it inside one ingestion transaction', async () => {
    const transaction = {} as any;
    const coordinator = {
      withIngestionTransaction: jest.fn(async (callback) =>
        callback(transaction),
      ),
    };
    const writer = {
      recordObservation: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DiscoveryService(coordinator as any, writer as any);
    const observedAt = new Date('2026-09-23T12:00:00Z');
    const rankObservedAt = new Date('2026-09-23T11:59:00Z');

    await service.recordDiscovery({
      observationId: 'observation-1',
      source: 'search',
      observedAt,
      region: 'br1',
      queriedPuuid: 'puuid-1',
      queueFilter: null,
      requestedCount: 20,
      startIndex: 0,
      rank: {
        tier: 'GOLD',
        division: 'II',
        leaguePoints: 0,
        queue: 'RANKED_SOLO_5x5',
        observedAt: rankObservedAt,
      },
      matchIds: [],
    });

    expect(coordinator.withIngestionTransaction).toHaveBeenCalledTimes(1);
    expect(writer.recordObservation).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        observationId: 'observation-1',
        rank: expect.objectContaining({ leaguePoints: 0 }),
      }),
      transaction,
    );
  });
});
