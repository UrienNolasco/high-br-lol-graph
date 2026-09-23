import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapParticipantBuild } from './builds.mapper';
import { projectFinalInventory } from '../../../core/riot/final-inventory';
import { unavailableItemCatalog } from '../../../core/data-dragon/item-catalog';
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
);
const participant = (fields: object = {}) => ({
  puuid: 'synthetic',
  championId: 1,
  championName: 'Example',
  itemTimeline: [],
  ...fields,
});
describe('authoritative final inventory', () => {
  it('reconciles all seven slots and role-bound item for every real participant', () => {
    for (const p of fixture.info.participants) {
      const build = mapParticipantBuild(
        participant({ finalInventory: projectFinalInventory(p) }),
      );
      expect(build.finalBuild.map((i) => i.itemId)).toEqual(
        Array.from({ length: 7 }, (_, slot) => p[`item${slot}`]),
      );
      expect(build.roleBoundItem.itemId).toBe(p.roleBoundItem);
      expect(build.inventoryCoverage).toEqual({ validSlots: 7, totalSlots: 7 });
    }
  });
  it('preserves duplicates, empty slots, trinket and quest item independently from sale and undo', () => {
    const finalInventory = projectFinalInventory({
      item0: 1001,
      item1: 1001,
      item2: 0,
      item3: 0,
      item4: 0,
      item5: 999999,
      item6: 3363,
      roleBoundItem: 1220,
    });
    const itemTimeline = [
      { itemId: 3000, timestamp: 1, type: 'BUY' },
      { itemId: 3000, timestamp: 2, type: 'SELL' },
      { itemId: 1001, timestamp: 3, type: 'BUY' },
      { itemId: 1001, timestamp: 4, type: 'UNDO' },
    ];
    const build = mapParticipantBuild(
      participant({ finalInventory, itemTimeline }),
      {
        ...unavailableItemCatalog('16.2.741'),
        version: '16.2.1',
        reason: null,
        items: { '1001': { name: 'Synthetic boots', imageUrl: null } },
      },
    );
    expect(build.finalBuild.map((i) => i.itemId)).toEqual([
      1001, 1001, 0, 0, 0, 999999, 3363,
    ]);
    expect(build.finalBuild[2]).toMatchObject({
      empty: true,
      origin: 'observed',
      reason: null,
      metadata: null,
      metadataReason: 'empty_slot',
    });
    expect(build.finalBuild[5]).toMatchObject({
      slot: 5,
      itemId: 999999,
      metadata: null,
      metadataReason: 'unknown_item_id',
    });
    expect(build.finalBuild[6].kind).toBe('trinket');
    expect(build.roleBoundItem).toMatchObject({
      slot: 'roleBoundItem',
      itemId: 1220,
    });
    expect(build.itemTimeline).toHaveLength(4);
  });
  it('keeps missing and invalid summary fields unavailable, without inventing empty slots', () => {
    const build = mapParticipantBuild(
      participant({
        finalInventory: projectFinalInventory({
          item0: 0,
          item1: -1,
          item2: NaN,
          item3: 1.5,
        }),
      }),
    );
    expect(build.finalBuild[0].itemId).toBe(0);
    expect(build.finalBuild[1]).toMatchObject({
      itemId: null,
      empty: null,
      reason: 'invalid_value',
    });
    expect(build.finalBuild[4]).toMatchObject({
      itemId: null,
      reason: 'missing_field',
    });
    expect(build.roleBoundItem.reason).toBe('missing_field');
    expect(build.inventoryCoverage.validSlots).toBe(1);
  });
  it('does not infer legacy inventory from purchases and reports malformed projections', () => {
    const build = mapParticipantBuild(
      participant({
        itemTimeline: [{ itemId: 1001, type: 'BUY', timestamp: 60000 }],
      }),
    );
    expect(build.finalBuild.every((s) => s.itemId === null)).toBe(true);
    expect(build.inventoryReason).toBe('missing_projection');
    expect(
      mapParticipantBuild(
        participant({ finalInventory: { version: 1, slots: [null] } }),
      ).inventoryReason,
    ).toBe('invalid_projection');
  });
});
