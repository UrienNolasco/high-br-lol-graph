import { createHash } from 'node:crypto';
import { DatasetFilters } from '../../../core/dataset/dataset-query';
export interface IndicatorCursor {
  gameCreation: bigint;
  matchId: string;
}
const scope = (filters: DatasetFilters) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)),
      ),
    )
    .digest('hex');
export function encodeIndicatorCursor(
  cursor: IndicatorCursor,
  filters: DatasetFilters,
) {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      gameCreation: cursor.gameCreation.toString(),
      matchId: cursor.matchId,
      scope: scope(filters),
    }),
  ).toString('base64url');
}
export function decodeIndicatorCursor(
  token: unknown,
  filters: DatasetFilters,
): IndicatorCursor {
  if (
    typeof token !== 'string' ||
    token.length > 1536 ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  )
    throw Error('Invalid history cursor');
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw Error('Invalid history cursor');
  }
  const row = value as Record<string, unknown>;
  if (
    !row ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    row.version !== 1 ||
    typeof row.gameCreation !== 'string' ||
    !/^\d{1,16}$/.test(row.gameCreation) ||
    BigInt(row.gameCreation) > BigInt(Number.MAX_SAFE_INTEGER) ||
    typeof row.matchId !== 'string' ||
    !row.matchId.length ||
    row.matchId.length > 128 ||
    row.scope !== scope(filters)
  )
    throw Error('Cursor does not match these history filters');
  return { gameCreation: BigInt(row.gameCreation), matchId: row.matchId };
}
