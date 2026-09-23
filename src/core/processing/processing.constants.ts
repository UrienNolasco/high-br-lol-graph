// Persistence/aggregate generation, independent from per-definition metricVersion.
// Formula changes affecting persisted values require a bump and offline rebuild.
// Adding pure contracts alone does not invalidate existing persisted work.
export const PROCESSING_VERSION = 4;
export const PROCESSING_GATE = 938402;
export const LEASE_MS = 120_000;
// Short admission transactions can overlap other workers' CPU preparation in this
// process. Use an explicit bound below the lease, not Prisma's implicit 5s limit.
export const CONTROL_TRANSACTION_OPTIONS = {
  timeout: 30_000,
  maxWait: 5_000,
} as const;
export const MAX_ATTEMPTS = 6;
export const REPUBLISH_MS = 60_000;

export class InvalidMatchError extends Error {}
export class MissingTimelineError extends Error {}
export class LeaseLostError extends Error {}
