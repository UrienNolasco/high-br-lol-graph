import { of, throwError } from 'rxjs';
import { DataDragonService } from './data-dragon.service';
import { parseSkillCatalog } from './skill-catalog';
import { itemProgressionMetadata } from './item-catalog';
const detail = {
  version: '16.2.1',
  data: {
    Synthetic: {
      key: '1',
      spells: Array.from({ length: 4 }, (_, i) => ({
        id: `s${i}`,
        name: `Skill${i}`,
        maxrank: i === 3 ? 3 : 5,
      })),
    },
  },
};
describe('MET16 patch catalogs', () => {
  it('preserves item recipe duplicates and optionality without inventing an empty recipe', () => {
    expect(
      itemProgressionMetadata({
        from: ['1001', '1001'],
        into: ['2001'],
        consumed: true,
        consumeOnFull: false,
        tags: ['Consumable'],
      }),
    ).toEqual({
      from: [1001, 1001],
      into: [2001],
      consumed: true,
      consumeOnFull: false,
      tags: ['Consumable'],
    });
    expect(itemProgressionMetadata({ from: ['0'] })).toEqual({
      from: null,
      into: null,
      consumed: null,
      consumeOnFull: null,
      tags: null,
    });
  });
  it('reads champion-specific slots/maxrank only for the exact patch', () => {
    expect(
      parseSkillCatalog('16.2.741', '16.2.1', 1, detail).spells[3],
    ).toMatchObject({ slot: 4, maxRank: 3 });
    expect(parseSkillCatalog('16.20.1', '16.2.1', 1, detail).reason).toBe(
      'invalid_catalog',
    );
    expect(parseSkillCatalog('16.2.1', '16.2.1', 2, detail).reason).toBe(
      'unknown_champion_id',
    );
    const noMax = JSON.parse(JSON.stringify(detail));
    delete noMax.data.Synthetic.spells[0].maxrank;
    expect(
      parseSkillCatalog('16.2.1', '16.2.1', 1, noMax).spells[0].maxRank,
    ).toBeNull();
  });
  it('explicit preload resolves exact patch and shares requests; cached lookup never performs network', async () => {
    const http = {
      get: jest
        .fn()
        .mockReturnValueOnce(of({ data: ['16.20.1', '16.2.1'] }))
        .mockReturnValueOnce(
          of({
            data: {
              version: '16.2.1',
              data: { Synthetic: { id: 'Synthetic', key: '1' } },
            },
          }),
        )
        .mockReturnValueOnce(of({ data: detail })),
    };
    const service = new DataDragonService(http as any);
    expect(service.getCachedSkillCatalog('16.2.741', 1).reason).toBe(
      'catalog_unavailable',
    );
    expect(http.get).not.toHaveBeenCalled();
    const [a, b] = await Promise.all([
      service.getSkillCatalogForGameVersion('16.2.741', 1),
      service.getSkillCatalogForGameVersion('16.2.741', 1),
    ]);
    expect(a).toBe(b);
    expect(a.version).toBe('16.2.1');
    expect(http.get).toHaveBeenCalledTimes(3);
    expect(http.get.mock.calls[2][0]).toContain(
      '/16.2.1/data/pt_BR/champion/Synthetic.json',
    );
    expect(service.getCachedSkillCatalog('16.2.741', 1)).toBe(a);
    expect(http.get).toHaveBeenCalledTimes(3);
  });
  it('unsupported patch and network failure remain unavailable', async () => {
    const http = { get: jest.fn().mockReturnValue(of({ data: ['16.20.1'] })) };
    const service = new DataDragonService(http as any);
    expect(
      (await service.getSkillCatalogForGameVersion('16.2.1', 1)).reason,
    ).toBe('unsupported_version');
    expect(http.get).toHaveBeenCalledTimes(1);
    http.get.mockReturnValue(throwError(() => new Error('offline')));
    expect(
      (await service.getSkillCatalogForGameVersion('16.3.1', 1)).reason,
    ).toBe('catalog_unavailable');
  });
});
