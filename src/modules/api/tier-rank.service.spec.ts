import { Test, TestingModule } from '@nestjs/testing';
import { TierRankService, ChampionMetrics } from './tier-rank.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('TierRankService', () => {
  let service: TierRankService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    matchupStats: {
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
    prismaService = module.get<PrismaService>(PrismaService);
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

  describe('inferPrimaryRole', () => {
    it('should infer primary role based on most games', async () => {
      const championId = 266;
      const patch = '15.23';

      mockPrismaService.matchupStats.findMany.mockResolvedValue([
        { role: 'TOP', gamesPlayed: 50 },
        { role: 'TOP', gamesPlayed: 30 },
        { role: 'MIDDLE', gamesPlayed: 10 },
      ]);

      const result = await service.inferPrimaryRole(championId, patch);
      expect(result).toBeDefined();
      expect(result).toBe('TOP');
      expect(mockPrismaService.matchupStats.findMany).toHaveBeenCalledWith({
        where: {
          patch,
          OR: [{ championId1: championId }, { championId2: championId }],
        },
      });
    });

    it('should return null when no matchup data exists', async () => {
      const championId = 999;
      const patch = '15.23';

      mockPrismaService.matchupStats.findMany.mockResolvedValue([]);

      const result = await service.inferPrimaryRole(championId, patch);
      expect(result).toBeNull();
    });
  });

  describe('processMatchupsForPatch', () => {
    it('should process matchups and extract primary roles', () => {
      const mockMatchups = [
        {
          championId1: 266,
          championId2: 103,
          gamesPlayed: 50,
          role: 'TOP',
        },
        {
          championId1: 266,
          championId2: 157,
          gamesPlayed: 30,
          role: 'TOP',
        },
        {
          championId1: 266,
          championId2: 54,
          gamesPlayed: 10,
          role: 'MIDDLE',
        },
      ];

      const result = service.processMatchupsForPatch(mockMatchups);

      expect(result.primaryRolesByChampion).toBeDefined();
      expect(result.gamesByChampionAndRole).toBeDefined();
      expect(result.totalGamesByRole).toBeDefined();
    });

    it('should correctly identify primary role for champion', () => {
      const mockMatchups = [
        {
          championId1: 266,
          championId2: 103,
          gamesPlayed: 50,
          role: 'TOP',
        },
        {
          championId1: 266,
          championId2: 157,
          gamesPlayed: 30,
          role: 'TOP',
        },
      ];

      const result = service.processMatchupsForPatch(mockMatchups);

      expect(result.primaryRolesByChampion.get(266)).toBe('TOP');
    });

    it('should handle empty matchups array', () => {
      const result = service.processMatchupsForPatch([]);

      expect(result.primaryRolesByChampion.size).toBe(0);
      expect(result.gamesByChampionAndRole.size).toBe(0);
      expect(result.totalGamesByRole.size).toBe(0);
    });

    it('should calculate total games by role correctly', () => {
      const mockMatchups = [
        {
          championId1: 266,
          championId2: 103,
          gamesPlayed: 50,
          role: 'TOP',
        },
        {
          championId1: 266,
          championId2: 157,
          gamesPlayed: 30,
          role: 'TOP',
        },
        {
          championId1: 103,
          championId2: 157,
          gamesPlayed: 40,
          role: 'TOP',
        },
      ];

      const result = service.processMatchupsForPatch(mockMatchups);

      expect(result.totalGamesByRole.get('TOP')).toBe(120);
    });

    it('should calculate games by champion and role correctly', () => {
      const mockMatchups = [
        {
          championId1: 266,
          championId2: 103,
          gamesPlayed: 50,
          role: 'TOP',
        },
        {
          championId1: 266,
          championId2: 157,
          gamesPlayed: 30,
          role: 'TOP',
        },
      ];

      const result = service.processMatchupsForPatch(mockMatchups);

      expect(result.gamesByChampionAndRole.get(266)?.get('TOP')).toBe(80);
    });

    it('should handle multiple roles for same champion', () => {
      const mockMatchups = [
        {
          championId1: 266,
          championId2: 103,
          gamesPlayed: 50,
          role: 'TOP',
        },
        {
          championId1: 266,
          championId2: 157,
          gamesPlayed: 10,
          role: 'MIDDLE',
        },
      ];

      const result = service.processMatchupsForPatch(mockMatchups);

      expect(result.primaryRolesByChampion.get(266)).toBe('TOP');
      expect(result.gamesByChampionAndRole.get(266)?.get('TOP')).toBe(50);
      expect(result.gamesByChampionAndRole.get(266)?.get('MIDDLE')).toBe(10);
    });
  });
});
