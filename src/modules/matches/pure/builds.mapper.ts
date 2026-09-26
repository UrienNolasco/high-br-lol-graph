import {
  readFinalInventory,
  unavailableFinalInventory,
} from '../contracts/final-inventory';
import type { InventoryItem } from '../contracts/final-inventory';
import {
  ItemCatalog,
  ItemMetadata,
  unavailableItemCatalog,
} from '../contracts/catalogs';
export interface ItemTimelineJson {
  itemId: number;
  timestamp: number;
  type: string;
}
export interface BuildParticipant {
  puuid: string;
  championId: number;
  championName: string;
  itemTimeline: ItemTimelineJson[] | null;
  finalInventory?: unknown;
}
export interface ItemEvent extends ItemTimelineJson {
  minute: number;
}
export interface FinalItem {
  slot: number | 'roleBoundItem';
  kind: 'item' | 'trinket' | 'roleBoundItem';
  itemId: number | null;
  empty: boolean | null;
  origin: 'observed' | 'unavailable';
  reason: string | null;
  metadata: ItemMetadata | null;
  metadataReason: string | null;
}
export interface ParticipantBuild {
  puuid: string;
  championId: number;
  championName: string;
  itemTimeline: ItemEvent[];
  transactionHistorySource: 'legacy_item_timeline';
  finalBuild: FinalItem[];
  roleBoundItem: FinalItem;
  inventorySource: 'MatchV5.item0..item6+roleBoundItem';
  inventoryVersion: 1;
  inventoryReason: string | null;
  inventoryCoverage: { validSlots: number; totalSlots: number };
}
export function mapParticipantBuild(
  p: BuildParticipant,
  catalog: ItemCatalog = unavailableItemCatalog('unknown'),
): ParticipantBuild {
  const projection = readFinalInventory(p.finalInventory);
  const source = projection ?? unavailableFinalInventory();
  const inventoryReason = projection
    ? null
    : p.finalInventory == null
      ? 'missing_projection'
      : 'invalid_projection';
  const resolve = (
    entry: InventoryItem,
    slot: FinalItem['slot'],
  ): FinalItem => {
    const known = entry.itemId !== null;
    const metadata =
      known && entry.itemId !== 0
        ? (catalog.items[String(entry.itemId)] ?? null)
        : null;
    return {
      slot,
      kind:
        slot === 'roleBoundItem'
          ? 'roleBoundItem'
          : slot === 6
            ? 'trinket'
            : 'item',
      itemId: entry.itemId,
      empty: known ? entry.itemId === 0 : null,
      origin: known ? 'observed' : 'unavailable',
      reason: inventoryReason ?? entry.reason,
      metadata,
      metadataReason: !known
        ? 'missing_item_id'
        : entry.itemId === 0
          ? 'empty_slot'
          : metadata
            ? null
            : (catalog.reason ?? 'unknown_item_id'),
    };
  };
  return {
    puuid: p.puuid,
    championId: p.championId,
    championName: p.championName,
    itemTimeline: (p.itemTimeline ?? []).map((item) => ({
      ...item,
      minute: item.timestamp / 60000,
    })),
    transactionHistorySource: 'legacy_item_timeline',
    finalBuild: source.slots.map((entry) => resolve(entry, entry.slot)),
    roleBoundItem: resolve(source.roleBoundItem, 'roleBoundItem'),
    inventorySource: 'MatchV5.item0..item6+roleBoundItem',
    inventoryVersion: 1,
    inventoryReason,
    inventoryCoverage: {
      validSlots: source.slots.filter((s) => s.itemId !== null).length,
      totalSlots: 7,
    },
  };
}
