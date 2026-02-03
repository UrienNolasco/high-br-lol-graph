import { Test, TestingModule } from '@nestjs/testing';
import { TierRankService, ChampionMetrics } from './tier-rank.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('TierRankService', () => {
  let service: TierRankService;

  const mockPrismaService = {
    championStats: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TierRankService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TierRankService>(TierRankService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPreviousPatch', () => {
    it('should return previous patch for standard version', () => {
      const result = service.getPreviousPatch('15.20');
      expect(result).toBe('15.19');
    });

    it('should return previous patch when minor version decrements', () => {
      const result = service.getPreviousPatch('15.01');
      expect(result).toBe('14.23');
    });

    it('should return null for first patch of version', () => {
      const result = service.getPreviousPatch('1.01');
      expect(result).toBeNull();
    });

    it('should handle double-digit patches correctly', () => {
      const result = service.getPreviousPatch('15.10');
      expect(result).toBe('15.09');
    });

    it('should return null for patch 1.00', () => {
      const result = service.getPreviousPatch('1.00');
      expect(result).toBeNull();
    });
  });

  describe('calculateChampionScore', () => {
    const mockCurrentMetrics: ChampionMetrics = {
      winRate: 55,
      banRate: 15,
      pickRate: 20,
      kda: 3.0,
      dpm: 700,
      gpm: 450,
      cspm: 8.0,
      gamesPlayed: 100,
    };

    it('should return S+ tier for very high score', () => {
      const highMetrics: ChampionMetrics = {
        winRate: 58,
        banRate: 25,
        pickRate: 30,
        kda: 4.5,
        dpm: 800,
        gpm: 500,
        cspm: 10,
        gamesPlayed: 150,
      };

      const result = service.calculateChampionScore(
        266,
        '15.23',
        highMetrics,
        null,
      );

      expect(result.tier).toBe('S+');
      expect(result.hasInsufficientData).toBe(false);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should return S tier for high score', () => {
      const result = service.calculateChampionScore(
        266,
        '15.23',
        mockCurrentMetrics,
        null,
      );

      expect(result.tier).toBe('S');
      expect(result.hasInsufficientData).toBe(false);
    });

    it('should return A tier for medium-high score', () => {
      const mediumHighMetrics: ChampionMetrics = {
        winRate: 52,
        banRate: 12,
        pickRate: 15,
        kda: 2.5,
        dpm: 600,
        gpm: 400,
        cspm: 7,
        gamesPlayed: 100,
      };

      const result = service.calculateChampionScore(
        266,
        '15.23',
        mediumHighMetrics,
        null,
      );

      expect(result.tier).toBe('A');
      expect(result.hasInsufficientData).toBe(false);
    });

    it('should return B tier for medium score', () => {
      const mediumMetrics: ChampionMetrics = {
        winRate: 48,
        banRate: 8,
        pickRate: 10,
        kda: 2.0,
        dpm: 500,
        gpm: 350,
        cspm: 6.0,
        gamesPlayed: 100,
      };

      const result = service.calculateChampionScore(
        266,
        '15.23',
        mediumMetrics,
        null,
      );

      expect(result.tier).toBe('B');
      expect(result.hasInsufficientData).toBe(false);
    });

    it('should return C tier for low score', () => {
      const lowMetrics: ChampionMetrics = {
        winRate: 47,
        banRate: 5,
        pickRate: 8,
        kda: 1.8,
        dpm: 450,
        gpm: 350,
        cspm: 5,
        gamesPlayed: 100,
      };

      const result = service.calculateChampionScore(
        266,
        '15.23',
        lowMetrics,
        null,
      );

      expect(result.tier).toBe('C');
      expect(result.hasInsufficientData).toBe(false);
    });

    it('should return D tier for very low score', () => {
      const veryLowMetrics: ChampionMetrics = {
        winRate: 43,
        banRate: 2,
        pickRate: 5,
        kda: 1.5,
        dpm: 350,
        gpm: 300,
        cspm: 4,
        gamesPlayed: 100,
      };

      const result = service.calculateChampionScore(
        266,
        '15.23',
        veryLowMetrics,
        null,
      );

      expect(result.tier).toBe('D');
      expect(result.hasInsufficientData).toBe(false);
    });

    it('should mark as insufficient data when games played < 50', () => {
      const lowGamesMetrics: ChampionMetrics = {
        winRate: 60,
        banRate: 20,
        pickRate: 25,
        kda: 4,
        dpm: 750,
        gpm: 480,
        cspm: 9,
        gamesPlayed: 30,
      };

      const result = service.calculateChampionScore(
        266,
        '15.23',
        lowGamesMetrics,
        null,
      );

      expect(result.hasInsufficientData).toBe(true);
    });

    it('should consider previous metrics in scoring', () => {
      const previousMetrics: ChampionMetrics = {
        winRate: 50,
        banRate: 10,
        pickRate: 15,
        kda: 2.5,
        dpm: 600,
        gpm: 400,
        cspm: 7,
        gamesPlayed: 100,
      };

      const result = service.calculateChampionScore(
        266,
        '15.23',
        mockCurrentMetrics,
        previousMetrics,
      );

      expect(result.score).toBeDefined();
      expect(result.hasInsufficientData).toBe(false);
    });

    it('should calculate score correctly with improved metrics', () => {
      const previousMetrics: ChampionMetrics = {
        winRate: 48,
        banRate: 8,
        pickRate: 12,
        kda: 2.2,
        dpm: 550,
        gpm: 380,
        cspm: 6,
        gamesPlayed: 100,
      };

      const result = service.calculateChampionScore(
        266,
        '15.23',
        mockCurrentMetrics,
        previousMetrics,
      );

      expect(result.score).toBeGreaterThan(0);
    });

    it('should calculate score correctly with declined metrics', () => {
      const previousMetrics: ChampionMetrics = {
        winRate: 60,
        banRate: 20,
        pickRate: 25,
        kda: 4,
        dpm: 800,
        gpm: 500,
        cspm: 10,
        gamesPlayed: 100,
      };

      const currentLowerMetrics: ChampionMetrics = {
        winRate: 52,
        banRate: 12,
        pickRate: 15,
        kda: 2.5,
        dpm: 600,
        gpm: 400,
        cspm: 7,
        gamesPlayed: 100,
      };

      const result = service.calculateChampionScore(
        266,
        '15.23',
        currentLowerMetrics,
        previousMetrics,
      );

      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('getChampionStats', () => {
    it('should return champion metrics when found', async () => {
      const championId = 266;
      const patch = '15.23';
      const queueId = 420;

      const mockStats = {
        winRate: 55,
        banRate: 15,
        pickRate: 20,
        kda: 3.0,
        dpm: 700,
        gpm: 450,
        cspm: 8.0,
        gamesPlayed: 100,
      };

      mockPrismaService.championStats.findUnique.mockResolvedValue(mockStats);

      const result = await service.getChampionStats(championId, patch, queueId);

      expect(result).toEqual(mockStats);
      expect(mockPrismaService.championStats.findUnique).toHaveBeenCalledWith({
        where: {
          championId_patch_queueId: { championId, patch, queueId },
        },
      });
    });

    it('should return null when stats not found', async () => {
      mockPrismaService.championStats.findUnique.mockResolvedValue(null);

      const result = await service.getChampionStats(266, '15.23', 420);

      expect(result).toBeNull();
    });
  });

  describe('getAllChampionStats', () => {
    it('should return all champion stats for a patch', async () => {
      const patch = '15.23';
      const mockStats = [
        { championId: 266, patch: '15.23', winRate: 55 },
        { championId: 103, patch: '15.23', winRate: 52 },
      ];

      mockPrismaService.championStats.findMany.mockResolvedValue(mockStats);

      const result = await service.getAllChampionStats(patch);

      expect(result).toEqual(mockStats);
      expect(mockPrismaService.championStats.findMany).toHaveBeenCalledWith({
        where: { patch },
      });
    });

    it('should filter by queueId when provided', async () => {
      const patch = '15.23';
      const queueId = 420;

      await service.getAllChampionStats(patch, queueId);

      expect(mockPrismaService.championStats.findMany).toHaveBeenCalledWith({
        where: { patch, queueId },
      });
    });
  });
});
