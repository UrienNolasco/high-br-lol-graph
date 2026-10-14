import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { matchReviewFixture } from '../../../../test/fixtures/match-review.fixture';
import {
  MatchReviewRepository,
  MATCH_REVIEW_READ_LIMITS,
} from './match-review.repository';

describe('MatchReviewRepository', () => {
  function setup() {
    const i = matchReviewFixture();
    const tx = {
      match: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...i, timelineProjection: i.projection }),
      },
      matchEventProjection: { findMany: jest.fn().mockResolvedValue(i.events) },
      matchProcessing: {
        findUnique: jest.fn().mockResolvedValue(i.processing),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
    };
    return {
      i,
      tx,
      prisma,
      repository: new MatchReviewRepository(prisma as unknown as PrismaService),
    };
  }
  it('reads only projected combat in one repeatable generation', async () => {
    const { repository, prisma, tx, i } = setup();
    expect(
      await repository.findReview(i.matchId, i.participants[0].puuid),
    ).toMatchObject({
      processing: i.processing,
      readLimits: { eventsTruncated: false, framesTruncated: false },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(tx.matchEventProjection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          matchId: i.matchId,
          type: { in: ['CHAMPION_KILL', 'GAME_END'] },
        },
        take: MATCH_REVIEW_READ_LIMITS.events + 1,
      }),
    );
    expect(tx.match.findUnique.mock.calls[0][0].select).not.toHaveProperty(
      'raw',
    );
  });
  it('does not read events when participant is not present', async () => {
    const { repository, tx, i } = setup();
    expect(await repository.findReview(i.matchId, 'missing')).toBeNull();
    expect(tx.matchEventProjection.findMany).not.toHaveBeenCalled();
  });
  it('reports truncation rather than claiming complete coverage', async () => {
    const { repository, tx, i } = setup();
    tx.matchEventProjection.findMany.mockResolvedValue(
      Array.from({ length: 2001 }, () => i.events[0]),
    );
    const r = await repository.findReview(i.matchId, i.participants[0].puuid);
    expect(r!.events).toHaveLength(2000);
    expect(r!.readLimits.eventsTruncated).toBe(true);
  });
});
