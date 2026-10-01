import { BuildChoiceRepository } from './build-choice.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma } from '@prisma/client';
describe('MET26 cohort SQL adapter', () => {
  it('counts and reads projections/job generation in one repeatable snapshot and filters before limit', async () => {
    const tx = {
      match: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              matchId: 'm',
              participants: [],
              events: [],
              timelineProjection: null,
            },
          ]),
      },
      matchProcessing: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { matchId: 'm', status: 'COMPLETED', processingVersion: 5 },
          ]),
      },
    };
    const prisma = { $transaction: jest.fn(async (fn) => fn(tx)) };
    const result = await new BuildChoiceRepository(
      prisma as unknown as PrismaService,
    ).findBuildChoiceCohort({
      patch: '16.2',
      championId: 1,
      role: 'MIDDLE',
      queueId: 420,
      checkpointMs: 900000,
      fromMs: 10,
      toMs: 20,
      limit: 1,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(tx.match.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1,
        where: {
          queueId: 420,
          mapId: 11,
          OR: [
            { gameVersion: '16.2' },
            { gameVersion: { startsWith: '16.2.' } },
          ],
          participants: {
            some: { championId: 1, role: { in: ['MID', 'MIDDLE'] } },
          },
          gameCreation: { gte: 10n, lt: 20n },
        },
        orderBy: [{ gameCreation: 'desc' }, { matchId: 'asc' }],
      }),
    );
    const query = tx.match.findMany.mock.calls[0][0];
    expect(query.select.events.where.OR).toContainEqual({
      quality: { path: ['unknownType'], equals: true },
    });
    expect(result).toMatchObject({
      totalMatches: 3,
      truncated: true,
      matches: [{ processing: { processingVersion: 5 } }],
    });
  });
});
