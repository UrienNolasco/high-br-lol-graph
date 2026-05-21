import { CollectorPipelineService } from './collector-pipeline.service';

describe('CollectorPipelineService', () => {
  let service: CollectorPipelineService;
  let mockRiotService: {
    getHighEloPuids: jest.Mock;
    getMatchIdsByPuuid: jest.Mock;
  };
  let mockQueueService: { publishBackgroundMatch: jest.Mock };
  let mockCollectorRepo: { matchExists: jest.Mock };
  let mockLogger: {
    info: jest.Mock;
    debug: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };

  beforeEach(() => {
    mockRiotService = {
      getHighEloPuids: jest.fn(),
      getMatchIdsByPuuid: jest.fn(),
    };
    mockQueueService = {
      publishBackgroundMatch: jest.fn(),
    };
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
    );
  });

  it('should fetch high-elo puids and enqueue new matches', async () => {
    mockRiotService.getHighEloPuids.mockResolvedValue(['p1', 'p2']);
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
    mockRiotService.getHighEloPuids.mockResolvedValue(['p1']);
    mockRiotService.getMatchIdsByPuuid.mockResolvedValue(['M1', 'M2']);
    mockCollectorRepo.matchExists
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);

    await service.runCollection({ startHour: 1, endHour: 8 });

    expect(mockQueueService.publishBackgroundMatch).toHaveBeenCalledTimes(1);
    expect(mockQueueService.publishBackgroundMatch).toHaveBeenCalledWith('M2');
  });

  it('should continue on per-player errors', async () => {
    mockRiotService.getHighEloPuids.mockResolvedValue(['p1', 'p2']);
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
    mockRiotService.getHighEloPuids.mockResolvedValue(['p1']);
    mockRiotService.getMatchIdsByPuuid.mockResolvedValue(['M1']);
    mockCollectorRepo.matchExists.mockRejectedValue(new Error('DB error'));

    await service.runCollection({ startHour: 1, endHour: 8 });

    expect(mockQueueService.publishBackgroundMatch).toHaveBeenCalledWith('M1');
  });
});
