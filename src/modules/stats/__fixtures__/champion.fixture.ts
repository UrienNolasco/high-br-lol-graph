export function aChampionStatRow(overrides?: Record<string, unknown>) {
  return {
    championId: 1,
    championName: 'Annie',
    patch: '15.1',
    queueId: 420,
    winRate: 55.5,
    gamesPlayed: 100,
    wins: 55,
    losses: 45,
    kda: 2.5,
    dpm: 650,
    cspm: 7.2,
    gpm: 450,
    banRate: 15.5,
    pickRate: 12.3,
    ...overrides,
  };
}

export function aChampionMetrics(overrides?: Record<string, unknown>) {
  return {
    winRate: 55,
    banRate: 15,
    pickRate: 20,
    kda: 3.0,
    dpm: 700,
    gpm: 450,
    cspm: 8.0,
    gamesPlayed: 100,
    ...overrides,
  };
}
