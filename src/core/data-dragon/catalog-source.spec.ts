import { of, throwError } from 'rxjs';
import { DataDragonService } from './data-dragon.service';
import { compatibleItemVersion } from './catalog-version';

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

describe('DataDragon catalog source', () => {
  it('selects the newest revision within the exact major/minor patch', () => {
    expect(
      compatibleItemVersion('16.2.741.3171', [
        '16.20.1',
        '16.2.1',
        '16.2.10',
        '16.2.3',
      ]),
    ).toBe('16.2.10');
    expect(compatibleItemVersion('16.3.777', ['16.20.1', '16.2.1'])).toBeNull();
    expect(compatibleItemVersion('unknown', ['16.2.1'])).toBeNull();
  });

  it('loads item source metadata, coalesces concurrent calls and supports cached reads', async () => {
    const http = { get: jest.fn() };
    const service = new DataDragonService(http as any);
    http.get
      .mockReturnValueOnce(of({ data: ['16.20.1', '16.2.1'] }))
      .mockReturnValueOnce(
        of({
          data: {
            version: '16.2.1',
            data: {
              '1001': { name: 'Synthetic boots', image: { full: '1001.png' } },
            },
          },
        }),
      );
    const [a, b] = await Promise.all([
      service.getItemCatalogSourceForGameVersion('16.2.741'),
      service.getItemCatalogSourceForGameVersion('16.2.741'),
    ]);
    expect(a).toBe(b);
    expect(a.version).toBe('16.2.1');
    expect((a.items['1001'].image as { full: string }).full).toBe('1001.png');
    expect(http.get.mock.calls[1][0]).toBe(
      'https://ddragon.leagueoflegends.com/cdn/16.2.1/data/pt_BR/item.json',
    );
    expect(service.getCachedItemCatalogSource('16.2.741')).toBe(a);
    await service.getItemCatalogSourceForGameVersion('16.2.741');
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('keeps unsupported and mismatching item catalogs unavailable', async () => {
    const http = { get: jest.fn().mockReturnValue(of({ data: ['16.20.1'] })) };
    const service = new DataDragonService(http as any);
    expect(
      (await service.getItemCatalogSourceForGameVersion('16.2.741')).status,
    ).toBe('unsupported_version');
    http.get
      .mockReturnValueOnce(of({ data: ['16.2.1'] }))
      .mockReturnValueOnce(of({ data: { version: '16.20.1', data: {} } }));
    expect(
      (await service.getItemCatalogSourceForGameVersion('16.2.741-malformed'))
        .status,
    ).toBe('invalid_catalog');
  });

  it('loads exact patch skill source metadata and never networks on a cold cached read', async () => {
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
    expect(service.getCachedSkillCatalogSource('16.2.741', 1).status).toBe(
      'catalog_unavailable',
    );
    expect(http.get).not.toHaveBeenCalled();
    const [a, b] = await Promise.all([
      service.getSkillCatalogSourceForGameVersion('16.2.741', 1),
      service.getSkillCatalogSourceForGameVersion('16.2.741', 1),
    ]);
    expect(a).toBe(b);
    expect(a.version).toBe('16.2.1');
    expect(http.get).toHaveBeenCalledTimes(3);
    expect(http.get.mock.calls[2][0]).toBe(
      'https://ddragon.leagueoflegends.com/cdn/16.2.1/data/pt_BR/champion/Synthetic.json',
    );
    expect(service.getCachedSkillCatalogSource('16.2.741', 1)).toBe(a);
  });

  it('returns an explicit unknown champion status without fetching a detail URL', async () => {
    const http = {
      get: jest
        .fn()
        .mockReturnValueOnce(of({ data: ['16.2.1'] }))
        .mockReturnValueOnce(
          of({
            data: {
              version: '16.2.1',
              data: { Synthetic: { id: 'Synthetic', key: '1' } },
            },
          }),
        ),
    };
    const service = new DataDragonService(http as any);
    expect(
      (await service.getSkillCatalogSourceForGameVersion('16.2.1', 2)).status,
    ).toBe('unknown_champion_id');
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('keeps network failure explicit', async () => {
    const http = {
      get: jest.fn().mockReturnValue(throwError(() => new Error('offline'))),
    };
    const service = new DataDragonService(http as any);
    expect(
      (await service.getSkillCatalogSourceForGameVersion('16.3.1', 1)).status,
    ).toBe('catalog_unavailable');
  });
  it('keeps item cache misses network-free and item network failures explicit', async () => {
    const http = {
      get: jest.fn().mockReturnValue(throwError(() => new Error('offline'))),
    };
    const service = new DataDragonService(http as any);
    expect(service.getCachedItemCatalogSource('16.2.741').status).toBe(
      'catalog_unavailable',
    );
    expect(http.get).not.toHaveBeenCalled();
    expect(
      (await service.getItemCatalogSourceForGameVersion('16.2.741')).status,
    ).toBe('catalog_unavailable');
  });

  it('preserves unsupported skill patches without fetching a current-patch substitute', async () => {
    const http = { get: jest.fn().mockReturnValue(of({ data: ['16.20.1'] })) };
    const service = new DataDragonService(http as any);
    expect(
      (await service.getSkillCatalogSourceForGameVersion('16.2.1', 1)).status,
    ).toBe('unsupported_version');
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('skips malformed item entries while retaining items without image metadata', async () => {
    const http = {
      get: jest
        .fn()
        .mockReturnValueOnce(of({ data: ['16.2.1'] }))
        .mockReturnValueOnce(
          of({
            data: {
              version: '16.2.1',
              data: {
                '1001': { name: 'No image' },
                '1002': { image: {} },
                invalid: { name: 'Invalid ID' },
              },
            },
          }),
        ),
    };
    const service = new DataDragonService(http as any);
    const source = await service.getItemCatalogSourceForGameVersion('16.2.741');
    expect(source.status).toBe('ok');
    expect(Object.keys(source.items)).toEqual(['1001']);
    expect(source.items['1001'].image).toBeUndefined();
  });

  it.each([{}, { data: {} }, { data: { Other: { key: '2', spells: [] } } }])(
    'keeps missing champion detail distinct from invalid spell schema: %j',
    async (missing) => {
      const http = {
        get: jest
          .fn()
          .mockReturnValueOnce(of({ data: ['16.2.1'] }))
          .mockReturnValueOnce(
            of({
              data: {
                version: '16.2.1',
                data: { Synthetic: { id: 'Synthetic', key: '1' } },
              },
            }),
          )
          .mockReturnValueOnce(of({ data: { version: '16.2.1', ...missing } })),
      };
      const service = new DataDragonService(http as any);
      expect(
        (await service.getSkillCatalogSourceForGameVersion('16.2.741', 1))
          .status,
      ).toBe('unknown_champion_id');
    },
  );

  it('expires malformed skill catalogs after one minute, and successful catalogs after one hour', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const index = {
      version: '16.2.1',
      data: { Synthetic: { id: 'Synthetic', key: '1' } },
    };
    const invalid = {
      ...detail,
      data: { Synthetic: { ...detail.data.Synthetic, spells: [] } },
    };
    const http = {
      get: jest
        .fn()
        .mockReturnValueOnce(of({ data: ['16.2.1'] }))
        .mockReturnValueOnce(of({ data: index }))
        .mockReturnValueOnce(of({ data: invalid }))
        .mockReturnValueOnce(of({ data: ['16.2.1'] }))
        .mockReturnValueOnce(of({ data: index }))
        .mockReturnValueOnce(of({ data: detail })),
    };
    try {
      const service = new DataDragonService(http as any);
      expect(
        (await service.getSkillCatalogSourceForGameVersion('16.2.741', 1))
          .status,
      ).toBe('invalid_catalog');
      now.mockReturnValue(60999);
      expect(service.getCachedSkillCatalogSource('16.2.741', 1).status).toBe(
        'invalid_catalog',
      );
      now.mockReturnValue(61000);
      expect(service.getCachedSkillCatalogSource('16.2.741', 1).status).toBe(
        'catalog_unavailable',
      );
      expect(
        (await service.getSkillCatalogSourceForGameVersion('16.2.741', 1))
          .status,
      ).toBe('ok');
      now.mockReturnValue(3660999);
      expect(service.getCachedSkillCatalogSource('16.2.741', 1).status).toBe(
        'ok',
      );
      now.mockReturnValue(3661000);
      expect(service.getCachedSkillCatalogSource('16.2.741', 1).status).toBe(
        'catalog_unavailable',
      );
      expect(http.get).toHaveBeenCalledTimes(6);
    } finally {
      now.mockRestore();
    }
  });
});
