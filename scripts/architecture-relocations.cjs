'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const DEFAULT_RELATIVE_PATH = 'docs/architecture/declaration-relocations.json';
const VALID_KINDS = new Set(['runtime', 'type']);
const gitShowCache = new Map();
const originPathCache = new Map();
const originFilesCache = new Map();

const uniqueSorted = (values) => [...new Set(values)].sort();
const originSymbol = (entry, symbol) => entry.originSymbols?.[symbol] || symbol;
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
  (kind === 'runtime'
    ? edge.relocationRuntimeBindings || edge.runtimeBindings
    : edge.relocationTypeBindings || edge.typeBindings
  ).map(normalizeBinding);
const edgeKinds = (edge) => edge.relocationKinds || edge.kinds;

function sourceFile(file, source) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.[cm]?tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function emittedSpecifiers(source, file) {
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
  const result = new Set();
  for (const match of emitted.matchAll(/\brequire\(["']([^"']+)["']\)/g))
    result.add(match[1]);
  for (const match of emitted.matchAll(/\bfrom\s+["']([^"']+)["']/g))
    result.add(match[1]);
  return result;
}

function isolateImport(source, file, selected) {
  const parsed = sourceFile(file, source);
  const removals = parsed.statements.filter(
    (statement) =>
      statement.pos !== selected.pos &&
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === selected.moduleSpecifier.text,
  );
  let isolated = source;
  for (const statement of removals.sort((a, b) => b.pos - a.pos))
    isolated = `${isolated.slice(0, statement.pos)}${isolated.slice(statement.end)}`;
  return isolated;
}

function bindingNames(name) {
  if (ts.isObjectBindingPattern(name))
    return name.elements.flatMap((element) =>
      ts.isIdentifier(element.name)
        ? [element.propertyName?.text || element.name.text]
        : [],
    );
  return ts.isIdentifier(name) ? ['*'] : [];
}

function commonJsBindings(source, file) {
  const parsed = sourceFile(file, source);
  const result = [];
  for (const statement of parsed.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const call = declaration.initializer;
      if (
        !call ||
        !ts.isCallExpression(call) ||
        !ts.isIdentifier(call.expression) ||
        !['require', 'from'].includes(call.expression.text) ||
        call.arguments.length !== 1 ||
        !ts.isStringLiteralLike(call.arguments[0])
      )
        continue;
      result.push({
        specifier: call.arguments[0].text,
        runtimeBindings: bindingNames(declaration.name),
        typeBindings: [],
        syntax: call.expression.text === 'from' ? 'compiled-loader' : 'require',
        line:
          parsed.getLineAndCharacterOfPosition(statement.getStart()).line + 1,
      });
    }
  }
  return result;
}

const sameSpecifier = (left, right) =>
  left === right || left === `dist:${right}` || `dist:${left}` === right;

function refineCurrentImportEdges(root, imports) {
  const sources = new Map();
  for (const edge of imports) {
    if (!edge.kinds.includes('runtime')) continue;
    const absolute = path.join(root, edge.from);
    if (!fs.existsSync(absolute)) continue;
    if (!sources.has(edge.from))
      sources.set(edge.from, fs.readFileSync(absolute, 'utf8'));
    const source = sources.get(edge.from);
    if (edge.syntax === 'require' || edge.syntax === 'compiled-loader') {
      const binding = commonJsBindings(source, edge.from).find(
        (candidate) =>
          candidate.syntax === edge.syntax &&
          sameSpecifier(candidate.specifier, edge.specifier) &&
          candidate.line <= edge.line,
      );
      if (binding) edge.relocationRuntimeBindings = binding.runtimeBindings;
      continue;
    }
    if (edge.syntax !== 'import') continue;
    const parsed = sourceFile(edge.from, source);
    const statement = parsed.statements.find(
      (candidate) =>
        ts.isImportDeclaration(candidate) &&
        ts.isStringLiteralLike(candidate.moduleSpecifier) &&
        candidate.moduleSpecifier.text === edge.specifier &&
        parsed.getLineAndCharacterOfPosition(candidate.getStart()).line + 1 ===
          edge.line,
    );
    if (!statement) continue;
    if (
      emittedSpecifiers(
        isolateImport(source, edge.from, statement),
        edge.from,
      ).has(edge.specifier)
    )
      continue;
    edge.relocationRuntimeBindings = [];
    edge.relocationTypeBindings = uniqueSorted([
      ...edge.typeBindings,
      ...edge.runtimeBindings,
    ]);
    edge.relocationKinds = edge.relocationTypeBindings.length ? ['type'] : [];
  }
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

function nestModuleMetadata(source, file, className) {
  const parsed = sourceFile(file, source);
  const declaration = parsed.statements.find(
    (statement) =>
      ts.isClassDeclaration(statement) && statement.name?.text === className,
  );
  if (!declaration || !ts.canHaveDecorators(declaration)) return null;
  const decorator = (ts.getDecorators(declaration) || []).find(
    (candidate) =>
      ts.isCallExpression(candidate.expression) &&
      ts.isIdentifier(candidate.expression.expression) &&
      candidate.expression.expression.text === 'Module',
  );
  const argument = decorator?.expression.arguments[0];
  if (!argument || !ts.isObjectLiteralExpression(argument)) return null;
  const result = {
    imports: new Set(),
    providers: new Set(),
    exports: new Set(),
  };
  for (const property of argument.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      !ts.isIdentifier(property.name) ||
      !['imports', 'providers', 'exports'].includes(property.name.text) ||
      !ts.isArrayLiteralExpression(property.initializer)
    )
      continue;
    for (const element of property.initializer.elements)
      if (ts.isIdentifier(element))
        result[property.name.text].add(element.text);
  }
  return result;
}

function directlyImports(source, file, target, symbol, resolver) {
  return importedBindings(source, file).some((item) => {
    if (!item.runtimeBindings.includes(symbol)) return false;
    return resolver(file, item.specifier) === target;
  });
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
  const parsed = sourceFile(file, source);
  for (const statement of parsed.statements) {
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
    if (
      !emittedSpecifiers(isolateImport(source, file, statement), file).has(
        statement.moduleSpecifier.text,
      )
    )
      typeBindings.push(...runtimeBindings.splice(0));
    result.push({
      specifier: statement.moduleSpecifier.text,
      runtimeBindings,
      typeBindings,
    });
  }
  return [...result, ...commonJsBindings(source, file)];
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

function originPath(root, revision, from, specifier) {
  const internalBase = specifier.startsWith('.')
    ? path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier))
    : from.startsWith('scripts/') && /^[A-Za-z0-9_-]+\//.test(specifier)
      ? `src/${specifier}`
      : null;
  if (!internalBase) return null;
  const cacheKey = `${root}\n${revision}\n${from}\n${specifier}`;
  if (originPathCache.has(cacheKey)) return originPathCache.get(cacheKey);
  const base = internalBase.startsWith('dist/')
    ? `src/${internalBase.slice('dist/'.length)}`
    : internalBase;
  const treeKey = `${root}\n${revision}`;
  if (!originFilesCache.has(treeKey))
    originFilesCache.set(
      treeKey,
      new Set(
        childProcess
          .execFileSync('git', ['ls-tree', '-r', '--name-only', revision], {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          })
          .split(/\r?\n/)
          .filter(Boolean),
      ),
    );
  const files = originFilesCache.get(treeKey);
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    base,
  ])
    if (files.has(candidate)) {
      originPathCache.set(cacheKey, candidate);
      return candidate;
    }
  originPathCache.set(cacheKey, null);
  return null;
}

function currentPath(root, from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(from), specifier),
  );
  return (
    [
      `${base}.ts`,
      `${base}.tsx`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
      base,
    ].find((candidate) => fs.existsSync(path.join(root, candidate))) || null
  );
}

function originReexports(source, file) {
  const result = [];
  for (const statement of sourceFile(file, source).statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteralLike(statement.moduleSpecifier)
    )
      continue;
    if (!statement.exportClause) {
      result.push({
        specifier: statement.moduleSpecifier.text,
        exported: '*',
        imported: '*',
        kind: statement.isTypeOnly ? 'type' : 'runtime',
      });
      continue;
    }
    if (!ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements)
      result.push({
        specifier: statement.moduleSpecifier.text,
        exported: element.name.text,
        imported: element.propertyName?.text || element.name.text,
        kind: statement.isTypeOnly || element.isTypeOnly ? 'type' : 'runtime',
      });
  }
  return result;
}

function originReexportsSymbol(
  root,
  revision,
  file,
  target,
  symbol,
  kind,
  visited = new Set(),
) {
  const key = `${file}\n${symbol}\n${kind}`;
  if (visited.has(key)) return false;
  visited.add(key);
  let source;
  try {
    source = gitShow(root, revision, file);
  } catch {
    return false;
  }
  if (file === target) {
    const declarationKind = declarations(source, file).get(symbol);
    return Boolean(
      declarationKind && (kind === 'type' || declarationKind === 'runtime'),
    );
  }
  return originReexports(source, file).some((item) => {
    if (item.exported !== '*' && item.exported !== symbol) return false;
    if (kind === 'runtime' && item.kind !== 'runtime') return false;
    const resolved = originPath(root, revision, file, item.specifier);
    return Boolean(
      resolved &&
        originReexportsSymbol(
          root,
          revision,
          resolved,
          target,
          item.imported === '*' ? symbol : item.imported,
          kind,
          new Set(visited),
        ),
    );
  });
}

function currentExportKind(root, file, symbol, visited = new Set()) {
  const key = `${file}\n${symbol}`;
  if (visited.has(key)) return null;
  visited.add(key);
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) return null;
  const source = fs.readFileSync(absolute, 'utf8');
  const direct = declarations(source, file).get(symbol);
  if (direct) return direct;
  for (const item of originReexports(source, file)) {
    if (item.exported !== '*' && item.exported !== symbol) continue;
    const resolved = currentPath(root, file, item.specifier);
    if (!resolved) continue;
    const targetKind = currentExportKind(
      root,
      resolved,
      item.imported === '*' ? symbol : item.imported,
      new Set(visited),
    );
    if (targetKind) return item.kind === 'type' ? 'type' : targetKind;
  }
  return null;
}

function gitShow(root, revision, file) {
  const cacheKey = `${root}\n${revision}\n${file}`;
  if (gitShowCache.has(cacheKey)) return gitShowCache.get(cacheKey);
  const source = childProcess.execFileSync(
    'git',
    ['show', `${revision}:${file}`],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  gitShowCache.set(cacheKey, source);
  return source;
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

  const relocationsByNew = new Map();
  for (const [index, entry] of entries.entries()) {
    if (typeof entry?.newPath === 'string') {
      if (!relocationsByNew.has(entry.newPath))
        relocationsByNew.set(entry.newPath, []);
      relocationsByNew.get(entry.newPath).push(entry);
    }
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
    if (entry.originSymbols !== undefined) {
      const aliases = entry.originSymbols;
      if (
        !aliases ||
        typeof aliases !== 'object' ||
        Array.isArray(aliases) ||
        Object.entries(aliases).some(
          ([current, origin]) =>
            !entry.symbols.includes(current) ||
            typeof origin !== 'string' ||
            !/^[A-Za-z_$][\w$]*$/.test(origin),
        ) ||
        new Set(entry.symbols.map((symbol) => originSymbol(entry, symbol)))
          .size !== entry.symbols.length
      )
        error(
          'invalid-origin-symbols',
          'originSymbols must map current symbols to unique origin identifiers',
          index,
        );
    }
    if (entry.kind !== undefined && entry.kind !== 'provider-composition')
      error(
        'invalid-relocation-kind',
        'Relocation kind must be provider-composition when specified',
        index,
      );
    if (entry.kind === 'provider-composition') {
      const provider = entry.provider;
      if (
        entry.symbols?.length !== 1 ||
        !provider ||
        typeof provider.symbol !== 'string' ||
        typeof provider.oldPath !== 'string' ||
        typeof provider.newPath !== 'string'
      )
        error(
          'invalid-provider-composition',
          'A provider composition relocation requires one module symbol and explicit provider symbol/paths',
          index,
        );
    }
    if (!Array.isArray(entry.consumers) || !entry.consumers.length)
      error(
        'missing-consumers',
        'A relocation requires explicit consumers',
        index,
      );
  }

  for (let left = 0; left < entries.length; left++)
    for (let right = left + 1; right < entries.length; right++) {
      const a = entries[left],
        b = entries[right];
      if (a.oldPath !== b.oldPath && a.newPath !== b.newPath) continue;
      const aSymbols =
        a.oldPath === b.oldPath
          ? (a.symbols || []).map((symbol) => originSymbol(a, symbol))
          : a.symbols || [];
      const bSymbols =
        a.oldPath === b.oldPath
          ? (b.symbols || []).map((symbol) => originSymbol(b, symbol))
          : b.symbols || [];
      const overlap = aSymbols.filter((symbol) => bSymbols.includes(symbol));
      if (!overlap.length) continue;
      for (const index of [left, right])
        error(
          'overlapping-relocation',
          `Relocations sharing an endpoint overlap symbols: ${overlap.join(', ')}`,
          index,
        );
    }

  const imports = inventory?.imports || [];
  const relocationTargets = new Set(entries.map((entry) => entry.newPath));
  refineCurrentImportEdges(
    root,
    imports.filter((edge) => relocationTargets.has(edge.resolved)),
  );
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
    for (const symbol of entry.symbols) {
      const original = originSymbol(entry, symbol);
      if (!originDeclarations.has(original))
        error(
          'origin-symbol-not-declared',
          `${entry.oldPath} did not export ${original} at originSha`,
          entryIndex,
        );
    }

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
    for (const symbol of entry.symbols) {
      const currentKind = currentExportKind(root, entry.newPath, symbol);
      if (!currentKind)
        error(
          'new-symbol-not-exported',
          `${entry.newPath} does not export ${symbol}`,
          entryIndex,
        );
      const originKind = originDeclarations.get(originSymbol(entry, symbol));
      if (originKind && currentKind && originKind !== currentKind)
        error(
          'declaration-kind-changed',
          `${symbol} changed from ${originKind} to ${currentKind}`,
          entryIndex,
        );
    }

    if (entry.kind === 'provider-composition' && entry.provider) {
      const provider = entry.provider;
      let originProviderSource = null;
      try {
        originProviderSource = gitShow(
          root,
          ledger.originSha,
          provider.oldPath,
        );
      } catch {
        error(
          'missing-origin-provider',
          `Origin does not contain provider ${provider.oldPath}`,
          entryIndex,
        );
      }
      const currentProviderKind = currentExportKind(
        root,
        provider.newPath,
        provider.symbol,
      );
      if (
        !originProviderSource ||
        declarations(originProviderSource, provider.oldPath).get(
          provider.symbol,
        ) !== 'runtime' ||
        currentProviderKind !== 'runtime'
      )
        error(
          'provider-declaration-mismatch',
          `${provider.symbol} must be a runtime declaration at both provider endpoints`,
          entryIndex,
        );
      const oldModuleClass = originSymbol(entry, entry.symbols[0]);
      const newModuleClass = entry.symbols[0];
      const oldMetadata = nestModuleMetadata(
        originSource,
        entry.oldPath,
        oldModuleClass,
      );
      const newMetadata = nestModuleMetadata(
        currentNew,
        entry.newPath,
        newModuleClass,
      );
      const oldImportsProvider = directlyImports(
        originSource,
        entry.oldPath,
        provider.oldPath,
        provider.symbol,
        (from, specifier) =>
          originPath(root, ledger.originSha, from, specifier),
      );
      const newImportsProvider = directlyImports(
        currentNew,
        entry.newPath,
        provider.newPath,
        provider.symbol,
        (from, specifier) => currentPath(root, from, specifier),
      );
      for (const [side, metadata, importsProvider] of [
        ['origin', oldMetadata, oldImportsProvider],
        ['current', newMetadata, newImportsProvider],
      ])
        if (
          !importsProvider ||
          !metadata?.providers.has(provider.symbol) ||
          !metadata?.exports.has(provider.symbol)
        )
          error(
            'provider-composition-mismatch',
            `${side} module must import, provide and export ${provider.symbol}`,
            entryIndex,
          );
      if (
        newMetadata &&
        (newMetadata.imports.size !== 0 ||
          newMetadata.providers.size !== 1 ||
          newMetadata.exports.size !== 1)
      )
        error(
          'provider-composition-expanded',
          `Current composition module may contain only ${provider.symbol} in providers/exports and no module imports`,
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
      if (
        consumer.syntax &&
        !['import', 'reexport', 'require', 'compiled-loader'].includes(
          consumer.syntax,
        )
      )
        error(
          'invalid-consumer-syntax',
          'Consumer syntax must be import, reexport, require or compiled-loader when specified',
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
          edgeKinds(edge).some((kind) => (consumer.kinds || []).includes(kind)),
      );
      const actualKinds = uniqueSorted(
        currentEdges.flatMap((edge) => edgeKinds(edge)),
      );
      const actualSymbols = uniqueSorted(
        currentEdges.flatMap((edge) =>
          edgeKinds(edge).flatMap((kind) => edgeBindings(edge, kind)),
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

      const possibleOrigins = [
        ...new Set(
          (relocationsByNew.get(consumer.from) || []).map(
            (item) => item.oldPath,
          ),
        ),
      ];
      const originFrom =
        possibleOrigins.length === 1 ? possibleOrigins[0] : consumer.from;
      if (originFrom === entry.oldPath) {
        if ((consumer.kinds || []).includes('runtime'))
          for (const symbol of consumer.symbols || [])
            if (
              originDeclarations.get(originSymbol(entry, symbol)) !== 'runtime'
            )
              error(
                'origin-symbol-not-runtime',
                `${entry.oldPath} did not expose ${originSymbol(entry, symbol)} as a runtime declaration`,
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
        const imported = importedBindings(originConsumer, originFrom);
        for (const kind of consumer.kinds || []) {
          for (const symbol of consumer.symbols || [])
            if (
              !imported.some((item) => {
                const original = originSymbol(entry, symbol);
                const bindings =
                  kind === 'runtime'
                    ? item.runtimeBindings
                    : [...item.typeBindings, ...item.runtimeBindings];
                if (!bindings.includes(original) && !bindings.includes('*'))
                  return false;
                const resolved = originPath(
                  root,
                  ledger.originSha,
                  originFrom,
                  item.specifier,
                );
                return Boolean(
                  resolved &&
                    originReexportsSymbol(
                      root,
                      ledger.originSha,
                      resolved,
                      entry.oldPath,
                      original,
                      kind,
                    ),
                );
              })
            )
              error(
                'origin-consumer-kind-mismatch',
                `${originFrom} did not import ${originSymbol(entry, symbol)} as ${kind} from ${entry.oldPath}`,
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
    const actualKinds = edgeKinds(edge);
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
