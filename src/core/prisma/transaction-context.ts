import type { Prisma } from '@prisma/client';
import type { TransactionContext } from '../../lib/transaction-context';

/**
 * Persistence-only bridge for the opaque transaction passed through public
 * ports.  No module contract may depend on Prisma's transaction client.
 */
export function toTransactionContext(
  transaction: Prisma.TransactionClient,
): TransactionContext {
  return transaction as unknown as TransactionContext;
}

export function fromTransactionContext(
  transaction: TransactionContext,
): Prisma.TransactionClient {
  return transaction as unknown as Prisma.TransactionClient;
}
