import { toChampionMetrics, toChampionDto, r2 } from './champion.enricher';

describe('champion.enricher', () => {
  describe('toChampionMetrics', () => {
    it('should map stat row to ChampionMetrics', () => {
      const row = { winRate: 55, banRate: 15, pickRate: 20, kda: 3.0, dpm: 700, gpm: 450, cspm: 8.0, gamesPlayed: 100 };
      const result = toChampionMetrics(row);
      expect(result).toEqual({ winRate: 55, banRate: 15, pickRate: 20, kda: 3.0, dpm: 700, gpm: 450, cspm: 8.0, gamesPlayed: 100 });
    });
  });

  describe('toChampionDto', () => {
    it('should map enriched champion to DTO fields', () => {
      const enriched = {
        championId: 1, championName: 'Annie', winRate: 55, gamesPlayed: 100,
        wins: 55, losses: 45, images: { square: 's', loading: 'l', splash: 'sp' },
        kda: 2.5, dpm: 650, cspm: 7.2, gpm: 450, banRate: 15, pickRate: 12,
        tier: 'S', rank: 3, score: 75, hasInsufficientData: false,
      };
      const result = toChampionDto(enriched as any);
      expect(result).toEqual({
        championId: 1, championName: 'Annie', winRate: 55, gamesPlayed: 100,
        wins: 55, losses: 45, images: { square: 's', loading: 'l', splash: 'sp' },
        kda: 2.5, dpm: 650, cspm: 7.2, gpm: 450, banRate: 15, pickRate: 12,
        tier: 'S', rank: 3,
      });
      expect(result).not.toHaveProperty('score');
      expect(result).not.toHaveProperty('hasInsufficientData');
    });
  });

  describe('r2', () => {
    it('should round to 2 decimal places', () => {
      expect(r2(3.14159)).toBe(3.14);
      expect(r2(3.14659)).toBe(3.15);
      expect(r2(5)).toBe(5);
    });
  });
});
