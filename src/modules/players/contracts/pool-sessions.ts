export interface PoolSessionQuery {
  playerId: string;
  queueId: number;
  mapId: number;
  fromMs: number;
  toMs: number;
  gapMinutes: number;
}
export interface PoolSessionRow {
  matchId: string;
  gameCreationMs: number;
  durationSeconds: number;
  championId: number | null;
  role: string | null;
  patch: string | null;
  eligible: boolean;
  win: number | null;
  exclusionReason: string | null;
  evidenceId: string;
}
export function normalizePoolSessionQuery(
  playerId: string,
  raw: Record<string, unknown>,
): PoolSessionQuery {
  const allowed = ['queueId', 'mapId', 'fromMs', 'toMs', 'gapMinutes'];
  for (const key of Object.keys(raw))
    if (!allowed.includes(key)) throw new Error(`Unknown filter: ${key}`);
  if (!playerId.trim()) throw new Error('Player PUUID required');
  const query = { playerId } as PoolSessionQuery;
  for (const key of allowed as Array<
    keyof Omit<PoolSessionQuery, 'playerId'>
  >) {
    const value = raw[key] ?? (key === 'gapMinutes' ? 30 : undefined);
    const number =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && /^\d+$/.test(value)
          ? Number(value)
          : NaN;
    if (!Number.isSafeInteger(number) || number < (key === 'fromMs' ? 0 : 1))
      throw new Error(`Invalid ${key}`);
    query[key] = number;
  }
  if (query.toMs > 8640000000000000)
    throw new Error('Period exceeds supported epoch range');
  if (query.fromMs >= query.toMs)
    throw new Error('Period must satisfy fromMs < toMs');
  if (query.toMs - query.fromMs > 366 * 86400000)
    throw new Error('Period exceeds 366 days');
  if (query.gapMinutes > 180)
    throw new Error('gapMinutes must be between 1 and 180');
  return query;
}
