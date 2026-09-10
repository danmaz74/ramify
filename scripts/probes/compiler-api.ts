import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, SymbolFlags } from 'typescript/unstable/sync';
import type { Project, Symbol as CompilerSymbol } from 'typescript/unstable/sync';
import { SyntaxKind, isImportDeclaration, isNamedImports, isStringLiteral } from 'typescript/unstable/ast';

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = resolve(packageRoot, 'scripts/probes/fixtures/compiler-api');
const config = resolve(fixtureRoot, 'tsconfig.json');
const compiler = require('typescript/package.json') as { version: string };
const compilerRoot = require('typescript') as Record<string, unknown>;
const api = new API({ cwd: fixtureRoot });
let snapshot: ReturnType<API['updateSnapshot']> | undefined;

function original(project: Project, symbol: CompilerSymbol): CompilerSymbol {
  const target = symbol.flags & SymbolFlags.Alias ? project.checker.getAliasedSymbol(symbol) : symbol;
  assert.equal(project.checker.isUnknownSymbol(target), false);
  return target;
}

function describe(project: Project, symbol: CompilerSymbol) {
  const target = original(project, symbol);
  return {
    exportName: symbol.name,
    originalName: target.name,
    existsAsValue: Boolean(target.flags & SymbolFlags.Value),
    existsAsType: Boolean(target.flags & SymbolFlags.Type),
    declarations: target.declarations.map(handle => {
      const node = handle.resolve(project);
      assert.ok(node);
      return {
        file: relative(fixtureRoot, node.getSourceFile().fileName),
        start: node.getStart(),
        end: node.end,
      };
    }),
  };
}

try {
  const parsed = api.parseConfigFile(config);
  snapshot = api.updateSnapshot({ openProjects: [config] });
  const project = snapshot.getProject(config);
  assert.ok(project);
  const diagnostics = [
    ...project.program.getConfigFileParsingDiagnostics(),
    ...project.program.getProgramDiagnostics(),
    ...project.program.getSyntacticDiagnostics(),
    ...project.program.getBindDiagnostics(),
    ...project.program.getSemanticDiagnostics(),
  ];
  assert.deepEqual(diagnostics, []);

  const imports = ['src/consumer.ts', 'src/alias-consumer.ts'].flatMap(file => {
    const source = project.program.getSourceFile(resolve(fixtureRoot, file));
    assert.ok(source);
    return source.statements.filter(isImportDeclaration).flatMap(statement => {
      assert.ok(isStringLiteral(statement.moduleSpecifier));
      const module = project.checker.getSymbolAtLocation(statement.moduleSpecifier);
      assert.ok(module);
      const named = statement.importClause?.namedBindings;
      assert.ok(named && isNamedImports(named));
      return named.elements.map(binding => {
        const symbol = project.checker.getSymbolAtLocation(binding.name);
        assert.ok(symbol);
        const target = describe(project, symbol);
        return {
          importer: file,
          specifier: statement.moduleSpecifier.getText(),
          selectedName: binding.name.text,
          writtenTypeOnly: statement.importClause?.phaseModifier === SyntaxKind.TypeKeyword || binding.isTypeOnly,
          resolvedModule: module.declarations.map(handle => relative(fixtureRoot, handle.path)),
          ...target,
        };
      });
    });
  });
  const selected = (name: string) => {
    const item = imports.find(value => value.selectedName === name);
    assert.ok(item);
    return item;
  };
  assert.equal(selected('Shape').writtenTypeOnly, false);
  assert.equal(selected('Shape').existsAsValue, false);
  assert.equal(selected('Shape').existsAsType, true);
  for (const name of ['RuntimeClass', 'Merged']) {
    assert.equal(selected(name).existsAsValue, true);
    assert.equal(selected(name).existsAsType, true);
  }
  assert.deepEqual(selected('Shape').declarations, selected('ForwardedShape').declarations);
  assert.deepEqual(selected('Shape').declarations, selected('PathAliasShape').declarations);
  assert.deepEqual(selected('Shape').resolvedModule, ['src/originals.ts']);
  assert.deepEqual(selected('PathAliasShape').resolvedModule, ['src/originals.ts']);

  const exportsOf = (file: string) => {
    const source = project.program.getSourceFile(resolve(fixtureRoot, file));
    assert.ok(source);
    const module = project.checker.getSymbolAtLocation(source);
    assert.ok(module);
    return project.checker.getExportsOfModule(module)
      .map(symbol => describe(project, symbol))
      .sort((left, right) => left.exportName.localeCompare(right.exportName, 'en'));
  };
  const interfaceExports = exportsOf('src/interfaces/public.ts');
  assert.deepEqual(interfaceExports.map(value => value.exportName), [
    'Contract', 'default', 'ownAlias', 'ownValue', 'unselectedExport',
  ]);
  assert.deepEqual(
    interfaceExports.find(value => value.exportName === 'ownAlias')?.declarations,
    interfaceExports.find(value => value.exportName === 'ownValue')?.declarations,
  );
  const originalExports = exportsOf('src/originals.ts');
  assert.ok(originalExports.some(value => value.exportName === 'privateExport'));
  const forwardExports = exportsOf('src/forward.ts');
  assert.deepEqual(
    forwardExports.find(value => value.exportName === 'renamedDefault')?.declarations,
    originalExports.find(value => value.exportName === 'default')?.declarations,
  );

  snapshot.dispose();
  assert.equal(snapshot.isDisposed(), true);
  console.log(JSON.stringify({
    probe: 'compiler-api',
    nodeVersion: process.version,
    compilerVersion: compiler.version,
    rootExports: Object.keys(compilerRoot).sort(),
    entry: 'typescript/unstable/sync',
    fixture: relative(packageRoot, fixtureRoot),
    selectedRootFiles: parsed.fileNames.map(file => relative(fixtureRoot, file)).sort(),
    compilerDiagnosticCount: diagnostics.length,
    imports,
    interfaceExports,
    originalExports,
    forwardExports,
    snapshotDisposed: snapshot.isDisposed(),
  }, null, 2));
} finally {
  if (snapshot && !snapshot.isDisposed()) snapshot.dispose();
  api.close();
}
