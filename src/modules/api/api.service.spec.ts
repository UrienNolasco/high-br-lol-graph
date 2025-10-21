import { Test, TestingModule } from '@nestjs/testing';
import { ApiService } from './api.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { NotFoundException } from '@nestjs/common';

// Mock data
const mockChampionStats = [
  {
    id: 1,
    championId: 266,
    patch: '14.4',
    wins: 10,
    gamesPlayed: 20,
    role: 'TOP',
  },
  {
    id: 2,
    championId: 103,
    patch: '14.4',
    wins: 15,
    gamesPlayed: 25,
    role: 'MIDDLE',
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

// Mocks for the services
const mockPrismaService = {
  championStats: {
    findMany: jest.fn().mockResolvedValue(mockChampionStats),
    findFirst: jest.fn(),
  },
  matchupStats: {
    findFirst: jest.fn().mockResolvedValue(mockMatchupStats),
  },
};

const mockDataDragonService = {
  getChampionById: jest.fn((id) => mockChampionData[id]),
  getChampionByName: jest.fn((name) => {
    if (name.toLowerCase() === 'aatrox') return mockChampionData['266'];
    if (name.toLowerCase() === 'ahri') return mockChampionData['103'];
    return undefined;
  }),
};

describe('ApiService', () => {
  let service: ApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: DataDragonService, useValue: mockDataDragonService },
      ],
    }).compile();

    service = module.get<ApiService>(ApiService);
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

      // O sort padrão é por winRate descendente
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(page);
      expect(result.limit).toBe(limit);

      // Ahri deve vir primeiro (60% winrate)
      expect(result.data[0].championName).toBe('Ahri');
      expect(result.data[0].winRate).toBe(60); // 15 wins / 25 games
      expect(result.data[0].gamesPlayed).toBe(25);

      // Aatrox em segundo (50% winrate)
      expect(result.data[1].championName).toBe('Aatrox');
      expect(result.data[1].winRate).toBe(50); // 10 wins / 20 games
      expect(result.data[1].gamesPlayed).toBe(20);

      expect(mockPrismaService.championStats.findMany).toHaveBeenCalledWith({
        where: { patch },
      });
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
      // Simula que o campeão existe no DataDragon mas não há stats para ele no patch
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
      expect(result.championA.winRate).toBe(50); // 5 wins for Aatrox / 10 games

      expect(result.championB.name).toBe('Ahri');
      expect(result.championB.winRate).toBe(50); // 10 games - 5 Aatrox wins = 5 Ahri wins

      expect(result.gamesPlayed).toBe(10);
    });

    it('should calculate matchup win rates correctly when championA is championId2', async () => {
      // Inverte a ordem para testar a lógica de cálculo
      mockPrismaService.matchupStats.findFirst.mockResolvedValueOnce({
        ...mockMatchupStats,
        championId1: 103, // Ahri
        championId2: 266, // Aatrox
        champion1Wins: 7, // Ahri wins
      });

      const result = await service.getMatchupStats(
        'Aatrox', // championA
        'Ahri', // championB
        '14.4',
        'TOP',
      );

      expect(result.championA.name).toBe('Aatrox');
      expect(result.championA.winRate).toBe(30); // 10 total - 7 Ahri wins = 3 Aatrox wins

      expect(result.championB.name).toBe('Ahri');
      expect(result.championB.winRate).toBe(70);
    });

    it('should throw NotFoundException if a champion is not found', async () => {
      await expect(
        service.getMatchupStats('Unknown', 'Ahri', '14.4', 'TOP'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
