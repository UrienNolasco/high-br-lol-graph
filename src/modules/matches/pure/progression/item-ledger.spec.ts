import { buildItemLedger } from './item-ledger';
import { event, itemCatalog } from './progression.fixture';
import { unavailableItemCatalog } from '../../contracts/catalogs';
describe('MET16 observed item ledger', () => {
  it('does not keep consumed items even when destruction precedes purchase at the same timestamp', () => {
    const result = buildItemLedger(
      [
        event('ITEM_DESTROYED', { itemId: 3001 }, 0),
        event('ITEM_PURCHASED', { itemId: 3001 }, 1),
      ],
      itemCatalog,
    );
    expect(result.observedInventory).toEqual([{ itemId: 3001, quantity: 0 }]);
    expect(result.acquisitions[0].effective).toBe(true);
    expect(result.transitions).toHaveLength(1);
  });
  it('removes components, reverses compatible purchase atomically, and preserves original acquisition', () => {
    const rows = [
      event('ITEM_PURCHASED', { itemId: 1001 }, 0, 100),
      event('ITEM_PURCHASED', { itemId: 1001 }, 1, 200),
      event('ITEM_DESTROYED', { itemId: 1001 }, 2, 300),
      event('ITEM_DESTROYED', { itemId: 1001 }, 3, 300),
      event('ITEM_PURCHASED', { itemId: 2001 }, 4, 300),
      event('ITEM_UNDO', { beforeId: 2001, afterId: 0, goldGain: 500 }, 5, 400),
    ];
    const before = JSON.stringify(rows),
      r = buildItemLedger(rows, itemCatalog);
    expect(r.transitions[2].inventoryAfter).toEqual([
      { itemId: 1001, quantity: 0 },
      { itemId: 2001, quantity: 1 },
    ]);
    expect(r.observedInventory).toEqual([{ itemId: 1001, quantity: 2 }]);
    expect(r.acquisitions[2]).toMatchObject({
      effective: false,
      undoneBy: 'm:0:5',
    });
    expect(r.transitions[3]).toMatchObject({
      interpretation: 'undo_purchase',
      reversedEventIds: ['m:0:2', 'm:0:3', 'm:0:4'],
    });
    expect(JSON.stringify(rows)).toBe(before);
  });
  it('restores a sale without adding a new acquisition, then allows another undo', () => {
    const r = buildItemLedger(
      [
        event(),
        event('ITEM_SOLD', { itemId: 1001 }, 1, 2000),
        event(
          'ITEM_UNDO',
          { beforeId: 0, afterId: 1001, goldGain: -100 },
          2,
          3000,
        ),
        event(
          'ITEM_UNDO',
          { beforeId: 1001, afterId: 0, goldGain: 300 },
          3,
          4000,
        ),
      ],
      itemCatalog,
    );
    expect(r.acquisitions).toHaveLength(1);
    expect(r.acquisitions[0].effective).toBe(false);
    expect(r.observedInventory).toEqual([]);
    expect(r.issues).toEqual([]);
  });
  it('keeps sold and destroyed inventory absent, preserving effective acquisition timing', () => {
    const r = buildItemLedger(
      [event(), event('ITEM_SOLD', { itemId: 1001 }, 1, 2000)],
      itemCatalog,
    );
    expect(r.observedInventory).toEqual([{ itemId: 1001, quantity: 0 }]);
    expect(r.acquisitions[0].effective).toBe(true);
  });
  it('does not invent component restoration without compatible recipe metadata', () => {
    const rows = [
      event(),
      event('ITEM_DESTROYED', { itemId: 1001 }, 1, 2000),
      event('ITEM_PURCHASED', { itemId: 2001 }, 2, 2000),
      event(
        'ITEM_UNDO',
        { beforeId: 2001, afterId: 0, goldGain: 500 },
        3,
        3000,
      ),
    ];
    const r = buildItemLedger(rows, unavailableItemCatalog('16.2.741'));
    expect(r.issues[0].reason).toBe('unvalidated_component_restoration');
    expect(r.stateComplete).toBe(false);
    expect(r.observedInventory.every((p) => p.quantity === null)).toBe(true);
    expect(r.acquisitions[1].effective).toBe(false);
  });
  it.each([
    { beforeId: 1001, afterId: 2001, goldGain: 0 },
    { beforeId: 1001, afterId: 0 },
    { beforeId: 0, afterId: 0, goldGain: 0 },
    { beforeId: 1001, afterId: 0, goldGain: -10 },
  ])(
    'signals unsupported undo without guessing transformation: %j',
    (payload) => {
      const r = buildItemLedger(
        [event(), event('ITEM_UNDO', payload, 1, 2000)],
        itemCatalog,
      );
      expect(r.stateComplete).toBe(false);
      expect(r.issues).toHaveLength(1);
      expect(r.acquisitions[0].effective).toBeNull();
    },
  );
  it('does not match an older purchase past an intervening unmatched transaction', () => {
    const r = buildItemLedger(
      [
        event(),
        event('ITEM_PURCHASED', { itemId: 3001 }, 1, 2000),
        event(
          'ITEM_UNDO',
          { beforeId: 1001, afterId: 0, goldGain: 300 },
          2,
          3000,
        ),
      ],
      itemCatalog,
    );
    expect(r.transitions[2].reason).toBe('unmatched_or_unsupported_undo');
  });
  it('missing acquisitions, unknown timestamps, and invalid IDs never manufacture a complete inventory', () => {
    expect(
      buildItemLedger([event('ITEM_DESTROYED', { itemId: 1001 })], itemCatalog),
    ).toMatchObject({
      stateComplete: false,
      observedInventory: [{ itemId: 1001, quantity: null }],
    });
    expect(
      buildItemLedger(
        [event('ITEM_PURCHASED', { itemId: 1001 }, 0, null)],
        itemCatalog,
      ).acquisitions[0].effective,
    ).toBeNull();
    expect(
      buildItemLedger([event('ITEM_PURCHASED', { itemId: 0 })], itemCatalog)
        .issues[0].reason,
    ).toBe('invalid_item_id');
  });
  it('never assumes a new item baseline is zero after an unsupported undo', () => {
    const r = buildItemLedger(
      [
        event(),
        event(
          'ITEM_UNDO',
          { beforeId: 1001, afterId: 2001, goldGain: 0 },
          1,
          2000,
        ),
        event('ITEM_PURCHASED', { itemId: 3001 }, 2, 3000),
      ],
      itemCatalog,
    );
    expect(
      r.observedInventory.find((i) => i.itemId === 3001)?.quantity,
    ).toBeNull();
  });
});
