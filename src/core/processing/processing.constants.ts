export const PROCESSING_VERSION = 1;
export const PROCESSING_GATE = 938402;
export const LEASE_MS = 120_000;
export const MAX_ATTEMPTS = 6;
export const REPUBLISH_MS = 60_000;

export class InvalidMatchError extends Error {}
export class MissingTimelineError extends Error {}
export class LeaseLostError extends Error {}
