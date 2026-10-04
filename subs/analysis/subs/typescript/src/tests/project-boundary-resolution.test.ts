import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRetainedSourceAnalysis } from '../retained-source-analysis.js';
import type { SourceAccess, SourceLimit, SourceTarget } from '../interfaces/source.js';
import type { ProjectExclusion } from '../../../project/src/interfaces/project.js';
import { acquire, analyze, analyzeView, areasFor, code, fixture, sourceLimits, type FixtureBoundaries } from './fixtures.js';

/*
 * PB1-14, PB1-15 and PB1-16 at the TypeScript adapter's evidence boundary:
 * which target each resolved specifier receives. The verdicts (the denied
 * outcome, the boundary diagnostic and the excluded-target limit) belong to
 * the analysis that consumes these targets, not to this owner.
 *
 * The topology follows the written provider topology: a root `app` with an
 * owned-ignored `fixture-project`, an external `external-project`, a child
 * `a` whose owned-ignored `fixtures/sample` is a NodeNext package installed
 * through the link `node_modules/sample`, a plain installed `realpkg`, the
 * output directory `dist`, the root scratch directory and a file beside the
 * root. Every expectation below is derived from the contracts' rules, not
 * from a recorded run.
 */

const fixtureProject: ProjectExclusion = { kind: 'owned-ignored', directory: 'fixture-project', owner: 'fixture' };
const externalProject: ProjectExclusion = { kind: 'external', directory: 'external-project', owner: null };
const sampleTree: ProjectExclusion = { kind: 'owned-ignored', directory: 'subs/a/fixtures/sample', owner: 'fixture/a' };
const output: ProjectExclusion = { kind: 'output', directory: 'dist', owner: null };
const scratch: ProjectExclusion = { kind: 'scratch', directory: 'src/tmp', owner: 'fixture' };
const packages: ProjectExclusion = { kind: 'packages', directory: 'node_modules', owner: null };

const nodeNext = (paths: Readonly<Record<string, readonly string[]>>) => JSON.stringify({
  compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', types: [], strict: true,
    resolveJsonModule: true, allowArbitraryExtensions: true, outDir: 'dist', paths },
  include: ['src', 'subs'],
});

const samplePackage = {
  'subs/a/fixtures/sample/package.json': JSON.stringify({ name: 'sample', type: 'module', exports: {
    '.': { types: './index.d.ts', default: './index.js' },
    './sub': { types: './sub.d.ts', default: './sub.js' },
    './style.css': './style.css',
  } }),
  'subs/a/fixtures/sample/module.ramify': 'ramify 1\nroot module sample\n',
  'subs/a/fixtures/sample/index.js': 'export const sample = 1;\n',
  'subs/a/fixtures/sample/index.d.ts': 'export declare const sample: number;\nexport interface SampleShape { size: number }\n',
  'subs/a/fixtures/sample/sub.js': 'export const sub = 1;\n',
  'subs/a/fixtures/sample/sub.d.ts': 'export declare const sub: number;\n',
  'subs/a/fixtures/sample/hidden.d.ts': 'export declare const hidden: number;\n',
  'subs/a/fixtures/sample/style.css': '.sample {}\n',
  'subs/a/fixtures/sample/style.d.css.ts': 'declare const classes: { sample: string }; export default classes;\n',
};

const topology: Readonly<Record<string, string>> = {
  'tsconfig.json': nodeNext({
    'sample-alias': ['./subs/a/fixtures/sample/index.d.ts'],
    '#sample/*': ['./subs/a/fixtures/sample/*'],
    '#tree/*': ['./fixture-project/src/*'],
    '#internal/*': ['./subs/a/src/*'],
  }),
  'module.ramify': 'ramify 1\nroot module fixture tagged [browser]\nowned-ignored "fixture-project"\nexternal "external-project"\n',
  'subs/a/module.ramify': 'ramify 1\nmodule a\nowned-ignored "fixtures/sample"\n',
  'subs/a/src/api.ts': 'export function api(): number { return 1; }\n',
  ...samplePackage,
  'fixture-project/module.ramify': 'ramify 1\nroot module fixture-project\n',
  'fixture-project/src/thing.ts': 'export const thing = 1;\nexport interface Shape { size: number }\n',
  'fixture-project/src/style.css': '.thing {}\n',
  'external-project/lib.ts': 'export const lib = 2;\n',
  'node_modules/realpkg/package.json': JSON.stringify({ name: 'realpkg', type: 'module', exports: { '.': { types: './index.d.ts', default: './index.js' } } }),
  'node_modules/realpkg/index.js': 'export const real = 1;\n',
  'node_modules/realpkg/index.d.ts': 'export declare const real: number;\n',
  'dist/out.js': 'export const out = 1;\n',
  'dist/out.d.ts': 'export declare const out: number;\n',
  'src/tmp/scratch.ts': 'export const scratch = 1;\n',
  'src/resources.d.ts': 'declare module "*.css" { const classes: Record<string, string>; export default classes; }\n',
  // Every form into the owned-ignored tree by a relative route.
  'src/forms.ts': [
    "import { thing } from '../fixture-project/src/thing.js';",
    "import type { Shape } from '../fixture-project/src/thing.js';",
    "import { type Shape as Inline } from '../fixture-project/src/thing.js';",
    "import '../fixture-project/src/thing.js';",
    "import {} from '../fixture-project/src/thing.js';",
    "import * as tree from '../fixture-project/src/thing.js';",
    "import style from '../fixture-project/src/style.css';",
    "export async function load(): Promise<number> { const { thing: lazy } = await import('../fixture-project/src/thing.js'); return lazy; }",
    "export type Queried = typeof import('../fixture-project/src/thing.js').thing;",
    'export const used: [number, number, Shape | Inline | null, string | undefined] = [thing, tree.thing, null, style.thing];',
    '',
  ].join('\n'),
  // Routes into either tree that are not package resolution, beside the true package.
  'src/routes.ts': [
    "import { sample } from 'sample';",
    "import type { SampleShape } from 'sample';",
    "import { sub } from 'sample/sub';",
    "import packagedStyle from 'sample/style.css';",
    "import { sample as aliased } from 'sample-alias';",
    "import { sample as wildcard } from '#sample/index.js';",
    "import aliasedStyle from '#sample/style.css';",
    "import { sample as relative } from '../subs/a/fixtures/sample/index.js';",
    "import { thing } from '#tree/thing.js';",
    "import { lib } from './linked/lib.js';",
    "import { lib as direct } from '../external-project/lib.js';",
    "import { api } from '#internal/api.js';",
    "import { api as relativeApi } from '../subs/a/src/api.js';",
    'export const routes: [number, number, SampleShape | null, unknown, unknown, number, number, number, number, number, number, number, number] =',
    '  [sample, sub, null, packagedStyle, aliasedStyle, aliased, wildcard, relative, thing, lib, direct, api(), relativeApi()];',
    '',
  ].join('\n'),
  // Always-excluded, outside and unresolved targets.
  'src/limits.ts': [
    "import { real } from 'realpkg';",
    "import { real as installed } from '../node_modules/realpkg/index.js';",
    "import { out } from '../dist/out.js';",
    "import { scratch } from './tmp/scratch.js';",
    "import { outside } from '../../outside.js';",
    "import { hidden } from 'sample/hidden';",
    "import { missing } from './missing.js';",
    'export const limits = [real, installed, out, scratch, outside, hidden, missing];',
    '',
  ].join('\n'),
  // Re-exports into both trees, of a package and of application source.
  'src/forward.ts': [
    "export { thing } from '../fixture-project/src/thing.js';",
    "export type { Shape } from '../fixture-project/src/thing.js';",
    "export * from '../external-project/lib.js';",
    "export {} from '../fixture-project/src/thing.js';",
    "export { sample } from 'sample';",
    "export { api } from '../subs/a/src/api.js';",
    '',
  ].join('\n'),
  'src/consumer.ts': "import { thing, sample, api } from './forward.js';\nimport type { Shape } from './forward.js';\nexport const consumed: [number, number, number, Shape | null] = [thing, sample, api(), null];\n",
};
const boundaries: FixtureBoundaries = {
  exclusions: [fixtureProject, externalProject, sampleTree, output],
  links: { 'node_modules/sample': 'subs/a/fixtures/sample', 'src/linked': 'external-project' },
  outside: { 'outside.ts': 'export const outside = 3;\n' },
};
const children = [{ name: 'a', directory: 'subs/a', tags: [] }];

const created: string[] = [];
afterEach(async () => { for (const directory of created.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function topologyAccesses(files: Readonly<Record<string, string>> = topology, fixtureBoundaries = boundaries) {
  const root = await fixture(files, children, fixtureBoundaries);
  created.push(fixtureBoundaries.outside ? dirname(root) : root);
  const analyzed = await analyze(root);
  try {
    const result = await analyzed.source.accesses();
    return { root, catalog: analyzed.catalog, ...result };
  } finally { await analyzed.dispose(); }
}

/** The one target every access of `specifier` in `file` carries. */
function targetOf(accesses: readonly SourceAccess[], file: string, specifier: string): SourceTarget {
  const targets = accesses.filter(access => access.location.file === file && access.specifier === specifier).map(access => access.target);
  expect(targets.length, `${file} ${specifier}`).toBeGreaterThan(0);
  for (const target of targets) expect(target, `${file} ${specifier}`).toEqual(targets[0]);
  return targets[0]!;
}
const nested = (file: string, exclusion: ProjectExclusion): SourceTarget => ({ kind: 'nested-tree', file, exclusion } as SourceTarget);
const excluded = (file: string, exclusion: ProjectExclusion): SourceTarget => ({ kind: 'excluded', file, exclusion } as SourceTarget);
/** The distinct codes and messages of the limits the accesses of `specifier` in `file` name. */
function notesOf(accesses: readonly SourceAccess[], coverage: readonly SourceLimit[], file: string, specifier: string): string[] {
  const ids = new Set(accesses.filter(access => access.location.file === file && access.specifier === specifier).flatMap(access => access.coverageIds));
  return [...new Set(coverage.filter(note => ids.has(note.id)).map(note => `${note.code}: ${note.message}`))].sort();
}

describe('PB1-14: nonpackage imports into declared trees are boundary targets', () => {
  it('gives every value, type-only, symbol-free, namespace, resource, lazy and type-query form the nested-tree target', async () => {
    const { accesses, coverage } = await topologyAccesses();
    const forms = accesses.filter(access => access.location.file === 'src/forms.ts');
    // One access per selected binding or symbol-free statement, all into the tree.
    expect(forms.map(access => access.form).sort()).toEqual([
      'dynamic-import', 'empty-import', 'import', 'import', 'import-type', 'import-type-query', 'inline-type-import',
      'namespace-import', 'side-effect-import',
    ]);
    for (const access of forms.filter(access => access.specifier !== '../fixture-project/src/style.css')) {
      expect(access.target, access.form).toEqual(nested('fixture-project/src/thing.ts', fixtureProject));
      // Nothing inside the tree is interpreted: no selection reaches an original.
      expect(access.selections.every(selection => selection.original === null), access.form).toBe(true);
    }
    expect(forms.filter(access => !access.runtimeLoad).map(access => access.form).sort()).toEqual(['import-type', 'import-type-query']);
    expect(targetOf(accesses, 'src/forms.ts', '../fixture-project/src/style.css')).toEqual(nested('fixture-project/src/style.css', fixtureProject));
    // Until the boundary rule is enforced, each statement carries one nonblocking limit naming the tree.
    expect(notesOf(accesses, coverage, 'src/forms.ts', '../fixture-project/src/thing.js')).toEqual([
      'outside-module-target: Accessed file fixture-project/src/thing.ts lies in the declared owned-ignored tree fixture-project without package resolution',
    ]);
  }, 60_000);

  it('gives relative, alias and workspace-link routes into either tree the nested-tree target', async () => {
    const { accesses } = await topologyAccesses();
    expect(targetOf(accesses, 'src/routes.ts', '../subs/a/fixtures/sample/index.js')).toEqual(nested('subs/a/fixtures/sample/index.d.ts', sampleTree));
    expect(targetOf(accesses, 'src/routes.ts', '#tree/thing.js')).toEqual(nested('fixture-project/src/thing.ts', fixtureProject));
    // The workspace link is classified at its physical target, not its spelling beneath src/.
    expect(targetOf(accesses, 'src/routes.ts', './linked/lib.js')).toEqual(nested('external-project/lib.ts', externalProject));
    expect(targetOf(accesses, 'src/routes.ts', '../external-project/lib.js')).toEqual(nested('external-project/lib.ts', externalProject));
    // Positive controls: application source by a relative path and by an alias.
    for (const specifier of ['#internal/api.js', '../subs/a/src/api.js']) {
      const target = targetOf(accesses, 'src/routes.ts', specifier);
      expect(target).toMatchObject({ kind: 'application', origin: { file: 'subs/a/src/api.ts', auxiliary: false, area: { owner: 'fixture/a', kind: 'ordinary' } } });
      const selected = accesses.find(access => access.specifier === specifier)!.selections[0]!;
      expect(selected).toMatchObject({ status: 'resolved', original: code('api.ts', 'api', 'fixture/a') });
    }
  }, 60_000);

  it('keeps re-exports into either tree as forwarding-file targets and preserves forwarding provenance', async () => {
    const { accesses, catalog } = await topologyAccesses();
    expect(targetOf(accesses, 'src/forward.ts', '../fixture-project/src/thing.js')).toEqual(nested('fixture-project/src/thing.ts', fixtureProject));
    expect(targetOf(accesses, 'src/forward.ts', '../external-project/lib.js')).toEqual(nested('external-project/lib.ts', externalProject));
    expect(accesses.filter(access => access.location.file === 'src/forward.ts' && access.target.kind === 'nested-tree')
      .map(access => access.form).sort()).toEqual(['empty-export', 'named-export', 'star-export', 'type-export']);
    // The forwarding file's exports from the trees describe no original.
    const forward = catalog.files.find(entry => entry.file === 'src/forward.ts')!;
    expect(forward.state).toBe('incomplete');
    expect(forward.exports.find(entry => entry.name === 'thing')).toMatchObject({ original: null });
    expect(forward.exports.find(entry => entry.name === 'api')).toMatchObject({ original: code('api.ts', 'api', 'fixture/a') });
    expect(catalog.coverage.filter(note => note.location.file === 'src/forward.ts').map(note => note.code).sort())
      .toEqual(['outside-module-target', 'outside-module-target', 'outside-module-target', 'unresolved-original']);
    // Excluded files are never described, and no original is defined in one.
    expect(catalog.files.map(entry => entry.file).filter(file => file.startsWith('src/tmp/')
      || !file.startsWith('src/') && !file.startsWith('subs/a/src/'))).toEqual([]);
    expect(catalog.originals.map(entry => entry.origin.file).filter(file => !file.startsWith('src/') && !file.startsWith('subs/a/src/'))).toEqual([]);
    // A consumer of the barrel keeps the barrel in each selection's forwarding provenance.
    const consumer = accesses.filter(access => access.location.file === 'src/consumer.ts');
    for (const access of consumer) expect(access.target).toMatchObject({ kind: 'application', origin: { file: 'src/forward.ts', auxiliary: false } });
    const selection = (name: string) => consumer.flatMap(access => access.selections).find(item => item.exportedName === name)!;
    expect(selection('thing')).toMatchObject({ status: 'unresolved', original: null });
    expect(selection('sample')).toMatchObject({ status: 'unresolved', original: null });
    expect(selection('api')).toMatchObject({ status: 'resolved', original: code('api.ts', 'api', 'fixture/a') });
    for (const name of ['thing', 'sample', 'api', 'Shape']) {
      expect(selection(name).forwarding.map(origin => [origin.file, origin.auxiliary]), name).toEqual([['src/forward.ts', false]]);
    }
    expect(selection('Shape')).toMatchObject({ request: 'type-only', original: null });
  }, 60_000);
});

describe('PB1-15: installed linked package provenance', () => {
  it('keeps the true package import external at its ignored real target while a bare alias to the same file is a boundary target', async () => {
    const { accesses, coverage } = await topologyAccesses();
    const packaged: SourceTarget = { kind: 'external', resolution: 'package', name: 'sample', resolvedFile: 'subs/a/fixtures/sample/index.d.ts' };
    expect(targetOf(accesses, 'src/routes.ts', 'sample')).toEqual(packaged);
    expect(accesses.filter(access => access.specifier === 'sample' && access.location.file === 'src/routes.ts').map(access => access.form).sort())
      .toEqual(['import', 'import-type']);
    expect(notesOf(accesses, coverage, 'src/routes.ts', 'sample')).toEqual([]);
    // The same physical file by a bare paths alias, exact and wildcard: not package resolution.
    expect(targetOf(accesses, 'src/routes.ts', 'sample-alias')).toEqual(nested('subs/a/fixtures/sample/index.d.ts', sampleTree));
    expect(targetOf(accesses, 'src/routes.ts', '#sample/index.js')).toEqual(nested('subs/a/fixtures/sample/index.d.ts', sampleTree));
    // Export-map subpaths: a listed subpath and resource stay external; an unlisted one is unresolved.
    expect(targetOf(accesses, 'src/routes.ts', 'sample/sub')).toEqual({ kind: 'external', resolution: 'package', name: 'sample/sub', resolvedFile: 'subs/a/fixtures/sample/sub.d.ts' });
    expect(targetOf(accesses, 'src/routes.ts', 'sample/style.css')).toMatchObject({ kind: 'external', resolution: 'package', name: 'sample/style.css' });
    expect(targetOf(accesses, 'src/routes.ts', '#sample/style.css')).toEqual(nested('subs/a/fixtures/sample/style.css', sampleTree));
    expect(targetOf(accesses, 'src/limits.ts', 'sample/hidden')).toEqual({ kind: 'unresolved' });
    // A re-export of the package stays external in the forwarding file.
    expect(targetOf(accesses, 'src/forward.ts', 'sample')).toEqual(packaged);
    // An ordinary installed package is external; a relative path into it is not package resolution.
    expect(targetOf(accesses, 'src/limits.ts', 'realpkg')).toEqual({ kind: 'external', resolution: 'package', name: 'realpkg', resolvedFile: 'node_modules/realpkg/index.d.ts' });
    expect(targetOf(accesses, 'src/limits.ts', '../node_modules/realpkg/index.js')).toEqual(excluded('node_modules/realpkg/index.d.ts', packages));
  }, 60_000);

  it('never takes a bare spelling for package resolution when the alias shares the installed package name', async () => {
    // The paths alias `sample` wins over the installed link of the same name.
    const files = { ...topology, 'tsconfig.json': nodeNext({ sample: ['./subs/a/fixtures/sample/index.d.ts'] }),
      'src/routes.ts': "import { sample } from 'sample';\nimport { sub } from 'sample/sub';\nexport const routes = [sample, sub];\n" };
    for (const file of ['src/forms.ts', 'src/limits.ts', 'src/forward.ts', 'src/consumer.ts']) delete (files as Record<string, string>)[file];
    const { accesses } = await topologyAccesses(files);
    expect(targetOf(accesses, 'src/routes.ts', 'sample')).toEqual(nested('subs/a/fixtures/sample/index.d.ts', sampleTree));
    // The alias does not match the subpath, which resolves through the installed link.
    expect(targetOf(accesses, 'src/routes.ts', 'sample/sub')).toEqual({ kind: 'external', resolution: 'package', name: 'sample/sub', resolvedFile: 'subs/a/fixtures/sample/sub.d.ts' });
  }, 60_000);
});

describe('PB1-16: outside, unresolved and always-excluded targets stay distinct', () => {
  it('names an outside-root file, each always-excluded kind and unresolved targets separately, none external or application', async () => {
    const { accesses, coverage } = await topologyAccesses();
    expect(targetOf(accesses, 'src/limits.ts', '../../outside.js')).toEqual({ kind: 'outside-project', file: '../outside.ts' });
    expect(targetOf(accesses, 'src/limits.ts', '../dist/out.js')).toEqual(excluded('dist/out.d.ts', output));
    expect(targetOf(accesses, 'src/limits.ts', './tmp/scratch.js')).toEqual(excluded('src/tmp/scratch.ts', scratch));
    expect(targetOf(accesses, 'src/limits.ts', '../node_modules/realpkg/index.js')).toEqual(excluded('node_modules/realpkg/index.d.ts', packages));
    expect(targetOf(accesses, 'src/limits.ts', './missing.js')).toEqual({ kind: 'unresolved' });
    expect(notesOf(accesses, coverage, 'src/limits.ts', '../../outside.js')).toEqual([
      'outside-module-target: Accessed file ../outside.ts is outside the project root without package resolution']);
    expect(notesOf(accesses, coverage, 'src/limits.ts', '../dist/out.js')).toEqual([
      'outside-module-target: Accessed file dist/out.d.ts lies in the always-excluded output directory dist without package resolution']);
    expect(notesOf(accesses, coverage, 'src/limits.ts', './tmp/scratch.js')).toEqual([
      'outside-module-target: Accessed file src/tmp/scratch.ts lies in the always-excluded scratch directory src/tmp without package resolution']);
    expect(notesOf(accesses, coverage, 'src/limits.ts', '../node_modules/realpkg/index.js')).toEqual([
      'outside-module-target: Accessed file node_modules/realpkg/index.d.ts lies in the always-excluded packages directory node_modules without package resolution']);
    expect(notesOf(accesses, coverage, 'src/limits.ts', './missing.js')).toEqual(['unresolved-target: Cannot establish the accessed source or resource target']);
    expect(notesOf(accesses, coverage, 'src/limits.ts', 'sample/hidden')).toEqual(['unresolved-target: Cannot establish the accessed source or resource target']);
  }, 60_000);
});

describe('retained adapter parity', () => {
  it('classifies every target as the batch helper does', async () => {
    const root = await fixture(topology, children, boundaries);
    created.push(dirname(root));
    const batchView = await acquire(root), retainedView = await acquire(root);
    const analyzed = await analyzeView(batchView);
    const inventory = retainedView.inventory;
    const analysis = await createRetainedSourceAnalysis({ root, configuration: join(root, 'tsconfig.json'), inventory,
      areas: areasFor(retainedView), limits: sourceLimits, sink: { file() {}, directory() {}, absent() {}, probe() {} } });
    try {
      const batch = await analyzed.source.accesses();
      await analysis.describe(inventory.files.map(file => file.path));
      const retained = await analysis.interpreter().interpret(inventory.files.map(file => file.path));
      const targets = (list: readonly SourceAccess[]) => list.map(access => [access.location.file, access.specifier, access.target]);
      // forms 9, routes 13, limits 7, forward 6 and consumer 4 selected bindings or statements.
      expect(batch.accesses).toHaveLength(39);
      expect(targets(retained.accesses)).toEqual(targets(batch.accesses));
    } finally { await analysis.dispose(); await analyzed.dispose(); await retainedView.dispose(); }
  }, 60_000);
});
