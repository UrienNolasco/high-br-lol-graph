import { discoveryData } from './discovery';

const context = () => ({
  observationId: 'observation-1',
  source: 'search' as const,
  observedAt: new Date('2026-09-23T00:00:00Z'),
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
    observedAt: new Date('2026-09-22T23:59:00Z'),
  },
});

describe('collector discovery contract', () => {
  it('keeps LP zero, null filters and empty observations', () => {
    expect(discoveryData(context(), [])).toMatchObject({
      rankLeaguePoints: 0,
      queueFilter: null,
      matches: { createMany: { data: [] } },
    });
  });

  it('deduplicates match edges and rejects rank captured after the query', () => {
    expect(
      discoveryData(context(), ['M1', 'M1', 'M2']).matches.createMany.data,
    ).toEqual([{ matchId: 'M1' }, { matchId: 'M2' }]);
    expect(() =>
      discoveryData(
        {
          ...context(),
          rank: { ...context().rank, observedAt: new Date('2026-09-24') },
        },
        [],
      ),
    ).toThrow('Invalid observed account rank');
  });
});
