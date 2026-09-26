import type { Prisma } from '@prisma/client';

/** Explicit adapter for JSON columns: no ORM types escape into domain models. */
export function jsonObject(value: object): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, item] of Object.entries(value)) {
    // Prisma omits undefined object properties; preserve that behavior.
    if (item !== undefined) result[key] = jsonValue(item);
  }
  return result;
}

export function jsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === 'object') return jsonObject(value);
  throw new TypeError(`Unsupported persisted JSON value: ${typeof value}`);
}
