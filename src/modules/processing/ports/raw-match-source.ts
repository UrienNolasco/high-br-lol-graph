export interface RawMatchSource {
  getMatchById(matchId: string): Promise<unknown>;
  getTimeline(matchId: string): Promise<unknown | null>;
}

export const RAW_MATCH_SOURCE = Symbol('processing.raw-match-source');
