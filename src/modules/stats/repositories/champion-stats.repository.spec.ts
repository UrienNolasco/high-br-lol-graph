import { Test, TestingModule } from '@nestjs/testing';
import { ChampionStatsRepository } from './champion-stats.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('ChampionStatsRepository', () => {
  let repo: ChampionStatsRepository;
  let prisma: {
    championStats: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      championStats: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChampionStatsRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    repo = module.get<ChampionStatsRepository>(ChampionStatsRepository);
  });

  describe('findManyByPatch', () => {
    it('should query champion stats by patch', async () => {
      await repo.findManyByPatch('15.1');
      expect(prisma.championStats.findMany).toHaveBeenCalledWith({
        where: { patch: '15.1' },
      });
    });
  });

  describe('findByChampionIdAndPatch', () => {
    it('should query by championId and patch', async () => {
      await repo.findByChampionIdAndPatch(1, '15.1');
      expect(prisma.championStats.findFirst).toHaveBeenCalledWith({
        where: { championId: 1, patch: '15.1' },
      });
    });
  });

  describe('findUnique', () => {
    it('should query with composite key', async () => {
      await repo.findUnique(1, '15.1', 420);
      expect(prisma.championStats.findUnique).toHaveBeenCalledWith({
        where: {
          championId_patch_queueId: {
            championId: 1,
            patch: '15.1',
            queueId: 420,
          },
        },
      });
    });
  });

  describe('findQualifiedStats', () => {
    it('should query stats with minimum games filter', async () => {
      await repo.findQualifiedStats('15.1', 50);
      expect(prisma.championStats.findMany).toHaveBeenCalledWith({
        where: { patch: '15.1', gamesPlayed: { gte: 50 } },
      });
    });
  });
});
