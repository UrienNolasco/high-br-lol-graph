import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsRepository } from './analytics.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

interface MockPrisma {
  user: { findUnique: jest.Mock };
  playerStats: { findUnique: jest.Mock };
  playerChampionStats: { findUnique: jest.Mock };
  matchParticipant: { findMany: jest.Mock };
}

describe('AnalyticsRepository', () => {
  let repo: AnalyticsRepository;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      playerStats: { findUnique: jest.fn() },
      playerChampionStats: { findUnique: jest.fn() },
      matchParticipant: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repo = module.get<AnalyticsRepository>(AnalyticsRepository);
  });

  describe('findUserByPuuid', () => {
    it('should query user by puuid', async () => {
      prisma.user.findUnique.mockResolvedValue({
        puuid: 'p1',
        gameName: 'Test',
      });

      const result = await repo.findUserByPuuid('p1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { puuid: 'p1' },
      });
      expect(result).toEqual({ puuid: 'p1', gameName: 'Test' });
    });
  });

  describe('findPlayerStats', () => {
    it('should query stats with queueId 420', async () => {
      prisma.playerStats.findUnique.mockResolvedValue({ gamesPlayed: 50 });

      const result = await repo.findPlayerStats('p1', '15.1');

      expect(prisma.playerStats.findUnique).toHaveBeenCalledWith({
        where: {
          puuid_patch_queueId: { puuid: 'p1', patch: '15.1', queueId: 420 },
        },
        select: expect.any(Object),
      });
      expect(result).toEqual({ gamesPlayed: 50 });
    });
  });

  describe('findPlayerChampionStats', () => {
    it('should query champion-specific stats', async () => {
      await repo.findPlayerChampionStats('p1', 1, '15.1');

      expect(prisma.playerChampionStats.findUnique).toHaveBeenCalledWith({
        where: {
          puuid_championId_patch_queueId: {
            puuid: 'p1',
            championId: 1,
            patch: '15.1',
            queueId: 420,
          },
        },
        select: expect.any(Object),
      });
    });
  });

  describe('findPlayerLaningMetrics', () => {
    it('should query laning metrics', async () => {
      await repo.findPlayerLaningMetrics('p1', 1, '15.1');

      expect(prisma.playerChampionStats.findUnique).toHaveBeenCalledWith({
        where: {
          puuid_championId_patch_queueId: {
            puuid: 'p1',
            championId: 1,
            patch: '15.1',
            queueId: 420,
          },
        },
        select: { avgCsd15: true, avgGd15: true, avgXpd15: true },
      });
    });
  });

  describe('findMatchesForTimeline', () => {
    it('should query match participants with all filters', async () => {
      prisma.matchParticipant.findMany.mockResolvedValue([]);

      await repo.findMatchesForTimeline('p1', {
        championId: 1,
        role: 'MID',
        patch: '15.1',
      });

      expect(prisma.matchParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Object),
          select: { csGraph: true, goldGraph: true },
          take: 100,
        }),
      );
    });

    it('should query without filters', async () => {
      prisma.matchParticipant.findMany.mockResolvedValue([]);

      await repo.findMatchesForTimeline('p1', {});

      expect(prisma.matchParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });
});
