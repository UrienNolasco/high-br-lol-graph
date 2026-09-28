// Shared processing policy values. Keeping them in lib avoids making queue or
// technical adapters depend on the processing module's implementation.
export const PROCESSING_VERSION = 4;
export const PROCESSING_GATE = 938402;
export const LEASE_MS = 120_000;
export const CONTROL_TRANSACTION_OPTIONS = {
  timeout: 30_000,
  maxWait: 5_000,
} as const;
export const MAX_ATTEMPTS = 6;
export const REPUBLISH_MS = 60_000;
