import { PoolSessionsRepository } from './pool-sessions.repository';
import { ReadSnapshot } from '../../../core/prisma/read-snapshot';
import { normalizePoolSessionQuery } from '../contracts/pool-sessions';
const query = normalizePoolSessionQuery('p', {
  queueId: 420,
  mapId: 11,
  fromMs: 1000,
  toMs: 86400000,
});
describe('MET31 owner-port orchestration', () => {
  const snapshot = { run: jest.fn((fn) => fn()) };
  const outcomes = { read: jest.fn(), matchIds: jest.fn() };
  const matches = {
    countWithoutAnchors: jest.fn(),
    durations: jest.fn(),
    existingIds: jest.fn(),
  };
  const discovery = { matchIds: jest.fn() };
  const repository = new PoolSessionsRepository(
    snapshot as unknown as ReadSnapshot,
    outcomes,
    matches,
    discovery,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    outcomes.read.mockResolvedValue({
      anchors: [
        {
          id: 'e',
          matchId: 'm',
          gameCreation: 1000n,
          championId: 1,
          role: 'MID',
          patch: '16.2',
          eligible: true,
          validCount: 1,
          value: 0,
          exclusionReason: null,
        },
      ],
      total: 1,
      tooLarge: false,
      datasetVersion: 4,
      processingVersion: 10,
    });
    outcomes.matchIds.mockResolvedValue(['m']);
    matches.countWithoutAnchors.mockResolvedValue(2);
    matches.durations.mockResolvedValue([
      { matchId: 'm', durationSeconds: 1200 },
    ]);
    matches.existingIds.mockResolvedValue(['m']);
    discovery.matchIds.mockResolvedValue(['m', 'missing', 'missing']);
  });
  it('shares one opaque snapshot and delegates dataset, match and discovery ownership', async () => {
    const result = await repository.analyze(query);
    expect(outcomes.read).toHaveBeenCalledWith(query, 10000);
    expect(matches.countWithoutAnchors).toHaveBeenCalledWith(query, ['m']);
    expect(discovery.matchIds).toHaveBeenCalledWith(query);
    expect(result.pool.contexts[0]).toMatchObject({
      role: 'MIDDLE',
      dispersion: { n: 1, mean: 0 },
    });
    expect(result.coverage.unmaterializedMatches).toBe(2);
    expect(result.discoveryGaps.discoveredUnimportedMatches).toBe(1);
  });
  it('preserves exact coverage when withholding over-limit cohorts', async () => {
    outcomes.read.mockResolvedValue({
      anchors: [],
      total: 10001,
      tooLarge: true,
      datasetVersion: 4,
      processingVersion: 10,
    });
    await repository.analyze(query);
    expect(outcomes.matchIds).toHaveBeenCalledWith(query);
    expect(matches.countWithoutAnchors).toHaveBeenCalledWith(query, ['m']);
  });
  it('withholds unknown duration from sessions without inventing time', async () => {
    matches.durations.mockResolvedValue([]);
    const result = await repository.analyze(query);
    expect(result.sessions.invalidTimingMatchIds).toEqual(['m']);
    expect(result.pool.n).toBe(1);
  });
});
