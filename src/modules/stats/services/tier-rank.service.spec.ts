import {
  TierRankService,
  TIER_METHOD,
  ChampionMetrics,
} from './tier-rank.service';

const metrics: ChampionMetrics = {
  winRate: 55,
  banRate: 15,
  pickRate: 20,
  kda: 3,
  dpm: 700,
  gpm: 450,
  cspm: 8,
  gamesPlayed: 100,
};
describe('documented champion tier heuristic', () => {
  const prisma = { match: { findMany: jest.fn() }, $queryRaw: jest.fn() };
  const service = new TierRankService(prisma as any);
  beforeEach(() => jest.clearAllMocks());
  it('matches the published formula rather than claiming a confidence probability', () => {
    const result = service.calculateChampionScore(1, '16.2', metrics, null);
    const hand =
      (35 +
        25 +
        3 +
        10 +
        (700 / 1200) * 100 * 0.08 +
        (450 / 600) * 100 * 0.04 +
        (8 / 8.5) * 100 * 0.03) *
      0.94;
    expect(result.score).toBeCloseTo(hand, 10);
    expect(result).toMatchObject({
      tier: 'S',
      hasInsufficientData: false,
      reason: null,
    });
    expect(TIER_METHOD).toMatchObject({
      kind: 'heuristic',
      version: 2,
      minimumPerformanceSamples: 50,
    });
  });
  it('keeps unavailable inputs and insufficient samples null, never zero-score champions', () => {
    for (const [changes, reason] of [
      [{ banRate: null }, 'missing_metric'],
      [{ dpm: NaN }, 'missing_metric'],
      [{ gamesPlayed: 49 }, 'insufficient_sample'],
    ] as const) {
      expect(
        service.calculateChampionScore(
          1,
          '16.2',
          { ...metrics, ...changes },
          null,
        ),
      ).toMatchObject({
        score: null,
        tier: 'Dados Insuficientes',
        hasInsufficientData: true,
        reason,
      });
    }
  });
  it('does not blend missing or insufficient previous data and applies valid previous trend', () => {
    const current = service.calculateChampionScore(1, '16.2', metrics, null);
    expect(
      service.calculateChampionScore(1, '16.2', metrics, {
        ...metrics,
        banRate: null,
      }),
    ).toEqual(current);
    const previous = { ...metrics, winRate: 50, banRate: 10 };
    const prior = service.calculateChampionScore(1, '16.1', previous, null);
    expect(
      service.calculateChampionScore(1, '16.2', metrics, previous).score,
    ).toBeCloseTo(current.score! * 0.7 + prior.score! * 0.3 + 5, 10);
  });
  it('resolves predecessor only from observed numeric patch keys without guessed year boundaries', async () => {
    prisma.match.findMany.mockResolvedValue([
      { gameVersion: '16.20.1' },
      { gameVersion: '16.2.741' },
      { gameVersion: '15.24.2' },
      { gameVersion: '16.1.5' },
    ]);
    expect(await service.getPreviousPatch('16.20')).toBe('16.2');
    expect(await service.getPreviousPatch('16.1', 440)).toBe('15.24');
    expect(await service.getPreviousPatch('15.24')).toBeNull();
    expect(await service.getPreviousPatch('17.1')).toBeNull();
    expect(prisma.match.findMany).toHaveBeenCalledWith({
      where: { queueId: 440, mapId: 11 },
      distinct: ['gameVersion'],
      select: { gameVersion: true },
    });
  });
});
