import { ProgressionRepository } from './progression.repository';
describe('MET16 progression projection query', () => {
  it('reads only selected participant projections in repeatable read, preserving unattributed events', async () => {
    const tx = {
      match: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ participants: [{ puuid: 'a' }] }),
      },
      matchEventProjection: { findMany: jest.fn().mockResolvedValue([]) },
      matchProcessing: { findUnique: jest.fn().mockResolvedValue(null) },
      matchTimelineProjection: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const result = await new ProgressionRepository(
      prisma as any,
    ).findProgression('m', 'a');
    expect(result?.participant.puuid).toBe('a');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(tx.matchEventProjection.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        matchId: 'm',
        AND: [
          { OR: [{ actorPuuid: 'a' }, { actorPuuid: null }] },
          expect.anything(),
        ],
      },
      orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
    });
  });
  it('missing participant has no projected query or fabricated response', async () => {
    const tx = {
      match: { findUnique: jest.fn().mockResolvedValue({ participants: [] }) },
    };
    expect(
      await new ProgressionRepository({
        $transaction: (callback: (client: typeof tx) => unknown) =>
          callback(tx),
      } as any).findProgression('m', 'x'),
    ).toBeNull();
  });
});
