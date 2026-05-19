import { enrichChampionStats } from './champion.enricher';

describe('champion.enricher', () => {
  const baseChamp = {
    championId: 1,
    gamesPlayed: 30,
    wins: 18,
    losses: 12,
    winRate: 60,
    avgKda: 3.5,
    avgCspm: 7.2,
    avgDpm: 650,
    avgGpm: 450,
    avgVisionScore: 20,
    avgCsd15: 10,
    avgGd15: 500,
    avgXpd15: 300,
    roleDistribution: { MID: 30 },
    lastPlayedAt: new Date('2026-01-01'),
  };

  it('should enrich with champion info name', () => {
    const result = enrichChampionStats(
      baseChamp,
      { id: 'Annie', name: 'Annie' },
      null,
    );
    expect(result.championName).toBe('Annie');
    expect(result.imageUrl).toBe('');
  });

  it('should fall back to championId when info is null', () => {
    const result = enrichChampionStats(baseChamp, null, null);
    expect(result.championName).toBe('Champion 1');
  });

  it('should include image URL when images are provided', () => {
    const result = enrichChampionStats(
      baseChamp,
      { id: 'Annie', name: 'Annie' },
      { square: 'https://img.png' },
    );
    expect(result.imageUrl).toBe('https://img.png');
  });

  it('should preserve all stats fields', () => {
    const result = enrichChampionStats(
      baseChamp,
      { id: 'Annie', name: 'Annie' },
      null,
    );
    expect(result.gamesPlayed).toBe(30);
    expect(result.wins).toBe(18);
    expect(result.losses).toBe(12);
    expect(result.winRate).toBe(60);
    expect(result.avgKda).toBe(3.5);
    expect(result.roleDistribution).toEqual({ MID: 30 });
  });
});
