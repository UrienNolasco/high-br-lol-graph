import {
  DataDragonCatalogAdapter,
  itemProgressionMetadata,
  mapItemCatalog,
  parseSkillCatalog,
} from './catalog.adapter';

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

describe('Data Dragon catalog adapter', () => {
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

  it('reads champion-specific skill slots/maxrank only for the exact patch', () => {
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

  it('maps raw item fields into the domain catalog at the boundary', () => {
    const source = {
      gameVersion: '16.2.741',
      version: '16.2.1',
      locale: 'pt_BR' as const,
      policy: 'latest_revision_of_exact_patch' as const,
      status: 'ok' as const,
      items: {
        '1001': {
          name: 'Synthetic boots',
          image: { full: '1001.png' },
          from: ['1000'],
          into: ['2001'],
          tags: ['Boots'],
          consumed: false,
          consumeOnFull: false,
        },
      },
    };
    expect(mapItemCatalog(source).items['1001']).toEqual({
      name: 'Synthetic boots',
      imageUrl:
        'https://ddragon.leagueoflegends.com/cdn/16.2.1/img/item/1001.png',
      from: [1000],
      into: [2001],
      tags: ['Boots'],
      consumed: false,
      consumeOnFull: false,
    });
  });

  it('memoizes the mapped result while the source object remains cached', () => {
    const source = {
      gameVersion: '16.2.741',
      version: '16.2.1',
      locale: 'pt_BR' as const,
      policy: 'latest_revision_of_exact_patch' as const,
      status: 'ok' as const,
      items: {},
    };
    const dataDragon = {
      getCachedItemCatalogSource: jest.fn(() => source),
    };
    const adapter = new DataDragonCatalogAdapter(dataDragon as any);
    const first = adapter.getCachedItemCatalog('16.2.741');
    const second = adapter.getCachedItemCatalog('16.2.741');
    expect(second).toBe(first);
    expect(dataDragon.getCachedItemCatalogSource).toHaveBeenCalledTimes(2);
  });
});
