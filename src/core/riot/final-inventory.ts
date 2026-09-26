import type {
  FinalInventory,
  InventoryItem,
} from '../../modules/matches/contracts/final-inventory';

/** @deprecated Import canonical types from modules/matches/contracts. */
export type {
  FinalInventory,
  InventoryItem,
} from '../../modules/matches/contracts/final-inventory';

function item(value: unknown): InventoryItem {
  if (value == null) return { itemId: null, reason: 'missing_field' };
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? { itemId: value, reason: null }
    : { itemId: null, reason: 'invalid_value' };
}

/** Match summary is authoritative. Purchases, sales and undo are not inventory. */
export function projectFinalInventory(participant: object): FinalInventory {
  const source = participant as Record<string, unknown>;
  return {
    version: 1,
    slots: Array.from({ length: 7 }, (_, slot) => ({
      slot,
      ...item(source[`item${slot}`]),
    })),
    roleBoundItem: item(source.roleBoundItem),
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
