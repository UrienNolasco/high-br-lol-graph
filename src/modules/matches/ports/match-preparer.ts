import type { ProcessedMatchData } from '../contracts/normalized-match';
import type { ParsedTimelineData } from '../contracts/normalized-timeline';

export interface PreparedMatch {
  matchData: ProcessedMatchData;
  timeline: ParsedTimelineData;
}

export interface MatchPreparer {
  prepare(
    matchId: string,
    summary: unknown,
    timeline: unknown,
    processingVersion: number,
  ): PreparedMatch;
}

export const MATCH_PREPARER = Symbol('matches.match-preparer');
