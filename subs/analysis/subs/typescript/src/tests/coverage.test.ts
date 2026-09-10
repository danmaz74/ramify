import { describe, expect, it } from 'vitest';
import { configuration, withCatalog } from './fixtures.js';

describe('iteration 12 source coverage boundaries', () => {
  it('separates proven package and builtin scope from unresolved names and outside-module files', async () => withCatalog({
    'node_modules/pkg/package.json': '{"name":"pkg","type":"module","types":"./index.d.ts"}',
    'node_modules/pkg/index.d.ts': 'export declare const value: number;',
    'outside.ts': 'export const value = 2;',
    'src/use.ts': "import { value } from 'pkg'; import 'node:fs'; import { unknown } from '@application/missing'; import { value as outside } from '../outside.js';",
  }, async ({ source }) => {
    const result = await source.accesses();
    expect(result.accesses.map(access => [access.specifier, access.target.kind])).toEqual([
      ['pkg', 'external'], ['node:fs', 'external'], ['@application/missing', 'unresolved'], ['../outside.js', 'outside-module'],
    ]);
    expect(result.accesses[0].target).toMatchObject({ resolution: 'package' });
    expect(result.accesses[1].target).toMatchObject({ resolution: 'builtin' });
    expect(result.coverage.map(issue => issue.code)).toEqual(['unresolved-target', 'outside-module-target']);
  }), 30_000);

  it('keeps a missing resource unverifiable and a missing name on a known resource definite', async () => withCatalog({
    'src/resources.d.ts': 'declare module "*.css" { const classes: Record<string, string>; export default classes; }',
    'src/theme.css': '.theme {}',
    'src/use.ts': "import missing from './missing.css'; import { absentStyle } from './theme.css'; import valid from './theme.css';",
  }, async ({ source }) => {
    const result = await source.accesses();
    expect(result.accesses.map(access => [access.target.kind, access.selections[0].status]))
      .toEqual([['unresolved', 'unresolved'], ['application', 'missing-export'], ['application', 'resolved']]);
    expect(result.coverage.map(issue => issue.code)).toEqual(['resource-target']);
    expect(result.accesses[1].selections[0].location).toMatchObject({ file: 'src/use.ts', line: 1 });
  }), 30_000);

  it.each(['require', 'import-equals', 'export-equals', 'module-exports'])('records %s CommonJS as unsupported access', async variant => withCatalog({
    'package.json': '{"type":"commonjs"}',
    'tsconfig.json': JSON.stringify({ ...configuration, compilerOptions: { ...configuration.compilerOptions, module: 'Node16', moduleResolution: 'Node16' } }),
    'src/api.ts': 'export const value = 1;',
    'src/use.ts': variant === 'require' ? "declare function require(name: string): any; const ns = require('./api.js'); void ns.value;"
      : variant === 'import-equals' ? "import ns = require('./api.js'); void ns.value;"
      : variant === 'export-equals' ? "import ns = require('./api.js'); export = ns;"
      : "declare const module: { exports: unknown }; declare function require(name: string): unknown; module.exports = require('./api.js');",
  }, async ({ source }) => {
    const result = await source.accesses();
    const unsupported = result.accesses.filter(access => access.form === 'commonjs');
    expect(unsupported.length).toBeGreaterThan(0);
    expect(unsupported.every(access => access.selectionForm === 'unknown' && access.selections.length === 0 && access.coverageIds.length > 0)).toBe(true);
    expect(result.coverage.some(issue => issue.code === 'unsupported-commonjs' && issue.location.file === 'src/use.ts')).toBe(true);
    expect(result.accesses.some(access => access.target.kind === 'external')).toBe(false);
  }), 30_000);

  it('reports glob and loader calls without treating arbitrary import methods as native ESM', async () => withCatalog({
    'src/api.ts': 'export const value = 1;',
    'src/use.ts': `interface ImportMeta { glob(pattern: string): unknown }
declare const loader: { import(path: string): unknown };
const modules = import.meta.glob('./*.ts');
void loader.import('./api.js');
import { value } from './api.js'; void value;`,
  }, async ({ source }) => {
    const result = await source.accesses();
    expect(result.accesses.filter(access => access.form === 'macro')).toHaveLength(2);
    expect(result.accesses.filter(access => access.form === 'macro').every(access => access.target.kind === 'unresolved'
      && access.selectionForm === 'unknown' && !access.selections.length)).toBe(true);
    expect(result.coverage.map(issue => issue.code)).toEqual(['unsupported-loader', 'unsupported-loader']);
    expect(result.accesses.find(access => access.form === 'import')!.selections[0]).toMatchObject({ status: 'resolved', original: { binding: 'value' } });
  }), 30_000);

  it('recognizes direct Jiti loader calls through renamed factory and local bindings', async () => withCatalog({
    'node_modules/jiti/package.json': '{"name":"jiti","type":"module","types":"./index.d.ts"}',
    'node_modules/jiti/index.d.ts': 'export declare function createJiti(base: string): (target: string) => unknown;',
    'src/api.ts': 'export const value = 1;',
    'src/use.ts': "import { createJiti as createLoader } from 'jiti'; const evaluate = createLoader(import.meta.url); void evaluate('./api.js');",
  }, async ({ source }) => {
    const result = await source.accesses();
    expect(result.accesses.filter(access => access.form === 'macro')).toHaveLength(1);
    expect(result.accesses.find(access => access.form === 'macro')).toMatchObject({ target: { kind: 'unresolved' }, selections: [], selectionForm: 'unknown' });
    expect(result.coverage.map(issue => issue.code)).toEqual(['unsupported-loader']);
    expect(result.accesses.find(access => access.form === 'import')!.target.kind).toBe('external');
  }), 30_000);

  // Node typings stay outside owned source, as the compiler would find them.
  const nodeTypes = {
    'tsconfig.json': JSON.stringify({ ...configuration, compilerOptions: { ...configuration.compilerOptions, types: ['node'] } }),
    'node_modules/@types/node/package.json': '{"name":"@types/node","types":"./index.d.ts"}',
    'node_modules/@types/node/index.d.ts': `interface ImportMeta { url: string }
declare var require: (id: string) => any;
declare module 'module' { export function createRequire(path: string | URL): (id: string) => any; const Module: { createRequire: typeof createRequire }; export default Module; }
declare module 'node:module' { export * from 'module'; export { default } from 'module'; }`,
    'src/setup.ts': 'const configured = true; void configured;',
  };
  it.each([
    ['named node:module', "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); require('./setup.js');"],
    ['renamed module', "import { createRequire as make } from 'module'; const load = make(import.meta.url); void load('./setup.js');"],
    ['namespace module', "import * as mod from 'module'; const require = mod.createRequire(import.meta.url); require('./setup.js');"],
    ['default node:module', "import mod from 'node:module'; const evaluate = mod.createRequire(import.meta.url); evaluate('./setup.js');"],
  ])('records Node createRequire loads through a %s import as CommonJS access', async (_name, use) => withCatalog({
    ...nodeTypes, 'src/use.ts': use,
  }, async ({ source }) => {
    const result = await source.accesses();
    const loads = result.accesses.filter(access => access.form === 'commonjs');
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ specifier: './setup.js', runtimeLoad: true, selectionForm: 'unknown', selections: [],
      target: { kind: 'application', origin: { file: 'src/setup.ts', area: { kind: 'ordinary' } } } });
    expect(result.coverage.map(issue => issue.code)).toEqual(['unsupported-commonjs']);
    expect(result.accesses.filter(access => access.form !== 'commonjs').every(access => access.target.kind === 'external')).toBe(true);
  }), 30_000);

  it('keeps a createRequire load of a module target unresolved like the ambient require', async () => withCatalog({
    ...nodeTypes, 'src/api.ts': 'export const value = 1;',
    'src/use.ts': "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); void require('./api.js'); void load('./api.js');",
  }, async ({ source }) => {
    const result = await source.accesses();
    expect(result.accesses.filter(access => access.form === 'commonjs').map(access => [access.specifier, access.target.kind]))
      .toEqual([['./api.js', 'unresolved'], ['./api.js', 'unresolved']]);
    expect(result.coverage.map(issue => issue.code)).toEqual(['unsupported-commonjs', 'unresolved-target', 'unsupported-commonjs', 'unresolved-target']);
  }), 30_000);

  it.each([
    ['require function', "function require(name: string) { return name; } void require('./setup.js');"],
    ['createRequire function', "function createRequire(base: string) { return (name: string) => name; } const require = createRequire(import.meta.url); void require('./setup.js');"],
  ])('does not treat an application %s as the CommonJS loader', async (_name, use) => withCatalog({
    ...nodeTypes, 'src/use.ts': use,
  }, async ({ source }) => {
    const result = await source.accesses();
    expect(result.accesses).toEqual([]);
    expect(result.coverage).toEqual([]);
  }), 30_000);

  it('retains known selections beside source resolution and compiler binding problems', async () => withCatalog({
    'src/api.ts': 'export const value = 1;',
    'src/broken.ts': "export { broken } from './missing.js';",
    'src/use.ts': "import { value, value as duplicate, value as duplicate } from './api.js'; import { broken } from './broken.js';",
  }, async ({ source, catalog }) => {
    const result = await source.accesses();
    const use = result.accesses.filter(access => access.importer.file === 'src/use.ts');
    expect(use[0].selections[0]).toMatchObject({ status: 'resolved', original: { binding: 'value' } });
    expect(use.slice(1).every(access => access.selections[0].status === 'unresolved' && access.coverageIds.length > 0)).toBe(true);
    expect(result.coverage.some(issue => issue.code === 'compiler-blocked')).toBe(true);
    expect(catalog.coverage.some(issue => issue.code === 'compiler-blocked' && issue.compilerCode)).toBe(true);
    expect(catalog.coverage).toContainEqual(expect.objectContaining({ code: 'compiler-blocked', compilerCode: 2307,
      location: expect.objectContaining({ file: 'src/broken.ts', line: 1 }) }));
  }), 30_000);

  it('rejects incompatible value/type facts for one resource despite identical exported names', async () => withCatalog({
    'tsconfig.json': JSON.stringify({ ...configuration, compilerOptions: { ...configuration.compilerOptions, paths: { '@theme': ['./src/theme.css'] } } }),
    'src/resources.d.ts': 'declare module "*.css" { const classes: Record<string, string>; export default classes; }\ndeclare module "@theme" { export default interface Classes { readonly theme: string } }',
    'src/theme.css': '.theme {}',
    'src/use.ts': "import classes from './theme.css'; import type Alias from '@theme';",
  }, async ({ source, catalog }) => {
    const resource = catalog.files.find(file => file.file === 'src/theme.css')!;
    expect(resource.state).toBe('ambiguous');
    expect(resource.exports.every(entry => entry.original === null)).toBe(true);
    expect(catalog.originals.some(original => original.id.kind === 'resource' && original.id.file === 'theme.css')).toBe(false);
    expect(catalog.coverage.some(issue => issue.code === 'ambiguous-original' && issue.location.file === 'src/theme.css')).toBe(true);
    const result = await source.accesses();
    expect(result.accesses.every(access => access.selections[0].status === 'unresolved' && access.coverageIds.length > 0)).toBe(true);
  }), 30_000);

  it.each(['dynamic', 'import-type'])('includes %s resource descriptions when checking consistency', async kind => withCatalog({
    'tsconfig.json': JSON.stringify({ ...configuration, compilerOptions: { ...configuration.compilerOptions, paths: { '@theme': ['./src/theme.css'] } } }),
    'src/resources.d.ts': 'declare module "*.css" { const classes: Record<string, string>; export default classes; }\ndeclare module "@theme" { const classes: Record<string, string>; export default classes; export const aliasOnly: string; }',
    'src/theme.css': '.theme {}',
    'src/use.ts': kind === 'dynamic' ? "void (await import('@theme')).aliasOnly; export {};" : "type Alias = typeof import('@theme').aliasOnly;",
  }, async ({ source, catalog }) => {
    expect(catalog.files.find(file => file.file === 'src/theme.css')!.state).toBe('ambiguous');
    const result = await source.accesses();
    expect(result.accesses[0].selections[0].status).toBe('unresolved');
    expect(result.coverage.length).toBeGreaterThan(0);
  }), 30_000);
});
