export interface InventoryItem {
  itemId: number | null;
  reason: 'missing_field' | 'invalid_value' | null;
}

/** Literal inventory from Match-V5; slots are numbered from zero through six. */
export interface FinalInventory {
  version: 1;
  slots: (InventoryItem & { slot: number })[];
  roleBoundItem: InventoryItem;
}

/** Missing persisted inventory supplies unavailable slots, never observed zero. */
export function unavailableFinalInventory(): FinalInventory {
  return {
    version: 1,
    slots: Array.from({ length: 7 }, (_, slot) => ({
      slot,
      itemId: null,
      reason: 'missing_field',
    })),
    roleBoundItem: { itemId: null, reason: 'missing_field' },
  };
}

export function readFinalInventory(json: unknown): FinalInventory | null {
  if (!json || typeof json !== 'object') return null;
  const p = json as FinalInventory;
  if (
    p.version !== 1 ||
    !Array.isArray(p.slots) ||
    p.slots.length !== 7 ||
    !p.roleBoundItem
  )
    return null;
  const valid = (value: InventoryItem) =>
    value &&
    ((value.itemId === null &&
      ['missing_field', 'invalid_value'].includes(value.reason ?? '')) ||
      (typeof value.itemId === 'number' &&
        Number.isSafeInteger(value.itemId) &&
        value.itemId >= 0 &&
        value.reason === null));
  return p.slots.every(
    (entry, index) => entry && entry.slot === index && valid(entry),
  ) && valid(p.roleBoundItem)
    ? p
    : null;
}
