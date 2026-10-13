// Real transport comparisons followed by the sustained selected configuration.
// Requires the isolated dependencies documented in report.md and a built runtime image.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
process.chdir(root);
const run = (label, options) => {
  const output = `docs/analysis/write-optimization/${label}.json`;
  console.log(new Date().toISOString(), label);
  const log = fs.openSync(`.tmp/write-optimization/${label}.log`, 'w');
  try {
    execFileSync(
      'taskset',
      [
        '-c',
        '6,8',
        'node',
        'scripts/write-optimization/real-worker.cjs',
        '.tmp/architecture-study-corpus',
        output,
        ...options,
      ],
      { stdio: ['ignore', log, log] },
    );
  } finally {
    fs.closeSync(log);
  }
  const result = JSON.parse(fs.readFileSync(output));
  console.log(
    JSON.stringify({
      label,
      throughput: result.throughput,
      errors: result.errors.length,
      responseMs: result.responseMs,
    }),
  );
};
for (const [label, workers, slots] of [
  ['real-2x1', 2, 1],
  ['real-2x2-1', 2, 2],
  ['real-4x1-1', 4, 1],
  ['real-4x1-2', 4, 1],
  ['real-2x2-2', 2, 2],
]) {
  run(label, [
    '--count=119',
    '--rates=0',
    `--workers=${workers}`,
    `--slots=${slots}`,
    '--reads=0',
  ]);
}
run('soak-30m', [
  '--seconds=1800',
  '--rates=1,1.5,2',
  '--workers=2',
  '--slots=2',
  '--shutdown-probe=1',
]);
