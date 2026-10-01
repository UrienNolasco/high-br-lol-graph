import { mapChoiceCatalog } from './choice-catalog.adapter';
import type { DataDragonChoiceSource } from '../../../../core/data-dragon/catalog-source';
function source(): DataDragonChoiceSource {
  return {
    gameVersion: '16.2.741',
    version: '16.2.1',
    status: 'ok',
    summoners: {
      version: '16.2.1',
      data: { Flash: { key: '4', name: 'Flash' } },
    },
    runes: [
      {
        id: 8000,
        name: 'Tree',
        slots: [0, 1, 2, 3].map((i) => ({
          runes: [{ id: 8001 + i, name: `Rune ${i}` }],
        })),
      },
    ],
  };
}
describe('MET26 choice catalog adapter', () => {
  it('maps numeric summoner/rune IDs and their tree slots under a compatible exact version', () =>
    expect(mapChoiceCatalog(source())).toMatchObject({
      version: '16.2.1',
      reason: null,
      summoners: { '4': { id: 4, name: 'Flash' } },
      styles: { '8000': { slots: [[8001], [8002], [8003], [8004]] } },
    }));
  it.each([
    'version',
    'mismatch',
    'missing-runes',
    'duplicate-rune',
    'invalid-spell',
    'missing-slot',
  ])('keeps %s explicit and unavailable', (kind) => {
    const s = source();
    if (kind === 'version') s.version = '16.20.1';
    if (kind === 'mismatch') (s.summoners as any).version = '16.3.1';
    if (kind === 'missing-runes') s.runes = null;
    if (kind === 'duplicate-rune')
      (s.runes as any)[0].slots[1].runes[0].id = 8001;
    if (kind === 'invalid-spell') (s.summoners as any).data.Flash.key = '4x';
    if (kind === 'missing-slot') (s.runes as any)[0].slots.pop();
    expect(mapChoiceCatalog(s)).toMatchObject({
      reason: 'invalid_catalog',
      version: null,
      runes: {},
      summoners: {},
    });
  });
  it('preserves unsupported source reason', () =>
    expect(
      mapChoiceCatalog({ ...source(), status: 'unsupported_version' }).reason,
    ).toBe('unsupported_version'));
});
