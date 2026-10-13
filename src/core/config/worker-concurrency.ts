/** One shared limit for RMQ prefetch and both worker delivery patterns. */
export function workerConcurrency(
  value = process.env.WORKER_CONCURRENCY,
): number {
  if (value === undefined) return 1;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 16)
    throw new Error('WORKER_CONCURRENCY must be an integer between 1 and 16');
  return Number(value);
}
