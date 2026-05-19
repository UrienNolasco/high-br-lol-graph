import { Test, TestingModule } from '@nestjs/testing';
import { PlayerStatsRepository } from './player-stats.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('PlayerStatsRepository', () => {
  let repo: PlayerStatsRepository;
  let prisma: {
    playerStats: { findUnique: jest.Mock };
    playerChampionStats: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      playerStats: { findUnique: jest.fn() },
      playerChampionStats: { findMany: jest.fn() },
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerStatsRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repo = module.get<PlayerStatsRepository>(PlayerStatsRepository);
  });

  describe('getAggregatedStats', () => {
    it('should query with composite key', async () => {
      await repo.getAggregatedStats('p1', '15.1', 420);

      expect(prisma.playerStats.findUnique).toHaveBeenCalledWith({
        where: { puuid_patch_queueId: { puuid: 'p1', patch: '15.1', queueId: 420 } },
      });
    });
  });

  describe('getChampionStats', () => {
    it('should query champion stats for player', async () => {
      await repo.getChampionStats('p1', '15.1', 420);

      expect(prisma.playerChampionStats.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { puuid: 'p1', patch: '15.1', queueId: 420 },
      }));
    });
  });

  describe('getRoleDistribution', () => {
    it('should execute raw SQL with patch filter', async () => {
      const mockResult = [{ role: 'MID', gamesplayed: BigInt(10), wins: BigInt(6), losses: BigInt(4), winrate: 60, avgkda: 3 }];
      prisma.$queryRaw.mockResolvedValue(mockResult);

      const result = await repo.getRoleDistribution('p1', '15.1');

      expect(result).toEqual(mockResult);
    });
  });

  describe('getActivityData', () => {
    it('should execute raw SQL for activity heatmap', async () => {
      const mockResult = [{ dayofweek: 1, hour: 14, games: BigInt(5), wins: BigInt(3), losses: BigInt(2), winrate: 60 }];
      prisma.$queryRaw.mockResolvedValue(mockResult);

      const result = await repo.getActivityData('p1', 'ALL');

      expect(result).toEqual(mockResult);
    });
  });
});
