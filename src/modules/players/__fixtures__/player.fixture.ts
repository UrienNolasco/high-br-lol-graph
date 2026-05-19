import { aChampion } from '../../../../test/fixtures/shared/champion.fixture';

export function aPlayer(overrides?: Record<string, unknown>) {
  return {
    puuid: 'test-puuid-12345',
    gameName: 'TestPlayer',
    tagLine: 'BR1',
    region: 'br1',
    profileIconId: 1234,
    summonerLevel: 100,
    summonerId: 'summoner-id',
    tier: 'GOLD',
    rank: 'II',
    leaguePoints: 50,
    rankedWins: 100,
    rankedLosses: 90,
    lastUpdated: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function aPlayerStats(overrides?: Record<string, unknown>) {
  return {
    puuid: 'test-puuid-12345',
    patch: '15.1',
    queueId: 420,
    gamesPlayed: 100,
    wins: 55,
    losses: 45,
    winRate: 55.0,
    avgKda: 2.5,
    avgCspm: 7.2,
    avgDpm: 650,
    avgGpm: 450,
    avgVisionScore: 20,
    roleDistribution: { MID: 50, TOP: 30, JUNGLE: 20 },
    topChampions: [
      { championId: 1, games: 30, winRate: 60 },
      { championId: 2, games: 20, winRate: 50 },
    ],
    lastUpdated: new Date('2026-01-01'),
    ...overrides,
  };
}

export function aMatchRow(overrides?: Record<string, unknown>) {
  return {
    matchId: 'BR1_123456',
    championId: 1,
    championName: 'Annie',
    role: 'MID',
    lane: 'MIDDLE',
    kills: 5,
    deaths: 3,
    assists: 10,
    kda: 5.0,
    goldEarned: 12000,
    totalDamage: 25000,
    visionScore: 30,
    win: true,
    csGraph: [0, 50, 100, 150, 200],
    match: {
      gameCreation: BigInt(1700000000000),
      gameDuration: 1800,
      queueId: 420,
    },
    ...overrides,
  };
}

export function aHeatmapEntry(
  dayOfWeek: number,
  hour: number,
  overrides?: Record<string, unknown>,
) {
  return {
    dayOfWeek,
    hour,
    games: 5,
    wins: 3,
    losses: 2,
    winRate: 60,
    ...overrides,
  };
}
