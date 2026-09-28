import type { ProcessedMatchData } from '../../matches/contracts/normalized-match';
import type { ParsedTimelineData } from '../../matches/contracts/normalized-timeline';

/**
 * The part of a normalized match that is needed to update the three stats
 * aggregates.  The writer deliberately receives the normalized snapshot
 * projection rather than the Riot TimelineDto.
 */
export interface StatsAggregateInput {
  matchData: ProcessedMatchData;
  timeline: ParsedTimelineData;
}

/** Stable aliases for callers that describe this operation as a publication. */
export type AggregateInput = StatsAggregateInput;
export type NormalizedStatsInput = StatsAggregateInput;
