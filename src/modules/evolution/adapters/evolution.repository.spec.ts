import { ReadSnapshot } from '../../../core/prisma/read-snapshot';
import { EvolutionRepository } from './evolution.repository';
import { normalizeEvolutionQuery } from '../evolution-contract';
const q = normalizeEvolutionQuery('player', {
  definitionId: 'final.deathsNearObjectives',
  championId: 114,
  role: 'TOP',
  queueId: 420,
  mapId: 11,
  horizonKey: 'final',
  baselineFromMs: 10,
  baselineToMs: 20,
  recentFromMs: 20,
  recentToMs: 30,
});
it('orchestrates owner ports in one snapshot with [) dates and excludes unmaterialized matches from values', async () => {
  const run = jest.fn(async (fn) => fn()),
    readWindow = jest
      .fn()
      .mockResolvedValue({ rows: [], publishedMatchIds: ['published'] }),
    countUnpublished = jest.fn().mockResolvedValue(2),
    readExample = jest.fn();
  const r = await new EvolutionRepository(
    { run } as unknown as ReadSnapshot,
    { readWindow },
    { countUnpublished, readExample },
  ).getEvolution(q);
  expect(run).toHaveBeenCalledTimes(1);
  expect(readWindow).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      subjectKind: 'participant',
      fromMs: 10,
      toMs: 20,
    }),
    'player',
    1000,
  );
  expect(readWindow).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({ fromMs: 20, toMs: 30 }),
    'player',
    1000,
  );
  expect(countUnpublished).toHaveBeenCalledWith(
    expect.objectContaining({
      playerId: 'player',
      role: 'TOP',
      fromMs: 10,
      toMs: 20,
    }),
    ['published'],
  );
  expect(r.windows.baseline).toMatchObject({
    unmaterializedMatches: 2,
    observed: { mean: null },
  });
  expect(readExample).not.toHaveBeenCalled();
});
it('rejects oversized owner-port results instead of a truncated delta', async () => {
  const snapshot = {
    run: async (fn: () => Promise<unknown>) => fn(),
  } as ReadSnapshot;
  await expect(
    new EvolutionRepository(
      snapshot,
      {
        readWindow: async () => ({
          rows: Array(1001).fill({}),
          publishedMatchIds: [],
        }),
      },
      { countUnpublished: async () => 0, readExample: jest.fn() },
    ).getEvolution(q),
  ).rejects.toThrow('narrow dates');
});
