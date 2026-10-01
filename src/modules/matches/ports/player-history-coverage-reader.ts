export interface PlayerHistoryScope {
  playerId: string;
  queueId: number;
  mapId: number;
  fromMs: number;
  toMs: number;
}
export interface PlayerHistoryCoverageReader {
  durations(
    matchIds: readonly string[],
  ): Promise<Array<{ matchId: string; durationSeconds: number }>>;
  countWithoutAnchors(
    scope: PlayerHistoryScope,
    materializedIds: readonly string[],
  ): Promise<number>;
  existingIds(matchIds: readonly string[]): Promise<string[]>;
}
export const PLAYER_HISTORY_COVERAGE_READER = Symbol(
  'PLAYER_HISTORY_COVERAGE_READER',
);
