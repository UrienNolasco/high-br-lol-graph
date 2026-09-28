import { discoveryCoverage, type CoverageMatch } from './coverage';

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

describe('collector coverage projection', () => {
  it('counts a match once while preserving overlapping source cohorts', () => {
    const observations = [
      {
        id: 'o1',
        source: 'collector',
        observedAt: new Date('2026-09-23T00:00:00Z'),
        queriedPuuid: 'p1',
        region: 'br1',
        queueFilter: null,
        rankTier: null,
        rankDivision: null,
        rankQueue: null,
        matches: [{ matchId: 'BR1_1' }],
      },
      {
        id: 'o2',
        source: 'search',
        observedAt: new Date('2026-09-24T00:00:00Z'),
        queriedPuuid: 'p2',
        region: 'br1',
        queueFilter: null,
        rankTier: null,
        rankDivision: null,
        rankQueue: null,
        matches: [{ matchId: 'BR1_1' }],
      },
    ];
    const result = discoveryCoverage([match, match], observations, 10);
    expect(result.population).toMatchObject({
      distinctKnownMatches: 1,
      discoveryObservations: 2,
      queriedAccounts: 2,
    });
    expect(result.lineage.bySource).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'collector', distinctMatches: 1 }),
        expect.objectContaining({ source: 'search', distinctMatches: 1 }),
      ]),
    );
  });

  it('reports deterministic empty periods and null completeness', () => {
    const result = discoveryCoverage([], [], 0);
    expect(result.rawPair).toMatchObject({ denominator: 0, coverage: null });
    expect(result.discoveryPeriod).toEqual({
      first: null,
      last: null,
      knownN: 0,
    });
    expect(result.importedGamePeriod).toMatchObject({
      first: null,
      last: null,
      knownN: 0,
      unknownN: 0,
    });
  });
});
