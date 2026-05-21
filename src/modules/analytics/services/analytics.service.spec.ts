import { AnalyticsService } from './analytics.service';

interface MockRepo {
  findUserByPuuid: jest.Mock;
  findPlayerStats: jest.Mock;
  findPlayerChampionStats: jest.Mock;
  findPlayerLaningMetrics: jest.Mock;
  findMatchesForTimeline: jest.Mock;
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockRepo: MockRepo;

  const baseStats = {
    gamesPlayed: 100,
    winRate: 55,
    avgKda: 3.0,
    avgCspm: 7.0,
    avgDpm: 600,
    avgGpm: 400,
    avgVisionScore: 20,
  };

  beforeEach(() => {
    mockRepo = {
      findUserByPuuid: jest.fn(),
      findPlayerStats: jest.fn(),
      findPlayerChampionStats: jest.fn(),
      findPlayerLaningMetrics: jest.fn(),
      findMatchesForTimeline: jest.fn(),
    };
    service = new AnalyticsService(mockRepo);
  });

  it('should return full comparison', async () => {
    mockRepo.findUserByPuuid.mockResolvedValue({
      puuid: 'h',
      gameName: 'Hero',
    });
    mockRepo.findPlayerStats.mockResolvedValue(baseStats);
    mockRepo.findPlayerLaningMetrics.mockResolvedValue(null);
    mockRepo.findMatchesForTimeline.mockResolvedValue([]);

    const result = await service.comparePlayerPerformance('h', 'v', {
      patch: '15.1',
    });

    expect(result.hero.puuid).toBe('h');
    expect(result.hero.stats.avgKda).toBe(baseStats.avgKda);
    expect(result.villain.puuid).toBe('v');
    expect(result.insights.winner).toBeDefined();
    expect(result.timelineComparison.csGraph.hero).toEqual([]);
  });

  it('should throw when hero not found', async () => {
    mockRepo.findUserByPuuid
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ puuid: 'v', gameName: 'Villain' });

    await expect(
      service.comparePlayerPerformance('h', 'v', { patch: '15.1' }),
    ).rejects.toThrow('não encontrado');
  });

  it('should use champion stats when championId provided', async () => {
    mockRepo.findUserByPuuid.mockResolvedValue({
      puuid: 'h',
      gameName: 'Hero',
    });
    mockRepo.findPlayerChampionStats.mockResolvedValue(baseStats);
    mockRepo.findPlayerLaningMetrics.mockResolvedValue({
      avgCsd15: 5,
      avgGd15: 200,
      avgXpd15: 150,
    });
    mockRepo.findMatchesForTimeline.mockResolvedValue([]);

    const result = await service.comparePlayerPerformance('h', 'v', {
      championId: 1,
      patch: '15.1',
    });

    expect(mockRepo.findPlayerChampionStats).toHaveBeenCalledTimes(2);
    expect(result.hero.stats.avgKda).toBe(baseStats.avgKda);
  });
});
