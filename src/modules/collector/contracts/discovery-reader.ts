export interface DiscoveryPeriod {
  playerId: string;
  fromMs: number;
  toMs: number;
}
/** IDs discovered within observedAt period; no inference of match creation/queue/map. */
export interface DiscoveryReader {
  matchIds(scope: DiscoveryPeriod): Promise<string[]>;
}
export const DISCOVERY_READER = Symbol('DISCOVERY_READER');
