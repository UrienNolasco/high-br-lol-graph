import type { TransactionContext } from '../../../lib/transaction-context';
import type { ProcessedMatchData } from '../contracts/normalized-match';
import type { ParsedTimelineData } from '../contracts/normalized-timeline';

export interface MatchProjectionWrite {
  matchData: ProcessedMatchData;
  timeline: ParsedTimelineData;
  completedAt: Date;
}

/**
 * Writes normalized match, teams, participants, snapshots and events, in that order.
 * The caller owns the transaction, gate and lease. This writer must neither open
 * nor commit a transaction, update aggregates, or mark processing COMPLETED.
 * Binding the implementation is part of the processing ownership move (ARQ-10).
 */
export interface MatchProjectionWriter {
  write(
    transaction: TransactionContext,
    input: MatchProjectionWrite,
  ): Promise<void>;
}
export const MATCH_PROJECTION_WRITER = Symbol('MATCH_PROJECTION_WRITER');
