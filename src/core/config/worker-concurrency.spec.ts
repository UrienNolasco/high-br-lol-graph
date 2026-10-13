import { workerConcurrency } from './worker-concurrency';

describe('workerConcurrency', () => {
  it('defaults to one and accepts explicit bounded integers', () => {
    const previous = process.env.WORKER_CONCURRENCY;
    delete process.env.WORKER_CONCURRENCY;
    try {
      expect(workerConcurrency()).toBe(1);
    } finally {
      if (previous !== undefined) process.env.WORKER_CONCURRENCY = previous;
    }
    expect(workerConcurrency('2')).toBe(2);
    expect(workerConcurrency('16')).toBe(16);
  });
  it.each(['0', '-1', '1.5', '', 'NaN', 'Infinity', '17', ' 2', '2x', '02'])(
    'rejects invalid concurrency %j',
    (value) =>
      expect(() => workerConcurrency(value)).toThrow('between 1 and 16'),
  );
});
