import { ChampionStatsService } from './champion-stats.service';
import { TierRankService } from './tier-rank.service';
import { ChampionPopulationRow } from '../repositories/champion-stats.repository';

export const populationRow = (
  overrides: Partial<ChampionPopulationRow> = {},
): ChampionPopulationRow => ({
  championId: 1,
  championName: 'Annie',
  patch: '16.2',
  queueId: 420,
  winRate: 55,
  gamesPlayed: 100,
  performanceN: 100,
  wins: 55,
  losses: 45,
  kda: 3,
  dpm: 700,
  gpm: 450,
  cspm: 8,
  banRate: 15,
  pickRate: 20,
  pickedMatches: 100,
  bannedMatches: 75,
  eligibleN: 500,
  selectedN: 500,
  excludedN: 0,
  excludedReasons: {},
  bansObservedN: 500,
  ...overrides,
});

describe('champion population responses', () => {
  const repo = { findPopulation: jest.fn(), findManyByPatch: jest.fn() };
  const dragon = {
    getChampionById: jest.fn(),
    getChampionImageUrls: jest.fn(),
  };
  const tier = new TierRankService({
    match: {
      findMany: jest.fn().mockResolvedValue([{ gameVersion: '16.2.1' }]),
    },
  } as any);
  const service = new ChampionStatsService(repo as any, dragon as any, tier);
  beforeEach(() => {
    jest.clearAllMocks();
    dragon.getChampionById.mockReturnValue(undefined);
    repo.findPopulation.mockResolvedValue({
      champions: [populationRow()],
      cohort: { eligibleN: 500 },
    });
  });
  it('retains observed IDs and metrics when champion catalog is absent', async () => {
    const result = await service.getChampionStats('16.2');
    expect(result.data[0]).toMatchObject({
      championId: 1,
      championName: 'Annie',
      images: null,
      rank: 1,
      score: expect.any(Number),
      availability: { catalog: 'missing_catalog' },
      tierMethod: { kind: 'heuristic', previousPatch: null },
    });
    expect(dragon.getChampionImageUrls).not.toHaveBeenCalled();
  });
  it('publishes a banned-only champion without fake performance or display metadata', async () => {
    repo.findPopulation.mockResolvedValue({
      champions: [
        populationRow({
          championId: 9999,
          championName: null,
          gamesPlayed: 0,
          pickedMatches: 0,
          performanceN: 0,
          wins: null,
          losses: null,
          winRate: null,
          kda: null,
          dpm: null,
          gpm: null,
          cspm: null,
          pickRate: 0,
        }),
      ],
      cohort: { eligibleN: 500 },
    });
    expect((await service.getChampionStats('16.2')).data[0]).toMatchObject({
      championId: 9999,
      championName: null,
      pickRate: 0,
      banRate: 15,
      winRate: null,
      kda: null,
      score: null,
      rank: null,
      availability: {
        performance: 'no_picks',
        catalog: 'missing_catalog',
        tier: 'missing_metric',
      },
    });
  });
  it('does not substitute a newer catalog for the requested patch', async () => {
    dragon.getChampionById.mockReturnValue({
      version: '16.20.1',
      id: 'Annie',
      name: 'NewName',
    });
    expect((await service.getChampionStats('16.2')).data[0]).toMatchObject({
      championName: 'Annie',
      images: null,
      availability: { catalog: 'missing_catalog' },
    });
    dragon.getChampionById.mockReturnValue({
      version: '16.2.1',
      id: 'Annie',
      name: 'Annie',
    });
    dragon.getChampionImageUrls.mockResolvedValue({
      square: 's',
      loading: 'l',
      splash: 'p',
    });
    await service.getChampionStats('16.2');
    expect(dragon.getChampionImageUrls).toHaveBeenCalledWith('Annie', '16.2.1');
  });
  it('disables tier for incomplete bans and publishes correct cohort metadata even empty', async () => {
    repo.findPopulation.mockResolvedValue({
      champions: [populationRow({ banRate: null, bansObservedN: 499 })],
      cohort: { eligibleN: 500 },
    });
    expect(
      (await service.getChampionStats('16.2', 1, 20, 'banRate', 'desc', 440))
        .data[0],
    ).toMatchObject({
      score: null,
      rank: null,
      banRate: null,
      availability: { banRate: 'missing_bans' },
    });
    expect(repo.findPopulation).toHaveBeenCalledWith('16.2', 440);
    repo.findPopulation.mockResolvedValue({
      champions: [],
      cohort: { eligibleN: 0, selectedN: 3, excludedN: 3 },
    });
    expect(await service.getChampionStats('16.2')).toMatchObject({
      data: [],
      total: 0,
      cohort: { eligibleN: 0, selectedN: 3, excludedN: 3 },
    });
  });
});
