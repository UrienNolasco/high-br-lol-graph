#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { analyze } = require('./architecture-inventory.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');
const DEFAULT_RULES_PATH = path.join(
  REPOSITORY_ROOT,
  'docs/architecture/rules.json',
);
const DEFAULT_BASELINE_PATH = path.join(
  REPOSITORY_ROOT,
  'docs/architecture/violations-baseline.json',
);

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const patterns = (values = []) => values.map((value) => new RegExp(value));
const matchesAny = (value, regexes) =>
  regexes.some((regex) => regex.test(value));
const moduleName = (file) => /^src\/modules\/([^/]+)\//.exec(file)?.[1] || null;
const identityTarget = (edge) => edge.resolved || `external:${edge.specifier}`;

function loadRules(value) {
  if (!value) return readJson(DEFAULT_RULES_PATH);
  if (typeof value === 'string') return readJson(path.resolve(value));
  return value;
}

function ruleMap(rules) {
  return new Map(rules.rules.map((rule) => [rule.id, rule]));
}

function remediation(rule, from = '', to = '') {
  const coreArea = from.match(/^src\/core\/([^/]+)/)?.[1];
  const moduleArea = from.match(/^src\/modules\/([^/]+)/)?.[1];
  const area = coreArea
    ? `core/${coreArea}`
    : moduleArea ||
      (from.startsWith('scripts/') ? 'studies/tools' : 'architecture');
  let card = 'ARQ-13';
  if (rule.id === 'core-no-modules') {
    if (from.startsWith('src/core/dataset/')) card = 'ARQ-07';
    else if (from.startsWith('src/core/stats/')) card = 'ARQ-08';
    else if (from.startsWith('src/core/processing/')) card = 'ARQ-10';
    else if (from.startsWith('src/core/research/')) card = 'ARQ-12';
  } else if (rule.id === 'area-reciprocity') {
    if (from.includes('analytics') && to.includes('matches')) card = 'ARQ-06';
    else if (from.includes('core/dataset')) card = 'ARQ-07';
    else if (from.includes('core/stats')) card = 'ARQ-08';
    else if (from.includes('core/processing')) card = 'ARQ-10';
  } else if (
    from.startsWith('scripts/') ||
    from.startsWith('src/core/research/')
  ) {
    card = 'ARQ-12';
  } else if (
    rule.id === 'contract-transitive-purity' &&
    from.startsWith('src/core/metrics/')
  ) {
    card = 'ARQ-04';
  } else if (from.includes('/indicators/') && to.includes('/core/dataset/')) {
    card = 'ARQ-12';
  } else if (
    rule.id === 'test-cross-context-internal-import' &&
    from.includes('/matches/') &&
    to.includes('/worker/')
  ) {
    card = 'ARQ-03';
  } else if (to.includes('/core/metrics/')) {
    card = 'ARQ-04';
  } else if (from.includes('/worker/pure/')) {
    card = 'ARQ-03';
  } else if (
    rule.id === 'contract-transitive-purity' &&
    from.includes('/references/')
  ) {
    card = 'ARQ-12';
  } else if (to.includes('/core/riot/') || to.includes('/core/data-dragon/')) {
    card = 'ARQ-05';
  } else if (
    to.includes('/core/metrics/') ||
    to.includes('/core/statistics/')
  ) {
    card = 'ARQ-04';
  } else if (
    (from.includes('/analytics/') && to.includes('/matches/')) ||
    (from.includes('/matches/') && to.includes('/analytics/'))
  ) {
    card = 'ARQ-06';
  } else if (rule.id === 'math-no-domain') {
    card = 'ARQ-04';
  } else if (
    rule.id === 'domain-no-framework-or-adapter' &&
    to.includes('/core/processing/')
  ) {
    card = 'ARQ-04';
  }
  return { owner: area, removalCard: card };
}

function violationFactory(rules) {
  const definitions = ruleMap(rules);
  return (ruleId, fields, stableParts) => {
    const definition = definitions.get(ruleId);
    if (!definition) throw new Error(`Unknown architecture rule: ${ruleId}`);
    const canonical = [ruleId, ...stableParts].join('\n');
    const id = `${ruleId}:${crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 20)}`;
    return {
      id,
      rule: ruleId,
      description: definition.description,
      ...remediation(definition, fields.from, fields.to),
      ...fields,
    };
  };
}

function analyzeViolations(root = REPOSITORY_ROOT, options = {}) {
  root = path.resolve(root);
  const rules = loadRules(options.rules);
  const inventory = options.inventory || analyze(root, { live: true });
  const make = violationFactory(rules);
  const publicApis = patterns(rules.publicApiPatterns);
  const contracts = patterns(rules.contractPatterns);
  const domains = patterns(rules.domainPatterns);
  const integrationTests = patterns(rules.testIntegrationPatterns);
  const fixtures = patterns(rules.fixturePatterns);
  const forbiddenDomainPackages = patterns(rules.forbiddenDomainPackages);
  const forbiddenDomainPaths = patterns(rules.forbiddenDomainPaths);
  const forbiddenContractPaths = patterns(rules.forbiddenContractPaths);
  const allowedModuleDependencies = rules.allowedModuleDependencies || {};
  const files = new Map(inventory.files.map((file) => [file.file, file]));
  const outgoing = new Map();
  for (const edge of inventory.imports) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge);
  }
  const violations = [];

  for (const edge of inventory.imports) {
    const source = files.get(edge.from);
    if (!source) continue;
    const target = edge.resolved;
    const targetRecord = target ? files.get(target) : null;
    const to = identityTarget(edge);

    if (
      source.scope === 'production' &&
      edge.from.startsWith('src/core/') &&
      target?.startsWith('src/modules/')
    ) {
      violations.push(
        make(
          'core-no-modules',
          { from: edge.from, to, line: edge.line, kinds: edge.kinds },
          [edge.from, to],
        ),
      );
    }

    if (source.scope === 'production' && matchesAny(edge.from, domains)) {
      const forbidden = target
        ? matchesAny(target, forbiddenDomainPaths)
        : matchesAny(edge.specifier, forbiddenDomainPackages);
      if (forbidden)
        violations.push(
          make(
            'domain-no-framework-or-adapter',
            { from: edge.from, to, line: edge.line, kinds: edge.kinds },
            [edge.from, to],
          ),
        );
    }

    const sourceModule = moduleName(edge.from);
    const targetModule = target ? moduleName(target) : null;
    if (sourceModule && targetModule && sourceModule !== targetModule) {
      const isPublic = matchesAny(target, publicApis);
      if (!isPublic && source.scope === 'production')
        violations.push(
          make(
            'cross-module-internal-import',
            { from: edge.from, to, line: edge.line, kinds: edge.kinds },
            [edge.from, to],
          ),
        );
      if (
        isPublic &&
        source.scope === 'production' &&
        !(allowedModuleDependencies[sourceModule] || []).includes(targetModule)
      )
        violations.push(
          make(
            'module-dependency-direction',
            { from: edge.from, to, line: edge.line, kinds: edge.kinds },
            [edge.from, to],
          ),
        );
      if (
        target.endsWith('.module.ts') &&
        source.scope === 'production' &&
        !edge.from.endsWith('.module.ts')
      )
        violations.push(
          make(
            'module-entrypoint-outside-composition',
            { from: edge.from, to, line: edge.line, kinds: edge.kinds },
            [edge.from, to],
          ),
        );
      if (
        !isPublic &&
        source.scope === 'test' &&
        !matchesAny(edge.from, integrationTests)
      )
        violations.push(
          make(
            'test-cross-context-internal-import',
            { from: edge.from, to, line: edge.line, kinds: edge.kinds },
            [edge.from, to],
          ),
        );
    } else if (
      source.scope === 'tool' &&
      targetModule &&
      !matchesAny(target, publicApis)
    ) {
      violations.push(
        make(
          'cross-module-internal-import',
          { from: edge.from, to, line: edge.line, kinds: edge.kinds },
          [edge.from, to],
        ),
      );
    }

    if (
      edge.from.startsWith('src/lib/math/') &&
      (targetModule ||
        target?.startsWith('src/core/') ||
        matchesAny(edge.specifier, forbiddenDomainPackages))
    ) {
      violations.push(
        make(
          'math-no-domain',
          { from: edge.from, to, line: edge.line, kinds: edge.kinds },
          [edge.from, to],
        ),
      );
    }

    if (
      (source.scope === 'production' || source.scope === 'tool') &&
      target &&
      (targetRecord?.scope === 'test' || matchesAny(target, fixtures))
    ) {
      violations.push(
        make(
          'production-imports-test',
          { from: edge.from, to, line: edge.line, kinds: edge.kinds },
          [edge.from, to],
        ),
      );
    }

    if (
      matchesAny(edge.from, contracts) &&
      edge.syntax === 'reexport' &&
      target?.startsWith('src/modules/') &&
      !matchesAny(target, publicApis) &&
      (edge.runtimeBindings.includes('*') ||
        edge.typeBindings.includes('*') ||
        matchesAny(target, forbiddenContractPaths))
    ) {
      violations.push(
        make(
          'public-contract-reexports-internal',
          { from: edge.from, to, line: edge.line, kinds: edge.kinds },
          [edge.from, to],
        ),
      );
    }
  }

  for (const contract of inventory.files.filter(
    (file) => file.scope === 'production' && matchesAny(file.file, contracts),
  )) {
    const queue = [{ file: contract.file, dependencyPath: [contract.file] }];
    const visited = new Set([contract.file]);
    while (queue.length) {
      const current = queue.shift();
      for (const edge of outgoing.get(current.file) || []) {
        const to = identityTarget(edge);
        const forbidden = edge.resolved
          ? matchesAny(edge.resolved, forbiddenContractPaths)
          : matchesAny(edge.specifier, forbiddenDomainPackages);
        if (forbidden) {
          violations.push(
            make(
              'contract-transitive-purity',
              {
                from: contract.file,
                to,
                line: edge.line,
                kinds: edge.kinds,
                dependencyPath: [...current.dependencyPath, to],
              },
              [contract.file, to],
            ),
          );
          continue;
        }
        if (edge.resolved && !visited.has(edge.resolved)) {
          visited.add(edge.resolved);
          queue.push({
            file: edge.resolved,
            dependencyPath: [...current.dependencyPath, edge.resolved],
          });
        }
      }
    }
  }

  for (const members of inventory.graph.runtimeCycles)
    violations.push(
      make(
        'runtime-cycle',
        { from: members[0], to: members[0], members },
        members,
      ),
    );
  for (const members of inventory.graph.typeOnlyCycles)
    violations.push(
      make(
        'type-cycle',
        { from: members[0], to: members[0], members },
        members,
      ),
    );
  for (const members of inventory.nest.moduleCycles)
    violations.push(
      make(
        'nest-module-cycle',
        { from: members[0], to: members[0], members },
        members,
      ),
    );
  for (const pair of inventory.graph.reciprocalAreas) {
    const [from, to] = pair.areas;
    violations.push(
      make(
        'area-reciprocity',
        {
          from,
          to,
          forward: { runtime: pair.forward.runtime, type: pair.forward.type },
          reverse: { runtime: pair.reverse.runtime, type: pair.reverse.type },
        },
        [from, to],
      ),
    );
  }

  const unique = new Map();
  for (const violation of violations) unique.set(violation.id, violation);
  return {
    inventory,
    violations: [...unique.values()].sort((a, b) => a.id.localeCompare(b.id)),
    cycles: {
      runtime: inventory.graph.runtimeCycles,
      type: inventory.graph.typeOnlyCycles,
      nest: inventory.nest.moduleCycles,
    },
    reciprocalAreas: inventory.graph.reciprocalAreas,
  };
}

function baselineEntries(value) {
  if (!value) return [];
  if (typeof value === 'string') value = readJson(path.resolve(value));
  return Array.isArray(value) ? value : value.entries || [];
}

function compareBaseline(violations, baseline) {
  const entries = baselineEntries(baseline);
  const current = new Map(
    violations.map((violation) => [violation.id, violation]),
  );
  const expected = new Map(entries.map((entry) => [entry.id, entry]));
  const seen = new Set();
  const invalidEntries = entries.filter((entry) => {
    const invalid =
      !entry.id ||
      !entry.owner ||
      !/^ARQ-\d{2}$/.test(entry.removalCard || '') ||
      seen.has(entry.id);
    seen.add(entry.id);
    return invalid;
  });
  return {
    newViolations: violations.filter(
      (violation) => !expected.has(violation.id),
    ),
    staleEntries: entries.filter((entry) => !current.has(entry.id)),
    matchedEntries: entries.filter((entry) => current.has(entry.id)),
    invalidEntries,
  };
}

function check(root = REPOSITORY_ROOT, options = {}) {
  const analysis = analyzeViolations(root, options);
  const baseline = baselineEntries(options.baseline);
  const comparison = options.strict
    ? {
        newViolations: analysis.violations,
        staleEntries: baseline,
        matchedEntries: [],
        invalidEntries: [],
      }
    : compareBaseline(analysis.violations, baseline);
  const hasHistoricalBaseline = options.historicalBaseline != null;
  const historical = baselineEntries(options.historicalBaseline);
  const historicalIds = new Set(historical.map((entry) => entry.id));
  const baselineGrowth = hasHistoricalBaseline
    ? baseline.filter((entry) => !historicalIds.has(entry.id))
    : [];
  return {
    ...analysis,
    ...comparison,
    baselineGrowth,
    ok:
      comparison.newViolations.length === 0 &&
      comparison.staleEntries.length === 0 &&
      comparison.invalidEntries.length === 0 &&
      baselineGrowth.length === 0,
  };
}

function historicalBaseline(baseRef, baselinePath) {
  if (!baseRef) return null;
  const relative = path
    .relative(REPOSITORY_ROOT, baselinePath)
    .split(path.sep)
    .join('/');
  childProcess.execFileSync('git', ['cat-file', '-e', `${baseRef}^{commit}`], {
    cwd: REPOSITORY_ROOT,
    stdio: 'ignore',
  });
  try {
    const json = childProcess.execFileSync(
      'git',
      ['show', `${baseRef}:${relative}`],
      {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return JSON.parse(json);
  } catch (error) {
    try {
      childProcess.execFileSync(
        'git',
        ['cat-file', '-e', `${baseRef}:${relative}`],
        {
          cwd: REPOSITORY_ROOT,
          stdio: 'ignore',
        },
      );
    } catch {
      return null;
    }
    throw error;
  }
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

function main() {
  const root = path.resolve(option('--root') || REPOSITORY_ROOT);
  const baselinePath = path.resolve(
    option('--baseline') || DEFAULT_BASELINE_PATH,
  );
  const rules = option('--rules') || DEFAULT_RULES_PATH;
  const baseline = fs.existsSync(baselinePath)
    ? readJson(baselinePath)
    : { schemaVersion: 1, entries: [] };
  const historical = historicalBaseline(
    process.env.ARCHITECTURE_BASE_REF,
    baselinePath,
  );
  const result = check(root, {
    rules,
    baseline,
    historicalBaseline: historical,
    strict: process.argv.includes('--strict'),
  });

  if (process.argv.includes('--prune')) {
    if (result.newViolations.length || result.baselineGrowth.length) {
      process.stderr.write('--prune refuses to add or legitimize violations\n');
      process.exitCode = 1;
      return;
    }
    const currentIds = new Set(
      result.violations.map((violation) => violation.id),
    );
    baseline.entries = baselineEntries(baseline).filter((entry) =>
      currentIds.has(entry.id),
    );
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
  }

  const summary = {
    violations: result.violations.length,
    newViolations: result.newViolations.length,
    staleEntries: result.staleEntries.length,
    baselineGrowth: result.baselineGrowth.length,
    invalidEntries: result.invalidEntries.length,
    strict: process.argv.includes('--strict'),
  };
  if (process.argv.includes('--json')) {
    process.stdout.write(
      JSON.stringify({ ...summary, ...result }, null, 2) + '\n',
    );
  } else {
    process.stdout.write(`architecture: ${JSON.stringify(summary)}\n`);
    for (const violation of result.newViolations)
      process.stderr.write(
        `NEW ${violation.id} ${violation.from} -> ${violation.to}\n`,
      );
    for (const entry of result.staleEntries)
      process.stderr.write(
        `STALE ${entry.id} ${entry.from || ''} -> ${entry.to || ''}\n`,
      );
    for (const entry of result.baselineGrowth)
      process.stderr.write(`BASELINE_GROWTH ${entry.id}\n`);
    for (const entry of result.invalidEntries)
      process.stderr.write(`INVALID_BASELINE ${entry.id || '<missing-id>'}\n`);
  }
  if (!result.ok) process.exitCode = 1;
}

module.exports = { analyzeViolations, compareBaseline, check };

if (require.main === module) main();
