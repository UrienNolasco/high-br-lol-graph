import { Test, TestingModule } from '@nestjs/testing';
import { ApiService } from './api.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { NotFoundException } from '@nestjs/common';
import { TierRankService } from './tier-rank.service';
import { RiotService } from '../../core/riot/riot.service';

const mockChampionStats = [
  {
    id: 1,
    championId: 266,
    patch: '14.4',
    queueId: 420,
    wins: 10,
    losses: 10,
    gamesPlayed: 20,
    winRate: 50.0,
    kda: 3.33,
    dpm: 416.67,
    cspm: 0.83,
    gpm: 125.0,
    banRate: 12.5,
    pickRate: 8.0,
    tier: null,
    rank: null,
  },
  {
    id: 2,
    championId: 103,
    patch: '14.4',
    queueId: 420,
    wins: 15,
    losses: 10,
    gamesPlayed: 25,
    winRate: 60.0,
    kda: 5.0,
    dpm: 500.0,
    cspm: 1.0,
    gpm: 133.33,
    banRate: 15.0,
    pickRate: 10.0,
    tier: null,
    rank: null,
  },
];

const mockChampionData = {
  '266': {
    id: 'Aatrox',
    key: '266',
    name: 'Aatrox',
    version: '14.4.1',
    title: 'the Darkin Blade',
  },
  '103': {
    id: 'Ahri',
    key: '103',
    name: 'Ahri',
    version: '14.4.1',
    title: 'the Nine-Tailed Fox',
  },
};

const mockPrismaService = {
  championStats: {
    findMany: jest.fn().mockResolvedValue(mockChampionStats),
    findFirst: jest.fn(),
  },
  match: {
    count: jest.fn().mockResolvedValue(100),
  },
};

const mockDataDragonService = {
  getChampionById: jest.fn((id: number) => mockChampionData[id.toString()]),
  getChampionByName: jest.fn((name: string) => {
    if (name.toLowerCase() === 'aatrox') return mockChampionData['266'];
    if (name.toLowerCase() === 'ahri') return mockChampionData['103'];
    return undefined;
  }),
  getChampionImageUrls: jest.fn().mockResolvedValue({
    square: 'https://url.com/Aatrox.png',
    loading: 'https://url.com/Aatrox_0.jpg',
    splash: 'https://url.com/Aatrox_0.jpg',
  }),
  getAllChampions: jest.fn().mockReturnValue(Object.values(mockChampionData)),
  getVersions: jest.fn().mockResolvedValue(['14.4.1', '14.3.1', '14.2.1']),
};

const mockTierRankService = {
  getPreviousPatch: jest.fn((patch: string) => {
    if (patch === '14.4') return '14.3';
    if (patch === '14.3') return '14.2';
    return '13.24';
  }),
  calculateChampionScore: jest.fn().mockReturnValue({
    tier: 'S',
    score: 85,
    hasInsufficientData: false,
  }),
  getChampionStats: jest.fn().mockResolvedValue(null),
};

const mockRiotService = {
  getMatchIdsByPuuid: jest.fn(),
};

describe('ApiService', () => {
  let service: ApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: DataDragonService, useValue: mockDataDragonService },
        { provide: TierRankService, useValue: mockTierRankService },
        { provide: RiotService, useValue: mockRiotService },
      ],
    }).compile();

    service = module.get<ApiService>(ApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getChampionStats', () => {
    it('should return paginated stats with tier and rank', async () => {
      const patch = '14.4';
      const page = 1;
      const limit = 10;

      const result = await service.getChampionStats(patch, page, limit);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(page);
      expect(result.limit).toBe(limit);

      expect(mockPrismaService.championStats.findMany).toHaveBeenCalledWith({
        where: { patch },
      });
    });

    it('should use default values for page and limit', async () => {
      const result = await service.getChampionStats('14.4');

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should handle empty results', async () => {
      mockPrismaService.championStats.findMany.mockResolvedValue([]);

      const result = await service.getChampionStats('99.9');

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getChampion', () => {
    it('should return stats for a specific champion', async () => {
      mockPrismaService.championStats.findFirst.mockResolvedValue(
        mockChampionStats[0],
      );
      const result = await service.getChampion('Aatrox', '14.4');
      expect(result.championName).toBe('Aatrox');
      expect(result.winRate).toBe(50);
    });

    it('should throw NotFoundException for an unknown champion name', async () => {
      await expect(service.getChampion('Unknown', '14.4')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if stats for a known champion do not exist on a patch', async () => {
      mockPrismaService.championStats.findFirst.mockResolvedValue(null);
      await expect(service.getChampion('Aatrox', '99.9')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAllChampions', () => {
    it('should return all champions with images', async () => {
      const result = await service.getAllChampions();

      expect(result.champions).toBeDefined();
      expect(Array.isArray(result.champions)).toBe(true);
      expect(result.total).toBe(2);
      expect(result.champions[0].images).toBeDefined();
    });
  });

  describe('getCurrentPatch', () => {
    it('should return patches with current highlighted', async () => {
      const result = await service.getCurrentPatch();

      expect(result.patches).toBeDefined();
      expect(result.current).toBeDefined();
      expect(result.patches[0]).toEqual(result.current);
    });

    it('should format patches correctly', async () => {
      const result = await service.getCurrentPatch();

      expect(result.patches[0].patch).toBe('14.4');
      expect(result.patches[0].fullVersion).toBe('14.4.1');
    });
  });

  describe('getProcessedMatches', () => {
    it('should return total count without patch filter', async () => {
      const result = await service.getProcessedMatches();

      expect(result).toEqual({ count: 100 });
      expect(mockPrismaService.match.count).toHaveBeenCalledWith();
    });

    it('should return count filtered by patch', async () => {
      mockPrismaService.match.count.mockResolvedValue(50);

      const result = await service.getProcessedMatches('14.4');

      expect(result).toEqual({ count: 50, patch: '14.4' });
      expect(mockPrismaService.match.count).toHaveBeenCalledWith({
        where: { gameVersion: { startsWith: '14.4' } },
      });
    });

    it('should return message when patch has no data', async () => {
      mockPrismaService.match.count.mockResolvedValue(0);

      const result = await service.getProcessedMatches('99.9');

      expect(result).toEqual({
        count: 0,
        patch: '99.9',
        message: 'Não há dados para o patch 99.9',
      });
    });
  });
});
