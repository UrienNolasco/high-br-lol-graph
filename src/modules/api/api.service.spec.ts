import { Test, TestingModule } from '@nestjs/testing';
import { ApiService } from './api.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { NotFoundException } from '@nestjs/common';
import { TierRankService } from './tier-rank.service';

const mockChampionStats = [
  {
    id: 1,
    championId: 266,
    patch: '14.4',
    wins: 10,
    gamesPlayed: 20,
    totalKills: 200,
    totalDeaths: 100,
    totalAssists: 300,
    totalDamageDealt: BigInt(500000),
    totalGoldEarned: BigInt(150000),
    totalCreepScore: 1000,
    totalDuration: 1200,
  },
  {
    id: 2,
    championId: 103,
    patch: '14.4',
    wins: 15,
    gamesPlayed: 25,
    totalKills: 300,
    totalDeaths: 150,
    totalAssists: 450,
    totalDamageDealt: BigInt(750000),
    totalGoldEarned: BigInt(200000),
    totalCreepScore: 1500,
    totalDuration: 1500,
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

const mockMatchupStats = {
  id: 1,
  championId1: 266,
  championId2: 103,
  champion1Wins: 5,
  gamesPlayed: 10,
  patch: '14.4',
  role: 'TOP',
};

const mockPrismaService = {
  championStats: {
    findMany: jest.fn().mockResolvedValue(mockChampionStats),
    findFirst: jest.fn(),
  },
  matchupStats: {
    findFirst: jest.fn().mockResolvedValue(mockMatchupStats),
    findMany: jest.fn().mockResolvedValue([mockMatchupStats]),
  },
  processedMatch: {
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
  processMatchupsForPatch: jest.fn().mockReturnValue({
    primaryRolesByChampion: new Map([
      [266, 'TOP'],
      [103, 'MID'],
    ]),
    gamesByChampionAndRole: new Map([
      [
        266,
        new Map([
          ['TOP', 10],
          ['JUNGLE', 5],
        ]),
      ],
      [103, new Map([['MID', 20]])],
    ]),
    totalGamesByRole: new Map([
      ['TOP', 100],
      ['JUNGLE', 50],
      ['MID', 150],
    ]),
  }),
  inferPrimaryRole: jest.fn().mockResolvedValue(null),
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
    it('should calculate winRate correctly and return paginated stats', async () => {
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

  describe('getMatchupStats', () => {
    it('should calculate matchup win rates correctly when championA is championId1', async () => {
      const championA = 'Aatrox';
      const championB = 'Ahri';
      const patch = '14.4';
      const role = 'TOP';

      const result = await service.getMatchupStats(
        championA,
        championB,
        patch,
        role,
      );

      expect(result.championA.name).toBe('Aatrox');
      expect(result.championA.winRate).toBe(50);

      expect(result.championB.name).toBe('Ahri');
      expect(result.championB.winRate).toBe(50);

      expect(result.gamesPlayed).toBe(10);
    });

    it('should calculate matchup win rates correctly when championA is championId2', async () => {
      mockPrismaService.matchupStats.findFirst.mockResolvedValueOnce({
        ...mockMatchupStats,
        championId1: 103,
        championId2: 266,
        champion1Wins: 7,
      });

      const result = await service.getMatchupStats(
        'Aatrox',
        'Ahri',
        '14.4',
        'TOP',
      );

      expect(result.championA.name).toBe('Aatrox');
      expect(result.championA.winRate).toBe(30);

      expect(result.championB.name).toBe('Ahri');
      expect(result.championB.winRate).toBe(70);
    });

    it('should throw NotFoundException if a champion is not found', async () => {
      await expect(
        service.getMatchupStats('Unknown', 'Ahri', '14.4', 'TOP'),
      ).rejects.toThrow(NotFoundException);
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
      expect(mockPrismaService.processedMatch.count).toHaveBeenCalledWith();
    });

    it('should return count filtered by patch', async () => {
      mockPrismaService.processedMatch.count.mockResolvedValue(50);

      const result = await service.getProcessedMatches('14.4');

      expect(result).toEqual({ count: 50, patch: '14.4' });
      expect(mockPrismaService.processedMatch.count).toHaveBeenCalledWith({
        where: { patch: '14.4' },
      });
    });

    it('should return message when patch has no data', async () => {
      mockPrismaService.processedMatch.count.mockResolvedValue(0);

      const result = await service.getProcessedMatches('99.9');

      expect(result).toEqual({
        count: 0,
        patch: '99.9',
        message: 'Não há dados para o patch 99.9',
      });
    });
  });
});
