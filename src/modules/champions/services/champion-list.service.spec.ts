import { ChampionListService } from './champion-list.service';

describe('ChampionListService', () => {
  let service: ChampionListService;
  const mockDataDragon = {
    getAllChampions: jest.fn(),
    getChampionImageUrls: jest.fn(),
  };

  beforeEach(() => {
    service = new ChampionListService(mockDataDragon as any);
  });

  it('should return champion list with images and total', async () => {
    mockDataDragon.getAllChampions.mockReturnValue([
      { name: 'Annie', id: '1', key: '1', title: 'Dark Child', version: '15.1' },
      { name: 'Garen', id: '86', key: '86', title: 'Might', version: '15.1' },
    ]);
    mockDataDragon.getChampionImageUrls.mockResolvedValue({
      square: 'img1.png',
      loading: 'img2.png',
      splash: 'img3.png',
    });

    const result = await service.getAllChampions();

    expect(result.total).toBe(2);
    expect(result.champions).toHaveLength(2);
    expect(result.champions[0]).toMatchObject({
      name: 'Annie',
      id: '1',
      key: 1,
      title: 'Dark Child',
    });
    expect(mockDataDragon.getChampionImageUrls).toHaveBeenCalledTimes(2);
  });

  it('should return empty list when no champions', async () => {
    mockDataDragon.getAllChampions.mockReturnValue([]);

    const result = await service.getAllChampions();

    expect(result.champions).toEqual([]);
    expect(result.total).toBe(0);
  });
});
