import type { TransactionContext } from '../../../lib/transaction-context';

export interface IngestionTransactionCoordinator {
  withIngestionTransaction<T>(
    callback: (transaction: TransactionContext) => Promise<T>,
  ): Promise<T>;
}

/** Query observation DTO. Collector maps this DTO to its canonical context. */
export interface ObservationRequest {
  readonly observationId: string;
  readonly source: 'collector' | 'search' | 'sync';
  readonly observedAt: Date;
  readonly region: string | null;
  readonly queriedPuuid: string;
  readonly queueFilter: number | null;
  readonly requestedCount: number;
  readonly startIndex: number;
  readonly rank: {
    tier: string;
    division: string | null;
    leaguePoints: number | null;
    queue: string;
    observedAt: Date;
  } | null;
  readonly matchIds: readonly string[];
}

export interface DiscoveryRecorder {
  recordDiscovery(request: ObservationRequest): Promise<void>;
}

export const DISCOVERY_RECORDER = Symbol('collector.discovery-recorder');

export const INGESTION_TRANSACTION_COORDINATOR = Symbol(
  'processing.ingestion-transaction-coordinator',
);
