import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SourceCatalog } from '../interfaces/source.js';
import { analyze, childOwner, code, configuration, exported, file, fixture, original, resource, withCatalog } from './fixtures.js';

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

  it('propagates an ambiguous namespace constituent through named forwarding and a later star export', async () => {
    await withCatalog({
      'src/a.ts': 'export const clash = 1; export const left = 1;',
      'src/b.ts': 'export const clash = 2; export const right = 2;',
      'src/conflict.ts': 'export * from "./a.js"; export * from "./b.js";',
      'src/namespace.ts': 'export * as ns from "./conflict.js"; export const sibling = 1;',
      'src/interfaces/api.ts': 'export { ns, sibling } from "../namespace.js";',
      'src/public.ts': 'export * from "./interfaces/api.js";',
    }, ({ catalog }) => {
      expect(file(catalog, 'src/conflict.ts').state).toBe('ambiguous');
      expect(file(catalog, 'src/namespace.ts').state).toBe('incomplete');
      expect(catalog.coverage).toContainEqual(expect.objectContaining({ code: 'incomplete-exports',
        location: expect.objectContaining({ file: 'src/interfaces/api.ts', line: 1, column: 10 }) }));
      for (const path of ['src/interfaces/api.ts', 'src/public.ts']) {
        const forwarder = file(catalog, path);
        expect(forwarder.state, path).toBe('incomplete');
        expect(catalog.coverage.some(limit => forwarder.issueIds.includes(limit.id)
          && limit.code === 'incomplete-exports' && limit.location.file === path), path).toBe(true);
        expect(exported(catalog, path, 'sibling').original, path).toEqual(code('namespace.ts', 'sibling'));
        const namespace = exported(catalog, path, 'ns');
        expect(namespace.original, path).toBeNull();
        expect(namespace.namespace?.find(entry => entry.name === 'clash')?.original ?? null, path).toBeNull();
        expect(namespace.namespace?.find(entry => entry.name === 'left')?.original, path).toEqual(code('a.ts', 'left'));
        expect(namespace.namespace?.find(entry => entry.name === 'right')?.original, path).toEqual(code('b.ts', 'right'));
      }
      expect(catalog.originals.filter(entry => entry.id.binding === 'clash')).toHaveLength(2);
    });
  }, 30_000);

  it('propagates an unresolved namespace constituent through a local alias, named forwarding and a later star export', async () => {
    await withCatalog({
      'src/partial.ts': 'export const known = 1; export { absent } from "./missing.js";',
      'src/namespace.ts': 'export * as ns from "./partial.js"; export const sibling = 1;',
      'src/interfaces/api.ts': 'import { ns, sibling } from "../namespace.js";\nexport { ns as forwarded, sibling };',
      'src/public.ts': 'export * from "./interfaces/api.js";',
    }, ({ catalog }) => {
      expect(file(catalog, 'src/partial.ts').state).toBe('incomplete');
      expect(file(catalog, 'src/namespace.ts').state).toBe('incomplete');
      for (const path of ['src/interfaces/api.ts', 'src/public.ts']) {
        const forwarder = file(catalog, path);
        expect(forwarder.state, path).toBe('incomplete');
        expect(catalog.coverage.some(limit => forwarder.issueIds.includes(limit.id)
          && limit.code === 'incomplete-exports' && limit.location.file === path), path).toBe(true);
        expect(exported(catalog, path, 'sibling').original, path).toEqual(code('namespace.ts', 'sibling'));
        const namespace = exported(catalog, path, 'forwarded');
        expect(namespace.namespace?.find(entry => entry.name === 'known')?.original, path).toEqual(code('partial.ts', 'known'));
        expect(namespace.namespace?.find(entry => entry.name === 'absent')?.original ?? null, path).toBeNull();
      }
      expect(catalog.originals.some(entry => entry.id.binding === 'absent')).toBe(false);
    });
  }, 30_000);

  it('propagates namespace completeness across three named forwarding hops', async () => {
    await withCatalog({
      'src/a.ts': 'export const clash = 1;',
      'src/b.ts': 'export const clash = 2;',
      'src/conflict.ts': 'export * from "./a.js"; export * from "./b.js";',
      'src/namespace.ts': 'export * as ns from "./conflict.js";',
      'src/first.ts': 'export { ns } from "./namespace.js"; export const first = 1;',
      'src/second.ts': 'export { ns as renamed } from "./first.js"; export const second = 2;',
      'src/third.ts': 'export { renamed as ns } from "./second.js"; export const third = 3;',
    }, ({ catalog }) => {
      for (const [path, name, own] of [['src/first.ts', 'ns', 'first'], ['src/second.ts', 'renamed', 'second'], ['src/third.ts', 'ns', 'third']] as const) {
        const hop = file(catalog, path);
        expect(hop.state, path).toBe('incomplete');
        expect(catalog.coverage.some(limit => hop.issueIds.includes(limit.id) && limit.code === 'incomplete-exports'
          && limit.location.file === path && limit.location.line === 1), path).toBe(true);
        expect(exported(catalog, path, name).namespace?.find(entry => entry.name === 'clash')?.original ?? null, path).toBeNull();
        expect(exported(catalog, path, own).original, path).toEqual(code(`${own}.ts`, own));
      }
      expect(catalog.originals.filter(entry => entry.id.binding === 'clash')).toHaveLength(2);
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

describe('shared globals declared by application source', () => {
  it('reports module global augmentations while preserving the module exports', async () => {
    await withCatalog({
      'src/globals.ts': [
        'export const local = 1;',
        'declare global { interface Window { readonly ramify: number } }',
        'declare global { var shared: number; }',
      ].join('\n'),
    }, ({ catalog }) => {
      const notes = catalog.coverage.filter(limit => limit.code === 'shared-global');
      expect(notes).toHaveLength(1);
      expect(catalog.coverage).toEqual(notes);
      expect(notes[0]).toMatchObject({ location: { file: 'src/globals.ts', line: 2, column: 1 },
        message: expect.stringContaining('shared globals') });
      expect(notes[0].related.map(location => [location.file, location.line])).toEqual([['src/globals.ts', 3]]);
      expect(file(catalog, 'src/globals.ts')).toMatchObject({ state: 'incomplete', issueIds: [notes[0].id] });
      expect(exported(catalog, 'src/globals.ts', 'local').original).toEqual(code('globals.ts', 'local'));
    });
  }, 30_000);

  it('recognizes import-only module augmentations without flagging local namespaces named global', async () => {
    await withCatalog({
      'src/globals.d.ts': 'import "./local.js";\ndeclare global { interface Window { readonly ramify: number } }',
      'src/local.ts': 'export namespace global { export const value = 1; }\ndeclare module global { export const local: number; }',
      'src/augmentation.d.ts': 'export {};\ndeclare module "./local.js" { export const extra: number; }',
    }, ({ catalog }) => {
      const notes = catalog.coverage.filter(limit => limit.code === 'shared-global');
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ location: { file: 'src/globals.d.ts', line: 2, column: 1 }, related: [] });
      expect(file(catalog, 'src/local.ts')).toMatchObject({ state: 'complete', issueIds: [] });
      expect(file(catalog, 'src/augmentation.d.ts')).toMatchObject({ state: 'complete', issueIds: [] });
    });
  }, 30_000);

  it('reports a cross-owner script global as located coverage instead of a complete script', async () => {
    const root = await fixture({
      'src/globals.ts': 'var sharedSecret = 1;',
      'subs/child/module.ramify': 'ramify 1\nmodule child tagged [ui]\n',
      'subs/child/src/reader.ts': 'export const read = (): number => sharedSecret;',
    }, [childOwner]);
    let result: Awaited<ReturnType<typeof analyze>> | undefined;
    try {
      result = await analyze(root);
      const { catalog } = result;
      const notes = catalog.coverage.filter(limit => limit.code === 'shared-global');
      expect(notes).toHaveLength(1);
      expect(catalog.coverage).toEqual(notes);
      expect(notes[0]).toMatchObject({ location: { file: 'src/globals.ts', line: 1, column: 1 }, related: [],
        message: expect.stringContaining('shared globals') });
      expect(file(catalog, 'src/globals.ts')).toMatchObject({ state: 'incomplete', exports: [], issueIds: [notes[0].id] });
      expect(file(catalog, 'subs/child/src/reader.ts')).toMatchObject({ state: 'complete', issueIds: [] });
      expect(exported(catalog, 'subs/child/src/reader.ts', 'read').original).toEqual(code('reader.ts', 'read', 'fixture/child'));
    } finally { await result?.dispose(); await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it('records one note per script with every further declaration as related evidence', async () => {
    await withCatalog({
      'src/globals.ts': [
        'var first = 1;', 'function second() { return first; }', 'class Third {}', 'enum Fourth { Member }',
        'interface Fifth { readonly value: number }', 'type Sixth = Fifth;', 'namespace Seventh { export const member = 1; }',
        'declare global { interface Window { readonly ramify: number } }', 'console.log(second());',
      ].join('\n'),
    }, ({ catalog }) => {
      const notes = catalog.coverage.filter(limit => limit.code === 'shared-global');
      expect(notes).toHaveLength(1);
      expect(catalog.coverage).toEqual(notes);
      expect(notes[0].location).toMatchObject({ file: 'src/globals.ts', line: 1, column: 1 });
      expect(notes[0].related.map(location => [location.file, location.line])).toEqual([2, 3, 4, 5, 6, 7, 8].map(line => ['src/globals.ts', line]));
      expect(file(catalog, 'src/globals.ts')).toMatchObject({ state: 'incomplete', exports: [], issueIds: [notes[0].id] });
    });
  }, 30_000);

  it('keeps a side-effect-only script complete without a note', async () => {
    await withCatalog({ 'src/boot.ts': "console.log('boot');\nglobalThis.console.log('again');" }, ({ catalog }) => {
      expect(file(catalog, 'src/boot.ts')).toMatchObject({ state: 'complete', exports: [], issueIds: [] });
      expect(catalog.coverage).toEqual([]);
    });
  }, 30_000);

  it('does not treat string-named ambient module declarations as shared globals', async () => {
    await withCatalog({
      'src/shim.d.ts': 'declare module "*.svg" { const url: string; export default url; }\ndeclare module "virtual:icons";',
      'src/icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      'src/use.ts': 'export { default as icon } from "./icon.svg";',
    }, ({ catalog }) => {
      expect(catalog.coverage.some(limit => limit.code === 'shared-global')).toBe(false);
      expect(file(catalog, 'src/shim.d.ts')).toMatchObject({ state: 'complete', exports: [], issueIds: [] });
      expect(exported(catalog, 'src/use.ts', 'icon').original).toEqual(resource('icon.svg'));
    });
  }, 30_000);
});
