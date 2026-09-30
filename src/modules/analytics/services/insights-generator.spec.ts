import { generateInsights } from './insights-generator';

describe('insights-generator', () => {
  const baseStats = {
    gamesPlayed: 100,
    winRate: 55,
    avgKda: 3.0,
    avgCspm: 7.0,
    avgDpm: 600,
    avgGpm: 400,
    avgVisionScore: 20,
  };

  const baseLaning = {
    avgCsd15: 5,
    avgGd15: 200,
    avgXpd15: 150,
    soloKills15: 0,
    soloDeaths15: 0,
  };

  it('should declare hero winner when winRate is higher', () => {
    const heroStats = { ...baseStats, winRate: 60 };
    const villainStats = { ...baseStats, winRate: 50 };

    const result = generateInsights(
      heroStats,
      villainStats,
      baseLaning,
      baseLaning,
    );

    expect(result.winner).toBe('hero');
  });

  it('should declare villain winner when winRate is lower', () => {
    const heroStats = { ...baseStats, winRate: 50 };
    const villainStats = { ...baseStats, winRate: 60 };

    const result = generateInsights(
      heroStats,
      villainStats,
      baseLaning,
      baseLaning,
    );

    expect(result.winner).toBe('villain');
  });

  it('should detect cs advantage when hero has 15% more cspm', () => {
    const heroStats = { ...baseStats, avgCspm: 8.0 };
    const villainStats = { ...baseStats, avgCspm: 7.0 };

    const result = generateInsights(
      heroStats,
      villainStats,
      baseLaning,
      baseLaning,
    );

    expect(result.advantages).toContain('Herói tem 14.3% mais CS/min');
  });

  it('should detect cs disadvantage and recommend', () => {
    const heroStats = { ...baseStats, avgCspm: 6.0 };
    const villainStats = { ...baseStats, avgCspm: 7.0 };

    const result = generateInsights(
      heroStats,
      villainStats,
      baseLaning,
      baseLaning,
    );

    expect(result.advantages).toContain('Vilão tem 14.3% mais CS/min');
    expect(result.recommendations).toContain(
      'Herói deve melhorar farm e controle de wave',
    );
  });

  it('should detect csd@15 advantage', () => {
    const heroLaning = { ...baseLaning, avgCsd15: 10 };
    const villainLaning = { ...baseLaning, avgCsd15: 5 };

    const result = generateInsights(
      baseStats,
      baseStats,
      heroLaning,
      villainLaning,
    );

    expect(result.advantages).toContain('Herói tem +5 CSD@15');
  });

  it('should detect vision advantage', () => {
    const heroStats = { ...baseStats, avgVisionScore: 30 };
    const villainStats = { ...baseStats, avgVisionScore: 20 };

    const result = generateInsights(
      heroStats,
      villainStats,
      baseLaning,
      baseLaning,
    );

    expect(result.advantages).toContain('Herói tem +10 vision score');
  });

  it('should detect KDA vs winrate paradox', () => {
    const heroStats = { ...baseStats, avgKda: 4.0, winRate: 45 };
    const villainStats = { ...baseStats, avgKda: 2.0, winRate: 55 };

    const result = generateInsights(
      heroStats,
      villainStats,
      baseLaning,
      baseLaning,
    );

    expect(result.recommendations).toContain(
      'Herói tem KDA superior mas winrate inferior — deve converter vantagens em objetivos',
    );
  });
});
