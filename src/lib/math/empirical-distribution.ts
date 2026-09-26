/** DKW-Massart simultaneous CDF half-width. */
export function dkwHalfWidth(n: number, confidence: number): number | null {
  if (
    !Number.isSafeInteger(n) ||
    n < 0 ||
    !Number.isFinite(confidence) ||
    confidence <= 0 ||
    confidence >= 1
  )
    throw new Error('Invalid confidence/sample count');
  return n === 0
    ? null
    : Math.min(1, Math.sqrt(Math.log(2 / (1 - confidence)) / (2 * n)));
}

/** Type1 (inverse empirical CDF); even-N median is the lower central order statistic. */
export function empiricalQuantile(
  sorted: readonly number[],
  probability: number,
): number | null {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1)
    throw new Error('Invalid quantile probability');
  if (
    sorted.some((v, i) => !Number.isFinite(v) || (i > 0 && v < sorted[i - 1]))
  )
    throw new Error('Quantile input must be finite and sorted');
  return sorted.length
    ? sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)]
    : null;
}

export function empiricalDistribution(values: readonly number[]) {
  if (values.some((v) => !Number.isFinite(v)))
    throw new Error('Nonfinite observations cannot enter a reference');
  const sorted = [...values].sort((a, b) => a - b);
  const groups: Array<{ value: number; count: number; cdf: number }> = [];
  for (const value of sorted) {
    const last = groups.at(-1);
    if (last?.value === value) last.count++;
    else groups.push({ value, count: 1, cdf: 0 });
  }
  let count = 0;
  for (const group of groups) {
    count += group.count;
    group.cdf = count / sorted.length;
  }
  return { sorted, groups };
}
