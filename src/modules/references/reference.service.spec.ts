import { PrismaService } from '../../core/prisma/prisma.service';
import { ReferenceService } from './reference.service';
import { normalizeReferenceQuery } from './reference-contract';
import { referenceQueryFixture } from '../../../test/fixtures/references';
describe('MET20 bounded projection reads', () => {
  it('refuses partial cohort statistics above the candidate bound', async () => {
    const tx = {
      historicalMetricContribution: {
        count: jest.fn().mockResolvedValue(10001),
        findMany: jest.fn(),
      },
      matchParticipant: { findMany: jest.fn() },
      match: { count: jest.fn().mockResolvedValue(3) },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    const result = await new ReferenceService(prisma).getReference(
      normalizeReferenceQuery(referenceQueryFixture),
    );
    expect(result).toMatchObject({
      status: 'insufficient',
      reason: 'cohort_too_large',
      maximumCandidateRows: 10000,
      counts: { candidateRows: 10001, eligibleRows: null },
      coverage: { value: null, unmaterializedMatches: 3 },
      distribution: null,
      median: null,
      provenance: { processedAt: null },
    });
    expect(tx.historicalMetricContribution.findMany).not.toHaveBeenCalled();
    expect(tx.matchParticipant.findMany).not.toHaveBeenCalled();
  });
  it('reports absent dataset coverage without generating a processing timestamp', async () => {
    const tx = {
      historicalMetricContribution: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      matchParticipant: { findMany: jest.fn() },
      match: { count: jest.fn().mockResolvedValue(4) },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    const result = await new ReferenceService(prisma).getReference(
      normalizeReferenceQuery(referenceQueryFixture),
    );
    expect(result).toMatchObject({
      status: 'insufficient',
      counts: { candidateRows: 0, selectedMatches: 0 },
      coverage: { value: null, unmaterializedMatches: 4 },
      provenance: { processedAt: null },
      observations: { items: [], total: 0 },
    });
  });
});
