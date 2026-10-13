// Derive presentation metrics from the completed real-worker artifacts.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.argv[2] || 'docs/analysis/write-optimization';
const quantiles = (values) => {
  const sorted = values.slice().sort((a, b) => a - b);
  const at = (p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
  return { n: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) ?? null };
};
const read = (name) => {
  const report = JSON.parse(fs.readFileSync(path.join(directory, name + '.json')));
  assert(report.finishedAt && !report.failure, 'Incomplete or failed run: ' + name);
  return report;
};
const resources = (report, start, end) => {
  const workers = report.containers.filter((c) => !c.api).map((c) => c.name);
  return Object.fromEntries(workers.map((name) => {
    const samples = report.runtime.filter((r) => r.container === name && r.time - report.measuredAt >= start && r.time - report.measuredAt < end);
    return [name, {
      samples: samples.length,
      // Interval CPU is approximate: first/last intervals overlap the boundary.
      approximateCpuPercentOfOneCore: samples.length ? samples.reduce((sum, r) => sum + r.cpuMs, 0) / (samples.length * 100) : null,
      rssMiB: quantiles(samples.map((r) => r.rss / 1048576)),
      heapUsedMiB: quantiles(samples.map((r) => r.heapUsed / 1048576)),
      cgroupMiB: quantiles(samples.map((r) => r.cgroupMemoryBytes / 1048576)),
      cgroupLifetimePeakMiB: Math.max(0, ...samples.map((r) => r.cgroupMemoryPeakBytes / 1048576)),
      eventLoopIntervalP99Ms: quantiles(samples.map((r) => r.eventLoopP99Ms)),
    }];
  }));
};
const bursts = ['real-2x1', 'real-2x2-1', 'real-4x1-1', 'real-4x1-2', 'real-2x2-2'].map((name) => {
  const r = read(name);
  return { name, throughput: r.throughput, serviceMs: r.serviceMs, errors: r.errors.length, maxActive: r.maxActive, resources: resources(r, 0, Infinity) };
});
const soak = read('soak-30m');
const span = soak.options.seconds * 1000 / soak.options.rates.length;
const stages = soak.options.rates.map((rate, index) => {
  const start = span * index, end = span * (index + 1);
  const within = (ms) => ms >= start && ms < end;
  const jobs = soak.completed.filter((r) => soak.arrivals[r.matchId] !== undefined && within(soak.arrivals[r.matchId] - soak.measuredAt));
  const samples = soak.samples.filter((s) => within(s.atMs));
  const reads = soak.reads.filter((r) => within(r.atMs));
  const first = samples[0], last = samples.at(-1);
  return {
    offeredRate: rate, startSeconds: start / 1000, endSeconds: end / 1000,
    newlyProcessed: jobs.length,
    responseMs: quantiles(jobs.map((r) => r.time - soak.arrivals[r.matchId])),
    serviceMs: quantiles(jobs.map((r) => r.duration)),
    oldestPendingMs: quantiles(samples.map((s) => s.oldestPendingMs)),
    brokerReady: quantiles(samples.map((s) => s.queue.messageCount)),
    lockWaiters: quantiles(samples.map((s) => s.database.locks)),
    readMs: quantiles(reads.map((r) => r.ms)), readErrors: reads.filter((r) => r.status !== 200 || r.error).length,
    postgresCpuPercentOfTwoCores: first && last && first !== last ? (last.postgresResources.usage_usec - first.postgresResources.usage_usec) / ((last.atMs - first.atMs) * 1000 * 2) * 100 : null,
    postgresMemoryMiB: quantiles(samples.map((s) => s.postgresResources.memoryBytes / 1048576)),
    resources: resources(soak, start, end),
  };
});
const result = {
  generatedAt: new Date().toISOString(),
  notes: ['CPU telemetry uses approximately 10-second intervals.', 'Queue and locks are point samples, not complete wait-duration traces.', 'RSS/cgroup peaks are sampled or lifetime peaks as labeled; sums of per-process peaks are not simultaneous peaks.', 'Four warm IDs are redelivered and excluded from newly processed counts; shutdown probe is excluded from load statistics.'],
  bursts,
  soak: {
    seconds: (soak.drainedAt - soak.measuredAt) / 1000,
    counts: soak.counts, jobStates: soak.jobStates, errors: soak.errors,
    responseMs: soak.responseMs, readMs: soak.readMs, maxActive: soak.maxActive,
    stages, shutdown: soak.shutdown, shutdownProbe: soak.shutdownProbe,
    finalSample: soak.samples.at(-1),
    finalStageWindows: Array.from({ length: 5 }, (_, i) => ({ startSeconds: 1200 + i * 120, resources: resources(soak, 1200000 + i * 120000, 1320000 + i * 120000) })),
  },
};
fs.writeFileSync(path.join(directory, 'real-summary.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ bursts: bursts.map(({ name, throughput }) => ({ name, throughput })), stages: stages.map(({ resources, ...rest }) => rest) }, null, 2));
