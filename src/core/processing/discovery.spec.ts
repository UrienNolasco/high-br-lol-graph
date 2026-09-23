import { discoveryData, DiscoveryContext } from './discovery';
import { discoveryCoverage, CoverageMatch } from './discovery-coverage';
import { ProcessingService } from './processing.service';

const context = (): DiscoveryContext => ({
  observationId: 'observation-1',
  source: 'search',
  observedAt: new Date('2026-09-23T00:00:00Z'),
  queriedPuuid: 'queried-account',
  region: 'br1',
  queueFilter: null,
  requestedCount: 20,
  startIndex: 0,
  rank: {
    tier: 'GOLD',
    division: 'II',
    leaguePoints: 0,
    queue: 'RANKED_SOLO_5x5',
    observedAt: new Date('2026-09-22T23:59:59Z'),
  },
});

describe('discovery lineage', () => {
  it('preserves zero LP, rank source time, and match uniqueness within one observation', () => {
    const result = discoveryData(context(), ['BR1_1', 'BR1_1', 'BR1_2']);
    expect(result.rankLeaguePoints).toBe(0);
    expect(result.rankObservedAt).toEqual(context().rank!.observedAt);
    expect(result.matches.createMany.data).toEqual([
      { matchId: 'BR1_1' },
      { matchId: 'BR1_2' },
    ]);
    expect(result.queueFilter).toBeNull(); // Ranked account does not imply ranked matches.
  });

  it('preserves queries with no matches and explicitly missing rank/region', () => {
    expect(
      discoveryData({ ...context(), rank: null, region: null }, []),
    ).toMatchObject({
      rankTier: null,
      rankDivision: null,
      rankQueue: null,
      rankLeaguePoints: null,
      rankObservedAt: null,
      region: null,
      matches: { createMany: { data: [] } },
    });
  });

  it('rejects missing identity, invalid counters and rank captured after the discovery', () => {
    for (const partial of [
      { observationId: '' },
      { queriedPuuid: '' },
      { requestedCount: -1 },
      { startIndex: 0.5 },
      { queueFilter: -1 },
      { observedAt: new Date(NaN) },
    ]) {
      expect(() => discoveryData({ ...context(), ...partial }, [])).toThrow(
        'Invalid discovery',
      );
    }
    expect(() =>
      discoveryData(
        {
          ...context(),
          rank: {
            ...context().rank!,
            observedAt: new Date('2026-09-24T00:00:00Z'),
          },
        },
        [],
      ),
    ).toThrow('Invalid observed account rank');
  });

  it('commits observation and its edges atomically under the ingestion gate', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      processingMaintenance: { findUnique: jest.fn() },
      discoveryObservation: { upsert: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    const service = new ProcessingService(prisma as any);
    await service.recordDiscovery(['BR1_1'], context());
    expect(tx.discoveryObservation.upsert).toHaveBeenCalledWith({
      where: { id: 'observation-1' },
      create: discoveryData(context(), ['BR1_1']),
      update: {},
    });
    tx.processingMaintenance.findUnique.mockResolvedValue({ rebuilding: true });
    tx.discoveryObservation.upsert.mockClear();
    await expect(service.recordDiscovery(['BR1_1'], context())).rejects.toThrow(
      'paused',
    );
    expect(tx.discoveryObservation.upsert).not.toHaveBeenCalled();
  });

  it('counts matches once while source cohorts overlap, and never treats queried rank as participant rank', () => {
    const match: CoverageMatch = {
      matchId: 'BR1_1',
      imported: true,
      summaryPresent: true,
      timelinePresent: true,
      gameCreation: 1000n,
      queueId: 440,
      mapId: 11,
      gameVersion: '16.2.1',
    };
    const base = {
      ...discoveryData(context(), []),
      matches: [{ matchId: 'BR1_1' }],
    };
    const result = discoveryCoverage(
      [match, match],
      [base, { ...base, id: 'collector-2', source: 'collector' }],
      10,
    );
    expect(result.population).toMatchObject({
      distinctKnownMatches: 1,
      importedMatches: 1,
      queriedAccounts: 1,
      participantAccounts: 10,
      discoveryObservations: 2,
      historicalParticipantRank: 'unavailable',
    });
    expect(
      result.lineage.bySource.filter((s) => s.distinctMatches === 1),
    ).toHaveLength(2);
    expect(result.matchPopulation[0].dimensions.queueId).toBe(440);
    expect(result.importedGamePeriod.first).toBe('1970-01-01T00:00:01.000Z');
  });

  it('returns null completeness and periods when no population is known', () => {
    const empty = discoveryCoverage([], [], 0);
    expect(empty.rawPair).toMatchObject({ denominator: 0, coverage: null });
    expect(empty.importedGamePeriod).toMatchObject({
      first: null,
      last: null,
      knownN: 0,
      continuousCoverage: 'unknown',
    });
    expect(empty.discoveryPeriod).toEqual({
      first: null,
      last: null,
      knownN: 0,
    });
  });
});
