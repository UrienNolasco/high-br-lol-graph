import { ProcessingService, ProcessingLease } from './processing.service';

describe('ProcessingService publication transaction', () => {
  const lease: ProcessingLease = {
    matchId: 'BR1_1',
    leaseToken: 'lease-1',
    attempts: 1,
  };

  function makeHarness(failAt?: 'match' | 'dataset' | 'stats' | 'completed') {
    const order: string[] = [];
    const transaction = {
      $queryRaw: jest.fn(async (...args: unknown[]) => {
        const query = String(args[0] ?? '');
        if (query.includes('match_processing')) {
          order.push('lease');
          return [{ matchId: lease.matchId }];
        }
        order.push('gate');
        return [];
      }),
      processingMaintenance: {
        findUnique: jest.fn(async () => {
          order.push('maintenance');
          return { rebuilding: false };
        }),
      },
      matchProcessing: {
        update: jest.fn(async () => {
          order.push('completed');
          if (failAt === 'completed') throw new Error('completed fault');
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const fail = (boundary: typeof failAt) => {
      if (failAt === boundary) throw new Error(`${boundary} fault`);
    };
    const service = new ProcessingService(
      prisma as never,
      { getMatchById: jest.fn(), getTimeline: jest.fn() },
      { prepare: jest.fn() },
      {
        write: jest.fn(async () => {
          order.push('match');
          fail('match');
        }),
      },
      {
        prepare: jest.fn(() => []),
        write: jest.fn(async () => {
          order.push('dataset');
          fail('dataset');
          return 1;
        }),
      },
      {
        update: jest.fn(async () => {
          order.push('stats');
          fail('stats');
        }),
      },
      { readLineage: jest.fn(async () => ({
        observationIds: [],
        sources: [],
        status: 'unknown' as const,
        reason: 'test',
      })) },
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
    );
    return { service, order };
  }

  const matchData = {} as never;
  const timeline = {
    snapshotProjection: {},
    normalizedEvents: [],
  } as never;

  it.each(['match', 'dataset', 'stats', 'completed'] as const)(
    'stops at the injected %s boundary without completing the job',
    async (failAt) => {
      const { service, order } = makeHarness(failAt);

      await expect(
        (service as unknown as { publish: Function }).publish(
          lease,
          matchData,
          timeline,
          false,
        ),
      ).rejects.toThrow(`${failAt} fault`);

      expect(order.slice(0, 4)).toEqual([
        'gate',
        'maintenance',
        'lease',
        ...(failAt === 'match' ? ['match'] : ['match']),
      ]);
      if (failAt === 'match') expect(order).toEqual(['gate', 'maintenance', 'lease', 'match']);
      if (failAt === 'dataset') expect(order).toEqual(['gate', 'maintenance', 'lease', 'match', 'dataset']);
      if (failAt === 'stats') expect(order).toEqual(['gate', 'maintenance', 'lease', 'match', 'dataset', 'stats']);
      if (failAt === 'completed') expect(order).toEqual(['gate', 'maintenance', 'lease', 'match', 'dataset', 'stats', 'completed']);
    },
  );
});
