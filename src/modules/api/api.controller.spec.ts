import { Test, TestingModule } from '@nestjs/testing';
import {
  RateLimitController,
  ChampionsController,
  StatsController,
} from './api.controller';
import { RateLimiterService } from '../../core/riot/rate-limiter.service';
import { ApiService } from './api.service';
import { NotFoundException } from '@nestjs/common';

describe('RateLimitController', () => {
  let controller: RateLimitController;
  let rateLimiterService: RateLimiterService;

  const mockRateLimiterService = {
    getStatus: jest.fn(),
    clear: jest.fn(),
  };

  const mockApiService = {
    getAllChampions: jest.fn(),
    getCurrentPatch: jest.fn(),
    getChampionStats: jest.fn(),
    getChampion: jest.fn(),
    getProcessedMatches: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RateLimitController],
      providers: [
        { provide: RateLimiterService, useValue: mockRateLimiterService },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compile();

    controller = module.get<RateLimitController>(RateLimitController);
    rateLimiterService = module.get<RateLimiterService>(RateLimiterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getRateLimitStatus', () => {
    it('should return current rate limit status', async () => {
      const mockStatus = {
        tokens: 9,
        maxTokens: 10,
        windowMs: 60000,
      };
      mockRateLimiterService.getStatus.mockResolvedValue(mockStatus);

      const result = await controller.getRateLimitStatus();

      expect(result).toEqual(mockStatus);
      expect(rateLimiterService.getStatus).toHaveBeenCalled();
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit tokens', async () => {
      mockRateLimiterService.clear.mockResolvedValue(undefined);

      const result = await controller.resetRateLimit();

      expect(result).toEqual({
        message: 'Rate limit tokens resetados com sucesso',
      });
      expect(rateLimiterService.clear).toHaveBeenCalled();
    });
  });
});

describe('ChampionsController', () => {
  let controller: ChampionsController;
  let apiService: ApiService;

  const mockApiService = {
    getAllChampions: jest.fn(),
    getCurrentPatch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChampionsController],
      providers: [{ provide: ApiService, useValue: mockApiService }],
    }).compile();

    controller = module.get<ChampionsController>(ChampionsController);
    apiService = module.get<ApiService>(ApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllChampions', () => {
    it('should return list of all champions', async () => {
      const mockChampionList = {
        champions: [
          {
            name: 'Aatrox',
            id: 'Aatrox',
            key: 266,
            title: 'the Darkin Blade',
            version: '14.4.1',
            images: { square: 'url', loading: 'url', splash: 'url' },
          },
          {
            name: 'Ahri',
            id: 'Ahri',
            key: 103,
            title: 'the Nine-Tailed Fox',
            version: '14.4.1',
            images: { square: 'url', loading: 'url', splash: 'url' },
          },
        ],
        total: 2,
      };
      mockApiService.getAllChampions.mockResolvedValue(mockChampionList);

      const result = await controller.getAllChampions();

      expect(result).toEqual(mockChampionList);
      expect(result.champions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(apiService.getAllChampions).toHaveBeenCalled();
    });

    it('should include images for each champion', async () => {
      const mockChampionList = {
        champions: [
          {
            name: 'Aatrox',
            id: 'Aatrox',
            key: 266,
            title: 'the Darkin Blade',
            version: '14.4.1',
            images: {
              square: 'https://url.com/Aatrox.png',
              loading: 'https://url.com/Aatrox_0.jpg',
              splash: 'https://url.com/Aatrox_0.jpg',
            },
          },
        ],
        total: 1,
      };
      mockApiService.getAllChampions.mockResolvedValue(mockChampionList);

      const result = await controller.getAllChampions();

      expect(result.champions[0].images).toBeDefined();
      expect(result.champions[0].images.square).toBeDefined();
      expect(result.champions[0].images.loading).toBeDefined();
      expect(result.champions[0].images.splash).toBeDefined();
    });
  });

  describe('getCurrentPatch', () => {
    it('should return all available patches ordered from most recent', async () => {
      const mockPatchData = {
        patches: [
          { patch: '15.23', fullVersion: '15.23.1' },
          { patch: '15.22', fullVersion: '15.22.2' },
          { patch: '15.21', fullVersion: '15.21.1' },
        ],
        current: { patch: '15.23', fullVersion: '15.23.1' },
      };
      mockApiService.getCurrentPatch.mockResolvedValue(mockPatchData);

      const result = await controller.getCurrentPatch();

      expect(result.patches).toHaveLength(3);
      expect(result.current).toEqual({
        patch: '15.23',
        fullVersion: '15.23.1',
      });
      expect(result.patches[0].patch).toBe('15.23');
      expect(result.patches[1].patch).toBe('15.22');
      expect(result.patches[2].patch).toBe('15.21');
    });

    it('should highlight the most recent patch as current', async () => {
      const mockPatchData = {
        patches: [
          { patch: '15.23', fullVersion: '15.23.1' },
          { patch: '15.22', fullVersion: '15.22.2' },
        ],
        current: { patch: '15.23', fullVersion: '15.23.1' },
      };
      mockApiService.getCurrentPatch.mockResolvedValue(mockPatchData);

      const result = await controller.getCurrentPatch();

      expect(result.current).toStrictEqual(result.patches[0]);
    });
  });
});

describe('StatsController', () => {
  let controller: StatsController;
  let apiService: ApiService;

  const mockApiService = {
    getChampionStats: jest.fn(),
    getChampion: jest.fn(),
    getProcessedMatches: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatsController],
      providers: [{ provide: ApiService, useValue: mockApiService }],
    }).compile();

    controller = module.get<StatsController>(StatsController);
    apiService = module.get<ApiService>(ApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getChampionStats', () => {
    it('should return paginated champion stats', async () => {
      const mockStats = {
        data: [
          {
            championId: 266,
            championName: 'Aatrox',
            winRate: 55.5,
            gamesPlayed: 100,
            wins: 55,
            losses: 45,
            kda: 2.5,
            dpm: 650.3,
            cspm: 7.2,
            gpm: 450.8,
            banRate: 15.5,
            pickRate: 12.3,
            tier: 'A',
            rank: 3,
            images: { full: 'url' },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockApiService.getChampionStats.mockResolvedValue(mockStats);

      const result = await controller.getChampionStats({
        patch: '15.23',
        page: 1,
        limit: 20,
        sortBy: 'winRate',
        order: 'desc',
      });

      expect(result).toEqual(mockStats);
      expect(apiService.getChampionStats).toHaveBeenCalledWith(
        '15.23',
        1,
        20,
        'winRate',
        'desc',
      );
    });

    it('should use default values when page and limit are not provided', async () => {
      const mockStats = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      };
      mockApiService.getChampionStats.mockResolvedValue(mockStats);

      await controller.getChampionStats({ patch: '15.23' });

      expect(apiService.getChampionStats).toHaveBeenCalledWith(
        '15.23',
        1,
        20,
        'winRate',
        'desc',
      );
    });

    it('should use default sortBy and order when not provided', async () => {
      const mockStats = { data: [], total: 0, page: 1, limit: 20 };
      mockApiService.getChampionStats.mockResolvedValue(mockStats);

      await controller.getChampionStats({ patch: '15.23' });

      expect(apiService.getChampionStats).toHaveBeenCalledWith(
        '15.23',
        1,
        20,
        'winRate',
        'desc',
      );
    });
  });

  describe('getChampion', () => {
    it('should return stats for a specific champion', async () => {
      const mockChampionStats = {
        championId: 266,
        championName: 'Aatrox',
        winRate: 55.5,
        gamesPlayed: 100,
        wins: 55,
        losses: 45,
        kda: 2.5,
        dpm: 650.3,
        cspm: 7.2,
        gpm: 450.8,
        banRate: 15.5,
        pickRate: 12.3,
        tier: 'A',
        rank: 3,
        primaryRole: 'TOP',
        images: { full: 'url' },
      };
      mockApiService.getChampion.mockResolvedValue(mockChampionStats);

      const result = await controller.getChampion('Aatrox', '15.23');

      expect(result).toEqual(mockChampionStats);
      expect(apiService.getChampion).toHaveBeenCalledWith('Aatrox', '15.23');
    });

    it('should throw NotFoundException when champion not found', async () => {
      mockApiService.getChampion.mockRejectedValue(
        new NotFoundException('Champion not found'),
      );

      await expect(controller.getChampion('Unknown', '15.23')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getProcessedMatches', () => {
    it('should return total count of processed matches without patch', async () => {
      const mockResult = { count: 1000 };
      mockApiService.getProcessedMatches.mockResolvedValue(mockResult);

      const result = await controller.getProcessedMatches();

      expect(result).toEqual(mockResult);
      expect(apiService.getProcessedMatches).toHaveBeenCalledWith(undefined);
    });

    it('should return count filtered by patch', async () => {
      const mockResult = { count: 500, patch: '15.23' };
      mockApiService.getProcessedMatches.mockResolvedValue(mockResult);

      const result = await controller.getProcessedMatches('15.23');

      expect(result).toEqual(mockResult);
      expect(apiService.getProcessedMatches).toHaveBeenCalledWith('15.23');
    });

    it('should return count 0 and message when patch has no data', async () => {
      const mockResult = {
        count: 0,
        patch: '99.99',
        message: 'Não há dados para o patch 99.99',
      };
      mockApiService.getProcessedMatches.mockResolvedValue(mockResult);

      const result = await controller.getProcessedMatches('99.99');

      expect(result).toEqual(mockResult);
    });
  });
});
