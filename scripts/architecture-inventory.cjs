#!/usr/bin/env node
'use strict';

/**
 * Reproducible architecture inventory for ARQ-01.
 *
 * Usage:
 *   node scripts/architecture-inventory.cjs
 *   node scripts/architecture-inventory.cjs --check
 *   node scripts/architecture-inventory.cjs --stdout
 *
 * The default command writes the canonical JSON and the human-readable report in
 * docs/architecture. No timestamps or machine-specific absolute paths are emitted.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const ARQ01_BASELINE_REVISION = '217331a675974fe6531da5bfff63a06c5324fde9';
const JSON_PATH = path.join(ROOT, 'docs/architecture/import-inventory.json');
const REPORT_PATH = path.join(ROOT, 'docs/architecture/import-inventory.md');
const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.cjs',
  '.mjs',
  '.py',
]);
const CODE_ROOTS = ['src', 'scripts', 'test'];
const ROOT_FILES = ['eslint.config.mjs', 'jest.setup.ts'];
const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

function posix(value) {
  return value.split(path.sep).join('/');
}

function relative(file, root = ROOT) {
  return posix(path.relative(root, file));
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === 'coverage'
    )
      continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) result.push(full);
  }
  return result;
}

function isTestFile(file) {
  return (
    file.startsWith('test/') ||
    /(?:^|\/)(?:__fixtures__|fixtures)(?:\/|$)/.test(file) ||
    /\.(?:spec|e2e-spec|fixture)\.[cm]?[jt]sx?$/.test(file) ||
    /(?:^|\/)jest\.setup\.ts$/.test(file)
  );
}

function areaOf(file) {
  const parts = file.split('/');
  if (parts[0] === 'src' && parts[1] === 'modules' && parts[2]) return parts[2];
  if (parts[0] === 'src' && parts[1] === 'core' && parts[2])
    return `core/${parts[2]}`;
  if (parts[0] === 'src' && parts[1] === 'lib') {
    if (parts[2] === 'math') return 'lib/math';
    return 'core/lib';
  }
  if (parts[0] === 'src' && parts[1] === 'studies') return 'studies';
  if (parts[0] === 'src' && parts[1] === 'composition') {
    if (parts[2] === 'http' || parts[2] === 'cli')
      return `composition/${parts[2]}`;
    return 'composition';
  }
  if (parts[0] === 'src') {
    if (
      file === 'src/main.ts' ||
      file === 'src/app.module.ts' ||
      file === 'src/app.controller.ts'
    )
      return 'composition/http';
    if (file.endsWith('-cli.ts')) return 'composition/cli';
    return 'other';
  }
  if (parts[0] === 'scripts') return 'studies/tools';
  if (parts[0] === 'test') return 'test/integration';
  if (file === 'eslint.config.mjs') return 'tooling/config';
  if (file === 'jest.setup.ts') return 'test/config';
  return 'other';
}

function scopeOf(file) {
  if (isTestFile(file)) return 'test';
  if (file.startsWith('scripts/') || file === 'eslint.config.mjs')
    return 'tool';
  return 'production';
}

function scriptKind(file) {
  const extension = path.extname(file);
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (extension === '.js' || extension === '.cjs' || extension === '.mjs')
    return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function resolveLocal(
  fromAbsolute,
  specifier,
  knownFiles,
  root = ROOT,
  compilerOptions = {},
) {
  const compiled = /^\.\.\/dist\/(.+)$/.exec(specifier);
  const candidates = [];
  if (compiled || specifier.startsWith('.')) {
    const base = compiled
      ? path.join(root, 'src', compiled[1])
      : path.resolve(path.dirname(fromAbsolute), specifier);
    candidates.push(
      base,
      ...['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs'].map(
        (extension) => base + extension,
      ),
      ...['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs'].map((extension) =>
        path.join(base, `index${extension}`),
      ),
    );
  }
  const resolved = ts.resolveModuleName(
    specifier,
    fromAbsolute,
    compilerOptions,
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  if (resolved) candidates.push(resolved.replace(/\.d\.ts$/, '.ts'));
  for (const candidate of candidates) {
    const candidateRelative = relative(candidate, root);
    if (knownFiles.has(candidateRelative)) return candidateRelative;
  }
  return null;
}

function bindingName(name) {
  return name && ts.isIdentifier(name)
    ? name.text
    : name
      ? name.getText()
      : '*';
}

function importKinds(node) {
  if (!node.importClause) return { runtime: ['<side-effect>'], type: [] };
  const runtime = [];
  const type = [];
  const clauseType = node.importClause.isTypeOnly;
  if (node.importClause.name)
    (clauseType ? type : runtime).push(node.importClause.name.text);
  const bindings = node.importClause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) {
    (clauseType ? type : runtime).push(`* as ${bindings.name.text}`);
  } else if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      const label = element.propertyName
        ? `${element.propertyName.text} as ${element.name.text}`
        : element.name.text;
      (clauseType || element.isTypeOnly ? type : runtime).push(label);
    }
  }
  return { runtime, type };
}

function location(sourceFile, node) {
  const point = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return { line: point.line + 1, column: point.character + 1 };
}

function decoratorName(decorator) {
  const expression = decorator.expression;
  const target = ts.isCallExpression(expression)
    ? expression.expression
    : expression;
  return ts.isIdentifier(target) ? target.text : target.getText();
}

function decoratorsOf(node) {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [];
}

function literalDecoratorArgument(decorator) {
  if (
    !ts.isCallExpression(decorator.expression) ||
    decorator.expression.arguments.length === 0
  )
    return null;
  const argument = decorator.expression.arguments[0];
  if (ts.isStringLiteralLike(argument) || ts.isNumericLiteral(argument))
    return argument.text;
  return argument.getText();
}

function moduleMetadata(sourceFile, classNode, decorator, root = ROOT) {
  const result = {
    file: relative(sourceFile.fileName, root),
    className: classNode.name?.text || '<anonymous>',
  };
  if (!ts.isCallExpression(decorator.expression)) return result;
  const argument = decorator.expression.arguments[0];
  if (!argument || !ts.isObjectLiteralExpression(argument)) return result;
  for (const property of argument.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = property.name.getText(sourceFile).replace(/["']/g, '');
    if (!['imports', 'controllers', 'providers', 'exports'].includes(key))
      continue;
    result[key] = ts.isArrayLiteralExpression(property.initializer)
      ? property.initializer.elements.map((element) =>
          element.getText(sourceFile),
        )
      : [property.initializer.getText(sourceFile)];
  }
  return result;
}

function parsePythonImports(source, file) {
  const imports = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    let match = line.match(/^\s*import\s+([A-Za-z_][\w.]*)/);
    if (!match) match = line.match(/^\s*from\s+([A-Za-z_.][\w.]*)\s+import\s+/);
    if (match)
      imports.push({
        from: file,
        specifier: match[1],
        resolved: null,
        external: true,
        kinds: ['runtime'],
        runtimeBindings: ['<python-import>'],
        typeBindings: [],
        line: index + 1,
        column: 1,
      });
  }
  return imports;
}

function emittedRuntimeSpecifiers(source, file) {
  const output = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2023,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
    },
  }).outputText;
  const specifiers = new Set();
  for (const match of output.matchAll(/\brequire\(["']([^"']+)["']\)/g))
    specifiers.add(match[1]);
  for (const match of output.matchAll(
    /\b(?:from\s+|import\s*\()["']([^"']+)["']/g,
  ))
    specifiers.add(match[1]);
  return specifiers;
}

function parsePrismaSchema(root = ROOT) {
  const schemaPath = path.join(root, 'prisma/schema.prisma');
  if (!fs.existsSync(schemaPath)) return [];
  const source = fs.readFileSync(schemaPath, 'utf8');
  const models = [];
  const pattern = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  for (const match of source.matchAll(pattern)) {
    const model = match[1];
    const body = match[2];
    const tableMatch = body.match(/@@map\("([^"]+)"\)/);
    models.push({
      model,
      delegate: model[0].toLowerCase() + model.slice(1),
      table: tableMatch ? tableMatch[1] : model,
    });
  }
  return models.sort((a, b) => a.model.localeCompare(b.model));
}

function gitRevision(root = ROOT) {
  let gitDirectory = path.join(root, '.git');
  if (!fs.existsSync(gitDirectory)) return '<unavailable>';
  if (fs.statSync(gitDirectory).isFile()) {
    const pointer = fs
      .readFileSync(gitDirectory, 'utf8')
      .match(/^gitdir:\s*(.+)$/m);
    if (!pointer) return '<unavailable>';
    gitDirectory = path.resolve(root, pointer[1].trim());
  }
  const head = fs.readFileSync(path.join(gitDirectory, 'HEAD'), 'utf8').trim();
  if (/^[0-9a-f]{40}$/i.test(head)) return head;
  const reference = head.match(/^ref:\s*(.+)$/)?.[1];
  if (!reference) return '<unavailable>';
  const looseReference = path.join(gitDirectory, reference);
  if (fs.existsSync(looseReference))
    return fs.readFileSync(looseReference, 'utf8').trim();
  const packed = path.join(gitDirectory, 'packed-refs');
  if (fs.existsSync(packed)) {
    const match = fs
      .readFileSync(packed, 'utf8')
      .split(/\r?\n/)
      .find((line) => line.endsWith(` ${reference}`));
    if (match) return match.split(' ')[0];
  }
  return '<unavailable>';
}

function stronglyConnectedComponents(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node, []]));
  for (const [from, to] of edges)
    if (adjacency.has(from) && adjacency.has(to)) adjacency.get(from).push(to);
  for (const targets of adjacency.values()) targets.sort();
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indexes = new Map();
  const lowLinks = new Map();
  const components = [];
  function visit(node) {
    indexes.set(node, index);
    lowLinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const target of adjacency.get(node)) {
      if (!indexes.has(target)) {
        visit(target);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(target)));
      } else if (onStack.has(target)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indexes.get(target)));
      }
    }
    if (lowLinks.get(node) === indexes.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      component.sort();
      const selfLoop =
        component.length === 1 &&
        adjacency.get(component[0]).includes(component[0]);
      if (component.length > 1 || selfLoop) components.push(component);
    }
  }
  for (const node of [...nodes].sort()) if (!indexes.has(node)) visit(node);
  return components.sort((a, b) => a[0].localeCompare(b[0]));
}

function readCompilerOptions(root) {
  const configPath = path.join(root, 'tsconfig.json');
  if (!fs.existsSync(configPath))
    return {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      baseUrl: root,
    };
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) return { baseUrl: root };
  return ts.parseJsonConfigFileContent(loaded.config, ts.sys, root).options;
}

function analyze(root = ROOT, options = {}) {
  root = path.resolve(root);
  const compilerOptions = readCompilerOptions(root);
  const absoluteFiles = [
    ...CODE_ROOTS.flatMap((directory) => walk(path.join(root, directory))),
    ...ROOT_FILES.map((file) => path.join(root, file)).filter((file) =>
      fs.existsSync(file),
    ),
  ].sort();
  const files = absoluteFiles.map((file) => relative(file, root));
  const knownFiles = new Set(files);
  const fileRecords = [];
  const imports = [];
  const nestModules = [];
  const controllers = [];
  const messageHandlers = [];
  const schedules = [];
  const prismaAccesses = [];
  const transactions = [];
  const models = parsePrismaSchema(root);
  const delegates = new Map(models.map((model) => [model.delegate, model]));

  for (const absoluteFile of absoluteFiles) {
    const file = relative(absoluteFile, root);
    const source = fs.readFileSync(absoluteFile, 'utf8');
    const record = {
      file,
      area: areaOf(file),
      scope: scopeOf(file),
      language: path.extname(file).slice(1),
      lines: source === '' ? 0 : source.split(/\r?\n/).length,
    };
    fileRecords.push(record);
    if (path.extname(file) === '.py') {
      imports.push(...parsePythonImports(source, file));
      continue;
    }

    const sourceFile = ts.createSourceFile(
      absoluteFile,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(file),
    );
    const emittedRuntime = emittedRuntimeSpecifiers(source, file);
    const localImports = new Map();
    function registerImport(local, resolved) {
      if (local && resolved) localImports.set(local, resolved);
    }
    function addImport(
      specifier,
      node,
      runtimeBindings,
      typeBindings,
      dynamic = false,
      resolvedOverride = undefined,
      syntax = 'import',
    ) {
      if (
        !dynamic &&
        runtimeBindings.length &&
        !emittedRuntime.has(specifier)
      ) {
        typeBindings = [...typeBindings, ...runtimeBindings];
        runtimeBindings = [];
      }
      const resolved =
        resolvedOverride === undefined
          ? resolveLocal(
              absoluteFile,
              specifier,
              knownFiles,
              root,
              compilerOptions,
            )
          : resolvedOverride;
      const kinds = [];
      if (runtimeBindings.length) kinds.push('runtime');
      if (typeBindings.length) kinds.push('type');
      const point = location(sourceFile, node);
      imports.push({
        from: file,
        specifier,
        resolved,
        external: !resolved,
        kinds,
        runtimeBindings: [...runtimeBindings].sort(),
        typeBindings: [...typeBindings].sort(),
        dynamic,
        syntax,
        ...point,
      });
    }

    for (const statement of sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteralLike(statement.moduleSpecifier)
      ) {
        const specifier = statement.moduleSpecifier.text;
        const bindings = importKinds(statement);
        const resolved = resolveLocal(
          absoluteFile,
          specifier,
          knownFiles,
          root,
          compilerOptions,
        );
        if (statement.importClause?.name)
          registerImport(statement.importClause.name.text, resolved);
        const named = statement.importClause?.namedBindings;
        if (named && ts.isNamespaceImport(named))
          registerImport(named.name.text, resolved);
        if (named && ts.isNamedImports(named))
          for (const element of named.elements)
            registerImport(element.name.text, resolved);
        addImport(specifier, statement, bindings.runtime, bindings.type);
      } else if (
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier &&
        ts.isStringLiteralLike(statement.moduleSpecifier)
      ) {
        const specifier = statement.moduleSpecifier.text;
        const runtimeBindings = [];
        const typeBindings = [];
        if (!statement.exportClause)
          (statement.isTypeOnly ? typeBindings : runtimeBindings).push('*');
        else if (ts.isNamespaceExport(statement.exportClause))
          (statement.isTypeOnly ? typeBindings : runtimeBindings).push(
            `* as ${statement.exportClause.name.text}`,
          );
        else
          for (const element of statement.exportClause.elements) {
            const label = element.propertyName
              ? `${element.propertyName.text} as ${element.name.text}`
              : element.name.text;
            (statement.isTypeOnly || element.isTypeOnly
              ? typeBindings
              : runtimeBindings
            ).push(label);
          }
        addImport(
          specifier,
          statement,
          runtimeBindings,
          typeBindings,
          false,
          undefined,
          'reexport',
        );
      } else if (
        ts.isImportEqualsDeclaration(statement) &&
        ts.isExternalModuleReference(statement.moduleReference) &&
        statement.moduleReference.expression &&
        ts.isStringLiteralLike(statement.moduleReference.expression)
      ) {
        const specifier = statement.moduleReference.expression.text;
        const resolved = resolveLocal(
          absoluteFile,
          specifier,
          knownFiles,
          root,
          compilerOptions,
        );
        registerImport(statement.name.text, resolved);
        addImport(
          specifier,
          statement,
          statement.isTypeOnly ? [] : [statement.name.text],
          statement.isTypeOnly ? [statement.name.text] : [],
        );
      }
    }

    function visit(node) {
      if (ts.isCallExpression(node)) {
        if (
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        ) {
          addImport(
            node.arguments[0].text,
            node,
            ['<dynamic>'],
            [],
            true,
            undefined,
            'dynamic-import',
          );
        } else if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'require' &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        ) {
          addImport(
            node.arguments[0].text,
            node,
            ['<require>'],
            [],
            false,
            undefined,
            'require',
          );
        } else if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'from' &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        ) {
          const requested = node.arguments[0].text;
          const candidates = [
            requested,
            `${requested}.ts`,
            `${requested}.js`,
            `${requested}/index.ts`,
            `${requested}/index.js`,
          ].map((candidate) => `src/${candidate}`);
          const resolved =
            candidates.find((candidate) => knownFiles.has(candidate)) || null;
          addImport(
            `dist:${requested}`,
            node,
            ['<compiled-loader>'],
            [],
            true,
            resolved,
            'compiled-loader',
          );
        }

        if (ts.isPropertyAccessExpression(node.expression)) {
          const operation = node.expression.name.text;
          const target = node.expression.expression;
          if (
            ts.isPropertyAccessExpression(target) &&
            delegates.has(target.name.text) &&
            (READ_OPERATIONS.has(operation) || WRITE_OPERATIONS.has(operation))
          ) {
            const model = delegates.get(target.name.text);
            prismaAccesses.push({
              file,
              area: record.area,
              scope: record.scope,
              model: model.model,
              table: model.table,
              operation,
              mode: READ_OPERATIONS.has(operation) ? 'read' : 'write',
              receiver: target.expression.getText(sourceFile),
              ...location(sourceFile, node),
            });
          }
          if (operation === '$transaction')
            transactions.push({
              file,
              area: record.area,
              scope: record.scope,
              ...location(sourceFile, node),
            });
          if (
            operation === '$queryRaw' ||
            operation === '$executeRaw' ||
            operation === '$queryRawUnsafe' ||
            operation === '$executeRawUnsafe'
          ) {
            const mode = operation.includes('query') ? 'read' : 'write';
            const callText = node.getText(sourceFile);
            const referenced = models.filter((model) =>
              new RegExp(
                `(?:^|[^A-Za-z0-9_])${model.table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^A-Za-z0-9_])`,
                'i',
              ).test(callText),
            );
            if (referenced.length) {
              for (const model of referenced)
                prismaAccesses.push({
                  file,
                  area: record.area,
                  scope: record.scope,
                  model: model.model,
                  table: model.table,
                  operation,
                  mode,
                  receiver: target.getText(sourceFile),
                  via: 'raw-sql',
                  ...location(sourceFile, node),
                });
            } else {
              prismaAccesses.push({
                file,
                area: record.area,
                scope: record.scope,
                model: null,
                table: '<raw-sql>',
                operation,
                mode,
                receiver: target.getText(sourceFile),
                via: 'raw-sql-unresolved',
                ...location(sourceFile, node),
              });
            }
          }
        }
        if (
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'increment' &&
          node.arguments[1] &&
          ts.isStringLiteralLike(node.arguments[1])
        ) {
          const model = models.find(
            (candidate) => candidate.table === node.arguments[1].text,
          );
          if (model)
            prismaAccesses.push({
              file,
              area: record.area,
              scope: record.scope,
              model: model.model,
              table: model.table,
              operation: 'raw-helper:increment',
              mode: 'write',
              receiver: node.expression.expression.getText(sourceFile),
              via: 'raw-helper',
              ...location(sourceFile, node),
            });
        }
      }

      if (ts.isClassDeclaration(node)) {
        const className = node.name?.text || '<anonymous>';
        for (const decorator of decoratorsOf(node)) {
          const name = decoratorName(decorator);
          if (name === 'Module') {
            const metadata = moduleMetadata(sourceFile, node, decorator, root);
            nestModules.push({
              ...metadata,
              area: record.area,
              scope: record.scope,
              resolvedImports: (metadata.imports || []).map((expression) => {
                const forward = expression.match(
                  /^forwardRef\(\(\)\s*=>\s*([A-Za-z_$][\w$]*)\)/,
                );
                const direct = expression.match(/^([A-Za-z_$][\w$]*)/);
                const localName = forward?.[1] || direct?.[1] || null;
                return {
                  expression,
                  localName,
                  resolvedFile: localName
                    ? (localImports.get(localName) ?? null)
                    : null,
                };
              }),
            });
          }
          if (name === 'Controller')
            controllers.push({
              file,
              area: record.area,
              scope: record.scope,
              className,
              route: literalDecoratorArgument(decorator) || '',
              ...location(sourceFile, node),
            });
        }
        for (const member of node.members) {
          for (const decorator of decoratorsOf(member)) {
            const name = decoratorName(decorator);
            const item = {
              file,
              area: record.area,
              scope: record.scope,
              className,
              method: member.name
                ? member.name.getText(sourceFile)
                : '<anonymous>',
              decorator: name,
              pattern: literalDecoratorArgument(decorator),
              ...location(sourceFile, member),
            };
            if (name === 'MessagePattern' || name === 'EventPattern')
              messageHandlers.push(item);
            if (name === 'Cron' || name === 'Interval' || name === 'Timeout')
              schedules.push(item);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  imports.sort((a, b) =>
    `${a.from}:${a.line}:${a.column}:${a.specifier}`.localeCompare(
      `${b.from}:${b.line}:${b.column}:${b.specifier}`,
    ),
  );
  prismaAccesses.sort((a, b) =>
    `${a.table}:${a.file}:${a.line}:${a.operation}`.localeCompare(
      `${b.table}:${b.file}:${b.line}:${b.operation}`,
    ),
  );
  const internal = imports.filter((edge) => edge.resolved);
  const runtimeEdges = internal
    .filter((edge) => edge.kinds.includes('runtime'))
    .map((edge) => [edge.from, edge.resolved]);
  const allEdges = internal.map((edge) => [edge.from, edge.resolved]);
  const runtimeCycles = stronglyConnectedComponents(files, runtimeEdges);
  const allCycles = stronglyConnectedComponents(files, allEdges);
  const runtimeCycleKeys = new Set(
    runtimeCycles.map((cycle) => cycle.join('\n')),
  );
  const typeOnlyCycles = allCycles.filter(
    (cycle) =>
      !runtimeCycleKeys.has(cycle.join('\n')) &&
      !runtimeCycles.some((runtime) =>
        runtime.every((member) => cycle.includes(member)),
      ),
  );

  const areaDirections = new Map();
  const architectureEdges = internal.filter(
    (edge) =>
      scopeOf(edge.from) !== 'test' && scopeOf(edge.resolved) !== 'test',
  );
  for (const edge of architectureEdges) {
    const fromArea = areaOf(edge.from);
    const toArea = areaOf(edge.resolved);
    if (fromArea === toArea) continue;
    const key = `${fromArea}\n${toArea}`;
    if (!areaDirections.has(key))
      areaDirections.set(key, {
        from: fromArea,
        to: toArea,
        runtime: 0,
        type: 0,
        examples: [],
      });
    const direction = areaDirections.get(key);
    if (edge.kinds.includes('runtime')) direction.runtime += 1;
    if (edge.kinds.includes('type')) direction.type += 1;
    if (direction.examples.length < 5)
      direction.examples.push(`${edge.from}:${edge.line} -> ${edge.resolved}`);
  }
  const areaDependencies = [...areaDirections.values()].sort((a, b) =>
    `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`),
  );
  const reciprocalAreas = [];
  for (const direction of areaDependencies) {
    if (direction.from.localeCompare(direction.to) >= 0) continue;
    const reverse = areaDirections.get(`${direction.to}\n${direction.from}`);
    if (reverse)
      reciprocalAreas.push({
        areas: [direction.from, direction.to],
        forward: direction,
        reverse,
      });
  }

  const moduleByIdentity = new Map(
    nestModules.map((module) => [`${module.file}#${module.className}`, module]),
  );
  const nestEdges = [];
  for (const module of nestModules) {
    for (const item of module.resolvedImports || []) {
      const target = item.resolvedFile
        ? moduleByIdentity.get(`${item.resolvedFile}#${item.localName}`)
        : null;
      nestEdges.push({
        from: module.className,
        fromFile: module.file,
        importedExpression: item.expression,
        resolvedImportFile: item.resolvedFile,
        to: target?.className || null,
        toFile: target?.file || null,
      });
    }
  }
  const nestCycles = stronglyConnectedComponents(
    [...moduleByIdentity.keys()],
    nestEdges
      .filter((edge) => edge.to)
      .map((edge) => [
        `${edge.fromFile}#${edge.from}`,
        `${edge.toFile}#${edge.to}`,
      ]),
  );

  const tableAccess = models.map((model) => ({
    ...model,
    readers: [
      ...new Set(
        prismaAccesses
          .filter(
            (access) =>
              access.model === model.model &&
              access.mode === 'read' &&
              access.scope !== 'test',
          )
          .map((access) => access.file),
      ),
    ].sort(),
    writers: [
      ...new Set(
        prismaAccesses
          .filter(
            (access) =>
              access.model === model.model &&
              access.mode === 'write' &&
              access.scope !== 'test',
          )
          .map((access) => access.file),
      ),
    ].sort(),
    operations: prismaAccesses.filter((access) => access.model === model.model),
  }));

  return {
    schemaVersion: 1,
    sourceRevision:
      options.live || root !== ROOT || process.argv.includes('--live')
        ? gitRevision(root)
        : ARQ01_BASELINE_REVISION,
    analysisMode:
      options.live || root !== ROOT || process.argv.includes('--live')
        ? 'live'
        : 'arq01-snapshot',
    analyzer: 'scripts/architecture-inventory.cjs',
    coverage: {
      roots: CODE_ROOTS,
      rootFiles: ROOT_FILES,
      extensions: [...SOURCE_EXTENSIONS].sort(),
      files: fileRecords.length,
      productionFiles: fileRecords.filter((file) => file.scope === 'production')
        .length,
      testFiles: fileRecords.filter((file) => file.scope === 'test').length,
      toolFiles: fileRecords.filter((file) => file.scope === 'tool').length,
    },
    files: fileRecords,
    imports,
    graph: {
      runtimeCycles,
      typeOnlyCycles,
      allCycles,
      areaDependencies,
      reciprocalAreas,
    },
    nest: {
      modules: nestModules.sort((a, b) => a.file.localeCompare(b.file)),
      edges: nestEdges.sort((a, b) =>
        `${a.from}:${a.importedExpression}`.localeCompare(
          `${b.from}:${b.importedExpression}`,
        ),
      ),
      moduleCycles: nestCycles,
      controllers: controllers.sort((a, b) => a.file.localeCompare(b.file)),
      messageHandlers,
      schedules,
    },
    database: {
      models,
      tableAccess,
      accesses: prismaAccesses,
      transactions: transactions.sort((a, b) =>
        `${a.file}:${a.line}`.localeCompare(`${b.file}:${b.line}`),
      ),
    },
    entrypoints: {
      http: ['src/main.ts', 'src/app.module.ts'],
      worker: [
        ...new Set(messageHandlers.map((handler) => handler.file)),
      ].sort(),
      cli: fileRecords
        .filter(
          (file) =>
            file.file.startsWith('src/') && file.file.endsWith('-cli.ts'),
        )
        .map((file) => file.file),
      scripts: fileRecords
        .filter((file) => file.file.startsWith('scripts/'))
        .map((file) => file.file),
      scheduled: [
        ...new Set(schedules.map((schedule) => schedule.file)),
      ].sort(),
    },
  };
}

function renderReport(inventory) {
  const productionImports = inventory.imports.filter(
    (edge) => scopeOf(edge.from) !== 'test',
  );
  const internal = productionImports.filter((edge) => edge.resolved);
  const external = productionImports.filter((edge) => !edge.resolved);
  const lines = [
    '# Inventário de dependências no baseline',
    '',
    `Fonte: \`${inventory.sourceRevision}\` (modo \`${inventory.analysisMode}\`). Gerado por \`node scripts/architecture-inventory.cjs\`.`,
    '',
    'O JSON ao lado é a evidência canônica por arquivo e linha. Este resumo não substitui o JSON.',
    '',
    '## Cobertura',
    '',
    '| Item | Quantidade |',
    '|---|---:|',
    `| Arquivos analisados | ${inventory.coverage.files} |`,
    `| Produção | ${inventory.coverage.productionFiles} |`,
    `| Testes/fixtures | ${inventory.coverage.testFiles} |`,
    `| Scripts/ferramentas | ${inventory.coverage.toolFiles} |`,
    `| Imports internos em produção/ferramentas | ${internal.length} |`,
    `| Imports externos em produção/ferramentas | ${external.length} |`,
    '',
    'Extensões: ' +
      inventory.coverage.extensions
        .map((extension) => `\`${extension}\``)
        .join(', ') +
      '.',
    '',
    '## Ciclos e reciprocidade',
    '',
    `Ciclos reais entre arquivos no grafo runtime: **${inventory.graph.runtimeCycles.length}**. Ciclos observáveis somente ao adicionar arestas de tipo: **${inventory.graph.typeOnlyCycles.length}**. Ciclos entre módulos Nest: **${inventory.nest.moduleCycles.length}**.`,
    '',
  ];
  if (inventory.graph.runtimeCycles.length) {
    lines.push('| SCC runtime | Arquivos |', '|---:|---|');
    inventory.graph.runtimeCycles.forEach((cycle, index) =>
      lines.push(
        `| ${index + 1} | ${cycle.map((file) => `\`${file}\``).join('<br>')} |`,
      ),
    );
    lines.push('');
  }
  lines.push(
    'Reciprocidade abaixo significa que existem imports nas duas direções entre áreas. Ela não implica, sozinha, SCC entre arquivos nem ciclo de DI.',
    '',
    '| Áreas | A → B (runtime/tipo) | B → A (runtime/tipo) |',
    '|---|---:|---:|',
  );
  for (const pair of inventory.graph.reciprocalAreas)
    lines.push(
      `| \`${pair.areas[0]}\` ↔ \`${pair.areas[1]}\` | ${pair.forward.runtime}/${pair.forward.type} | ${pair.reverse.runtime}/${pair.reverse.type} |`,
    );
  if (!inventory.graph.reciprocalAreas.length) lines.push('| — | 0/0 | 0/0 |');
  lines.push('', '## Entrypoints', '', '| Tipo | Arquivos |', '|---|---|');
  for (const [kind, files] of Object.entries(inventory.entrypoints))
    lines.push(
      `| ${kind} | ${files.map((file) => `\`${file}\``).join('<br>') || '—'} |`,
    );
  lines.push(
    '',
    '## Módulos Nest',
    '',
    '| Módulo | Escopo | Arquivo | imports | providers | exports |',
    '|---|---|---|---|---|---|',
  );
  for (const module of inventory.nest.modules)
    lines.push(
      `| ${module.className} | ${module.scope} | \`${module.file}\` | ${(module.imports || []).join('<br>') || '—'} | ${(module.providers || []).join('<br>') || '—'} | ${(module.exports || []).join('<br>') || '—'} |`,
    );
  lines.push(
    '',
    '## Acesso atual às tabelas',
    '',
    'A classificação é sintática e inclui cada chamada Prisma reconhecida. A matriz normativa de propriedade está na ADR.',
    '',
    '| Modelo (`@@map`) | Leitores de produção | Escritores de produção |',
    '|---|---|---|',
  );
  for (const table of inventory.database.tableAccess)
    lines.push(
      `| ${table.model} (\`${table.table}\`) | ${table.readers.map((file) => `\`${file}\``).join('<br>') || '—'} | ${table.writers.map((file) => `\`${file}\``).join('<br>') || '—'} |`,
    );
  lines.push(
    '',
    '## Reprodução',
    '',
    '```bash',
    'node scripts/architecture-inventory.cjs --check',
    'node scripts/architecture-inventory.cjs --live --stdout > /tmp/architecture-inventory-live.json',
    'node scripts/architecture-inventory.cjs --stdout > /tmp/architecture-inventory.json',
    '```',
    '',
    '`--check` regenera em memória e falha se qualquer um dos dois artefatos versionados estiver desatualizado.',
    '',
  );
  return lines.join('\n');
}

function main() {
  const live = process.argv.includes('--live');
  if (!live) {
    if (!fs.existsSync(JSON_PATH) || !fs.existsSync(REPORT_PATH)) {
      process.stderr.write('ARQ-01 snapshot artifacts are missing\n');
      process.exitCode = 1;
      return;
    }
    const snapshot = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    if (
      snapshot.sourceRevision !== ARQ01_BASELINE_REVISION ||
      snapshot.analysisMode !== 'arq01-snapshot'
    ) {
      process.stderr.write('ARQ-01 snapshot metadata is invalid\n');
      process.exitCode = 1;
      return;
    }
    if (process.argv.includes('--stdout'))
      process.stdout.write(fs.readFileSync(JSON_PATH, 'utf8'));
    else if (process.argv.includes('--check'))
      process.stdout.write('ARQ-01 snapshot metadata is valid\n');
    else {
      process.stderr.write(
        'ARQ-01 snapshot is immutable; use --live --stdout for the current tree\n',
      );
      process.exitCode = 1;
    }
    return;
  }
  const inventory = analyze();
  const json = JSON.stringify(inventory, null, 2) + '\n';
  const report = renderReport(inventory);
  if (process.argv.includes('--stdout')) {
    process.stdout.write(json);
    return;
  }
  process.stdout.write(json);
}

module.exports = {
  analyze,
  stronglyConnectedComponents,
  areaOf,
  scopeOf,
};

if (require.main === module) main();
