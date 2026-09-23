import { ChampionDetailService } from './champion-detail.service';

describe('champion detail shares list calculations', () => {
  const stats = { getChampionStats: jest.fn() };
  const dragon = { getChampionByName: jest.fn() };
  const service = new ChampionDetailService(stats as any, dragon as any);
  beforeEach(() => jest.clearAllMocks());
  it('uses numeric IDs without catalog and preserves list rank/availability', async () => {
    const champion = {
      championId: 9999,
      championName: null,
      rank: null,
      banRate: 50,
      pickRate: 0,
    };
    stats.getChampionStats.mockResolvedValue({ data: [champion] });
    expect(await service.getChampion('9999', '16.2', 440)).toBe(champion);
    expect(stats.getChampionStats).toHaveBeenCalledWith(
      '16.2',
      1,
      Number.MAX_SAFE_INTEGER,
      'championId',
      'asc',
      440,
    );
    expect(dragon.getChampionByName).not.toHaveBeenCalled();
  });
  it('resolves names then returns the same representation as list, or explicit 404', async () => {
    dragon.getChampionByName.mockReturnValue({ key: '1' });
    stats.getChampionStats.mockResolvedValue({
      data: [{ championId: 1, rank: 3 }],
    });
    expect(await service.getChampion('Annie', '16.2')).toEqual({
      championId: 1,
      rank: 3,
    });
    stats.getChampionStats.mockResolvedValue({ data: [] });
    await expect(service.getChampion('Annie', '16.2')).rejects.toThrow(
      'Stats for champion',
    );
    dragon.getChampionByName.mockReturnValue(undefined);
    await expect(service.getChampion('unknown', '16.2')).rejects.toThrow(
      'Champion unknown not found',
    );
  });
});
