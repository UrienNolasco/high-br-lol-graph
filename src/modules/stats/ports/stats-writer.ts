import type { TransactionContext } from '../../../lib/transaction-context';
import type { StatsAggregateInput } from '../contracts/aggregate';

/**
 * Writes all stats aggregates in the caller's transaction.
 *
 * The transaction is intentionally opaque here.  Only the persistence
 * adapter may turn it into a Prisma transaction client; a writer never opens
 * or commits a transaction of its own.
 */
export interface StatsWriter {
  update(
    transaction: TransactionContext,
    input: StatsAggregateInput,
  ): Promise<void>;
}

export const STATS_WRITER = Symbol('STATS_WRITER');
