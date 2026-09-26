import {
  dkwHalfWidth,
  empiricalDistribution,
  empiricalQuantile,
} from '../../../lib/math/empirical-distribution';

/** MET20 method1: empirical inverse CDF plus a DKW-Massart simultaneous band. */
export const REFERENCE_METHOD_VERSION = 1;

export interface PrecisionPolicy {
  confidence: number;
  cdfHalfWidth: number;
  minimumUnits: number;
}

export const DEFAULT_PRECISION: PrecisionPolicy = {
  confidence: 0.95,
  cdfHalfWidth: 0.15,
  minimumUnits: 0,
};

export function precisionPolicy(
  raw: Partial<PrecisionPolicy> = {},
): PrecisionPolicy {
  const p = { ...DEFAULT_PRECISION, ...raw };
  if (
    !Number.isFinite(p.confidence) ||
    p.confidence < 0.8 ||
    p.confidence > 0.999 ||
    !Number.isFinite(p.cdfHalfWidth) ||
    p.cdfHalfWidth < 0.01 ||
    p.cdfHalfWidth > 0.25 ||
    !Number.isSafeInteger(p.minimumUnits) ||
    p.minimumUnits < 0 ||
    p.minimumUnits > 100000
  )
    throw new Error(
      'Precision requires confidence0.8..0.999, cdfHalfWidth0.01..0.25, minimumUnits0..100000',
    );
  return p;
}

export function requiredReferenceUnits(policy: PrecisionPolicy): number {
  const p = precisionPolicy(policy);
  return Math.max(
    p.minimumUnits,
    Math.ceil(Math.log(2 / (1 - p.confidence)) / (2 * p.cdfHalfWidth ** 2)),
  );
}

export function referenceStatistics(
  values: readonly number[],
  policy: PrecisionPolicy,
  individualValue: number | null = null,
) {
  const { sorted, groups } = empiricalDistribution(values);
  const n = sorted.length,
    requiredUnits = requiredReferenceUnits(policy),
    epsilon = dkwHalfWidth(n, policy.confidence);
  const sufficient = n >= requiredUnits;
  const precision = {
    ...policy,
    requiredUnits,
    observedUnits: n,
    achievedCdfHalfWidth: epsilon,
    sufficient,
  };
  if (!sufficient)
    return {
      precision,
      distribution: null,
      median: null,
      quantiles: null,
      individualPercentile: null,
    };
  const quantiles = [0.1, 0.25, 0.5, 0.75, 0.9].map((probability) => ({
    probability,
    value: empiricalQuantile(sorted, probability),
    interval: {
      lower:
        probability - epsilon! <= 0
          ? null
          : empiricalQuantile(sorted, probability - epsilon!),
      upper:
        probability + epsilon! >= 1
          ? null
          : empiricalQuantile(sorted, probability + epsilon!),
      lowerUnbounded: probability - epsilon! <= 0,
      upperUnbounded: probability + epsilon! >= 1,
      confidence: policy.confidence,
      method:
        'inverse DKW simultaneous CDF band; null endpoint means unbounded',
    },
  }));
  let percentile: {
    value: number;
    lower: number;
    upper: number;
    ties: number;
    method: string;
  } | null = null;
  if (individualValue !== null && Number.isFinite(individualValue)) {
    const less = sorted.filter((v) => v < individualValue).length,
      ties = sorted.filter((v) => v === individualValue).length;
    const rank = (less + ties / 2) / n;
    percentile = {
      value: 100 * rank,
      lower: 100 * Math.max(0, rank - epsilon!),
      upper: 100 * Math.min(1, rank + epsilon!),
      ties,
      method:
        '100*(strictly smaller + half ties)/n; conditional DKW band; not a competitive rank',
    };
  }
  return {
    precision,
    distribution: groups.map((group) => ({
      ...group,
      lower: Math.max(0, group.cdf - epsilon!),
      upper: Math.min(1, group.cdf + epsilon!),
    })),
    median: empiricalQuantile(sorted, 0.5),
    quantiles,
    individualPercentile: percentile,
  };
}
