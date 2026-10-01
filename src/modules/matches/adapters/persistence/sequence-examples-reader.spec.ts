import { SequenceExamplesAdapter } from './sequence-examples-reader';
import { ReadSnapshot } from '../../../../core/prisma/read-snapshot';
it('counts matches absent from publication IDs without reading another owner delegate; normalizes role alias', async () => {
  const count = jest.fn().mockResolvedValue(2);
  const reader = new SequenceExamplesAdapter({
    client: () => ({ match: { count } }),
  } as unknown as ReadSnapshot);
  expect(
    await reader.countUnpublished(
      {
        playerId: 'p',
        championId: 1,
        role: 'MIDDLE',
        queueId: 420,
        mapId: 11,
        fromMs: 10,
        toMs: 20,
      },
      ['published'],
    ),
  ).toBe(2);
  expect(count).toHaveBeenCalledWith({
    where: {
      matchId: { notIn: ['published'] },
      queueId: 420,
      mapId: 11,
      gameCreation: { gte: 10n, lt: 20n },
      participants: {
        some: { puuid: 'p', championId: 1, role: { in: ['MID', 'MIDDLE'] } },
      },
    },
  });
});
it('publishes event truncation instead of calculating partial sequence frequency', async () => {
  const reader = new SequenceExamplesAdapter({
    client: () => ({
      match: { findUnique: async () => ({}) },
      matchEventProjection: { findMany: async () => [{}, {}] },
    }),
  } as unknown as ReadSnapshot);
  expect(
    await reader.readExample({
      matchId: 'm',
      subjectId: 'p',
      processingVersion: 4,
      processedAt: new Date(0).toISOString(),
      eventLimit: 1,
      episodeLimit: 20,
    }),
  ).toMatchObject({
    reason: 'example_event_limit',
    episodes: [],
    truncated: true,
  });
});
