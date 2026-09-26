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
  return { root, write, git, ledger, oldPath, newPath, consumer };
}

function amendOrigin(f, files) {
  f.git('reset', '--hard', 'HEAD');
  for (const [file, source] of Object.entries(files)) f.write(file, source);
  f.git('add', '.');
  f.git(
    '-c',
    'user.name=Architecture test',
    '-c',
    'user.email=architecture@example.invalid',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--amend',
    '-qm',
    'original declarations',
  );
  f.ledger.originSha = f.git('rev-parse', 'HEAD');
}

function addInternalAdapterRelocation(f, extraConsumers = []) {
  const oldAdapter = 'src/modules/worker/pure/parser.ts';
  const newAdapter = 'src/modules/matches/adapters/riot/parser.ts';
  const workerConsumer = 'src/modules/worker/services/use.ts';
  amendOrigin(f, {
    [oldAdapter]: 'export function parse() { return 1; }',
    [workerConsumer]:
      "import { parse } from '../pure/parser'; export const value = parse();",
    ...Object.fromEntries(
      extraConsumers.map(({ from, originSource }) => [from, originSource]),
    ),
  });
  f.write(f.newPath, 'export interface Event { timestampMs: number | null }');
  f.write(
    f.oldPath,
    "export type { Event } from '../../modules/matches/contracts/normalized-events';",
  );
  f.write(
    f.consumer,
    "import type { Event } from '../../modules/matches/contracts/normalized-events'; export type UsedEvent = Event;",
  );
  fs.rmSync(path.join(f.root, oldAdapter));
  f.write(newAdapter, 'export function parse() { return 1; }');
  f.write(
    workerConsumer,
    "import { parse } from '../../matches/adapters/riot/parser'; export const value = parse();",
  );
  for (const consumer of extraConsumers)
    f.write(consumer.from, consumer.source);
  f.ledger.entries.push({
    oldPath: oldAdapter,
    newPath: newAdapter,
    symbols: ['parse'],
    consumers: [
      {
        from: workerConsumer,
        kinds: ['runtime'],
        symbols: ['parse'],
        owner: 'worker',
        removalCard: 'ARQ-10',
      },
      ...extraConsumers.map(({ from }) => ({
        from,
        kinds: ['runtime'],
        symbols: ['parse'],
        owner: 'matches',
        removalCard: 'ARQ-10',
      })),
    ],
  });
  return { newAdapter, workerConsumer };
}

function addProviderCompositionRelocation(f) {
  const oldProvider = 'src/core/riot/parser.service.ts';
  const newProvider = 'src/modules/matches/adapters/riot/parser.service.ts';
  const oldModule = 'src/core/riot/riot.module.ts';
  const newModule = 'src/modules/matches/match-normalization.module.ts';
  const consumer = 'src/modules/worker/worker.module.ts';
  amendOrigin(f, {
    [oldProvider]: 'export class ParserService {}',
    [oldModule]:
      "import { Module } from '@nestjs/common'; import { ParserService } from './parser.service'; @Module({ providers: [ParserService], exports: [ParserService] }) export class RiotModule {}",
    [consumer]:
      "import { Module } from '@nestjs/common'; import { RiotModule } from '../../core/riot/riot.module'; @Module({ imports: [RiotModule] }) export class WorkerModule {}",
  });
  f.write(f.newPath, 'export interface Event { timestampMs: number | null }');
  f.write(
    f.oldPath,
    "export type { Event } from '../../modules/matches/contracts/normalized-events';",
  );
  f.write(
    f.consumer,
    "import type { Event } from '../../modules/matches/contracts/normalized-events'; export type UsedEvent = Event;",
  );
  f.write(newProvider, 'export class ParserService {}');
  f.write(
    newModule,
    "import { Module } from '@nestjs/common'; import { ParserService } from './adapters/riot/parser.service'; @Module({ providers: [ParserService], exports: [ParserService] }) export class MatchNormalizationModule {}",
  );
  f.write(
    consumer,
    "import { Module } from '@nestjs/common'; import { MatchNormalizationModule } from '../matches/match-normalization.module'; @Module({ imports: [MatchNormalizationModule] }) export class WorkerModule {}",
  );
  f.ledger.entries.push({
    kind: 'provider-composition',
    oldPath: oldModule,
    newPath: newModule,
    symbols: ['MatchNormalizationModule'],
    originSymbols: { MatchNormalizationModule: 'RiotModule' },
    provider: {
      symbol: 'ParserService',
      oldPath: oldProvider,
      newPath: newProvider,
    },
    consumers: [
      {
        from: consumer,
        kinds: ['runtime'],
        symbols: ['MatchNormalizationModule'],
        owner: 'worker',
        removalCard: 'ARQ-10',
      },
    ],
  });
  return { consumer, newModule };
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

test('the new public contract may use a proven named reexport', (t) => {
  const f = fixture(t);
  f.write(
    'src/modules/matches/domain/normalized-event.ts',
    'export interface Event { timestampMs: number | null }',
  );
  f.write(
    f.newPath,
    "export type { Event } from '../domain/normalized-event';",
  );
  assert.deepEqual(validateRelocations(f.root, f.ledger).errors, []);
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

test('a renamed declaration requires an explicit proven origin symbol', (t) => {
  const f = fixture(t);
  f.write(
    f.newPath,
    'export interface RenamedEvent { timestampMs: number | null }',
  );
  f.write(
    f.oldPath,
    "export type { RenamedEvent } from '../../modules/matches/contracts/normalized-events';",
  );
  f.write(
    f.consumer,
    "import type { RenamedEvent } from '../../modules/matches/contracts/normalized-events'; export type UsedEvent = RenamedEvent;",
  );
  const entry = f.ledger.entries[0];
  entry.symbols = ['RenamedEvent'];
  entry.originSymbols = { RenamedEvent: 'Event' };
  for (const consumer of entry.consumers) consumer.symbols = ['RenamedEvent'];
  assert.deepEqual(validateRelocations(f.root, f.ledger).errors, []);
  entry.originSymbols.RenamedEvent = 'UnprovenEvent';
  assert.ok(
    validateRelocations(f.root, f.ledger).errors.some(
      (error) => error.code === 'origin-symbol-not-declared',
    ),
  );
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

test('one origin file may be split into disjoint declaration relocations', (t) => {
  const f = fixture(t);
  const secondPath = 'src/modules/matches/contracts/other.ts';
  const secondConsumer = 'src/core/dataset/other.ts';
  amendOrigin(f, {
    [f.oldPath]:
      'export interface Event { timestampMs: number | null } export interface Other { value: number }',
    [secondConsumer]:
      "import type { Other } from '../riot/example'; export type UsedOther = Other;",
  });
  f.write(f.newPath, 'export interface Event { timestampMs: number | null }');
  f.write(secondPath, 'export interface Other { value: number }');
  f.write(
    f.oldPath,
    "export type { Event } from '../../modules/matches/contracts/normalized-events'; export type { Other } from '../../modules/matches/contracts/other';",
  );
  f.write(
    f.consumer,
    "import type { Event } from '../../modules/matches/contracts/normalized-events'; export type UsedEvent = Event;",
  );
  f.write(
    secondConsumer,
    "import type { Other } from '../../modules/matches/contracts/other'; export type UsedOther = Other;",
  );
  f.ledger.entries.push({
    oldPath: f.oldPath,
    newPath: secondPath,
    symbols: ['Other'],
    consumers: [
      {
        from: secondConsumer,
        kinds: ['type'],
        symbols: ['Other'],
        owner: 'dataset',
        removalCard: 'ARQ-07',
      },
    ],
  });
  assert.deepEqual(validateRelocations(f.root, f.ledger).errors, []);
});

test('relocations sharing an endpoint cannot overlap symbols', (t) => {
  const f = fixture(t);
  f.ledger.entries.push({
    ...f.ledger.entries[0],
    consumers: f.ledger.entries[0].consumers.map((consumer) => ({
      ...consumer,
    })),
  });
  assert.ok(
    validateRelocations(f.root, f.ledger).errors.some(
      (error) => error.code === 'overlapping-relocation',
    ),
  );
});

test('an origin consumer may reach a declaration through a proven reexport barrel', (t) => {
  const f = fixture(t);
  const barrel = 'src/core/riot/index.ts';
  amendOrigin(f, {
    [barrel]: "export * from './example';",
    [f.consumer]:
      "import type { Event } from '../riot'; export type UsedEvent = Event;",
  });
  f.write(f.newPath, 'export interface Event { timestampMs: number | null }');
  f.write(
    f.oldPath,
    "export type { Event } from '../../modules/matches/contracts/normalized-events';",
  );
  f.write(
    f.consumer,
    "import type { Event } from '../../modules/matches/contracts/normalized-events'; export type UsedEvent = Event;",
  );
  assert.deepEqual(validateRelocations(f.root, f.ledger).errors, []);
});

test('an unrelated origin barrel cannot prove a declaration relocation', (t) => {
  const f = fixture(t);
  const barrel = 'src/core/riot/index.ts';
  const unrelated = 'src/core/riot/unrelated.ts';
  amendOrigin(f, {
    [unrelated]: 'export interface Event { other: boolean }',
    [barrel]: "export * from './unrelated';",
    [f.consumer]:
      "import type { Event } from '../riot'; export type UsedEvent = Event;",
  });
  f.write(f.newPath, 'export interface Event { timestampMs: number | null }');
  f.write(
    f.oldPath,
    "export type { Event } from '../../modules/matches/contracts/normalized-events';",
  );
  f.write(
    f.consumer,
    "import type { Event } from '../../modules/matches/contracts/normalized-events'; export type UsedEvent = Event;",
  );
  assert.ok(
    validateRelocations(f.root, f.ledger).errors.some(
      (error) => error.code === 'origin-consumer-kind-mismatch',
    ),
  );
});

test('a proven internal adapter move preserves ownership only for its original consumer', (t) => {
  const f = fixture(t);
  const { newAdapter } = addInternalAdapterRelocation(f);
  let result = analyzeViolations(f.root, { relocations: f.ledger });
  assert.equal(
    result.violations.some(
      (violation) =>
        violation.rule === 'cross-module-internal-import' &&
        violation.to === newAdapter,
    ),
    false,
  );
  f.write(
    'src/modules/worker/services/unlisted.ts',
    "import { parse } from '../../matches/adapters/riot/parser'; export const extra = parse();",
  );
  result = analyzeViolations(f.root, { relocations: f.ledger });
  assert.ok(
    result.violations.some(
      (violation) =>
        violation.rule === 'cross-module-internal-import' &&
        violation.from === 'src/modules/worker/services/unlisted.ts' &&
        violation.to === newAdapter,
    ),
  );
});

test('an adapter relocation never relaxes domain purity against its physical target', (t) => {
  const f = fixture(t);
  const domainConsumer = 'src/modules/matches/pure/use.ts';
  const { newAdapter } = addInternalAdapterRelocation(f, [
    {
      from: domainConsumer,
      originSource:
        "import { parse } from '../../worker/pure/parser'; export const value = parse();",
      source:
        "import { parse } from '../adapters/riot/parser'; export const value = parse();",
    },
  ]);
  const result = analyzeViolations(f.root, { relocations: f.ledger });
  assert.ok(
    result.violations.some(
      (violation) =>
        violation.rule === 'domain-no-framework-or-adapter' &&
        violation.from === domainConsumer &&
        violation.to === newAdapter,
    ),
  );
});

test('a CommonJS tool bridge proves its exact destructured runtime binding', (t) => {
  const f = fixture(t);
  const tool = 'scripts/use.cjs';
  const { newAdapter } = addInternalAdapterRelocation(f, [
    {
      from: tool,
      originSource:
        "const { parse } = require('../src/modules/worker/pure/parser'); module.exports = parse();",
      source:
        "const { parse } = require('../src/modules/matches/adapters/riot/parser'); module.exports = parse();",
    },
  ]);
  const validation = validateRelocations(f.root, f.ledger);
  assert.deepEqual(validation.errors, []);
  const result = analyzeViolations(f.root, { relocations: f.ledger });
  assert.equal(
    result.violations.some(
      (violation) => violation.from === tool && violation.to === newAdapter,
    ),
    false,
  );
  f.write(
    tool,
    "const { unexpected } = require('../src/modules/matches/adapters/riot/parser'); module.exports = unexpected();",
  );
  assert.ok(validateRelocations(f.root, f.ledger).errors.length > 0);
});

test('a provider composition move proves both Nest module registrations', (t) => {
  const f = fixture(t);
  addProviderCompositionRelocation(f);
  assert.deepEqual(validateRelocations(f.root, f.ledger).errors, []);
});

test('a provider composition move rejects a missing provider registration', (t) => {
  const f = fixture(t);
  const { newModule } = addProviderCompositionRelocation(f);
  f.write(
    newModule,
    "import { Module } from '@nestjs/common'; import { ParserService } from './adapters/riot/parser.service'; @Module({ providers: [], exports: [ParserService] }) export class MatchNormalizationModule {}",
  );
  assert.ok(
    validateRelocations(f.root, f.ledger).errors.some(
      (error) => error.code === 'provider-composition-mismatch',
    ),
  );
});

test('a provider composition move rejects an extra provider', (t) => {
  const f = fixture(t);
  const { newModule } = addProviderCompositionRelocation(f);
  f.write(
    newModule,
    "import { Module } from '@nestjs/common'; import { ParserService } from './adapters/riot/parser.service'; class ExtraProvider {} @Module({ providers: [ParserService, ExtraProvider], exports: [ParserService] }) export class MatchNormalizationModule {}",
  );
  assert.ok(
    validateRelocations(f.root, f.ledger).errors.some(
      (error) => error.code === 'provider-composition-expanded',
    ),
  );
});

test('a provider composition move does not authorize an extra module consumer', (t) => {
  const f = fixture(t);
  const { newModule } = addProviderCompositionRelocation(f);
  const extra = 'src/modules/worker/extra.module.ts';
  f.write(
    extra,
    "import { Module } from '@nestjs/common'; import { MatchNormalizationModule } from '../matches/match-normalization.module'; @Module({ imports: [MatchNormalizationModule] }) export class ExtraModule {}",
  );
  const result = analyzeViolations(f.root, { relocations: f.ledger });
  assert.ok(
    result.violations.some(
      (violation) => violation.from === extra && violation.to === newModule,
    ),
  );
});

test('strict mode rejects a provider composition bridge', (t) => {
  const f = fixture(t);
  addProviderCompositionRelocation(f);
  f.ledger.entries = [f.ledger.entries.at(-1)];
  assert.equal(
    check(f.root, { relocations: f.ledger, baseline: [], strict: true }).ok,
    false,
  );
});
