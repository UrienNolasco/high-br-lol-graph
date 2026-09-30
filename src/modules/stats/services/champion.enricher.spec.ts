import { toChampionMetrics, r2 } from './champion.enricher';

describe('champion metric availability', () => {
  it('uses valid performance N for heuristic sample threshold and preserves null ban rate', () => {
    const result = toChampionMetrics({
      gamesPlayed: 100,
      performanceN: 20,
      winRate: 55,
      banRate: null,
      pickRate: 50,
      kda: 2,
      dpm: 700,
      gpm: 500,
      cspm: 8,
    });
    expect(result.gamesPlayed).toBe(20);
    expect(result.banRate).toBeNull();
  });
  it('does not turn unavailable values into display zeros', () => {
    expect(r2(null)).toBeNull();
    expect(r2(0)).toBe(0);
    expect(r2(3.146)).toBe(3.15);
  });
});
