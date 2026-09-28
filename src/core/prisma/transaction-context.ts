import type { Prisma } from '@prisma/client';
import type { TransactionContext } from '../../lib/transaction-context';

/** Persistence-only identity bridge for opaque public transaction ports. */
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

export const bindPrismaTransaction = toTransactionContext;
export const getPrismaTransaction = fromTransactionContext;
