import { PROCESSING_VERSION } from '../processing/processing.constants';

/** Definition version, independent from the persisted projection version. */
export const METRIC_VERSION = 1;
export const METRIC_ORIGINS = [
  'observed',
  'derived',
  'estimated',
  'unavailable',
] as const;
export type MetricOrigin = (typeof METRIC_ORIGINS)[number];
export type MissingReason =
  | 'missing_field'
  | 'missing_frame'
  | 'ambiguous_role'
  | 'missing_opponent'
  | 'short_match'
  | 'unsupported_version'
  | 'zero_denominator'
  | 'insufficient_sample'
  | 'invalid_value'
  | 'unknown_remake'
  | 'remake'
  | 'outside_cohort'
  | 'not_calculated';
export type MetricUnit =
  | 'count'
  | 'gold'
  | 'xp'
  | 'level'
  | 'cs'
  | 'damage'
  | 'seconds'
  | 'milliseconds'
  | 'player_seconds'
  | 'minutes'
  | 'percent'
  | 'ratio'
  | 'gold_minutes'
  | 'gold_per_minute'
  | 'cs_per_minute'
  | 'damage_per_minute'
  | 'score'
  | 'score_per_minute';
export interface MetricEvidence {
  source: string;
  field: string;
  value: number | string | boolean | null;
  eventId?: string;
  frameIndex?: number;
  timestampMs?: number;
}
export interface MetricQuality {
  validSamples: number;
  totalSamples: number;
  coverage: number | null;
  unknownEvents: number;
  reconciliationIssues: string[];
}
export interface MetricContext {
  metricId: string;
  metricVersion: number;
  processingVersion: number;
  processedAt: string;
  matchId: string;
  subject: { kind: 'participant' | 'team' | 'match'; id: string };
  unit: MetricUnit;
  window: { startMs: number; endMs: number; bounds: '[)' | '[]' | '(]' } | null;
  denominator: {
    value: number | null;
    unit: string;
    population: string;
  } | null;
  quality: MetricQuality;
  evidence: MetricEvidence[];
}
export type MetricResult = MetricContext &
  (
    | {
        origin: Exclude<MetricOrigin, 'unavailable'>;
        value: number;
        reason: null;
        method: string;
      }
    | {
        origin: 'unavailable';
        value: null;
        reason: MissingReason;
        method: string | null;
      }
  );

export function metricQuality(
  validSamples: number,
  totalSamples: number,
): MetricQuality {
  if (
    ![validSamples, totalSamples].every(Number.isInteger) ||
    validSamples < 0 ||
    totalSamples < validSamples
  )
    throw new RangeError('Invalid sample counts');
  return {
    validSamples,
    totalSamples,
    coverage: totalSamples ? validSamples / totalSamples : null,
    unknownEvents: 0,
    reconciliationIssues: [],
  };
}

export function metricContext(
  input: Omit<MetricContext, 'metricVersion' | 'processingVersion'> &
    Partial<Pick<MetricContext, 'metricVersion' | 'processingVersion'>>,
): MetricContext {
  if (!Number.isFinite(Date.parse(input.processedAt)))
    throw new RangeError('Invalid processing timestamp');
  if (
    input.denominator?.value != null &&
    (!Number.isFinite(input.denominator.value) || input.denominator.value < 0)
  )
    throw new RangeError('Invalid denominator');
  return {
    ...input,
    metricVersion: input.metricVersion ?? METRIC_VERSION,
    processingVersion: input.processingVersion ?? PROCESSING_VERSION,
  };
}

export function unavailableMetric(
  context: MetricContext,
  reason: MissingReason,
  method: string | null = null,
): MetricResult {
  return { ...context, value: null, origin: 'unavailable', reason, method };
}

export function metricValue(
  context: MetricContext,
  value: number | null | undefined,
  origin: Exclude<MetricOrigin, 'unavailable'>,
  method: string,
): MetricResult {
  if (!method.trim()) throw new Error('Metric requires a method');
  if (value == null) return unavailableMetric(context, 'missing_field', method);
  if (!Number.isFinite(value))
    return unavailableMetric(context, 'invalid_value', method);
  return { ...context, value, origin, reason: null, method };
}

/** No rounding; scale=100 for percentages, 1 for shares. */
export function ratioMetric(
  context: MetricContext,
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  scale: 1 | 100 = 1,
): MetricResult {
  if (!context.denominator)
    throw new Error('Ratio requires a named denominator');
  const withDenominator = {
    ...context,
    denominator: {
      ...context.denominator,
      value:
        denominator != null && Number.isFinite(denominator) && denominator >= 0
          ? denominator
          : null,
    },
  };
  const method = `numerator / denominator * ${scale}`;
  if (numerator == null || denominator == null)
    return unavailableMetric(withDenominator, 'missing_field', method);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator < 0
  )
    return unavailableMetric(withDenominator, 'invalid_value', method);
  if (denominator === 0)
    return unavailableMetric(withDenominator, 'zero_denominator', method);
  return metricValue(
    withDenominator,
    (numerator / denominator) * scale,
    'derived',
    method,
  );
}
