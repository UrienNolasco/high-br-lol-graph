const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { analyzeViolations, check } = require('./architecture-check.cjs');
const { validateRelocations } = require('./architecture-relocations.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'highbr-relocation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
  };
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const oldPath = 'src/core/riot/example.ts';
  const newPath = 'src/modules/matches/contracts/normalized-events.ts';
  const consumer = 'src/core/dataset/use.ts';
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { target: 'ES2023', module: 'commonjs' },
    }),
  );
  write('prisma/schema.prisma', '');
  write(oldPath, 'export interface Event { timestampMs: number | null }');
  write(
    consumer,
    "import type { Event } from '../riot/example'; export type UsedEvent = Event;",
  );
  git('init', '-q');
  git('add', '.');
  git(
    '-c',
    'user.name=Architecture test',
    '-c',
    'user.email=architecture@example.invalid',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-qm',
    'original declarations',
  );
  const originSha = git('rev-parse', 'HEAD');
  write(newPath, 'export interface Event { timestampMs: number | null }');
  write(
    oldPath,
    "export type { Event } from '../../modules/matches/contracts/normalized-events';",
  );
  write(
    consumer,
    "import type { Event } from '../../modules/matches/contracts/normalized-events'; export type UsedEvent = Event;",
  );
  const ledger = {
    schemaVersion: 1,
    originSha,
    entries: [
      {
        oldPath,
        newPath,
        symbols: ['Event'],
        consumers: [
          {
            from: consumer,
            kinds: ['type'],
            symbols: ['Event'],
            owner: 'dataset',
            removalCard: 'ARQ-07',
          },
          {
            from: oldPath,
            kinds: ['type'],
            symbols: ['Event'],
            owner: 'matches',
            removalCard: 'ARQ-05',
          },
        ],
      },
    ],
  };
  return { root, write, ledger, oldPath, newPath, consumer };
}

test('verified extraction preserves logical boundary identity and reports its bridges', (t) => {
  const f = fixture(t);
  assert.deepEqual(validateRelocations(f.root, f.ledger).errors, []);
  const result = analyzeViolations(f.root, { relocations: f.ledger });
  assert.deepEqual(result.violations, []);
  assert.ok(result.transitionalDebt.length > 0);
});

test('a new consumer is not authorized by an existing relocation', (t) => {
  const f = fixture(t);
  f.write(
    'src/core/riot/unlisted.ts',
    "import type { Event } from '../../modules/matches/contracts/normalized-events'; export type Extra = Event;",
  );
  const result = analyzeViolations(f.root, { relocations: f.ledger });
  assert.ok(
    result.violations.some((v) => v.from === 'src/core/riot/unlisted.ts'),
  );
});

test('a type bridge cannot authorize runtime imports', (t) => {
  const f = fixture(t);
  f.write(
    f.consumer,
    "import { Event } from '../../modules/matches/contracts/normalized-events'; export const value = Event;",
  );
  const result = check(f.root, { relocations: f.ledger, baseline: [] });
  assert.equal(result.ok, false);
});

test('changing the ledger itself cannot turn an original type import into runtime', (t) => {
  const f = fixture(t);
  f.write(
    f.consumer,
    "import { Event } from '../../modules/matches/contracts/normalized-events'; export const value = Event;",
  );
  f.ledger.entries[0].consumers[0].kinds = ['runtime'];
  assert.ok(validateRelocations(f.root, f.ledger).errors.length > 0);
});

test('a relocation cannot leave a second declaration at the old path', (t) => {
  const f = fixture(t);
  f.write(f.oldPath, 'export interface Event { timestampMs: number | null }');
  assert.ok(validateRelocations(f.root, f.ledger).errors.length > 0);
});

test('the new contract must export every declared transferred symbol', (t) => {
  const f = fixture(t);
  f.write(
    f.newPath,
    'export interface DifferentEvent { timestampMs: number | null }',
  );
  assert.ok(validateRelocations(f.root, f.ledger).errors.length > 0);
});

test('a relocation must prove its origin in Git', (t) => {
  const f = fixture(t);
  f.ledger.originSha = '0000000000000000000000000000000000000000';
  assert.ok(validateRelocations(f.root, f.ledger).errors.length > 0);
});

test('listing a symbol absent from the original declaration fails', (t) => {
  const f = fixture(t);
  f.ledger.entries[0].symbols.push('NewSymbol');
  assert.ok(validateRelocations(f.root, f.ledger).errors.length > 0);
});

test('strict mode rejects even valid transitional bridges', (t) => {
  const f = fixture(t);
  assert.equal(
    check(f.root, { relocations: f.ledger, baseline: [], strict: true }).ok,
    false,
  );
});

test('an unlisted edge cannot hide inside a reciprocal pair covered by other bridges', (t) => {
  const f = fixture(t);
  f.write(
    'src/modules/matches/adapters/riot/read.ts',
    "import type { Event } from '../../../../core/riot/example'; export type Read = Event;",
  );
  f.write(
    'src/core/riot/unlisted.ts',
    "import type { Event } from '../../modules/matches/contracts/normalized-events'; export type Extra = Event;",
  );
  const result = analyzeViolations(f.root, { relocations: f.ledger });
  assert.ok(result.violations.some((v) => v.rule === 'area-reciprocity'));
});
