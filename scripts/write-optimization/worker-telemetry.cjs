// Validation-only preload; persistence and dependency injection are untouched.
const fs = require('node:fs');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();
const forbid = () => {
  throw Error('External HTTP forbidden in stored-raw validation');
};
require('node:http').request = forbid;
require('node:https').request = forbid;
global.fetch = forbid;
let previous = process.cpuUsage();
setInterval(() => {
  const usage = process.cpuUsage(previous);
  previous = process.cpuUsage();
  console.log(
    JSON.stringify({
      event: 'validation_runtime',
      time: Date.now(),
      node: process.version,
      cpuMs: (usage.user + usage.system) / 1000,
      ...process.memoryUsage(),
      eventLoopP99Ms: loop.percentile(99) / 1e6,
      cgroupMemoryBytes: Number(
        fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8'),
      ),
      cgroupMemoryPeakBytes: Number(
        fs.readFileSync('/sys/fs/cgroup/memory.peak', 'utf8'),
      ),
    }),
  );
  loop.reset();
}, 10000).unref();
