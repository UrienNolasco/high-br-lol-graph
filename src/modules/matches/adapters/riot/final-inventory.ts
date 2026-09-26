import type {
  FinalInventory,
  InventoryItem,
} from '../../contracts/final-inventory';

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
