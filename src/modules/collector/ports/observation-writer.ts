import type { DiscoveryContext } from '../contracts/discovery';
import type { TransactionContext } from '../../../lib/transaction-context';

export interface ObservationWriter {
  recordObservation(
    matchIds: readonly string[],
    context: DiscoveryContext,
    transaction: TransactionContext,
  ): Promise<void>;
}

export const OBSERVATION_WRITER = Symbol('collector.observation-writer');
