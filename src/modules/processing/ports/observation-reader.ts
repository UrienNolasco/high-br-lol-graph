import type { TransactionContext } from '../../../lib/transaction-context';

export interface ObservationLineage {
  observationIds: string[];
  sources: string[];
  status: 'observed' | 'unknown';
  reason: string | null;
}

/** Consumer-owned port. Processing can read lineage without knowing collector. */
export interface ObservationReader {
  readLineage(
    matchId: string,
    transaction: TransactionContext,
  ): Promise<ObservationLineage>;
}

export const OBSERVATION_READER = Symbol('processing.observation-reader');
