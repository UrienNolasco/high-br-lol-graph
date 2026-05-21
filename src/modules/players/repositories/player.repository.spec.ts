import { Test, TestingModule } from '@nestjs/testing';
import { PlayerRepository } from './player.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('PlayerRepository', () => {
  let repo: PlayerRepository;
  let prisma: { user: { findUnique: jest.Mock; upsert: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), upsert: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repo = module.get<PlayerRepository>(PlayerRepository);
  });

  describe('findByPuuid', () => {
    it('should call prisma.user.findUnique', async () => {
      prisma.user.findUnique.mockResolvedValue({ puuid: 'p1' });

      const result = await repo.findByPuuid('p1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { puuid: 'p1' },
      });
      expect(result).toEqual({ puuid: 'p1' });
    });
  });

  describe('upsert', () => {
    it('should call prisma.user.upsert with correct data', async () => {
      const data = {
        gameName: 'Test',
        tagLine: 'BR1',
        region: 'br1',
        profileIconId: 1,
        summonerLevel: 30,
        summonerId: null,
        tier: null,
        rank: null,
        leaguePoints: null,
        rankedWins: null,
        rankedLosses: null,
      };
      prisma.user.upsert.mockResolvedValue({});

      await repo.upsert('p1', data);

      expect(prisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { puuid: 'p1' },
          update: expect.objectContaining({ gameName: 'Test' }),
          create: expect.objectContaining({ puuid: 'p1', gameName: 'Test' }),
        }),
      );
    });
  });
});
