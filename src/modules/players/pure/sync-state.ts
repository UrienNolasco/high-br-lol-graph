export const SYNC_TTL_SECONDS = 1800;

export function syncStatusKey(puuid: string) {
  return `sync:${puuid}:status`;
}

export function syncMatchIdsKey(puuid: string) {
  return `sync:${puuid}:matchIds`;
}
