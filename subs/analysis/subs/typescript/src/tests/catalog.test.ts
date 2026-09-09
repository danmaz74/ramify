import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SourceCatalog } from '../interfaces/source.js';
import { analyze, childOwner, code, configuration, exported, file, fixture, original, withCatalog } from './fixtures.js';

describe('compiler-derived code originals', () => {
  let root: string;
  let result: Awaited<ReturnType<typeof analyze>>;
  let catalog: SourceCatalog;
  beforeAll(async () => {
    root = await fixture({
      'tsconfig.json': JSON.stringify({ ...configuration, include: ['src/original.ts'] }),
      'src/original.ts': [
        'export interface Shape { readonly value: number }',
        'export class RuntimeClass { value = 1 }',
        'export interface Merged { readonly value: number }',
        'export const Merged = { value: 1 };',
        'export function work() { return 1; }',
        'export const privateExport = 2;',
        'export const { first, nested: { second } } = { first: 1, nested: { second: 2 } };',
        'export default function OriginalDefault() { return 3; }',
        'const local = 4; export { local as localAlias, local as otherAlias };',
      ].join('\n'),
      'src/forward.ts': [
        'import { Shape as LocalShape, work as localWork } from "@fixture/original.js";',
        'export { LocalShape as RenamedShape, localWork as renamedWork };',
        'export { default as renamedDefault } from "./original.js";',
        'export const wrapper = () => localWork();',
        'export type NewShape = LocalShape;',
      ].join('\n'),
      'src/tests/bridge.ts': 'export { work as testWork } from "../original.js";',
      'src/through-tests.ts': 'export { testWork as productionAlias } from "./tests/bridge.js";',
      'src/namespace.ts': 'export * as publicNamespace from "./original.js";',
      'src/star.ts': 'export * from "./original.js";',
      'src/empty.ts': '// An existing empty interface is a complete empty contract.\n',
      'src/anonymous.ts': 'export default () => 1;',
      'src/tests/owned-test.ts': 'export const testOnly = 1;',
      'subs/child/module.ramify': 'ramify 1\nmodule child tagged [ui]\n',
      'subs/child/src/original.ts': 'export const work = "different owner";',
      'subs/child/src/helpers/tests/ordinary.ts': 'export const stillOrdinary = 1;',
    }, [childOwner]);
    result = await analyze(root);
    catalog = result.catalog;
  }, 30_000);
  afterAll(async () => { await result?.dispose(); if (root) await rm(root, { recursive: true, force: true }); });

  it('catalogs private exports and every owned root excluded from compiler selection', () => {
    expect(file(catalog, 'src/original.ts').exports.map(entry => entry.name).sort()).toEqual([
      'Merged', 'RuntimeClass', 'Shape', 'default', 'first', 'localAlias', 'otherAlias', 'privateExport', 'second', 'work',
    ].sort());
    expect(catalog.files.map(entry => entry.file).sort()).toEqual(result.view.inventory.files.map(entry => entry.path).sort());
    expect(exported(catalog, 'src/tests/owned-test.ts', 'testOnly').original).toEqual(code('tests/owned-test.ts', 'testOnly'));
    expect(exported(catalog, 'subs/child/src/original.ts', 'work').original).toEqual(code('original.ts', 'work', 'fixture/child'));
    expect(catalog.coverage).toEqual([]);
  });

  it('preserves originals through configured aliases, .js substitution, local forwarding and defaults', () => {
    expect(exported(catalog, 'src/forward.ts', 'RenamedShape').original).toEqual(code('original.ts', 'Shape'));
    expect(exported(catalog, 'src/forward.ts', 'renamedWork').original).toEqual(code('original.ts', 'work'));
    expect(exported(catalog, 'src/forward.ts', 'renamedDefault').original).toEqual(code('original.ts', 'OriginalDefault'));
    expect(exported(catalog, 'src/original.ts', 'localAlias').original).toEqual(code('original.ts', 'local'));
    expect(exported(catalog, 'src/original.ts', 'otherAlias').original).toEqual(code('original.ts', 'local'));
    expect(exported(catalog, 'src/anonymous.ts', 'default').original).toEqual(code('anonymous.ts', '#default'));
  });

  it('gives wrappers, new type aliases and same-spelling declarations their own identities', () => {
    expect(exported(catalog, 'src/forward.ts', 'wrapper').original).toEqual(code('forward.ts', 'wrapper'));
    expect(exported(catalog, 'src/forward.ts', 'NewShape').original).toEqual(code('forward.ts', 'NewShape'));
    expect(exported(catalog, 'src/original.ts', 'work').original)
      .not.toEqual(exported(catalog, 'subs/child/src/original.ts', 'work').original);
    expect(catalog.originals.filter(entry => entry.id.binding === 'local')).toHaveLength(1);
  });

  it('classifies unmarked interfaces, classes, functions and merged bindings from the original', () => {
    for (const [binding, hasValue, hasType] of [
      ['Shape', false, true], ['RuntimeClass', true, true], ['Merged', true, true], ['work', true, false],
    ] as const) expect(original(catalog, code('original.ts', binding))).toMatchObject({ hasValue, hasType });
    expect(original(catalog, code('original.ts', 'Merged')).declarations).toHaveLength(2);
    for (const declaration of original(catalog, code('original.ts', 'Merged')).declarations) {
      expect(declaration).toMatchObject({ file: 'src/original.ts', line: expect.any(Number), column: expect.any(Number) });
      expect(declaration.end).toBeGreaterThan(declaration.start);
    }
    expect(original(catalog, code('forward.ts', 'NewShape'))).toMatchObject({ hasValue: false, hasType: true });
  });

  it('retains tests along forwarding paths independently of the defining ordinary area', () => {
    const forwarded = exported(catalog, 'src/through-tests.ts', 'productionAlias');
    expect(forwarded.original).toEqual(code('original.ts', 'work'));
    expect(forwarded.forwarding).toContainEqual({ file: 'src/tests/bridge.ts', area: {
      owner: 'fixture', kind: 'tests', root: 'src/tests', profile: ['testing'],
    } });
    expect(original(catalog, forwarded.original).origin).toEqual({ file: 'src/original.ts', area: {
      owner: 'fixture', kind: 'ordinary', root: 'src', profile: ['browser'],
    } });
    expect(original(catalog, code('helpers/tests/ordinary.ts', 'stillOrdinary', 'fixture/child')).origin.area)
      .toEqual({ owner: 'fixture/child', kind: 'ordinary', root: 'subs/child/src', profile: ['ui'] });
  });

  it('keeps namespace constituent originals and the distinct star/default memberships', () => {
    const namespace = exported(catalog, 'src/namespace.ts', 'publicNamespace');
    expect(namespace.original).toBeNull();
    expect(namespace.namespace?.map(entry => entry.name).sort()).toEqual(file(catalog, 'src/original.ts').exports.map(entry => entry.name).sort());
    expect(namespace.namespace?.find(entry => entry.name === 'work')?.original).toEqual(code('original.ts', 'work'));
    expect(catalog.originals.some(entry => entry.id.binding === 'publicNamespace')).toBe(false);
    expect(file(catalog, 'src/star.ts').exports.map(entry => entry.name).sort())
      .toEqual(file(catalog, 'src/original.ts').exports.filter(entry => entry.name !== 'default').map(entry => entry.name).sort());
  });

  it('distinguishes an existing empty file from an unresolved export set', () => {
    expect(file(catalog, 'src/empty.ts')).toMatchObject({ state: 'complete', exports: [], issueIds: [] });
  });
});

describe('export completeness and compiler limits', () => {
  it('does not retain a compiler-selected winner for conflicting lexical declarations', async () => {
    await withCatalog({
      'src/duplicate.ts': 'export const duplicate=1; export const duplicate=2; export const known=3;',
      'src/a-star.ts': 'export * from "./duplicate.js";',
      'src/forward.ts': 'export { duplicate, known } from "./duplicate.js";',
    }, ({ catalog }) => {
      expect(exported(catalog, 'src/duplicate.ts', 'duplicate').original).toBeNull();
      expect(exported(catalog, 'src/a-star.ts', 'duplicate').original).toBeNull();
      expect(exported(catalog, 'src/forward.ts', 'duplicate').original).toBeNull();
      expect(exported(catalog, 'src/forward.ts', 'known').original).toEqual(code('duplicate.ts', 'known'));
      expect(catalog.originals.some(entry => entry.id.binding === 'duplicate')).toBe(false);
      expect(catalog.coverage.some(limit => limit.compilerCode === 2451)).toBe(true);
    });
  });
  it('propagates ambiguous constituents through later star and named forwarding without losing known originals', async () => {
    await withCatalog({
      'src/a.ts': 'export const collision = 1; export const left = 1;',
      'src/b.ts': 'export const collision = 2; export const right = 2;',
      'src/ambiguous.ts': 'export * from "./a.js"; export * from "./b.js";',
      'src/downstream.ts': 'export * from "./ambiguous.js";',
      'src/final.ts': 'export { collision as chosen } from "./downstream.js";',
      'src/local.ts': 'import { collision } from "./ambiguous.js"; export { collision as chosen };',
      'src/explicit.ts': 'export * from "./a.js"; export * from "./b.js"; export { collision } from "./b.js";',
    }, ({ catalog }) => {
      expect(file(catalog, 'src/ambiguous.ts').state).toBe('ambiguous');
      expect(exported(catalog, 'src/downstream.ts', 'collision').original).toBeNull();
      for (const path of ['src/final.ts', 'src/local.ts']) {
        expect(file(catalog, path).state).not.toBe('complete');
        expect(exported(catalog, path, 'chosen').original).toBeNull();
      }
      expect(exported(catalog, 'src/downstream.ts', 'left').original).toEqual(code('a.ts', 'left'));
      expect(exported(catalog, 'src/downstream.ts', 'right').original).toEqual(code('b.ts', 'right'));
      expect(file(catalog, 'src/explicit.ts').state).toBe('complete');
      expect(exported(catalog, 'src/explicit.ts', 'collision').original).toEqual(code('b.ts', 'collision'));
    });
  }, 30_000);

  it('does not merge one symbol across ordinary and testing declarations in the same owner', async () => {
    await withCatalog({
      'src/value.ts': 'export interface Value { value: number }',
      'src/tests/augment.ts': 'import "../value.js"; declare module "../value.js" { interface Value { test: number } } export { Value } from "../value.js";',
      'src/forward.ts': 'export type { Value } from "./value.js";',
    }, ({ catalog }) => {
      for (const path of ['src/value.ts', 'src/tests/augment.ts', 'src/forward.ts']) {
        expect(file(catalog, path).state).toBe('ambiguous');
        expect(exported(catalog, path, 'Value').original).toBeNull();
      }
      expect(catalog.originals.some(entry => entry.id.binding === 'Value')).toBe(false);
      expect(catalog.coverage).toContainEqual(expect.objectContaining({ code: 'ambiguous-original', related: expect.arrayContaining([
        expect.objectContaining({ file: 'src/value.ts' }), expect.objectContaining({ file: 'src/tests/augment.ts' }),
      ]) }));
    });
  }, 30_000);

  it('distinguishes proven external forwarding, outside-module source, unresolved names and application aliases', async () => {
    await withCatalog({
      'node_modules/fixture-dependency/package.json': '{"name":"fixture-dependency","type":"module","types":"./index.d.ts"}',
      'node_modules/fixture-dependency/index.d.ts': 'export declare const dependency: number;',
      'loose/outside.ts': 'export const outside = 1;',
      'src/external.ts': 'export { dependency } from "fixture-dependency";',
      'src/outside.ts': 'export { outside } from "../loose/outside.js";',
      'src/unresolved.ts': 'export { unknown } from "missing-package";',
      'src/value.ts': 'export const value = 1;',
      'src/alias.ts': 'export { value } from "@fixture/value.js";',
    }, ({ catalog }) => {
      expect(catalog.coverage).toContainEqual(expect.objectContaining({
        code: 'unresolved-original', location: expect.objectContaining({ file: 'src/external.ts' }),
        message: expect.stringContaining('compiler-resolved external'),
      }));
      expect(catalog.coverage).toContainEqual(expect.objectContaining({
        code: 'outside-module-target', location: expect.objectContaining({ file: 'src/outside.ts' }),
      }));
      expect(catalog.coverage).toContainEqual(expect.objectContaining({
        code: 'unresolved-target', location: expect.objectContaining({ file: 'src/unresolved.ts' }),
      }));
      for (const [path, name] of [['src/external.ts', 'dependency'], ['src/outside.ts', 'outside'], ['src/unresolved.ts', 'unknown']]) {
        expect(exported(catalog, path, name).original).toBeNull();
      }
      expect(file(catalog, 'src/alias.ts').state).toBe('complete');
      expect(exported(catalog, 'src/alias.ts', 'value').original).toEqual(code('value.ts', 'value'));
      expect(catalog.originals.map(entry => entry.id)).toEqual([code('value.ts', 'value')]);
    });
  }, 30_000);

  it('keeps known exports while an unresolved forwarding declaration prevents a complete contract', async () => {
    await withCatalog({
      'src/known.ts': 'export const known = 1;',
      'src/partial.ts': 'export { known } from "./known.js";\nexport { absent } from "./missing.js";',
    }, ({ catalog }) => {
      const partial = file(catalog, 'src/partial.ts');
      expect(partial.state).toBe('incomplete');
      expect(exported(catalog, 'src/partial.ts', 'known').original).toEqual(code('known.ts', 'known'));
      expect(partial.issueIds.length).toBeGreaterThan(0);
      expect(catalog.coverage.some(limit => partial.issueIds.includes(limit.id) && limit.location.file === 'src/partial.ts')).toBe(true);
      expect(catalog.originals.some(entry => entry.id.binding === 'absent')).toBe(false);
    });
  }, 30_000);

  it('does not arbitrarily select one of two conflicting star exports', async () => {
    await withCatalog({
      'src/a.ts': 'export const collision = 1; export const left = 1;',
      'src/b.ts': 'export const collision = 2; export const right = 2;',
      'src/ambiguous.ts': 'export * from "./a.js";\nexport * from "./b.js";',
    }, ({ catalog }) => {
      const ambiguous = file(catalog, 'src/ambiguous.ts');
      expect(ambiguous.state).toBe('ambiguous');
      expect(ambiguous.exports.find(entry => entry.name === 'collision')?.original ?? null).toBeNull();
      expect(exported(catalog, 'src/ambiguous.ts', 'left').original).toEqual(code('a.ts', 'left'));
      expect(exported(catalog, 'src/ambiguous.ts', 'right').original).toEqual(code('b.ts', 'right'));
      expect(catalog.coverage.some(limit => ambiguous.issueIds.includes(limit.id))).toBe(true);
    });
  }, 30_000);

  it('accepts repeated star paths to the same original', async () => {
    await withCatalog({
      'src/value.ts': 'export const value = 1;',
      'src/alias.ts': 'export { value } from "./value.js";',
      'src/repeated.ts': 'export * from "./value.js"; export * from "./alias.js";',
    }, ({ catalog }) => {
      expect(file(catalog, 'src/repeated.ts')).toMatchObject({ state: 'complete', issueIds: [] });
      expect(exported(catalog, 'src/repeated.ts', 'value').original).toEqual(code('value.ts', 'value'));
    });
  }, 30_000);

  it('records a located compiler limit for syntax that prevents reliable export enumeration', async () => {
    await withCatalog({ 'src/broken.ts': 'export const = ;\nexport {\n' }, ({ catalog }) => {
      const broken = file(catalog, 'src/broken.ts');
      expect(broken.state).toBe('incomplete');
      expect(catalog.coverage).toContainEqual(expect.objectContaining({
        code: 'compiler-blocked', compilerCode: expect.any(Number),
        location: expect.objectContaining({ file: 'src/broken.ts', line: expect.any(Number) }),
      }));
      expect(broken.issueIds.length).toBeGreaterThan(0);
    });
  }, 30_000);

  it('does not run ordinary TypeScript type checking or execute project entry points', async () => {
    await withCatalog({
      'src/type-error.ts': 'export const declaredNumber: number = "ordinary type error";\nthrow new Error("application must not execute");',
    }, ({ catalog }) => {
      expect(file(catalog, 'src/type-error.ts')).toMatchObject({ state: 'complete', issueIds: [] });
      expect(exported(catalog, 'src/type-error.ts', 'declaredNumber').original).toEqual(code('type-error.ts', 'declaredNumber'));
      expect(catalog.coverage).toEqual([]);
    });
  }, 30_000);
});
