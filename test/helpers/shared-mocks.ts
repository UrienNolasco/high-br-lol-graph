export function mockPrismaService() {
  return {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $on: jest.fn(),
    $transaction: jest.fn().mockResolvedValue(undefined),
    $executeRaw: jest.fn().mockResolvedValue(0),
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    player: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    match: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    championStats: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    matchParticipant: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    matchTeam: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    playerChampionStats: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
    },
    playerSync: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    timelineEvent: {
      findMany: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    timelineFrame: {
      findMany: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    processedMatch: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    patch: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  };
}

export function mockStatsService(overrides?: Record<string, unknown>) {
  return {
    getChampionStats: jest.fn().mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    }),
    getChampion: jest.fn().mockResolvedValue(null),
    getProcessedMatches: jest.fn().mockResolvedValue({ count: 1000 }),
    ...overrides,
  };
}

export function mockChampionListService(overrides?: Record<string, unknown>) {
  return {
    getAllChampions: jest.fn().mockResolvedValue({
      champions: [],
      total: 0,
    }),
    ...overrides,
  };
}

export function mockCurrentPatchService(overrides?: Record<string, unknown>) {
  return {
    getCurrentPatch: jest.fn().mockResolvedValue({
      patches: [],
      current: { patch: '15.1', fullVersion: '15.1.1' },
    }),
    ...overrides,
  };
}

export function mockRateLimiterService(overrides?: Record<string, unknown>) {
  return {
    getStatus: jest.fn().mockResolvedValue({
      requestsInWindow: 0,
      maxRequests: 100,
      canProceed: true,
    }),
    clear: jest.fn().mockResolvedValue(undefined),
    throttle: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function mockCollectorService(overrides?: Record<string, unknown>) {
  return {
    getStatus: jest.fn().mockResolvedValue({
      enabled: true,
      isRunning: false,
      lastRun: null,
      startHour: 0,
      endHour: 23,
    }),
    setEnabled: jest.fn().mockResolvedValue(undefined),
    triggerNow: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function mockAnalyticsService(overrides?: Record<string, unknown>) {
  return {
    comparePlayerPerformance: jest.fn().mockResolvedValue({
      hero: { puuid: 'hero', summary: {} },
      villain: { puuid: 'villain', summary: {} },
      comparison: {},
    }),
    ...overrides,
  };
}

export function mockMatchDetailService(overrides?: Record<string, unknown>) {
  return {
    getMatchDetails: jest
      .fn()
      .mockResolvedValue({ matchId: 'BR1_123', participants: [] }),
    ...overrides,
  };
}

export function mockMatchGoldTimelineService(
  overrides?: Record<string, unknown>,
) {
  return {
    getGoldTimeline: jest.fn().mockResolvedValue({ frames: [] }),
    ...overrides,
  };
}

export function mockMatchTimelineEventsService(
  overrides?: Record<string, unknown>,
) {
  return {
    getTimelineEvents: jest.fn().mockResolvedValue({ events: [] }),
    ...overrides,
  };
}

export function mockMatchBuildsService(overrides?: Record<string, unknown>) {
  return {
    getBuilds: jest.fn().mockResolvedValue({ builds: [] }),
    ...overrides,
  };
}

export function mockMatchPerformanceService(
  overrides?: Record<string, unknown>,
) {
  return {
    getPerformanceComparison: jest.fn().mockResolvedValue({
      player: { puuid: 'test', performance: {} },
      teamAverage: {},
    }),
    ...overrides,
  };
}

export function mockPlayersService(overrides?: Record<string, unknown>) {
  return {
    searchPlayer: jest
      .fn()
      .mockResolvedValue({
        puuid: 'test-puuid',
        gameName: 'Test',
        tagLine: 'BR1',
      }),
    getPlayerProfile: jest
      .fn()
      .mockResolvedValue({
        puuid: 'test-puuid',
        gameName: 'Test',
        tagLine: 'BR1',
        profileIconId: 1,
        summonerLevel: 30,
      }),
    getPlayerUpdateStatus: jest
      .fn()
      .mockResolvedValue({ puuid: 'test-puuid', status: 'idle' }),
    getPlayerSummary: jest
      .fn()
      .mockResolvedValue({
        puuid: 'test-puuid',
        totalGames: 100,
        wins: 55,
        losses: 45,
      }),
    getPlayerChampions: jest
      .fn()
      .mockResolvedValue({ puuid: 'test-puuid', champions: [], total: 0 }),
    getPlayerRoleDistribution: jest
      .fn()
      .mockResolvedValue({ puuid: 'test-puuid', roles: {} }),
    getPlayerActivity: jest
      .fn()
      .mockResolvedValue({ puuid: 'test-puuid', activity: [] }),
    getPlayerMatches: jest
      .fn()
      .mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20 } }),
    getPlayerMatchesByPage: jest
      .fn()
      .mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20 } }),
    ...overrides,
  };
}

export function mockQueueService(overrides?: Record<string, unknown>) {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function mockPinoLogger(overrides?: Record<string, unknown>) {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
    ...overrides,
  };
}

export function mockSyncService(overrides?: Record<string, unknown>) {
  return {
    triggerDeepSync: jest
      .fn()
      .mockResolvedValue({ message: 'Sync started', puuid: 'test-puuid' }),
    getSyncStatus: jest
      .fn()
      .mockResolvedValue({ puuid: 'test-puuid', status: 'idle', progress: 0 }),
    ...overrides,
  };
}
