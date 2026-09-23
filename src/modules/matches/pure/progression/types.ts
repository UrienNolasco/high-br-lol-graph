export interface ProgressionEvent {
  matchId: string;
  frameIndex: number;
  eventIndex: number;
  type: string | null;
  timestampMs: number | null;
  actorPuuid: string | null;
  payload: unknown;
  quality: unknown;
  metricVersion: number;
  processingVersion: number;
}
export const eventId = (e: ProgressionEvent) =>
  `${e.matchId}:${e.frameIndex}:${e.eventIndex}`;
export const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const itemId = (v: unknown): v is number => integer(v) && v > 0;
export const time = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;
export const ordered = (events: ProgressionEvent[]) =>
  [...events].sort(
    (a, b) =>
      (a.timestampMs ?? Infinity) - (b.timestampMs ?? Infinity) ||
      a.frameIndex - b.frameIndex ||
      a.eventIndex - b.eventIndex,
  );
export const ITEM_EVENT_TYPES = [
  'ITEM_PURCHASED',
  'ITEM_SOLD',
  'ITEM_DESTROYED',
  'ITEM_UNDO',
];
export const PROGRESSION_EVENT_TYPES = [
  ...ITEM_EVENT_TYPES,
  'SKILL_LEVEL_UP',
  'GAME_END',
];
