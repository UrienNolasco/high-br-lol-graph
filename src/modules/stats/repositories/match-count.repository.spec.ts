import { Test, TestingModule } from '@nestjs/testing';
import { MatchCountRepository } from './match-count.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('MatchCountRepository', () => {
  let repo: MatchCountRepository;
  let prisma: { match: { count: jest.Mock } };

  beforeEach(async () => {
    prisma = { match: { count: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchCountRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    repo = module.get<MatchCountRepository>(MatchCountRepository);
  });

  describe('countByPatch', () => {
    it('should count matches starting with patch', async () => {
      prisma.match.count.mockResolvedValue(500);
      const result = await repo.countByPatch('15.1');
      expect(result).toBe(500);
      expect(prisma.match.count).toHaveBeenCalledWith({
        where: { gameVersion: { startsWith: '15.1' } },
      });
    });
  });

  describe('countTotal', () => {
    it('should count all matches', async () => {
      prisma.match.count.mockResolvedValue(1000);
      const result = await repo.countTotal();
      expect(result).toBe(1000);
      expect(prisma.match.count).toHaveBeenCalledWith();
    });
  });
});
