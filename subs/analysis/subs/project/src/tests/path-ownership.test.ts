import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProject } from '../read-project.js';
import { buildProjectOwnership, classifyProjectPath } from '../ownership.js';
import type { NestedTreeDeclaration } from '../ownership.js';
import type { NestedTreeStatement, ParsedDescription } from '../../../descriptions/src/interfaces/syntax.js';
import type { InventoryModule, PathOwnership, ProjectExclusion, ProjectOwnership, ProjectReadOptions, ProjectScope } from '../interfaces/project.js';
import { limits, marker, put } from './fixtures.js';

// Expectations below are written from the plan's written topology
// (fixtures.md) and the layout specification, not from classifier output.
const span = { start: 0, end: 1, line: 1, column: 1 };
function tree(index: number, kind: NestedTreeStatement['kind'], directory: string): NestedTreeStatement {
  return { index, kind, span, directory: { value: directory, span: { ...span, start: index } } };
}
function described(file: string, name: string, statements: readonly NestedTreeStatement[]): ParsedDescription {
  return { status: 'valid', document: { file, version: 1,
    module: { name, tags: [], root: file === 'module.ramify' ? span : null, span }, tokens: [], statements } };
}
type ModuleInput = Pick<InventoryModule, 'id' | 'parent' | 'directory' | 'description'>;
function module(id: string, parent: string | null, directory: string, statements: readonly NestedTreeStatement[] = []): ModuleInput {
  const file = directory === '.' ? 'module.ramify' : `${directory}/module.ramify`;
  return { id, parent, directory, description: described(file, id.split('/').at(-1)!, statements) };
}
function scopeOf(ownership: ProjectOwnership): ProjectScope {
  return { root: '/project', selection: 'given', invokedFrom: '/project', configuration: '/project/tsconfig.json',
    walkedAreas: [], independentScopes: [], ownership };
}

const rootTrees = [tree(0, 'owned-ignored', 'fixture-project'), tree(1, 'external', 'external-project')];
const aTrees = [tree(0, 'owned-ignored', 'fixtures/sample')];
const topology: readonly ModuleInput[] = [
  module('app', null, '.', rootTrees), module('app/a', 'app', 'subs/a', aTrees), module('app/a/grand', 'app/a', 'subs/a/subs/grand'),
  module('app/a-extra', 'app', 'subs/a-extra'), module('app/b', 'app', 'subs/b'),
];

const owned = (moduleId: string, directory: string, exclusion: ProjectExclusion | null = null): PathOwnership =>
  ({ status: 'owned', module: moduleId, directory, exclusion });
const excluded = (kind: ProjectExclusion['kind'], directory: string): PathOwnership =>
  ({ status: 'excluded', module: null, exclusion: { kind, directory, owner: null } });
const outside: PathOwnership = { status: 'outside-project', module: null };
const appScratch: ProjectExclusion = { kind: 'scratch', directory: 'src/tmp', owner: 'app' };
const aScratch: ProjectExclusion = { kind: 'scratch', directory: 'subs/a/src/tmp', owner: 'app/a' };
const aSample: ProjectExclusion = { kind: 'owned-ignored', directory: 'subs/a/fixtures/sample', owner: 'app/a' };
const fixtureProject: ProjectExclusion = { kind: 'owned-ignored', directory: 'fixture-project', owner: 'app' };

/** The written topology's table: byte-ordered modules, then rooted exclusions with `dist` as the output directory. */
const expectedTable: ProjectOwnership = {
  modules: [
    { id: 'app', parent: null, directory: '.' },
    { id: 'app/a', parent: 'app', directory: 'subs/a' },
    { id: 'app/a-extra', parent: 'app', directory: 'subs/a-extra' },
    { id: 'app/a/grand', parent: 'app/a', directory: 'subs/a/subs/grand' },
    { id: 'app/b', parent: 'app', directory: 'subs/b' },
  ],
  exclusions: [
    { kind: 'output', directory: 'dist', owner: null },
    { kind: 'external', directory: 'external-project', owner: null },
    fixtureProject,
    appScratch,
    { kind: 'scratch', directory: 'subs/a-extra/src/tmp', owner: 'app/a-extra' },
    aSample,
    aScratch,
    { kind: 'scratch', directory: 'subs/a/subs/grand/src/tmp', owner: 'app/a/grand' },
    { kind: 'scratch', directory: 'subs/b/src/tmp', owner: 'app/b' },
  ],
};

/** Path seeds of the written topology and their independently stated ownership. */
const topologySeeds: readonly (readonly [string, PathOwnership])[] = [
  ['.', owned('app', '.')],
  ['module.ramify', owned('app', '.')],
  ['notes/design.md', owned('app', '.')],
  ['notes/new.md', owned('app', '.')],
  ['notes/old.md', owned('app', '.')],
  ['scripts/check.ts', owned('app', '.')],
  ['src/main.ts', owned('app', '.')],
  ['src/tmp', owned('app', '.', appScratch)],
  ['src/tmp/throwaway.test.ts', owned('app', '.', appScratch)],
  ['tools/tmp/helper.ts', owned('app', '.')],
  ['fixture-project', owned('app', '.', fixtureProject)],
  ['fixture-project/module.ramify', owned('app', '.', fixtureProject)],
  ['fixture-project/src/index.ts', owned('app', '.', fixtureProject)],
  ['external-project/file.ts', excluded('external', 'external-project')],
  ['external-project', excluded('external', 'external-project')],
  ['subs', owned('app', '.')],
  ['subs/a', owned('app/a', 'subs/a')],
  ['subs/a/README.md', owned('app/a', 'subs/a')],
  ['subs/a/src/api.ts', owned('app/a', 'subs/a')],
  ['subs/a/src/tests/api.test.ts', owned('app/a', 'subs/a')],
  ['subs/a/src/tests/tmp/real.test.ts', owned('app/a', 'subs/a')],
  ['subs/a/src/tmp/throwaway.ts', owned('app/a', 'subs/a', aScratch)],
  ['subs/a/src/tmp/new.ts', owned('app/a', 'subs/a', aScratch)],
  ['subs/a/scripts/report.ts', owned('app/a', 'subs/a')],
  ['subs/a/fixtures/sample/src/world.ts', owned('app/a', 'subs/a', aSample)],
  ['subs/a/fixtures/sample', owned('app/a', 'subs/a', aSample)],
  ['subs/a/fixtures/other.json', owned('app/a', 'subs/a')],
  ['subs/a/subs/grand/new.txt', owned('app/a/grand', 'subs/a/subs/grand')],
  ['subs/a-extra/src/other.test.ts', owned('app/a-extra', 'subs/a-extra')],
  ['subs/b/src/consumer.ts', owned('app/b', 'subs/b')],
  ['node_modules/sample/index.ts', excluded('packages', 'node_modules')],
  ['dist/output.ts', excluded('output', 'dist')],
  ['subs/a/src/.ramify/category/api.d.ts', excluded('generated', 'subs/a/src/.ramify')],
  ['.ramify-architect/README.md', excluded('generated', '.ramify-architect')],
  ['../outside.ts', outside],
];

describe('PB1-08/PB1-17/PB1-18: the written topology from a pure ownership table', () => {
  const built = buildProjectOwnership(topology, ['dist']);
  const scope = scopeOf(built.ownership);

  it('holds byte-ordered modules and rooted exclusions, with a scratch directory for every module', () => {
    expect(built.ownership).toEqual(expectedTable);
    expect(built.declarations.map(item => [item.module, item.kind, item.directory, item.problem])).toEqual([
      ['app', 'owned-ignored', 'fixture-project', null], ['app', 'external', 'external-project', null],
      ['app/a', 'owned-ignored', 'subs/a/fixtures/sample', null],
    ]);
    expect(Object.isFrozen(built.ownership) && Object.isFrozen(built.ownership.exclusions[0])).toBe(true);
  });

  it.each(topologySeeds)('classifies %s', (path, expected) => {
    expect(classifyProjectPath(scope, path)).toEqual(expected);
  });

  it('classifies a scope that crossed a JSON boundary exactly as the original', () => {
    const copy = JSON.parse(JSON.stringify(scope)) as ProjectScope;
    for (const [path, expected] of topologySeeds) expect(classifyProjectPath(copy, path)).toEqual(expected);
  });

  it('keeps the root owner for root inert paths and never selects a descendant by ancestry', () => {
    // A root-owned path names the root alone; isolated descendants keep their own paths.
    for (const path of ['notes/design.md', 'README.md', 'package.json', 'subs/README.md', 'subs/group/file.txt']) {
      expect(classifyProjectPath(scope, path)).toEqual(owned('app', '.'));
    }
    expect(classifyProjectPath(scope, 'subs/a-extra')).toEqual(owned('app/a-extra', 'subs/a-extra'));
    expect(classifyProjectPath(scope, 'subs/a-extra2/x.ts')).toEqual(owned('app', '.'));
  });
});

describe('PB1-09: the exact scratch position', () => {
  const scope = scopeOf(buildProjectOwnership(topology, []).ownership);
  it.each([
    ['subs/a/src/tmp', owned('app/a', 'subs/a', aScratch)],
    ['subs/a/src/tmp/deep/x.ts', owned('app/a', 'subs/a', aScratch)],
    ['subs/b/src/tmp/x.ts', owned('app/b', 'subs/b', { kind: 'scratch', directory: 'subs/b/src/tmp', owner: 'app/b' })],
    ['subs/a-extra/src/tmp/x.ts', owned('app/a-extra', 'subs/a-extra', { kind: 'scratch', directory: 'subs/a-extra/src/tmp', owner: 'app/a-extra' })],
    // Neither a nested `tmp`, a `tmp` outside `src/`, nor a near name is scratch.
    ['subs/a/src/tests/tmp/real.test.ts', owned('app/a', 'subs/a')],
    ['subs/a/tools/tmp/helper.ts', owned('app/a', 'subs/a')],
    ['subs/a/tmp/x.ts', owned('app/a', 'subs/a')],
    ['subs/a/src/tmpfile.ts', owned('app/a', 'subs/a')],
    ['subs/a/src/tmp2/x.ts', owned('app/a', 'subs/a')],
    ['subs/a/src/lib/tmp/x.ts', owned('app/a', 'subs/a')],
    ['tools/tmp/helper.ts', owned('app', '.')],
    ['subs/src/tmp/x.ts', owned('app', '.')],
    ['src/tests/tmp/x.ts', owned('app', '.')],
  ] as const)('classifies %s', (path, expected) => {
    expect(classifyProjectPath(scope, path)).toEqual(expected);
  });
});

describe('reserved exclusions', () => {
  const scope = scopeOf(buildProjectOwnership(topology, ['build/out']).ownership);
  it.each([
    ['.git', excluded('repository', '.git')],
    ['.git/HEAD', excluded('repository', '.git')],
    ['subs/b/node_modules/lib/index.js', excluded('packages', 'subs/b/node_modules')],
    ['subs/a/src/bower_components/x.js', excluded('packages', 'subs/a/src/bower_components')],
    ['jspm_packages/x.js', excluded('packages', 'jspm_packages')],
    ['build/out/main.js', excluded('output', 'build/out')],
    ['build/other.js', owned('app', '.')],
    ['subs/a/src/.ramify.tmp-1234/x.d.ts', excluded('generated', 'subs/a/src/.ramify.tmp-1234')],
    ['subs/a/src/tests/.ramify.old-abc/x.d.ts', excluded('generated', 'subs/a/src/tests/.ramify.old-abc')],
    ['.ramify-architect.tmp-1/README.md', excluded('generated', '.ramify-architect.tmp-1')],
    // Closed enumeration: near names are ordinary owned paths.
    ['subs/a/src/.ramify-other/x.ts', owned('app/a', 'subs/a')],
    ['subs/a/src/.ramify.tmp/x.ts', owned('app/a', 'subs/a')],
    ['.gitignore', owned('app', '.')],
    ['node_modules.txt', owned('app', '.')],
  ] as const)('classifies %s', (path, expected) => {
    expect(classifyProjectPath(scope, path)).toEqual(expected);
  });

  it('stops at the first exclusion reached from the root, as discovery would', () => {
    expect(classifyProjectPath(scope, 'fixture-project/node_modules/x.js')).toEqual(owned('app', '.', fixtureProject));
    expect(classifyProjectPath(scope, 'subs/a/fixtures/sample/src/tmp/x.ts')).toEqual(owned('app/a', 'subs/a', aSample));
    expect(classifyProjectPath(scope, 'external-project/.git/HEAD')).toEqual(excluded('external', 'external-project'));
    expect(classifyProjectPath(scope, 'node_modules/pkg/subs/a/src/x.ts')).toEqual(excluded('packages', 'node_modules'));
  });
});

describe('outside and invalid paths', () => {
  const scope = scopeOf(buildProjectOwnership(topology, []).ownership);
  it.each(['..', '../outside.ts', '../..', '../../elsewhere/x.ts', '../sibling/subs/a/src/api.ts'])('%s is outside the project', path => {
    expect(classifyProjectPath(scope, path)).toEqual(outside);
  });
  it.each(['', '/project/src/main.ts', '/', 'C:/x.ts', 'src\\main.ts', 'src//main.ts', 'src/', './src/main.ts', 'src/./main.ts',
    'src/../main.ts', 'src/..', '../a/../b', '../.', '.././x', 'subs/a/', '.git/'])('rejects %j', path => {
    expect(classifyProjectPath(scope, path)).toMatchObject({ status: 'invalid-path' });
  });
  it('rejects an in-project path when the scope has no root module', () => {
    const empty = scopeOf(buildProjectOwnership([], []).ownership);
    expect(classifyProjectPath(empty, 'src/main.ts')).toMatchObject({ status: 'invalid-path' });
    expect(classifyProjectPath(empty, 'node_modules/x.js')).toEqual(excluded('packages', 'node_modules'));
    expect(classifyProjectPath(empty, '../x.ts')).toEqual(outside);
  });
});

describe('PB1-03/PB1-04: declaration evidence without the filesystem', () => {
  function evidence(rootStatements: readonly NestedTreeStatement[], aStatements: readonly NestedTreeStatement[] = [], outputs: readonly string[] = ['dist']) {
    const modules = [module('app', null, '.', rootStatements), module('app/a', 'app', 'subs/a', aStatements), module('app/b', 'app', 'subs/b')];
    return buildProjectOwnership(modules, outputs);
  }
  const problems = (declarations: readonly NestedTreeDeclaration[]) =>
    declarations.map(item => [item.module, item.decoded, item.directory, item.problem]);
  const declared = (ownership: ProjectOwnership) => ownership.exclusions.filter(item => item.kind === 'owned-ignored' || item.kind === 'external');

  it('normalizes equivalent spellings relative to the declaring module and retains located evidence', () => {
    const built = evidence([tree(0, 'external', 'tool-cache/./x/..')], [tree(3, 'owned-ignored', './fixtures/../fixtures/sample')]);
    expect(problems(built.declarations)).toEqual([['app', 'tool-cache/./x/..', 'tool-cache', null],
      ['app/a', './fixtures/../fixtures/sample', 'subs/a/fixtures/sample', null]]);
    expect(built.declarations[1]).toMatchObject({ description: 'subs/a/module.ramify', statement: 3, kind: 'owned-ignored', span: { start: 3 } });
    expect(declared(built.ownership)).toEqual([{ kind: 'owned-ignored', directory: 'subs/a/fixtures/sample', owner: 'app/a' },
      { kind: 'external', directory: 'tool-cache', owner: null }]);
  });

  it('rejects escapes, malformed strings, child overlap, external source trees and always-excluded targets', () => {
    const built = evidence([
      tree(0, 'external', '../outside'), tree(1, 'owned-ignored', '.'), tree(2, 'external', '/abs'), tree(3, 'external', 'a//b'),
      tree(4, 'external', 'trailing/'), tree(5, 'external', 'C:/x'), tree(6, 'owned-ignored', 'subs/a/fixtures'), tree(7, 'external', 'subs/b'),
      tree(8, 'external', 'src/vendor'), tree(9, 'owned-ignored', 'src/tmp/keep'), tree(10, 'external', 'node_modules/x'),
      tree(11, 'external', 'dist'), tree(12, 'owned-ignored', 'src/.ramify'), tree(13, 'owned-ignored', 'src/tests/fixture'),
    ], [tree(0, 'owned-ignored', '../../x'), tree(1, 'external', 'fixtures/../..'), tree(2, 'external', 'src/tests/data')]);
    expect(problems(built.declarations)).toEqual([
      ['app', '../outside', null, 'escape'], ['app', '.', '.', 'escape'], ['app', '/abs', null, 'invalid-path'],
      ['app', 'a//b', null, 'invalid-path'], ['app', 'trailing/', null, 'invalid-path'], ['app', 'C:/x', null, 'invalid-path'],
      ['app', 'subs/a/fixtures', 'subs/a/fixtures', 'child-module'], ['app', 'subs/b', 'subs/b', 'child-module'],
      ['app', 'src/vendor', 'src/vendor', 'external-in-src'], ['app', 'src/tmp/keep', 'src/tmp/keep', 'always-excluded'],
      ['app', 'node_modules/x', 'node_modules/x', 'always-excluded'], ['app', 'dist', 'dist', 'always-excluded'],
      ['app', 'src/.ramify', 'src/.ramify', 'always-excluded'],
      // An owned-ignored tree may lie within owned source, including its testing area.
      ['app', 'src/tests/fixture', 'src/tests/fixture', null],
      ['app/a', '../../x', 'x', 'escape'], ['app/a', 'fixtures/../..', 'subs', 'escape'],
      ['app/a', 'src/tests/data', 'subs/a/src/tests/data', 'external-in-src'],
    ]);
    expect(declared(built.ownership)).toEqual([{ kind: 'owned-ignored', directory: 'src/tests/fixture', owner: 'app' }]);
  });

  it('rejects equal or nested declarations of either kind and accepts nonoverlapping neighbours', () => {
    const built = evidence([tree(0, 'owned-ignored', 'data'), tree(1, 'external', 'data/cache'), tree(2, 'owned-ignored', 'logs'),
      tree(3, 'external', './logs'), tree(4, 'owned-ignored', 'data2'), tree(5, 'external', 'datastore/x')]);
    expect(problems(built.declarations)).toEqual([['app', 'data', 'data', 'overlap'], ['app', 'data/cache', 'data/cache', 'overlap'],
      ['app', 'logs', 'logs', 'overlap'], ['app', './logs', 'logs', 'overlap'], ['app', 'data2', 'data2', null],
      ['app', 'datastore/x', 'datastore/x', null]]);
    expect(declared(built.ownership)).toEqual([{ kind: 'owned-ignored', directory: 'data2', owner: 'app' },
      { kind: 'external', directory: 'datastore/x', owner: null }]);
    // A rejected declaration excludes nothing: its paths keep their ordinary owner.
    expect(classifyProjectPath(scopeOf(built.ownership), 'data/cache/x.ts')).toEqual(owned('app', '.'));
  });

  it('takes nothing from an invalid description', () => {
    const invalid: ModuleInput = { id: 'app', parent: null, directory: '.',
      description: { status: 'invalid', file: 'module.ramify', tokens: [], issues: [] } };
    expect(buildProjectOwnership([invalid], []).ownership).toEqual({ modules: [{ id: 'app', parent: null, directory: '.' }],
      exclusions: [appScratch] });
  });
});

describe('PB1-08/PB1-19: an acquired scope classifies absent and deleted paths without reads', () => {
  let work: string, root: string;
  beforeEach(async () => { work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-ownership-'))); root = join(work, 'project'); });
  afterEach(async () => { await rm(work, { recursive: true, force: true }); });

  it('builds the scope table during acquisition and answers after the project is deleted', async () => {
    const documents: Readonly<Record<string, ModuleInput>> = Object.fromEntries(topology.map(item => [
      item.description.status === 'valid' ? item.description.document.file : '', item]));
    for (const file of Object.keys(documents)) await put(root, file, file === 'module.ramify' ? 'ramify 1\nroot module app\n' : 'ramify 1\n');
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { types: [], outDir: 'dist', module: 'ESNext', moduleResolution: 'bundler' },
      files: ['src/main.ts', 'subs/a/src/api.ts', 'subs/b/src/consumer.ts'] }));
    for (const file of ['src/main.ts', 'subs/a/src/api.ts', 'subs/b/src/consumer.ts']) await put(root, file, 'export {};\n');
    await put(root, 'notes/design.md', '# Design\n');
    // The owned-ignored trees hold only data here: discovery does not yet prune them.
    await put(root, 'fixture-project/data.txt', 'data\n');
    await put(root, 'subs/a/fixtures/sample/data.txt', 'data\n');
    // The external tree, scratch directories, `dist` and every seeded file below stay absent.
    const parse: ProjectReadOptions['parse'] = file => documents[file]!.description;
    const result = await readProject({ request: { cwd: root, root, scope: 'whole-project', configuration: 'discover' }, parse, marker, limits });
    expect(result.status, JSON.stringify(result.status === 'acquired' || result.status === 'cancelled' ? {} : result.issues)).toBe('acquired');
    if (result.status !== 'acquired') return;
    const scope = result.view.inventory.scope;
    await result.view.dispose();
    expect(scope.ownership).toEqual(expectedTable);
    expect(Object.isFrozen(scope.ownership)).toBe(true);
    await rm(root, { recursive: true, force: true });
    for (const [path, expected] of topologySeeds) expect(classifyProjectPath(scope, path)).toEqual(expected);
  });
});
