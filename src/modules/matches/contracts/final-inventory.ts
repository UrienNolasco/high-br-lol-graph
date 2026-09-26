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
