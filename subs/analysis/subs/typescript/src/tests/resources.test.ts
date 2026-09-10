import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SourceCatalog } from '../interfaces/source.js';
import { analyze, childOwner, configuration, exported, file, fixture, original, resource, withCatalog } from './fixtures.js';

describe('resource-specific effective exports', () => {
  let root: string;
  let result: Awaited<ReturnType<typeof analyze>>;
  let catalog: SourceCatalog;
  beforeAll(async () => {
    root = await fixture({
      'src/resources.d.ts': [
        'declare module "*.module.css" {',
        '  const classes: { readonly [key: string]: string };',
        '  export default classes;',
        '}',
      ].join('\n'),
      'src/theme.module.css': '.root { color: red; }',
      'src/unimported.module.css': '.unused { color: blue; }',
      'src/forward.ts': 'export { default as theme } from "./theme.module.css";\nexport { default as aliasTheme } from "@fixture/theme.module.css";',
      'src/data.json': '{"answer":42,"label":"owned JSON"}',
      'src/json.ts': 'import data from "./data.json"; export { data as jsonData };',
      'subs/child/module.ramify': 'ramify 1\nmodule child tagged [ui]\n',
      'subs/child/src/theme.module.css': '.child { color: green; }',
      'subs/child/src/view.ts': 'export { default as theme } from "./theme.module.css";',
      'src/tests/testing.module.css': '.testing { color: purple; }',
      'src/tests/forward.ts': 'export { default as testingTheme } from "./testing.module.css";',
    }, [childOwner]);
    result = await analyze(root);
    catalog = result.catalog;
  }, 30_000);
  afterAll(async () => { await result?.dispose(); if (root) await rm(root, { recursive: true, force: true }); });

  it('keeps two existing resources distinct under one shared shim', () => {
    const first = exported(catalog, 'src/theme.module.css', 'default');
    const second = exported(catalog, 'subs/child/src/theme.module.css', 'default');
    expect(first.original).toEqual(resource('theme.module.css'));
    expect(second.original).toEqual(resource('theme.module.css', 'default', 'fixture/child'));
    expect(first.original).not.toEqual(second.original);
    expect(file(catalog, 'src/theme.module.css')).toMatchObject({ state: 'complete', descriptionFiles: ['src/resources.d.ts'] });
    expect(file(catalog, 'subs/child/src/theme.module.css').descriptionFiles).toEqual(['src/resources.d.ts']);
    expect(original(catalog, first.original)).toMatchObject({ hasValue: true, hasType: false,
      origin: { file: 'src/theme.module.css', area: { owner: 'fixture', kind: 'ordinary' } } });
    expect(original(catalog, second.original).origin.area).toMatchObject({ owner: 'fixture/child', profile: ['ui'] });
  });

  it('preserves the resource identity through a forwarding export and a configured resource alias', () => {
    expect(exported(catalog, 'src/forward.ts', 'theme').original).toEqual(resource('theme.module.css'));
    expect(exported(catalog, 'src/forward.ts', 'aliasTheme').original).toEqual(resource('theme.module.css'));
    expect(catalog.originals.filter(entry => entry.id.kind === 'resource' && entry.id.owner === 'fixture'
      && entry.id.file === 'theme.module.css')).toHaveLength(1);
  });

  it('catalogs effective descriptions of resources that source never imports', () => {
    expect(file(catalog, 'src/unimported.module.css')).toMatchObject({ state: 'complete', issueIds: [], descriptionFiles: ['src/resources.d.ts'] });
    expect(exported(catalog, 'src/unimported.module.css', 'default').original).toEqual(resource('unimported.module.css'));
  });

  it('takes JSON binding ownership from the actual JSON file and preserves its forwarding identity', () => {
    expect(file(catalog, 'src/data.json').state).toBe('complete');
    const forwarded = exported(catalog, 'src/json.ts', 'jsonData').original;
    expect(forwarded).toEqual(resource('data.json'));
    expect(exported(catalog, 'src/data.json', 'default').original).toEqual(forwarded);
    expect(original(catalog, forwarded)).toMatchObject({ hasValue: true, origin: { file: 'src/data.json', area: { owner: 'fixture' } } });
    expect(file(catalog, 'src/data.json').descriptionFiles.every(path => !path.endsWith('.d.ts'))).toBe(true);
  });

  it('keeps a resource under tests in its defining testing area despite the shared ordinary shim', () => {
    const testing = exported(catalog, 'src/tests/forward.ts', 'testingTheme').original;
    expect(testing).toEqual(resource('tests/testing.module.css'));
    expect(original(catalog, testing).origin).toEqual({ file: 'src/tests/testing.module.css', area: {
      owner: 'fixture', kind: 'tests', root: 'src/tests', profile: ['testing'],
    } });
  });

  it('does not invent absent resource export names from a broad class index signature', () => {
    expect(file(catalog, 'src/theme.module.css').exports.map(entry => entry.name)).toEqual(['default']);
    expect(file(catalog, 'src/theme.module.css').exports.some(entry => entry.name === 'missingName')).toBe(false);
  });
});

describe('resource descriptions and existence', () => {
  it('resolves a resource alias relative to the inherited configuration that defines paths', async () => {
    await withCatalog({
      'tsconfig.json': '{"extends":"./config/base.json","include":["src"]}',
      'config/base.json': JSON.stringify({ compilerOptions: {
        ...configuration.compilerOptions, paths: { '@asset/*': ['../src/assets/*'] },
      } }),
      'src/shim.d.ts': 'declare module "*.module.css" { const classes: {theme:string}; export default classes; }',
      'src/assets/theme.module.css': '.theme {}',
      'src/forward.ts': 'export { default as theme } from "@asset/theme.module.css";',
    }, ({ catalog }) => {
      expect(file(catalog, 'src/forward.ts').state).toBe('complete');
      expect(exported(catalog, 'src/forward.ts', 'theme').original).toEqual(resource('assets/theme.module.css'));
    });
  }, 30_000);

  it('does not select a later resource paths fallback after TypeScript resolved an earlier package declaration', async () => {
    await withCatalog({
      'tsconfig.json': JSON.stringify({ ...configuration, compilerOptions: {
        ...configuration.compilerOptions, paths: { '@chosen': ['./node_modules/pkg/index.d.ts', './src/style.css'] },
      } }),
      'node_modules/pkg/package.json': '{"name":"pkg","type":"module","types":"./index.d.ts"}',
      'node_modules/pkg/index.d.ts': 'declare const library: number; export default library; export declare const externalName: number;',
      'src/style.css': '.style {}',
      'src/shim.d.ts': 'declare module "*.css" { const classes: {style:string}; export default classes; }',
      'src/forward.ts': 'export { default as selected } from "@chosen";',
    }, ({ catalog }) => {
      expect(file(catalog, 'src/style.css')).toMatchObject({ state: 'complete', descriptionFiles: ['src/shim.d.ts'] });
      expect(file(catalog, 'src/style.css').exports.map(entry => entry.name)).toEqual(['default']);
      expect(exported(catalog, 'src/forward.ts', 'selected').original).toBeNull();
      expect(catalog.originals.some(entry => entry.id.kind === 'resource' && entry.id.binding === 'externalName')).toBe(false);
      expect(catalog.coverage).toContainEqual(expect.objectContaining({ location: expect.objectContaining({ file: 'src/forward.ts' }),
        message: expect.stringContaining('compiler-resolved external') }));
    });
  }, 30_000);

  it('reports a missing resource beside its per-file declaration as a resource target limit', async () => {
    await withCatalog({
      'src/theme.d.css.ts': 'declare const classes: {theme:string}; export default classes;',
      'src/forward.ts': 'export { default as theme } from "./theme.css";',
    }, ({ catalog }) => {
      expect(file(catalog, 'src/forward.ts').state).toBe('incomplete');
      expect(exported(catalog, 'src/forward.ts', 'theme').original).toBeNull();
      expect(catalog.originals.some(entry => entry.id.kind === 'resource')).toBe(false);
      expect(catalog.coverage).toContainEqual(expect.objectContaining({ code: 'resource-target',
        location: expect.objectContaining({ file: 'src/forward.ts' }) }));
      expect(catalog.coverage.some(limit => limit.code === 'outside-module-target')).toBe(false);
    });
  }, 30_000);

  it('coalesces aliases proven equivalent within one resource', async () => {
    await withCatalog({
      'src/resource.d.ts': 'declare module "*.tokens" { const tokens: { value: string }; export { tokens as default, tokens as alternate }; }',
      'src/colors.tokens': 'color=blue',
      'src/forward.ts': 'export { default as first, alternate as second } from "./colors.tokens";',
    }, ({ catalog }) => {
      expect(file(catalog, 'src/colors.tokens').exports.map(entry => entry.name).sort()).toEqual(['alternate', 'default']);
      expect(exported(catalog, 'src/colors.tokens', 'alternate').original)
        .toEqual(exported(catalog, 'src/colors.tokens', 'default').original);
      expect(exported(catalog, 'src/forward.ts', 'first').original).toEqual(exported(catalog, 'src/forward.ts', 'second').original);
      expect(catalog.originals.filter(entry => entry.id.kind === 'resource' && entry.id.file === 'colors.tokens')).toHaveLength(1);
    });
  }, 30_000);

  it('uses a per-file arbitrary-extension declaration as the resource description', async () => {
    await withCatalog({
      'src/theme.css': '.theme { color: blue; }',
      'src/theme.d.css.ts': 'declare const classes: { theme: string }; export default classes; export declare const themeName: string;',
      'src/forward.ts': 'export { default as theme, themeName } from "./theme.css";',
    }, ({ catalog }) => {
      expect(file(catalog, 'src/theme.css')).toMatchObject({ state: 'complete', descriptionFiles: ['src/theme.d.css.ts'] });
      expect(file(catalog, 'src/theme.css').exports.map(entry => entry.name).sort()).toEqual(['default', 'themeName']);
      expect(exported(catalog, 'src/forward.ts', 'theme').original).toEqual(resource('theme.css'));
      expect(exported(catalog, 'src/forward.ts', 'themeName').original).toEqual(resource('theme.css', 'themeName'));
    });
  }, 30_000);

  it('does not let a matching shim establish a missing resource', async () => {
    await withCatalog({
      'src/shim.d.ts': 'declare module "*.module.css" { const value: { [name: string]: string }; export default value; }',
      'src/forward.ts': 'export { default as absent } from "./missing.module.css";',
    }, ({ catalog }) => {
      expect(file(catalog, 'src/forward.ts').state).toBe('incomplete');
      expect(catalog.originals.some(entry => entry.id.kind === 'resource')).toBe(false);
      expect(catalog.files.some(entry => entry.file === 'src/missing.module.css')).toBe(false);
      expect(catalog.coverage).toContainEqual(expect.objectContaining({ code: 'resource-target',
        location: expect.objectContaining({ file: 'src/forward.ts' }) }));
    });
  }, 30_000);
});
