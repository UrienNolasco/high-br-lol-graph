import { createHash } from 'node:crypto';

/** Canonical JSON used by dataset and offline study provenance manifests. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return typeof value === 'bigint'
      ? JSON.stringify(String(value))
      : JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value)
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`,
    )
    .join(',')}}`;
}

export const datasetDigest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
