import { ItemCatalog, ItemMetadata } from '../../contracts/catalogs';
import {
  ProgressionEvent,
  eventId,
  record,
  itemId,
  integer,
  ordered,
  time,
} from './types';
export interface Acquisition {
  eventId: string;
  itemId: number;
  timestampMs: number | null;
  effective: boolean | null;
  undoneBy: string | null;
  metadata: ItemMetadata | null;
  metadataReason: string | null;
}
type State = Map<number, number | null>;
interface Action {
  events: ProgressionEvent[];
  before: State;
  itemId: number;
  kind: 'purchase' | 'sale';
  acquisition: Acquisition | null;
  reversible: boolean;
}
function recipeCovers(
  purchased: number,
  destroyed: number[],
  catalog: ItemCatalog,
): boolean {
  if (!destroyed.length) return true;
  const remaining = new Map<number, number>();
  for (const id of destroyed) remaining.set(id, (remaining.get(id) ?? 0) + 1);
  const visit = (id: number, path: number[]): void => {
    if (path.includes(id) || path.length > 16) return;
    if ((remaining.get(id) ?? 0) > 0) {
      remaining.set(id, remaining.get(id)! - 1);
      return;
    }
    for (const child of catalog.items[String(id)]?.from ?? [])
      visit(child, [...path, id]);
  };
  for (const child of catalog.items[String(purchased)]?.from ?? [])
    visit(child, [purchased]);
  return [...remaining.values()].every((n) => n === 0);
}
export function buildItemLedger(
  events: ProgressionEvent[],
  catalog: ItemCatalog,
) {
  const state: State = new Map();
  let unknownBaseline = false;
  const acquisitions: Acquisition[] = [];
  const issues: { reason: string; eventIds: string[] }[] = [];
  const transitions: {
    eventIds: string[];
    timestampMs: number | null;
    interpretation: string;
    reason: string | null;
    reversedEventIds: string[];
    inventoryAfter: { itemId: number; quantity: number | null }[];
  }[] = [];
  const stack: Action[] = [];
  const snapshot = () =>
    [...state.entries()]
      .sort(([a], [b]) => a - b)
      .map(([id, quantity]) => ({ itemId: id, quantity }));
  const change = (id: number, delta: number) => {
    const current = state.has(id) ? state.get(id)! : unknownBaseline ? null : 0;
    if (current === null) {
      state.set(id, null);
      return;
    }
    const next = current + delta;
    state.set(id, next >= 0 ? next : null);
  };
  const batches: ProgressionEvent[][] = [];
  for (const event of ordered(events)) {
    const previous = batches[batches.length - 1];
    if (
      event.timestampMs !== null &&
      previous?.[0].timestampMs === event.timestampMs
    )
      previous.push(event);
    else batches.push([event]);
  }
  for (const batch of batches) {
    const ids = batch.map(eventId),
      timestampMs = batch[0].timestampMs;
    let interpretation = 'observed_deltas',
      reason: string | null = null,
      reversedEventIds: string[] = [];
    const badTime = !time(timestampMs);
    const undo = batch.filter((e) => e.type === 'ITEM_UNDO');
    const normal = batch.filter((e) => e.type !== 'ITEM_UNDO');
    const purchaseRows = normal.filter((e) => e.type === 'ITEM_PURCHASED');
    const created = purchaseRows.flatMap((e) => {
      const id = record(e.payload).itemId;
      if (!itemId(id)) return [];
      const a: Acquisition = {
        eventId: eventId(e),
        itemId: id,
        timestampMs: e.timestampMs,
        effective: badTime ? null : true,
        undoneBy: null,
        metadata: catalog.items[String(id)] ?? null,
        metadataReason: catalog.items[String(id)]
          ? null
          : (catalog.reason ?? 'unknown_item_id'),
      };
      acquisitions.push(a);
      return [a];
    });
    if (
      badTime ||
      (undo.length > 0 && batch.length !== 1) ||
      normal.some((e) => !itemId(record(e.payload).itemId))
    ) {
      reason = badTime
        ? 'missing_timestamp'
        : undo.length
          ? 'ambiguous_simultaneous_undo'
          : 'invalid_item_id';
      interpretation = 'ambiguous';
      for (const id of state.keys()) state.set(id, null);
      for (const a of created) {
        state.set(a.itemId, null);
        a.effective = null;
      }
      if (undo.length)
        for (const a of acquisitions)
          if (a.effective === true) a.effective = null;
      unknownBaseline = true;
      stack.length = 0;
    } else if (undo.length === 1) {
      const event = undo[0],
        p = record(event.payload),
        before = p.beforeId,
        after = p.afterId,
        gold = p.goldGain;
      const top = stack[stack.length - 1];
      const valid =
        integer(before) &&
        integer(after) &&
        typeof gold === 'number' &&
        Number.isFinite(gold);
      const purchaseUndo =
        valid &&
        before > 0 &&
        after === 0 &&
        gold >= 0 &&
        top?.kind === 'purchase' &&
        top.itemId === before;
      const saleUndo =
        valid &&
        before === 0 &&
        after > 0 &&
        gold <= 0 &&
        top?.kind === 'sale' &&
        top.itemId === after;
      if ((purchaseUndo || saleUndo) && top.reversible) {
        state.clear();
        for (const [id, n] of top.before) state.set(id, n);
        if (top.acquisition) {
          top.acquisition.effective = false;
          top.acquisition.undoneBy = eventId(event);
        }
        reversedEventIds = top.events.map(eventId);
        stack.pop();
        interpretation = purchaseUndo ? 'undo_purchase' : 'undo_sale';
      } else {
        reason = !valid
          ? 'invalid_undo_fields'
          : top && (purchaseUndo || saleUndo)
            ? 'unvalidated_component_restoration'
            : 'unmatched_or_unsupported_undo';
        interpretation = 'ambiguous';
        if (purchaseUndo && top.acquisition) {
          top.acquisition.effective = false;
          top.acquisition.undoneBy = eventId(event);
        } else
          for (const a of acquisitions.filter(
            (a) =>
              (!itemId(before) || a.itemId === before) && a.effective === true,
          ))
            a.effective = null;
        unknownBaseline = true;
        // Unknown undo may restore components that are not named by beforeId/afterId.
        for (const id of state.keys()) state.set(id, null);
        if (itemId(before)) state.set(before, null);
        if (itemId(after)) state.set(after, null);
        stack.length = 0;
      }
    } else {
      const before = new Map(state),
        delta = new Map<number, number>();
      const removed: number[] = [];
      for (const event of normal) {
        const id = record(event.payload).itemId as number;
        const sign = event.type === 'ITEM_PURCHASED' ? 1 : -1;
        delta.set(id, (delta.get(id) ?? 0) + sign);
        if (event.type === 'ITEM_DESTROYED') removed.push(id);
      }
      for (const [id, d] of delta) {
        const current = state.has(id)
          ? state.get(id)
          : unknownBaseline
            ? null
            : 0;
        change(id, d);
        if (current !== null && current !== undefined && current + d < 0)
          reason = 'removal_without_observed_acquisition';
      }
      // Same timestamp is one observed delta group: consumed items cannot survive because a destroy preceded purchase in source order.
      const sales = normal.filter((e) => e.type === 'ITEM_SOLD');
      const purchase =
        created.length === 1 && purchaseRows.length === 1 && sales.length === 0;
      const sale = normal.length === 1 && sales.length === 1;
      if (purchase || sale)
        stack.push({
          events: batch,
          before,
          itemId: purchase
            ? created[0].itemId
            : (record(sales[0].payload).itemId as number),
          kind: purchase ? 'purchase' : 'sale',
          acquisition: purchase ? created[0] : null,
          reversible:
            !reason &&
            (sale || recipeCovers(created[0].itemId, removed, catalog)),
        });
      else stack.length = 0;
      if (removed.length && purchase)
        interpretation = recipeCovers(created[0].itemId, removed, catalog)
          ? 'recipe_compatible_observed_deltas'
          : 'removal_cause_unknown';
      if (reason) interpretation = 'ambiguous';
    }
    if (reason) issues.push({ reason, eventIds: ids });
    transitions.push({
      eventIds: ids,
      timestampMs,
      interpretation,
      reason,
      reversedEventIds,
      inventoryAfter: snapshot(),
    });
  }
  return {
    acquisitions,
    transitions,
    observedInventory: snapshot(),
    issues,
    stateComplete:
      issues.length === 0 && [...state.values()].every((n) => n !== null),
    inventorySemantics:
      'Observed multiset of item deltas, not authoritative slots. Destruction does not prove consumption or transformation; compatible recipes are contextual evidence only.',
  };
}
