// Persistence/aggregate generation, independent from per-definition metricVersion.
// Formula changes affecting persisted values require a bump and offline rebuild.
// Adding pure contracts alone does not invalidate existing persisted work.
export const PROCESSING_VERSION = 3;
export const PROCESSING_GATE = 938402;
export const LEASE_MS = 120_000;
export const MAX_ATTEMPTS = 6;
export const REPUBLISH_MS = 60_000;

export class InvalidMatchError extends Error {}
export class MissingTimelineError extends Error {}
export class LeaseLostError extends Error {}
