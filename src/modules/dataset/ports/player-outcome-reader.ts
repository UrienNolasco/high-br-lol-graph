export interface PlayerOutcomeScope {
  playerId: string;
  queueId: number;
  mapId: number;
  fromMs: number;
  toMs: number;
}
export interface PlayerOutcomeAnchor {
  id: string;
  matchId: string;
  gameCreation: bigint;
  championId: number | null;
  role: string | null;
  patch: string | null;
  eligible: boolean;
  validCount: number;
  value: number | null;
  exclusionReason: string | null;
}
export interface PlayerOutcomePage {
  anchors: PlayerOutcomeAnchor[];
  total: number;
  tooLarge: boolean;
  datasetVersion: number;
  processingVersion: number;
}
export interface PlayerOutcomeReader {
  read(scope: PlayerOutcomeScope, maximum: number): Promise<PlayerOutcomePage>;
  /** Exact materialized IDs for coverage, including over-limit cohorts. */
  matchIds(scope: PlayerOutcomeScope): Promise<string[]>;
}
export const PLAYER_OUTCOME_READER = Symbol('PLAYER_OUTCOME_READER');
