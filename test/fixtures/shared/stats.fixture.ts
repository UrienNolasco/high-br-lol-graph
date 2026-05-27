export function championStatsEntry(overrides?: Record<string, unknown>) {
  return {
    championId: 1,
    championName: 'Annie',
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
    tier: 'A',
    rank: 3,
    images: {
      square: 'https://example.com/square.png',
      loading: 'https://example.com/loading.png',
      splash: 'https://example.com/splash.png',
    },
    ...overrides,
  };
}

export function paginatedStats(overrides?: Record<string, unknown>) {
  return {
    data: [championStatsEntry()],
    total: 1,
    page: 1,
    limit: 20,
    ...overrides,
  };
}
