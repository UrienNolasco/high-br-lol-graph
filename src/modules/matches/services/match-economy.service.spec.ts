import { MatchEconomyService } from './match-economy.service';
import { economyFixture } from '../../../../test/fixtures/economy.fixture';

describe('projection-only economy service', () => {
  const prisma = {
    match: { findUnique: jest.fn() },
    matchProcessing: { findUnique: jest.fn() },
    $transaction: jest.fn((queries) => Promise.all(queries)),
    matchRaw: { findUnique: jest.fn() },
  };
  const service = new MatchEconomyService(prisma as any);
  beforeEach(() => {
    jest.clearAllMocks();
    const input = economyFixture();
    prisma.match.findUnique.mockResolvedValue({
      ...input,
      timelineProjection: input.projection,
    });
    prisma.matchProcessing.findUnique.mockResolvedValue(input.processing);
  });
  it('reads only projected fields and completed provenance in one repeatable snapshot', async () => {
    const input = economyFixture();
    const report = await service.getEconomy(
      input.matchId,
      input.participants[0].puuid,
      'pastOnly',
    );
    expect(report).toMatchObject({
      processedAt: '2026-09-23T00:00:00.000Z',
      processingVersion: 2,
      checkpointContract: { mode: 'pastOnly' },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: 'RepeatableRead',
    });
    expect(prisma.matchRaw.findUnique).not.toHaveBeenCalled();
    const selected = prisma.match.findUnique.mock.calls[0][0].select;
    expect(selected).toMatchObject({
      timelineProjection: true,
      participants: { select: { finalStats: true } },
    });
    expect(selected.goldGraph).toBeUndefined();
  });
  it('returns explicit provenance absence when job is incomplete even with frames present', async () => {
    const input = economyFixture();
    prisma.matchProcessing.findUnique.mockResolvedValue({
      ...input.processing,
      status: 'PROCESSING',
    });
    expect(
      await service.getEconomy(input.matchId, input.participants[0].puuid),
    ).toMatchObject({
      processedAt: null,
      reason: 'missing_processing_provenance',
      samples: [],
    });
  });
  it('distinguishes missing match or participant as 404', async () => {
    const input = economyFixture();
    await expect(
      service.getEconomy(input.matchId, 'absent'),
    ).rejects.toMatchObject({ status: 404 });
    prisma.match.findUnique.mockResolvedValue(null);
    await expect(service.getEconomy('absent', 'absent')).rejects.toMatchObject({
      status: 404,
    });
  });
});
