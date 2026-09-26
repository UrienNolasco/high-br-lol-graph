/**
 * Exact persisted generation supported by dataset queries and export manifests.
 * This is a reader compatibility decision, independent of job execution policy.
 * Feature builders separately retain their existing generation >= 4 policy.
 */
export const DATASET_PROCESSING_VERSION = 4;
