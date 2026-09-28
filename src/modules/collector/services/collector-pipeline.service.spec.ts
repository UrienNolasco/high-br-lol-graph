import { CollectorPipelineService } from './collector-pipeline.service';

describe('CollectorPipelineService', () => {
  let service: CollectorPipelineService;
  let mockRiotService: {
    getHighEloAccounts: jest.Mock;
    getMatchIdsByPuuid: jest.Mock;
  };
  let mockQueueService: {
    publishBackgroundMatch: jest.Mock;
  };
  let mockDiscovery: { recordDiscovery: jest.Mock };
  let mockCollectorRepo: { matchExists: jest.Mock };
  let mockLogger: {
    info: jest.Mock;
    debug: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };

  beforeEach(() => {
    mockRiotService = {
      getHighEloAccounts: jest.fn(),
      getMatchIdsByPuuid: jest.fn(),
    };
    mockQueueService = {
      publishBackgroundMatch: jest.fn(),
    };
    mockDiscovery = { recordDiscovery: jest.fn() };
    mockCollectorRepo = {
      matchExists: jest.fn(),
    };
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    service = new CollectorPipelineService(
      mockRiotService,
      mockQueueService,
      mockCollectorRepo,
      mockLogger,
      mockDiscovery,
    );
  });

  it('should fetch high-elo puids and enqueue new matches', async () => {
    mockRiotService.getHighEloAccounts.mockResolvedValue(
      ['p1', 'p2'].map((puuid) => ({ puuid, rank: null })),
    );
    mockRiotService.getMatchIdsByPuuid.mockResolvedValue(['M1', 'M2']);
    mockCollectorRepo.matchExists.mockResolvedValue(false);

    await service.runCollection({ startHour: 1, endHour: 8 });

    expect(mockQueueService.publishBackgroundMatch).toHaveBeenCalledTimes(4);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ matchesEnqueued: 4 }),
      'Collection completed',
    );
  });

  it('should skip existing matches', async () => {
    mockRiotService.getHighEloAccounts.mockResolvedValue([
      { puuid: 'p1', rank: null },
    ]);
    mockRiotService.getMatchIdsByPuuid.mockResolvedValue(['M1', 'M2']);
    mockCollectorRepo.matchExists
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);

    await service.runCollection({ startHour: 1, endHour: 8 });

    expect(mockQueueService.publishBackgroundMatch).toHaveBeenCalledTimes(1);
    expect(mockQueueService.publishBackgroundMatch).toHaveBeenCalledWith('M2');
    expect(mockDiscovery.recordDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({
        matchIds: ['M1', 'M2'],
        source: 'collector',
        queriedPuuid: 'p1',
        queueFilter: null,
        rank: null,
      }),
    );
  });

  it('should continue on per-player errors', async () => {
    mockRiotService.getHighEloAccounts.mockResolvedValue(
      ['p1', 'p2'].map((puuid) => ({ puuid, rank: null })),
    );
    mockRiotService.getMatchIdsByPuuid
      .mockRejectedValueOnce(new Error('Rate limited'))
      .mockResolvedValueOnce(['M1']);
    mockCollectorRepo.matchExists.mockResolvedValue(false);

    await service.runCollection({ startHour: 1, endHour: 8 });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        puuid: 'p1',
        event: 'collection_player_error',
      }),
      'Error processing player PUUID',
    );
    expect(mockQueueService.publishBackgroundMatch).toHaveBeenCalledTimes(1);
  });

  it('should treat matchExists errors as new match', async () => {
    mockRiotService.getHighEloAccounts.mockResolvedValue([
      { puuid: 'p1', rank: null },
    ]);
    mockRiotService.getMatchIdsByPuuid.mockResolvedValue(['M1']);
    mockCollectorRepo.matchExists.mockRejectedValue(new Error('DB error'));

    await service.runCollection({ startHour: 1, endHour: 8 });

    expect(mockQueueService.publishBackgroundMatch).toHaveBeenCalledWith('M1');
  });
  it('records queried account rank and empty results without inferring match queue', async () => {
    const rank = {
      tier: 'MASTER',
      division: 'I',
      leaguePoints: 0,
      queue: 'RANKED_SOLO_5x5',
      observedAt: new Date(0),
    };
    mockRiotService.getHighEloAccounts.mockResolvedValue([
      { puuid: 'p1', rank },
    ]);
    mockRiotService.getMatchIdsByPuuid.mockResolvedValue([]);
    await service.runCollection({ startHour: 1, endHour: 8 });
    expect(mockDiscovery.recordDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({
        matchIds: [],
        rank,
        queueFilter: null,
        region: 'br1',
      }),
    );
    expect(mockQueueService.publishBackgroundMatch).not.toHaveBeenCalled();
  });
});
