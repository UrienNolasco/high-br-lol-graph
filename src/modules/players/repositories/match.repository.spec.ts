import { Test, TestingModule } from '@nestjs/testing';
import { MatchRepository } from './match.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('MatchRepository', () => {
  let repo: MatchRepository;
  let prisma: {
    match: { findMany: jest.Mock; findUnique: jest.Mock; count: jest.Mock };
    matchParticipant: { findMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      match: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
      matchParticipant: { findMany: jest.fn(), count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repo = module.get<MatchRepository>(MatchRepository);
  });

  describe('findExistingMatchIds', () => {
    it('should return a Set of existing match IDs', async () => {
      prisma.match.findMany.mockResolvedValue([{ matchId: 'M1' }, { matchId: 'M2' }]);

      const result = await repo.findExistingMatchIds(['M1', 'M2', 'M3']);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(2);
      expect(result.has('M1')).toBe(true);
      expect(result.has('M3')).toBe(false);
    });
  });

  describe('countMatchesByIds', () => {
    it('should count matches by IDs', async () => {
      prisma.match.count.mockResolvedValue(5);

      const result = await repo.countMatchesByIds(['M1', 'M2']);

      expect(result).toBe(5);
    });
  });

  describe('findByMatchId', () => {
    it('should find match by ID with gameCreation select', async () => {
      prisma.match.findUnique.mockResolvedValue({ gameCreation: BigInt(999) });

      const result = await repo.findByMatchId('M1');

      expect(result).toEqual({ gameCreation: BigInt(999) });
    });
  });
});
