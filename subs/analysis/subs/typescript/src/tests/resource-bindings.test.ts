import { describe, expect, it } from 'vitest';
import type { SourceCatalog } from '../interfaces/source.js';
import { exported, file, original, resource, withCatalog } from './fixtures.js';

const dependencies = {
  'node_modules/packagea/package.json': '{"name":"packagea","type":"module","types":"./index.d.ts"}',
  'node_modules/packagea/index.d.ts': 'export declare const Value: number;',
  'node_modules/packageb/package.json': '{"name":"packageb","type":"module","types":"./index.d.ts"}',
  'node_modules/packageb/index.d.ts': 'export interface Value { readonly name: string }',
};

function asset(description: string): Record<string, string> {
  return { ...dependencies,
    'src/resources.d.ts': `declare module "*.asset" { ${description} }`,
    'src/data.asset': 'resource bytes',
    'src/forward.ts': 'export { runtime as runtimeForward, typeOnly as typeForward } from "./data.asset";',
  };
}

function sameSpellingFacts(catalog: SourceCatalog): void {
  expect(file(catalog, 'src/data.asset')).toMatchObject({ state: 'complete', issueIds: [] });
  expect(file(catalog, 'src/forward.ts')).toMatchObject({ state: 'complete', issueIds: [] });
  const runtime = exported(catalog, 'src/data.asset', 'runtime').original;
  const typeOnly = exported(catalog, 'src/data.asset', 'typeOnly').original;
  expect(runtime).not.toEqual(typeOnly);
  expect(runtime).toEqual(resource('data.asset', 'runtime'));
  expect(typeOnly).toEqual(resource('data.asset', 'typeOnly'));
  expect(original(catalog, runtime)).toMatchObject({ hasValue: true, hasType: false,
    origin: { file: 'src/data.asset', area: { owner: 'fixture', kind: 'ordinary' } } });
  expect(original(catalog, typeOnly)).toMatchObject({ hasValue: false, hasType: true,
    origin: { file: 'src/data.asset', area: { owner: 'fixture', kind: 'ordinary' } } });
  expect(original(catalog, runtime).declarations.map(location => location.file)).toEqual(['node_modules/packagea/index.d.ts']);
  expect(original(catalog, typeOnly).declarations.map(location => location.file)).toEqual(['node_modules/packageb/index.d.ts']);
  expect(exported(catalog, 'src/forward.ts', 'runtimeForward').original).toEqual(runtime);
  expect(exported(catalog, 'src/forward.ts', 'typeForward').original).toEqual(typeOnly);
  expect(catalog.originals.filter(entry => entry.id.kind === 'resource' && entry.id.file === 'data.asset')).toHaveLength(2);
}

describe('resource bindings from effective export alias groups', () => {
  it('keeps identically named dependency originals distinct with their own value and type facts', async () => {
    await withCatalog(asset('export { Value as runtime } from "packagea"; export { Value as typeOnly } from "packageb";'),
      ({ catalog }) => sameSpellingFacts(catalog));
  }, 30_000);

  it('retains distinct identities and flags when effective declarations are permuted', async () => {
    const summaries: unknown[] = [];
    for (const declarations of [
      'export { Value as runtime } from "packagea"; export { Value as typeOnly } from "packageb";',
      'export { Value as typeOnly } from "packageb"; export { Value as runtime } from "packagea";',
    ]) {
      await withCatalog(asset(declarations), ({ catalog }) => {
        sameSpellingFacts(catalog);
        summaries.push(file(catalog, 'src/data.asset').exports.map(entry => ({
          name: entry.name, id: entry.original, hasValue: original(catalog, entry.original).hasValue,
          hasType: original(catalog, entry.original).hasType,
        })));
      });
    }
    expect(summaries[1]).toEqual(summaries[0]);
  }, 30_000);

  it('coalesces only aliases of the same compiler original using a stable effective name', async () => {
    for (const aliases of ['Value as zRuntime, Value as aRuntime', 'Value as aRuntime, Value as zRuntime']) {
      await withCatalog({
        ...dependencies,
        'src/resources.d.ts': [
          'declare module "*.asset" {',
          `  export { ${aliases} } from "packagea";`,
          '  export { Value as typeOnly } from "packageb";',
          '  export const direct: string;',
          '}',
        ].join('\n'),
        'src/data.asset': 'resource bytes',
        'src/forward.ts': 'export { zRuntime as first, aRuntime as second, typeOnly, direct } from "./data.asset";',
      }, ({ catalog }) => {
        expect(file(catalog, 'src/data.asset')).toMatchObject({ state: 'complete', issueIds: [] });
        const first = exported(catalog, 'src/data.asset', 'zRuntime').original;
        const second = exported(catalog, 'src/data.asset', 'aRuntime').original;
        expect(first).toEqual(resource('data.asset', 'aRuntime'));
        expect(second).toEqual(first);
        expect(exported(catalog, 'src/data.asset', 'typeOnly').original).toEqual(resource('data.asset', 'typeOnly'));
        expect(exported(catalog, 'src/data.asset', 'direct').original).toEqual(resource('data.asset', 'direct'));
        expect(exported(catalog, 'src/forward.ts', 'first').original).toEqual(first);
        expect(exported(catalog, 'src/forward.ts', 'second').original).toEqual(first);
        expect(original(catalog, first)).toMatchObject({ hasValue: true, hasType: false });
        expect(catalog.originals.filter(entry => entry.id.kind === 'resource' && entry.id.file === 'data.asset')).toHaveLength(3);
      });
    }
  }, 30_000);

  it('prefers default within its proven alias group without merging another same-spelling original', async () => {
    await withCatalog({
      ...dependencies,
      'src/resources.d.ts': 'declare module "*.asset" { export { Value as aRuntime, Value as default } from "packagea"; export { Value as typeOnly } from "packageb"; }',
      'src/data.asset': 'resource bytes',
      'src/forward.ts': 'export { aRuntime as first, default as second, typeOnly } from "./data.asset";',
    }, ({ catalog }) => {
      expect(file(catalog, 'src/data.asset')).toMatchObject({ state: 'complete', issueIds: [] });
      const primary = exported(catalog, 'src/data.asset', 'default').original;
      expect(primary).toEqual(resource('data.asset'));
      expect(exported(catalog, 'src/data.asset', 'aRuntime').original).toEqual(primary);
      expect(exported(catalog, 'src/forward.ts', 'first').original).toEqual(primary);
      expect(exported(catalog, 'src/forward.ts', 'second').original).toEqual(primary);
      expect(original(catalog, primary)).toMatchObject({ hasValue: true, hasType: false });
      const typeOnly = exported(catalog, 'src/data.asset', 'typeOnly').original;
      expect(typeOnly).toEqual(resource('data.asset', 'typeOnly'));
      expect(original(catalog, typeOnly)).toMatchObject({ hasValue: false, hasType: true });
    });
  }, 30_000);
});
