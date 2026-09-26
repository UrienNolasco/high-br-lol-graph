'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const DEFAULT_RELATIVE_PATH = 'docs/architecture/declaration-relocations.json';
const VALID_KINDS = new Set(['runtime', 'type']);

const uniqueSorted = (values) => [...new Set(values)].sort();
const asEntries = (value) =>
  Array.isArray(value)
    ? value
    : Array.isArray(value?.entries)
      ? value.entries
      : [];

function loadRelocations(value, root = process.cwd()) {
  if (value === undefined) {
    const defaultPath = path.join(root, DEFAULT_RELATIVE_PATH);
    if (!fs.existsSync(defaultPath))
      return { schemaVersion: 1, originSha: null, entries: [] };
    value = defaultPath;
  }
  if (typeof value === 'string')
    value = JSON.parse(fs.readFileSync(path.resolve(root, value), 'utf8'));
  if (Array.isArray(value))
    return { schemaVersion: 1, originSha: null, entries: value };
  return value && typeof value === 'object'
    ? { ...value, entries: asEntries(value) }
    : { schemaVersion: 1, originSha: null, entries: [] };
}

const normalizeBinding = (binding) => binding.split(/\s+as\s+/)[0];
const edgeBindings = (edge, kind) =>
  (kind === 'runtime' ? edge.runtimeBindings : edge.typeBindings).map(
    normalizeBinding,
  );

function sourceFile(file, source) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.[cm]?tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

const exported = (node) =>
  Boolean(
    node.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ),
  );

function declarations(source, file) {
  const result = new Map();
  for (const statement of sourceFile(file, source).statements) {
    let kind = null;
    let names = [];
    if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      kind = 'type';
      if (exported(statement)) names = [statement.name.text];
    } else if (
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isFunctionDeclaration(statement)
    ) {
      kind = 'runtime';
      if (exported(statement) && statement.name) names = [statement.name.text];
    } else if (ts.isVariableStatement(statement) && exported(statement)) {
      kind = 'runtime';
      names = statement.declarationList.declarations.flatMap((declaration) =>
        ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
      );
    }
    for (const name of names) result.set(name, kind);
  }
  return result;
}

function namedReexports(source, file) {
  const result = new Map();
  for (const statement of sourceFile(file, source).statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    )
      continue;
    for (const element of statement.exportClause.elements) {
      const exportedName = element.name.text;
      const originalName = element.propertyName?.text || exportedName;
      result.set(exportedName, {
        originalName,
        specifier: statement.moduleSpecifier.text,
      });
    }
  }
  return result;
}

function wildcardReexports(source, file) {
  return sourceFile(file, source).statements.filter(
    (statement) =>
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      !statement.exportClause,
  );
}

function importedBindings(source, file) {
  const result = [];
  const emitted = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2023,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  }).outputText;
  const emittedSpecifiers = new Set();
  for (const match of emitted.matchAll(/\brequire\(["']([^"']+)["']\)/g))
    emittedSpecifiers.add(match[1]);
  for (const match of emitted.matchAll(/\bfrom\s+["']([^"']+)["']/g))
    emittedSpecifiers.add(match[1]);
  for (const statement of sourceFile(file, source).statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier)
    )
      continue;
    const runtimeBindings = [];
    const typeBindings = [];
    const clauseTypeOnly = Boolean(statement.importClause?.isTypeOnly);
    if (statement.importClause?.name)
      (clauseTypeOnly ? typeBindings : runtimeBindings).push('default');
    const named = statement.importClause?.namedBindings;
    if (named && ts.isNamespaceImport(named))
      (clauseTypeOnly ? typeBindings : runtimeBindings).push('*');
    if (named && ts.isNamedImports(named))
      for (const element of named.elements)
        (clauseTypeOnly || element.isTypeOnly
          ? typeBindings
          : runtimeBindings
        ).push(element.propertyName?.text || element.name.text);
    if (!emittedSpecifiers.has(statement.moduleSpecifier.text))
      typeBindings.push(...runtimeBindings.splice(0));
    result.push({
      specifier: statement.moduleSpecifier.text,
      runtimeBindings,
      typeBindings,
    });
  }
  return result;
}

function resolvesTo(from, specifier, expected) {
  if (!specifier.startsWith('.')) return false;
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(from), specifier),
  );
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ].includes(expected);
}

function gitShow(root, revision, file) {
  return childProcess.execFileSync('git', ['show', `${revision}:${file}`], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function validateRelocations(root, value, inventory) {
  root = path.resolve(root);
  const ledger = loadRelocations(value, root);
  const entries = asEntries(ledger);
  const errors = [];
  const error = (code, message, entryIndex = null, consumerIndex = null) =>
    errors.push({ code, message, entryIndex, consumerIndex });

  if (ledger.schemaVersion !== 1)
    error(
      'invalid-schema-version',
      'Relocation ledger schemaVersion must be 1',
    );
  if (!entries.length) return { ledger, entries, validEntries: [], errors };
  if (!inventory) {
    const { analyze } = require('./architecture-inventory.cjs');
    inventory = analyze(root, { live: true });
  }
  if (!ledger.originSha || typeof ledger.originSha !== 'string') {
    error(
      'missing-origin-sha',
      'A non-empty relocation ledger requires originSha',
    );
    return { ledger, entries, validEntries: [], errors };
  }
  try {
    childProcess.execFileSync(
      'git',
      ['cat-file', '-e', `${ledger.originSha}^{commit}`],
      {
        cwd: root,
        stdio: 'ignore',
      },
    );
  } catch {
    error(
      'invalid-origin-sha',
      `originSha is not a commit: ${ledger.originSha}`,
    );
    return { ledger, entries, validEntries: [], errors };
  }

  const relocationByNew = new Map();
  for (const [index, entry] of entries.entries()) {
    if (typeof entry?.newPath === 'string')
      relocationByNew.set(entry.newPath, entry);
    if (!entry || typeof entry !== 'object') {
      error('invalid-entry', 'Relocation entry must be an object', index);
      continue;
    }
    for (const field of ['oldPath', 'newPath'])
      if (
        typeof entry[field] !== 'string' ||
        path.posix.isAbsolute(entry[field]) ||
        entry[field].split('/').includes('..')
      )
        error(
          'invalid-path',
          `${field} must be a repository-relative path`,
          index,
        );
    if (entry.oldPath === entry.newPath)
      error('same-path', 'oldPath and newPath must differ', index);
    if (
      !Array.isArray(entry.symbols) ||
      !entry.symbols.length ||
      entry.symbols.some(
        (symbol) =>
          typeof symbol !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(symbol),
      ) ||
      new Set(entry.symbols).size !== entry.symbols.length
    )
      error(
        'invalid-symbols',
        'symbols must contain unique explicit identifiers',
        index,
      );
    if (!Array.isArray(entry.consumers) || !entry.consumers.length)
      error(
        'missing-consumers',
        'A relocation requires explicit consumers',
        index,
      );
  }

  const duplicatePaths = new Set();
  for (const entry of entries) {
    for (const candidate of entries)
      if (
        candidate !== entry &&
        (candidate.oldPath === entry.oldPath ||
          candidate.newPath === entry.newPath)
      )
        duplicatePaths.add(entry.oldPath || entry.newPath);
  }
  for (const duplicate of duplicatePaths)
    error('duplicate-relocation', `Duplicate relocation path: ${duplicate}`);

  const imports = inventory?.imports || [];
  for (const [entryIndex, entry] of entries.entries()) {
    if (!entry?.oldPath || !entry?.newPath || !Array.isArray(entry.symbols))
      continue;
    let originSource;
    try {
      originSource = gitShow(root, ledger.originSha, entry.oldPath);
    } catch {
      error(
        'missing-origin-file',
        `Origin does not contain ${entry.oldPath}`,
        entryIndex,
      );
      continue;
    }
    const originDeclarations = declarations(originSource, entry.oldPath);
    for (const symbol of entry.symbols)
      if (!originDeclarations.has(symbol))
        error(
          'origin-symbol-not-declared',
          `${entry.oldPath} did not export ${symbol} at originSha`,
          entryIndex,
        );

    const newAbsolute = path.join(root, entry.newPath);
    const oldAbsolute = path.join(root, entry.oldPath);
    if (!fs.existsSync(newAbsolute)) {
      error(
        'missing-new-file',
        `Current tree does not contain ${entry.newPath}`,
        entryIndex,
      );
      continue;
    }
    const currentNew = fs.readFileSync(newAbsolute, 'utf8');
    const currentDeclarations = declarations(currentNew, entry.newPath);
    for (const symbol of entry.symbols) {
      if (!currentDeclarations.has(symbol))
        error(
          'new-symbol-not-exported',
          `${entry.newPath} does not export ${symbol}`,
          entryIndex,
        );
      const originKind = originDeclarations.get(symbol);
      const currentKind = currentDeclarations.get(symbol);
      if (originKind && currentKind && originKind !== currentKind)
        error(
          'declaration-kind-changed',
          `${symbol} changed from ${originKind} to ${currentKind}`,
          entryIndex,
        );
    }

    if (fs.existsSync(oldAbsolute)) {
      const oldSource = fs.readFileSync(oldAbsolute, 'utf8');
      const oldDeclarations = declarations(oldSource, entry.oldPath);
      const reexports = namedReexports(oldSource, entry.oldPath);
      if (wildcardReexports(oldSource, entry.oldPath).length)
        error(
          'blanket-compatibility-reexport',
          `${entry.oldPath} may preserve compatibility only with named reexports`,
          entryIndex,
        );
      for (const symbol of entry.symbols) {
        if (oldDeclarations.has(symbol))
          error(
            'duplicate-current-declaration',
            `${entry.oldPath} still declares ${symbol}`,
            entryIndex,
          );
        const reexport = reexports.get(symbol);
        if (
          reexport &&
          !resolvesTo(entry.oldPath, reexport.specifier, entry.newPath)
        )
          error(
            'invalid-compatibility-reexport',
            `${entry.oldPath} reexports ${symbol} from an unexpected path`,
            entryIndex,
          );
      }
    }

    const seenConsumers = new Set();
    for (const [consumerIndex, consumer] of (entry.consumers || []).entries()) {
      if (!consumer || typeof consumer !== 'object') {
        error(
          'invalid-consumer',
          'Consumer must be an object',
          entryIndex,
          consumerIndex,
        );
        continue;
      }
      const consumerKey = `${consumer.from}\n${consumer.syntax || '*'}\n${JSON.stringify(
        consumer.kinds,
      )}\n${JSON.stringify(consumer.symbols)}`;
      if (seenConsumers.has(consumerKey))
        error(
          'duplicate-consumer',
          `Duplicate consumer ${consumer.from}`,
          entryIndex,
          consumerIndex,
        );
      seenConsumers.add(consumerKey);
      if (typeof consumer.from !== 'string')
        error(
          'invalid-consumer-path',
          'Consumer from must be a path',
          entryIndex,
          consumerIndex,
        );
      if (consumer.syntax && !['import', 'reexport'].includes(consumer.syntax))
        error(
          'invalid-consumer-syntax',
          'Consumer syntax must be import or reexport when specified',
          entryIndex,
          consumerIndex,
        );
      if (
        !Array.isArray(consumer.kinds) ||
        !consumer.kinds.length ||
        consumer.kinds.some((kind) => !VALID_KINDS.has(kind)) ||
        new Set(consumer.kinds).size !== consumer.kinds.length
      )
        error(
          'invalid-consumer-kinds',
          'Consumer kinds must be unique runtime/type values',
          entryIndex,
          consumerIndex,
        );
      if (
        !Array.isArray(consumer.symbols) ||
        !consumer.symbols.length ||
        consumer.symbols.some((symbol) => !entry.symbols.includes(symbol)) ||
        new Set(consumer.symbols).size !== consumer.symbols.length
      )
        error(
          'invalid-consumer-symbols',
          'Consumer symbols must be a unique subset of relocation symbols',
          entryIndex,
          consumerIndex,
        );
      if (typeof consumer.owner !== 'string' || !consumer.owner)
        error(
          'missing-consumer-owner',
          'Consumer owner is required',
          entryIndex,
          consumerIndex,
        );
      if (!/^ARQ-\d{2}$/.test(consumer.removalCard || ''))
        error(
          'invalid-removal-card',
          'Consumer removalCard must be one ARQ card',
          entryIndex,
          consumerIndex,
        );

      const currentEdges = imports.filter(
        (edge) =>
          edge.from === consumer.from &&
          edge.resolved === entry.newPath &&
          (!consumer.syntax || edge.syntax === consumer.syntax) &&
          edge.kinds.some((kind) => (consumer.kinds || []).includes(kind)),
      );
      const actualKinds = uniqueSorted(
        currentEdges.flatMap((edge) => edge.kinds),
      );
      const actualSymbols = uniqueSorted(
        currentEdges.flatMap((edge) =>
          edge.kinds.flatMap((kind) => edgeBindings(edge, kind)),
        ),
      );
      if (
        JSON.stringify(actualKinds) !==
          JSON.stringify(uniqueSorted(consumer.kinds || [])) ||
        JSON.stringify(actualSymbols) !==
          JSON.stringify(uniqueSorted(consumer.symbols || []))
      )
        error(
          'consumer-edge-mismatch',
          `${consumer.from} imports ${entry.newPath} with different kinds or symbols`,
          entryIndex,
          consumerIndex,
        );

      const originFrom =
        relocationByNew.get(consumer.from)?.oldPath || consumer.from;
      if (originFrom === entry.oldPath) {
        if ((consumer.kinds || []).includes('runtime'))
          for (const symbol of consumer.symbols || [])
            if (originDeclarations.get(symbol) !== 'runtime')
              error(
                'origin-symbol-not-runtime',
                `${entry.oldPath} did not expose ${symbol} as a runtime declaration`,
                entryIndex,
                consumerIndex,
              );
      } else {
        let originConsumer;
        try {
          originConsumer = gitShow(root, ledger.originSha, originFrom);
        } catch {
          error(
            'missing-origin-consumer',
            `Origin does not contain consumer ${originFrom}`,
            entryIndex,
            consumerIndex,
          );
          continue;
        }
        const imported = importedBindings(originConsumer, originFrom).filter(
          (item) => resolvesTo(originFrom, item.specifier, entry.oldPath),
        );
        for (const kind of consumer.kinds || []) {
          const bindings = imported.flatMap((item) =>
            kind === 'runtime'
              ? item.runtimeBindings
              : [...item.typeBindings, ...item.runtimeBindings],
          );
          for (const symbol of consumer.symbols || [])
            if (!bindings.includes(symbol) && !bindings.includes('*'))
              error(
                'origin-consumer-kind-mismatch',
                `${originFrom} did not import ${symbol} as ${kind} from ${entry.oldPath}`,
                entryIndex,
                consumerIndex,
              );
        }
      }
    }
  }

  const invalidIndexes = new Set(
    errors
      .filter((item) => item.entryIndex !== null)
      .map((item) => item.entryIndex),
  );
  return {
    ledger,
    entries,
    validEntries: entries.filter((_, index) => !invalidIndexes.has(index)),
    errors,
  };
}

function applyRelocations(inventory, entries) {
  const consumers = new Map();
  for (const entry of entries)
    for (const consumer of entry.consumers || []) {
      const key = `${consumer.from}\n${entry.newPath}`;
      if (!consumers.has(key)) consumers.set(key, []);
      consumers.get(key).push({ entry, consumer });
    }
  const transitionalDebt = [];
  const debtKeys = new Set();
  const imports = inventory.imports.map((edge) => {
    const candidates = consumers.get(`${edge.from}\n${edge.resolved}`) || [];
    const actualKinds = edge.kinds;
    const actualSymbols = uniqueSorted(
      actualKinds.flatMap((kind) => edgeBindings(edge, kind)),
    );
    const bridge = candidates.find(
      (candidate) =>
        (!candidate.consumer.syntax ||
          candidate.consumer.syntax === edge.syntax) &&
        actualKinds.every((kind) => candidate.consumer.kinds.includes(kind)) &&
        actualSymbols.every((symbol) =>
          candidate.consumer.symbols.includes(symbol),
        ),
    );
    if (!bridge) return { ...edge, logicalResolved: edge.resolved };
    const debtKey = `${bridge.consumer.from}\n${edge.syntax}\n${bridge.entry.oldPath}\n${bridge.entry.newPath}`;
    if (!debtKeys.has(debtKey)) {
      debtKeys.add(debtKey);
      transitionalDebt.push({
        from: bridge.consumer.from,
        syntax: bridge.consumer.syntax || edge.syntax,
        oldPath: bridge.entry.oldPath,
        newPath: bridge.entry.newPath,
        kinds: [...bridge.consumer.kinds],
        symbols: [...bridge.consumer.symbols],
        owner: bridge.consumer.owner,
        removalCard: bridge.consumer.removalCard,
      });
    }
    return {
      ...edge,
      logicalResolved: bridge.entry.oldPath,
      declarationRelocation: {
        oldPath: bridge.entry.oldPath,
        newPath: bridge.entry.newPath,
      },
    };
  });
  return { imports, transitionalDebt };
}

module.exports = {
  DEFAULT_RELATIVE_PATH,
  applyRelocations,
  loadRelocations,
  validateRelocations,
};
