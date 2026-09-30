const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  analyzeViolations,
  compareBaseline,
  check,
  areaOf: checkAreaOf,
} = require('./architecture-check.cjs');
const { areaOf: inventoryAreaOf } = require('./architecture-inventory.cjs');

function inspect(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'highbr-architecture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inputs = {
    'tsconfig.json': JSON.stringify({ compilerOptions: {
      module: 'commonjs', target: 'ES2023', baseUrl: '.',
      paths: { '@matches/*': ['src/modules/matches/*'] },
      experimentalDecorators: true, emitDecoratorMetadata: true,
    } }),
    'prisma/schema.prisma': '',
    ...files,
  };
  for (const [file, content] of Object.entries(inputs)) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return analyzeViolations(root);
}

test('area classification keeps technical libraries and studies out of composition', () => {
  const expected = {
    'src/lib/math/per-minute.ts': 'lib/math',
    'src/lib/processing-policy.ts': 'core/lib',
    'src/studies/vision/entrypoint.ts': 'studies',
    'src/composition/online-processing.module.ts': 'composition',
    'src/composition/http/server.ts': 'composition/http',
    'src/main.ts': 'composition/http',
    'src/processing-cli.ts': 'composition/cli',
  };
  for (const [file, area] of Object.entries(expected)) {
    assert.equal(inventoryAreaOf(file), area, `inventory area for ${file}`);
    assert.equal(checkAreaOf(file), area, `checker area for ${file}`);
  }
});

test('studies may consume public contracts but not module internals', t => {
  const result = inspect(t, {
    'src/modules/matches/contracts/normalized-match.ts': 'export interface Match { id: string }',
    'src/modules/matches/domain/private.ts': 'export const value = 1;',
    'src/studies/vision/study.ts': [
      "import type { Match } from '../../modules/matches/contracts/normalized-match';",
      "import { value } from '../../modules/matches/domain/private';",
      'export const study = (match: Match) => match.id + value;',
    ].join('\n'),
  });
  assert.ok(
    result.violations.some(
      violation =>
        violation.rule === 'cross-module-internal-import' &&
        violation.from === 'src/studies/vision/study.ts',
    ),
  );
  assert.ok(
    !result.violations.some(
      violation =>
        violation.rule === 'cross-module-internal-import' &&
        violation.to === 'src/modules/matches/contracts/normalized-match.ts',
    ),
  );
});

test('pure upstream contracts and same-module domain imports are allowed', t => {
  const result = inspect(t, {
    'src/modules/matches/contracts/normalized-match.ts': 'export interface Match { id: string }',
    'src/modules/dataset/domain/build.ts': "import type { Match } from '../../matches/contracts/normalized-match'; export const id = (m: Match) => m.id;",
  });
  assert.deepEqual(result.violations, []);
});

for (const specifier of ['../../modules/matches/contracts/normalized-match', '@matches/contracts/normalized-match']) {
  test(`core ownership is enforced even for type imports: ${specifier}`, t => {
    const result = inspect(t, {
      'src/modules/matches/contracts/normalized-match.ts': 'export interface Match { id: string }',
      'src/core/config/leak.ts': `import type { Match } from '${specifier}'; export type Leaked = Match;`,
    });
    assert.ok(result.violations.length > 0);
  });
}

for (const external of ['@nestjs/common', '@prisma/client', 'axios']) {
  test(`domain cannot import external adapter types from ${external}`, t => {
    const result = inspect(t, {
      'src/modules/matches/domain/leak.ts': `import type { External } from '${external}'; export type Leaked = External;`,
    });
    assert.ok(result.violations.length > 0);
  });
}

test('domain cannot import a Data Dragon transport shape', t => {
  const result = inspect(t, {
    'src/core/data-dragon/catalog-source.ts':
      'export interface RawCatalog { data: unknown }',
    'src/modules/matches/domain/catalog.ts':
      "import type { RawCatalog } from '../../../core/data-dragon/catalog-source'; export type Catalog = RawCatalog;",
  });
  assert.ok(
    result.violations.some(
      violation => violation.rule === 'domain-no-framework-or-adapter',
    ),
  );
});

test('a public contract cannot expose a Data Dragon transport shape', t => {
  const result = inspect(t, {
    'src/core/data-dragon/catalog-source.ts':
      'export interface RawCatalog { data: unknown }',
    'src/modules/matches/contracts/catalog.ts':
      "export type { RawCatalog } from '../../../core/data-dragon/catalog-source';",
  });
  assert.ok(
    result.violations.some(
      violation => violation.rule === 'contract-transitive-purity',
    ),
  );
});

test('private cross-module dependencies are rejected', t => {
  const result = inspect(t, {
    'src/modules/matches/repositories/private.ts': 'export const value = 1;',
    'src/modules/analytics/application/query.ts': "import { value } from '../../matches/repositories/private'; export const query = () => value;",
  });
  assert.ok(result.violations.length > 0);
});

test('public reexports do not expose persistence internals', t => {
  const result = inspect(t, {
    'src/modules/matches/repositories/private.ts': 'export const value = 1;',
    'src/modules/matches/contracts/query.ts': "export * from '../repositories/private';",
    'src/modules/analytics/application/query.ts': "import { value } from '../../matches/contracts/query'; export const query = () => value;",
  });
  assert.ok(result.violations.length > 0);
});

test('production cannot consume test fixtures', t => {
  const result = inspect(t, {
    'src/modules/matches/__fixtures__/match.ts': 'export const fixture = 1;',
    'src/modules/matches/application/query.ts': "import { fixture } from '../__fixtures__/match'; export const query = () => fixture;",
  });
  assert.ok(result.violations.length > 0);
});

test('a module test may exercise its own private implementation', t => {
  const result = inspect(t, {
    'src/modules/matches/domain/calculation.ts': 'export const value = 1;',
    'src/modules/matches/domain/calculation.spec.ts': "import { value } from './calculation'; console.log(value);",
  });
  assert.deepEqual(result.violations, []);
});

test('runtime cycles are rejected even inside the same module', t => {
  const result = inspect(t, {
    'src/modules/matches/domain/a.ts': "import { b } from './b'; export const a = () => b();",
    'src/modules/matches/domain/b.ts': "import { a } from './a'; export const b = () => a();",
  });
  assert.ok(result.violations.some(v => /cycle/i.test(v.rule)));
});

test('type-only recursion does not create a runtime cycle', t => {
  const result = inspect(t, {
    'src/modules/matches/domain/a.ts': "import type { B } from './b'; export interface A { b?: B }",
    'src/modules/matches/domain/b.ts': "import type { A } from './a'; export interface B { a?: A }",
  });
  assert.ok(!result.violations.some(v => /runtime.*cycle|cycle.*runtime/i.test(v.rule)));
});

test('a pure public capability may reexport its own domain implementation', t => {
  const result = inspect(t, {
    'src/modules/matches/domain/calculate.ts': 'export const calculate = (n: number) => n * 2;',
    'src/modules/matches/contracts/calculation.ts': "export { calculate } from '../domain/calculate';",
    'src/modules/dataset/domain/build.ts': "import { calculate } from '../../matches/contracts/calculation'; export const build = () => calculate(2);",
  });
  assert.deepEqual(result.violations, []);
});

test('math cannot depend on match concepts through a public contract', t => {
  const result = inspect(t, {
    'src/modules/matches/contracts/normalized-match.ts': 'export interface Match { id: string }',
    'src/lib/math/leak.ts': "import type { Match } from '../../modules/matches/contracts/normalized-match'; export type Leaked = Match;",
  });
  assert.ok(result.violations.length > 0);
});

test('baseline comparison distinguishes a new violation from a retired one', () => {
  const current = [{ id: 'current', rule: 'test-rule', from: 'a', to: 'b' }];
  const previous = [{ id: 'retired', rule: 'test-rule', from: 'a', to: 'c', owner: 'matches', removalCard: 'ARQ-06' }];
  const result = compareBaseline(current, previous);
  assert.equal(result.newViolations.length, 1);
  assert.equal(result.staleEntries.length, 1);
  assert.equal(result.matchedEntries.length, 0);
});

test('type reexports through an alias preserve the ownership restriction', t => {
  const result = inspect(t, {
    'src/modules/matches/contracts/normalized-match.ts': 'export interface Match { id: string }',
    'src/core/config/reexport.ts': "export type { Match } from '@matches/contracts/normalized-match';",
  });
  assert.ok(result.violations.length > 0);
});

test('domain cannot launder an external adapter through a public contract', t => {
  const result = inspect(t, {
    'src/modules/matches/contracts/client.ts': "export type { PrismaClient } from '@prisma/client';",
    'src/modules/dataset/domain/build.ts': "import type { PrismaClient } from '../../matches/contracts/client'; export type Client = PrismaClient;",
  });
  assert.ok(result.violations.length > 0);
});

test('violation identity does not depend on source line numbers', t => {
  const files = {
    'src/modules/matches/contracts/normalized-match.ts': 'export interface Match { id: string }',
    'src/core/config/leak.ts': "import type { Match } from '@matches/contracts/normalized-match'; export type Leaked = Match;",
  };
  const before = inspect(t, files).violations.map(v => v.id).sort();
  const after = inspect(t, { ...files, 'src/core/config/leak.ts': '\n\n' + files['src/core/config/leak.ts'] }).violations.map(v => v.id).sort();
  assert.ok(before.length > 0);
  assert.deepEqual(before, after);
});

test('public naming does not allow matches to depend on analytics', t => {
  const result = inspect(t, {
    'src/modules/analytics/contracts/query.ts': 'export interface Query { id: string }',
    'src/modules/matches/application/query.ts': "import type { Query } from '../../analytics/contracts/query'; export type MatchQuery = Query;",
  });
  assert.ok(result.violations.length > 0);
});

test('module composition may wire a permitted upstream Nest module', t => {
  const result = inspect(t, {
    'src/modules/matches/matches.module.ts': 'export class MatchesModule {}',
    'src/modules/dataset/dataset.module.ts': "import { MatchesModule } from '../matches/matches.module'; export const imports = [MatchesModule];",
  });
  assert.deepEqual(result.violations, []);
});

test('domain cannot use the Nest module entrypoint exception', t => {
  const result = inspect(t, {
    'src/modules/matches/matches.module.ts': 'export class MatchesModule {}',
    'src/modules/dataset/domain/build.ts': "import { MatchesModule } from '../../matches/matches.module'; export const imports = [MatchesModule];",
  });
  assert.ok(result.violations.length > 0);
});

test('a previously empty baseline cannot grow to whitelist a regression', t => {
  const { inventory, violations } = inspect(t, {
    'src/modules/matches/contracts/normalized-match.ts': 'export interface Match { id: string }',
    'src/core/config/leak.ts': "import type { Match } from '@matches/contracts/normalized-match'; export type Leaked = Match;",
  });
  const result = check(os.tmpdir(), { inventory, baseline: violations, historicalBaseline: [] });
  assert.ok(result.baselineGrowth.length > 0);
  assert.equal(result.ok, false);
});

test('strict mode accepts a clean graph and zero exceptions', t => {
  const { inventory } = inspect(t, {
    'src/modules/matches/domain/clean.ts': 'export const identity = (n: number) => n;',
  });
  const result = check(os.tmpdir(), { inventory, baseline: [], strict: true });
  assert.equal(result.ok, true);
});

test('baseline entries require a concrete removal card and an owner', () => {
  const violation = { id: 'existing', rule: 'test-rule', from: 'a', to: 'b' };
  const result = compareBaseline([violation], [{ ...violation, removalCard: 'ARQ-03..13' }]);
  assert.equal(result.invalidEntries.length, 1);
});

test('math cannot import framework or ORM types', t => {
  const result = inspect(t, {
    'src/lib/math/leak.ts': "import type { PrismaClient } from '@prisma/client'; export type MathClient = PrismaClient;",
  });
  assert.ok(result.violations.length > 0);
});
