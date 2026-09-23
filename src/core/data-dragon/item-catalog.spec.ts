import { of, throwError } from 'rxjs';
import { DataDragonService } from './data-dragon.service';
import { compatibleItemVersion } from './item-catalog';
describe('item catalog by match version', () => {
  const http = { get: jest.fn() };
  let service: DataDragonService;
  beforeEach(() => {
    jest.resetAllMocks();
    service = new DataDragonService(http as any);
  });
  it('resolves the latest revision inside the exact internal patch only', () => {
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
  it('loads versioned pt_BR metadata, caches concurrent calls and exposes offline lookup', async () => {
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
      service.getItemCatalogForGameVersion('16.2.741'),
      service.getItemCatalogForGameVersion('16.2.741'),
    ]);
    expect(a).toBe(b);
    expect(a.version).toBe('16.2.1');
    expect(a.items['1001'].imageUrl).toContain('/16.2.1/');
    expect(http.get.mock.calls[1][0]).toBe(
      'https://ddragon.leagueoflegends.com/cdn/16.2.1/data/pt_BR/item.json',
    );
    expect(service.getCachedItemCatalog('16.2.741')).toBe(a);
    await service.getItemCatalogForGameVersion('16.2.741');
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it('does not substitute current patch when historical catalog is missing', async () => {
    http.get.mockReturnValue(of({ data: ['16.20.1'] }));
    expect(
      (await service.getItemCatalogForGameVersion('16.2.741')).reason,
    ).toBe('unsupported_version');
    expect(http.get).toHaveBeenCalledTimes(1);
  });
  it('rejects mismatching catalog version instead of labeling it historical', async () => {
    http.get
      .mockReturnValueOnce(of({ data: ['16.2.1'] }))
      .mockReturnValueOnce(of({ data: { version: '16.20.1', data: {} } }));
    expect(
      (await service.getItemCatalogForGameVersion('16.2.741')).reason,
    ).toBe('invalid_catalog');
  });
  it('keeps network failure explicit and never performs network in the cached reader', async () => {
    expect(service.getCachedItemCatalog('16.2.741').reason).toBe(
      'catalog_unavailable',
    );
    expect(http.get).not.toHaveBeenCalled();
    http.get.mockReturnValue(throwError(() => new Error('offline')));
    expect(
      (await service.getItemCatalogForGameVersion('16.2.741')).reason,
    ).toBe('catalog_unavailable');
  });
});
