import { Test, TestingModule } from '@nestjs/testing';
import { CollectorRepository } from './collector.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('CollectorRepository', () => {
  let repo: CollectorRepository;
  let prisma: PrismaService;

  beforeEach(async () => {
    const mockPrisma = {
      match: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectorRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repo = module.get<CollectorRepository>(CollectorRepository);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('matchExists', () => {
    it('should return true when match exists', async () => {
      (prisma.match.findUnique as jest.Mock).mockResolvedValue({
        matchId: 'BR1_1',
      });

      const result = await repo.matchExists('BR1_1');

      expect(result).toBe(true);
      expect(prisma.match.findUnique).toHaveBeenCalledWith({
        where: { matchId: 'BR1_1' },
        select: { matchId: true },
      });
    });

    it('should return false when match does not exist', async () => {
      (prisma.match.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await repo.matchExists('BR1_1');

      expect(result).toBe(false);
    });
  });
});
