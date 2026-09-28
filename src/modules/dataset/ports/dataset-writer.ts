import type { TransactionContext } from '../../../lib/transaction-context';
import type {
  DatasetContribution,
  DatasetInput,
} from '../pure/dataset-builder';

/**
 * Dataset publication is coordinated by processing. Implementations receive
 * the coordinator's opaque transaction and must never begin or commit one.
 */
export interface DatasetWriter {
  prepare(input: Omit<DatasetInput, 'lineage'>): readonly DatasetContribution[];
  write(
    transaction: TransactionContext,
    input: DatasetInput,
    prepared: readonly DatasetContribution[],
  ): Promise<number>;
}

export const DATASET_WRITER = Symbol('DATASET_WRITER');
