/**
 * Opaque transaction handle shared by application ports.
 *
 * The concrete database transaction is bound only by the persistence bridge;
 * modules must pass this value through without inspecting or narrowing it.
 */
declare const TRANSACTION_CONTEXT: unique symbol;

export interface TransactionContext {
  readonly [TRANSACTION_CONTEXT]: true;
}
