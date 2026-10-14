#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(
  new URL('../../test/integration/match-review-corpus.mjs', import.meta.url),
);
const result = spawnSync(process.execPath, [runner, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
if (result.error)
  process.stderr.write(`Validation failed: ${result.error.message}\n`);
process.exitCode = result.status ?? 1;
