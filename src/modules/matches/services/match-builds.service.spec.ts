import { MatchBuildsService } from './match-builds.service';
import { projectFinalInventory } from '../adapters/riot/final-inventory';
import { unavailableItemCatalog } from '../contracts/catalogs';
describe('MatchBuildsService', () => {
  const repo = { findBuilds: jest.fn() };
  const dragon = { getItemCatalogForGameVersion: jest.fn() };
  let service: MatchBuildsService;
  beforeEach(() => {
    jest.resetAllMocks();
    service = new MatchBuildsService(repo as any, dragon as any);
    dragon.getItemCatalogForGameVersion.mockResolvedValue(
      unavailableItemCatalog('16.2.741'),
    );
  });
  it('uses match version once for all players and keeps IDs if catalog cannot load', async () => {
    repo.findBuilds.mockResolvedValue({
      gameVersion: '16.2.741',
      participants: [
        {
          puuid: 'p1',
          championId: 1,
          championName: 'A',
          itemTimeline: [],
          finalInventory: projectFinalInventory({ item0: 123 }),
        },
      ],
    });
    const result = await service.getBuilds('BR1_1');
    expect(dragon.getItemCatalogForGameVersion).toHaveBeenCalledWith(
      '16.2.741',
    );
    expect(dragon.getItemCatalogForGameVersion).toHaveBeenCalledTimes(1);
    expect(result.builds[0].finalBuild[0]).toMatchObject({
      itemId: 123,
      metadataReason: 'catalog_unavailable',
    });
    expect(result.catalog.gameVersion).toBe('16.2.741');
  });
  it('distinguishes an existing match with no participants from a missing match', async () => {
    repo.findBuilds.mockResolvedValue({
      gameVersion: '16.2.741',
      participants: [],
    });
    expect((await service.getBuilds('BR1_1')).builds).toEqual([]);
    repo.findBuilds.mockResolvedValue(null);
    await expect(service.getBuilds('BR1_2')).rejects.toThrow('not found');
  });
});
