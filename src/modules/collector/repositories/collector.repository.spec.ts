import { Test, TestingModule } from '@nestjs/testing';
import { CollectorRepository } from './collector.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('CollectorRepository', () => {
  let repo: CollectorRepository;
  let prisma: PrismaService;

  beforeEach(async () => {
    const mockPrisma = {
      match: { findUnique: jest.fn() },
      discoveryObservation: { findMany: jest.fn() },
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

  it('records an empty immutable observation in the caller transaction', async () => {
    const tx = { discoveryObservation: { upsert: jest.fn() } };
    const context = {
      observationId: 'o1',
      source: 'sync' as const,
      observedAt: new Date('2026-09-23T00:00:00Z'),
      region: null,
      queriedPuuid: 'p1',
      queueFilter: 420,
      requestedCount: 100,
      startIndex: 0,
      rank: null,
    };
    await repo.recordObservation([], context, tx as any);
    expect(tx.discoveryObservation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1' },
        update: {},
        create: expect.objectContaining({
          id: 'o1',
          matches: { createMany: { data: [] } },
        }),
      }),
    );
  });

  it('reads lineage through the exact caller transaction', async () => {
    const tx = {
      discoveryObservation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'o1', source: 'collector', observedAt: new Date() },
          { id: 'o2', source: 'search', observedAt: new Date() },
        ]),
      },
    };
    await expect(repo.readLineage('M1', tx as any)).resolves.toEqual({
      observationIds: ['o1', 'o2'],
      sources: ['collector', 'search'],
      status: 'observed',
      reason: null,
    });
    expect(tx.discoveryObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { matches: { some: { matchId: 'M1' } } },
      }),
    );
  });
});
