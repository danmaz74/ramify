import { rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createSourceAnalysis } from '../source-analysis.js';
import { acquire, areasFor, code, configuration, fixture, sourceLimits, withCatalog } from './fixtures.js';

const api = `export const value = 1;
export interface Type { value: number }
export class Runtime {}
export interface Merged { value: number }
export const Merged = { value: 1 };
export default function defaultValue() {}
`;

describe('static source occurrences through the real compiler', () => {
  it('classifies each binding and preserves written forms, selected names, and exact locations', async () => withCatalog({
    'src/api.ts': api,
    'src/use.ts': `import Default, { value as renamed, Type, Runtime, Merged, type value as TypeOfValue } from '@fixture/api.js';
import type { Runtime as RuntimeType } from './api.js';
export type { value as ExportedType } from './api.js';
export { type Runtime as OtherType, value as exportedValue } from './api.js';
export { renamed as forwardedLocal };
`,
  }, async ({ source }) => {
    const result = await source.accesses();
    expect(result.coverage).toEqual([]);
    const selections = result.accesses.flatMap(access => access.selections.map(selection => [selection.localName, access.form, selection.request,
      selection.explicitType, selection.original?.binding, access.runtimeLoad]));
    expect(selections.sort()).toEqual([
      ['Default', 'import', 'value', false, 'defaultValue', true],
      ['renamed', 'import', 'value', false, 'value', true],
      ['Type', 'import', 'type-only', false, 'Type', true],
      ['Runtime', 'import', 'value', false, 'Runtime', true],
      ['Merged', 'import', 'value', false, 'Merged', true],
      ['TypeOfValue', 'inline-type-import', 'type-only', true, 'value', true],
      ['RuntimeType', 'import-type', 'type-only', true, 'Runtime', false],
      ['ExportedType', 'type-export', 'type-only', true, 'value', false],
      ['OtherType', 'inline-type-export', 'type-only', true, 'Runtime', true],
      ['exportedValue', 'named-export', 'value', false, 'value', true],
    ].sort());
    expect(result.accesses.every(access => access.target.kind === 'application' && access.target.origin.file === 'src/api.ts')).toBe(true);
    expect(result.accesses.find(access => access.selections[0]?.localName === 'Default')).toMatchObject({
      location: { file: 'src/use.ts', line: 1, column: 1 }, selectionForm: 'default',
      selections: [{ location: { file: 'src/use.ts', line: 1, column: 8 } }],
    });
    expect(new Set(result.accesses.map(access => access.id)).size).toBe(10);
    expect(await source.accesses()).toEqual(result);
    expect(Object.isFrozen(result.accesses[0].selections[0].original)).toBe(true);
  }), 30_000);

  it('retains accessed barrels, local aliases and every testing forwarding origin', async () => withCatalog({
    'src/api.ts': api,
    'src/tests/bridge.ts': "import { value as local } from '../api.js'; export { local as renamed };",
    'src/bridge.ts': "export { renamed as default } from './tests/bridge.js';",
    'src/use.ts': "import finalValue from './bridge.js';",
  }, async ({ source }) => {
    const result = await source.accesses();
    const use = result.accesses.find(access => access.importer.file === 'src/use.ts')!;
    expect(use.target).toMatchObject({ kind: 'application', origin: { file: 'src/bridge.ts' } });
    expect(use.selections[0]).toMatchObject({ original: code('api.ts', 'value'), status: 'resolved' });
    expect(use.selections[0].forwarding.map(origin => [origin.file, origin.area.kind])).toEqual([
      ['src/bridge.ts', 'ordinary'], ['src/tests/bridge.ts', 'tests'],
    ]);
  }), 30_000);

  it('keeps symbol-free code and stylesheet targets with their testing areas', async () => withCatalog({
    'src/tests/init.ts': 'globalThis.console.log(1);',
    'src/tests/theme.css': ':root { color: red; }',
    'src/use.ts': "import './tests/init.js';\nimport './tests/theme.css';",
  }, async ({ source }) => {
    const result = await source.accesses();
    expect(result.coverage).toEqual([]);
    expect(result.accesses.map(access => [access.form, access.runtimeLoad, access.selections,
      access.target.kind === 'application' && access.target.origin.area.kind])).toEqual([
      ['side-effect-import', true, [], 'tests'], ['side-effect-import', true, [], 'tests'],
    ]);
  }), 30_000);

  it('distinguishes missing exports and unresolved targets from bounded selections and escaped promises', async () => withCatalog({
    'src/api.ts': api,
    'src/use.ts': `import { Missing } from './api.js';
import { absent } from '@unknown/api';
import * as ns from './api.js'; void ns.value;
export * from './api.js';
const lazy = import('./api.js');
`,
  }, async ({ source }) => {
    const result = await source.accesses();
    expect(result.accesses[0].selections[0].status).toBe('missing-export');
    expect(result.accesses[1].target.kind).toBe('unresolved');
    expect(result.accesses[1].coverageIds.length).toBeGreaterThan(0);
    expect(result.accesses.filter(access => ['namespace-import', 'star-export'].includes(access.form))
      .every(access => access.coverageIds.length === 0 && access.selections[0]?.status === 'resolved')).toBe(true);
    expect(result.accesses.find(access => access.form === 'dynamic-import')!.coverageIds.length).toBeGreaterThan(0);
    expect(result.accesses.some(access => access.target.kind === 'external')).toBe(false);
  }), 30_000);

  it('checks bounded namespace and lazy selections without selecting unrelated exports', async () => withCatalog({
    'src/api.ts': api,
    'src/use.ts': `import * as ns from './api.js';
void ns.value; void ns['value']; const { value: local } = ns;
type T = ns.Type;
void (await import('./api.js')).value;
const lazy = await import('./api.js'); void lazy.value;
const { value: lazyLocal } = await import('./api.js');
import('./api.js').then(m => ({ default: m.value }));
import('./api.js').then(({ value: v }) => v);
`,
  }, async ({ source }) => {
    const result = await source.accesses();
    expect(result.coverage).toEqual([]);
    expect(result.accesses.flatMap(access => access.selections.map(selection => [access.selectionForm, selection.original?.binding, selection.request])))
      .toEqual([
        ['direct-member', 'value', 'value'], ['literal-key', 'value', 'value'], ['destructure', 'value', 'value'],
        ['qualified-type', 'Type', 'type-only'], ['direct-member', 'value', 'value'], ['direct-member', 'value', 'value'],
        ['destructure', 'value', 'value'], ['then-member', 'value', 'value'], ['then-destructure', 'value', 'value'],
      ]);
    expect(new Set(result.accesses.map(access => access.id)).size).toBe(result.accesses.length);
  }), 30_000);

  it('uses nested namespace originals, shadowing, and partial coverage without widening selections', async () => withCatalog({
    'src/api.ts': api,
    'src/bridge.ts': "export * as group from './api.js';",
    'src/use.ts': `import { group } from './bridge.js';
void group.value;
declare function consume(value: unknown): void;
consume(group);
declare const key: string; void group[key];
const { value, ...rest } = group;
function shadow(group: { missing: number }) { return group.missing; }
`,
  }, async ({ source }) => {
    const result = await source.accesses();
    const use = result.accesses.filter(access => access.importer.file === 'src/use.ts');
    expect(use.flatMap(access => access.selections.map(selection => selection.original?.binding))).toEqual(['value', 'value']);
    expect(use.flatMap(access => access.selections).every(selection => selection.forwarding.some(origin => origin.file === 'src/bridge.ts'))).toBe(true);
    expect(result.coverage.map(issue => issue.code).sort()).toEqual(['namespace-escape', 'namespace-escape', 'unknown-key']);
  }), 30_000);

  it('interprets TypeScript and attached JSDoc import types without runtime loads', async () => withCatalog({
    'tsconfig.json': JSON.stringify({ ...configuration, compilerOptions: { ...configuration.compilerOptions, allowJs: true, checkJs: true, noEmit: true } }),
    'src/api.ts': api,
    'src/use.ts': "type T = import('./api.js').Type; type R = typeof import('./api.js').Runtime; type N = typeof import('./api.js');",
    'src/doc.js': "/** @typedef {import('./api.js').Type} Local */\nexport {};",
  }, async ({ source }) => {
    const result = await source.accesses();
    expect(result.coverage).toEqual([]);
    expect(result.accesses.every(access => !access.runtimeLoad && access.selections.every(selection => selection.request === 'type-only'))).toBe(true);
    expect(result.accesses.filter(access => access.form === 'jsdoc-import-type').flatMap(access => access.selections.map(selection => selection.original?.binding))).toEqual(['Type']);
    expect(result.accesses.filter(access => access.selectionForm === 'whole-namespace').flatMap(access => access.selections.map(selection => selection.original?.binding)).sort())
      .toEqual(['Merged', 'Runtime', 'defaultValue', 'value']);
  }), 30_000);

  it('retains incomplete nested expansion through a named namespace relay', async () => withCatalog({
    'src/api.ts': "export const known = 1; export * from './absent.js';",
    'src/bridge.ts': "export * as ns from './api.js';",
    'src/relay.ts': "export { ns } from './bridge.js';",
    'src/use.ts': "type All = typeof import('./relay.js').ns;",
  }, async ({ source }) => {
    const result = await source.accesses();
    const use = result.accesses.filter(access => access.importer.file === 'src/use.ts');
    expect(use.flatMap(access => access.selections.map(selection => selection.original?.binding))).toEqual(['known']);
    expect(use.some(access => access.coverageIds.length > 0)).toBe(true);
    expect(result.coverage.some(issue => issue.location.file === 'src/use.ts' && issue.code === 'incomplete-exports')).toBe(true);
  }), 30_000);

  it('keeps literal dotted export names distinct from nested namespace paths', async () => withCatalog({
    'src/api.ts': 'export const value = 1;',
    'src/bridge.ts': "export * as group from './api.js'; const literal = 2; export { literal as 'group.value' };",
    'src/use.ts': "export * from './bridge.js';",
  }, async ({ source }) => {
    const result = await source.accesses();
    const use = result.accesses.filter(access => access.importer.file === 'src/use.ts');
    expect(result.coverage).toEqual([]);
    expect(use.flatMap(access => access.selections.map(selection => selection.original?.binding)).sort()).toEqual(['literal', 'value']);
    expect(new Set(use.map(access => access.id)).size).toBe(2);
  }), 30_000);

  it('resolves plain initialization scripts with configured aliases and compiler module suffix priority', async () => withCatalog({
    'tsconfig.json': JSON.stringify({ ...configuration, compilerOptions: { ...configuration.compilerOptions, moduleSuffixes: ['.native', ''] } }),
    'src/init.native.ts': 'globalThis.console.log(1);',
    'src/init.ts': 'globalThis.console.log(2);',
    'src/use.ts': "import '@fixture/init.js';",
  }, async ({ source }) => {
    const result = await source.accesses();
    expect(result.coverage).toEqual([]);
    expect(result.accesses[0]).toMatchObject({ target: { kind: 'application', origin: { file: 'src/init.native.ts' } }, selections: [] });
  }), 30_000);

  it('supports access-first calls, releases their lifetime, and preserves detached data', async () => {
    const root = await fixture({ 'src/api.ts': api, 'src/use.ts': "import { value } from './api.js';" });
    const view = await acquire(root);
    let source: Awaited<ReturnType<typeof createSourceAnalysis>> | undefined;
    try {
      source = await createSourceAnalysis({ view, inventory: view.inventory, areas: areasFor(view), limits: sourceLimits });
      const first = await source.accesses();
      expect(first.accesses[0].selections[0].original).toEqual(code('api.ts', 'value'));
      expect((await source.catalog()).originals.length).toBe(5);
      const abort = new AbortController(); abort.abort();
      await expect(source.accesses(abort.signal)).rejects.toMatchObject({ code: 'cancelled' });
      await source.dispose();
      await expect(source.accesses()).rejects.toMatchObject({ code: 'cancelled' });
      expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    } finally { await source?.dispose(); await view.dispose(); await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.each(['maxAccesses', 'maxSelections'] as const)('rejects %s exhaustion without a successful prefix', async name => {
    const root = await fixture({ 'src/api.ts': api, 'src/use.ts': "import { value, Runtime } from './api.js';" });
    const view = await acquire(root);
    let source: Awaited<ReturnType<typeof createSourceAnalysis>> | undefined;
    try {
      source = await createSourceAnalysis({ view, inventory: view.inventory, areas: areasFor(view), limits: { ...sourceLimits, [name]: 1 } });
      await expect(source.accesses()).rejects.toMatchObject({ code: 'resource-limit' });
      await expect(source.accesses()).rejects.toMatchObject({ code: 'resource-limit' });
    } finally { await source?.dispose(); await view.dispose(); await rm(root, { recursive: true, force: true }); }
  }, 30_000);
});
