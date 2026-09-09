import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, SymbolFlags } from 'typescript/unstable/sync';
import type { Symbol as CompilerSymbol } from 'typescript/unstable/sync';
import { SyntaxKind, isImportDeclaration, isNamedImports, isStringLiteral } from 'typescript/unstable/ast';

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = resolve(packageRoot, 'examples/collection-review');
const config = resolve(root, 'tsconfig.json');
const compiler = require('typescript/package.json') as { version: string };
const api = new API({ cwd: root });
let snapshot: ReturnType<API['updateSnapshot']> | undefined;

try {
  const parsed = api.parseConfigFile(config);
  snapshot = api.updateSnapshot({ openProjects: [config] });
  const project = snapshot.getProject(config);
  assert.ok(project);
  const sourceFile = (file: string) => {
    const source = project.program.getSourceFile(resolve(root, file));
    assert.ok(source, file);
    return source;
  };
  const original = (symbol: CompilerSymbol) => {
    const target = symbol.flags & SymbolFlags.Alias ? project.checker.getAliasedSymbol(symbol) : symbol;
    assert.equal(project.checker.isUnknownSymbol(target), false);
    return target;
  };
  const declarationFiles = (symbol: CompilerSymbol) => symbol.declarations
    .map(handle => relative(root, handle.path)).sort();

  const client = sourceFile('subs/workspace/src/client.ts');
  const routerImport = client.statements.filter(isImportDeclaration)
    .find(statement => statement.moduleSpecifier.getText() === "'../../../src/interfaces/protocol.js'");
  assert.ok(routerImport);
  const named = routerImport.importClause?.namedBindings;
  assert.ok(named && isNamedImports(named));
  const binding = named.elements.find(element => element.name.text === 'AppRouter');
  assert.ok(binding);
  const imported = project.checker.getSymbolAtLocation(binding.name);
  const accessedModule = project.checker.getSymbolAtLocation(routerImport.moduleSpecifier);
  assert.ok(imported && accessedModule);
  const routerOriginal = original(imported);
  const immediate = project.checker.getImmediateAliasedSymbol(imported);
  assert.ok(immediate);
  assert.deepEqual(declarationFiles(routerOriginal), ['src/assembly.ts']);
  assert.deepEqual(declarationFiles(accessedModule), ['src/interfaces/protocol.ts']);
  assert.deepEqual(declarationFiles(immediate), ['src/interfaces/protocol.ts']);

  const cssSources = [
    'subs/workspace/subs/catalog/subs/ui/src/catalog-card.tsx',
    'subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx',
  ];
  const cssSymbols: CompilerSymbol[] = [];
  const css = cssSources.map(file => {
    const source = sourceFile(file);
    const statement = source.statements.filter(isImportDeclaration).find(node =>
      isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.endsWith('.module.css'));
    assert.ok(statement && isStringLiteral(statement.moduleSpecifier));
    const name = statement.importClause?.name;
    assert.ok(name);
    const symbol = project.checker.getSymbolAtLocation(name);
    const module = project.checker.getSymbolAtLocation(statement.moduleSpecifier);
    assert.ok(symbol && module);
    const target = original(symbol);
    cssSymbols.push(target);
    const exports = project.checker.getExportsOfModule(module).map(item => item.name).sort();
    assert.deepEqual(exports, ['default']);
    assert.equal(Boolean(target.flags & SymbolFlags.Value), true);
    // These authored imports are relative. This probe verifies the physical
    // resources separately; a matching ambient shim cannot prove existence.
    assert.ok(statement.moduleSpecifier.text.startsWith('./'));
    const resourcePath = resolve(dirname(source.fileName), statement.moduleSpecifier.text);
    assert.equal(statSync(resourcePath).isFile(), true);
    return {
      importer: file,
      specifier: statement.moduleSpecifier.text,
      resource: relative(root, resourcePath),
      bytes: statSync(resourcePath).size,
      effectiveExportNames: exports,
      effectiveDescription: declarationFiles(target),
      existsAsValue: Boolean(target.flags & SymbolFlags.Value),
      presentInCompilerSourceFiles: Boolean(project.program.getSourceFile(resourcePath)),
    };
  });
  assert.notEqual(css[0].resource, css[1].resource);
  assert.deepEqual(css[0].effectiveDescription, css[1].effectiveDescription);
  const sharedShimSymbol = cssSymbols[0].id === cssSymbols[1].id;
  assert.equal(sharedShimSymbol, true);

  const vocabulary = sourceFile('subs/workspace/subs/contracts/src/interfaces/vocabulary.ts');
  const vocabularyModule = project.checker.getSymbolAtLocation(vocabulary);
  assert.ok(vocabularyModule);
  const vocabularyExports = project.checker.getExportsOfModule(vocabularyModule)
    .map(symbol => ({ name: symbol.name, originalFiles: declarationFiles(original(symbol)) }))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  assert.equal(vocabularyExports.length, 17);
  assert.ok(vocabularyExports.every(item => item.originalFiles.length === 1
    && item.originalFiles[0] === relative(root, vocabulary.fileName)));

  const diagnostics = [
    ...project.program.getConfigFileParsingDiagnostics(),
    ...project.program.getProgramDiagnostics(),
    ...project.program.getSyntacticDiagnostics(),
    ...project.program.getBindDiagnostics(),
    ...project.program.getSemanticDiagnostics(),
  ];
  assert.deepEqual(diagnostics, []);
  snapshot.dispose();
  assert.equal(snapshot.isDisposed(), true);
  console.log(JSON.stringify({
    probe: 'reference-resolution',
    nodeVersion: process.version,
    compilerVersion: compiler.version,
    projectCompilerVersion: (JSON.parse(readFileSync(resolve(root, 'node_modules/typescript/package.json'), 'utf8')) as { version: string }).version,
    root: relative(packageRoot, root),
    configuration: 'tsconfig.json',
    compilerSelectedFileCount: parsed.fileNames.length,
    compilerDiagnosticCount: diagnostics.length,
    appRouter: {
      accessedFile: declarationFiles(accessedModule),
      intermediateAliasFile: declarationFiles(immediate),
      originalFile: declarationFiles(routerOriginal),
      originalName: routerOriginal.name,
      explicitTypeOnly: routerImport.importClause?.phaseModifier === SyntaxKind.TypeKeyword,
      existsAsValue: Boolean(routerOriginal.flags & SymbolFlags.Value),
    },
    css,
    sharedCompilerShimSymbol: sharedShimSymbol,
    vocabularyExports,
    snapshotDisposed: snapshot.isDisposed(),
  }, null, 2));
} finally {
  if (snapshot && !snapshot.isDisposed()) snapshot.dispose();
  api.close();
}
