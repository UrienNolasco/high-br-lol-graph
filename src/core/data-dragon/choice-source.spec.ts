import { of, throwError } from 'rxjs';
import { DataDragonService } from './data-dragon.service';
describe('MET26 exact version raw choice source', () => {
  it('resolves exact patch revision, fetches versioned paths and deduplicates/cache concurrent requests', async () => {
    const http = {
      get: jest
        .fn()
        .mockReturnValueOnce(of({ data: ['16.20.1', '16.2.1'] }))
        .mockReturnValueOnce(of({ data: [] }))
        .mockReturnValueOnce(of({ data: { version: '16.2.1', data: {} } })),
    };
    const service = new DataDragonService(http as any);
    const [a, b] = await Promise.all([
      service.getChoiceCatalogSource('16.2.741'),
      service.getChoiceCatalogSource('16.2.741'),
    ]);
    expect(a).toBe(b);
    expect(a).toMatchObject({ version: '16.2.1', status: 'ok' });
    expect(http.get.mock.calls.map((c) => c[0])).toEqual([
      'https://ddragon.leagueoflegends.com/api/versions.json',
      'https://ddragon.leagueoflegends.com/cdn/16.2.1/data/pt_BR/runesReforged.json',
      'https://ddragon.leagueoflegends.com/cdn/16.2.1/data/pt_BR/summoner.json',
    ]);
    await service.getChoiceCatalogSource('16.2.741');
    expect(http.get).toHaveBeenCalledTimes(3);
  });
  it('does not fall back to current patch and keeps invalid/network source unavailable', async () => {
    for (const [raw, status] of [
      [['16.20.1'], 'unsupported_version'],
      [{}, 'invalid_catalog'],
    ] as const) {
      const http = { get: jest.fn().mockReturnValue(of({ data: raw })) };
      expect(
        (
          await new DataDragonService(http as any).getChoiceCatalogSource(
            '16.2.741',
          )
        ).status,
      ).toBe(status);
      expect(http.get).toHaveBeenCalledTimes(1);
    }
    const http = {
      get: jest.fn().mockReturnValue(throwError(() => new Error('offline'))),
    };
    expect(
      (
        await new DataDragonService(http as any).getChoiceCatalogSource(
          '16.2.741',
        )
      ).status,
    ).toBe('catalog_unavailable');
  });
});
