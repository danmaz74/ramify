import { createHook } from 'node:async_hooks';
import { mkdtemp, realpath, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { observeProject } from '../observer.js';
import { readProject } from '../read-project.js';
import { resolveProjectRoot } from '../resolve-root.js';
import type { ProjectInventory, ProjectIssue, ProjectRead, ProjectReadOptions, ProjectRequest, ProjectResolution } from '../interfaces/project.js';
import { declaration, limits, marker, put } from './fixtures.js';

// PB1-42 and PB1-43: root selection by the root marker and its acquisition
// validity, over the written topology of the plan's fixture contract. Expected
// selections, codes, paths and spans follow the root-marker contract (R7),
// independently of the implementation. The marker and header parser are this
// owner's local doubles, which reflect real bytes; the Descriptions owner's
// reader and parser are supplied by analysis, whose tests run them.

const configuration = '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src"]}\n';
const issue = (code: ProjectIssue['code']): ReturnType<typeof expect.objectContaining> => expect.objectContaining({ code });
/** `parse` with one malformed statement: the exact line `not a statement` is an unknown statement. */
const parse: ProjectReadOptions['parse'] = (file, text) => {
  const lines = text.split('\n');
  const index = lines.indexOf('not a statement');
  if (index < 0) return declaration(file, text);
  const start = lines.slice(0, index).reduce((total, line) => total + line.length + 1, 0);
  return { status: 'invalid', file, tokens: [], issues: [{ code: 'unknown-statement', message: 'Unknown statement not.', file,
    span: { start, end: start + 3, line: index + 1, column: 1 } }] };
};

let work: string, app: string;
const views: { dispose(): Promise<void> }[] = [];
/**
 * `app` of the written topology: marked; `a`, `grand` and `b` unmarked;
 * `subs/a/fixtures/sample` and `fixture-project` marked projects with their
 * own configurations, which `app`'s configuration does not select, declared
 * owned-ignored by `a` and by `app`, which also declares the absent
 * `external-project`.
 */
const appText = 'ramify 1\nroot module app tagged [dispatch]\nowned-ignored "fixture-project"\nexternal "external-project"\n';
const aText = 'ramify 1\nmodule a\nowned-ignored "fixtures/sample"\n';
async function topology(): Promise<void> {
  await put(app, 'module.ramify', appText);
  await put(app, 'tsconfig.json', '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},'
    + '"include":["src","scripts","subs/a/src","subs/a/subs/grand/src","subs/b/src"]}\n');
  await put(app, 'src/main.ts', 'export const main = 1;\n');
  await put(app, 'scripts/check.ts', 'export {};\n');
  await put(app, 'subs/a/module.ramify', aText);
  await put(app, 'subs/a/src/api.ts', 'export function api(): number { return 1; }\n');
  await put(app, 'subs/a/subs/grand/module.ramify', 'ramify 1\nmodule grand\n');
  await put(app, 'subs/a/subs/grand/src/grand.ts', 'export {};\n');
  await put(app, 'subs/b/module.ramify', 'ramify 1\nmodule b\n');
  await put(app, 'subs/b/src/consumer.ts', 'export {};\n');
  for (const [directory, name] of [['subs/a/fixtures/sample', 'sample'], ['fixture-project', 'fixture-project']] as const) {
    await put(app, `${directory}/module.ramify`, `ramify 1\nroot module ${name}\n`);
    await put(app, `${directory}/tsconfig.json`, configuration);
    await put(app, `${directory}/src/world.ts`, 'export const world = 1;\n');
  }
}
beforeEach(async () => {
  work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-root-selection-')));
  app = join(work, 'app');
  await topology();
});
afterEach(async () => {
  for (const view of views.splice(0)) await view.dispose();
  await rm(work, { recursive: true, force: true });
});

const request = (cwd: string, root?: string): ProjectRequest =>
  ({ cwd, ...(root === undefined ? {} : { root }), scope: 'whole-project', configuration: 'discover' });
const resolve = (cwd: string, root?: string): Promise<ProjectResolution> => resolveProjectRoot(request(cwd, root), marker);
async function read(cwd: string, root?: string, changes: Partial<ProjectReadOptions> = {}): Promise<ProjectRead> {
  const result = await readProject({ request: request(cwd, root), parse, marker, limits, ...changes });
  if (result.status === 'acquired') views.push(result.view);
  return result;
}
function inventory(result: ProjectRead): ProjectInventory {
  if (result.status === 'acquired') return result.view.inventory;
  if (result.status === 'cancelled' || !result.inventory) throw new Error(JSON.stringify(result));
  return result.inventory;
}
/** Configuration helpers spawned while `operation` runs: a reused resolution spawns none. */
async function spawned<T>(operation: () => Promise<T>): Promise<{ value: T; helpers: number }> {
  let helpers = 0;
  const hook = createHook({ init(_id, type) { if (type === 'PROCESSWRAP') helpers++; } }).enable();
  try { return { value: await operation(), helpers }; } finally { hook.disable(); }
}
const addMarker = (path: string): string => `${path} does not carry the root marker: add root before module on its module line to declare the project root`;
const notFound = (cwd: string, nearest?: string): string => nearest === undefined ? `No marked project root at or above ${cwd}`
  : `No marked project root at or above ${cwd}; the nearest description is ${nearest}: add root before module on its module line if it is the project root`;

describe('PB1-42: selection by the root marker', () => {
  it('passes unmarked descriptions inside and outside subs/ and stops at the nearest marked one', async () => {
    const found = { status: 'resolved', root: app, selection: 'found', configuration: join(app, 'tsconfig.json') };
    expect(await resolve(join(app, 'subs/a/subs/grand/src'))).toEqual({ ...found, invokedFrom: join(app, 'subs/a/subs/grand/src') });
    expect(await resolve(join(app, 'subs/a/subs/grand'))).toEqual({ ...found, invokedFrom: join(app, 'subs/a/subs/grand') });
    expect(await resolve(join(app, 'scripts'))).toEqual({ ...found, invokedFrom: join(app, 'scripts') });
    // An unmarked description outside every subs/ does not stop the climb either.
    await put(app, 'tools/module.ramify', 'ramify 1\nmodule tools\n');
    await put(app, 'tools/helper/helper.ts', 'export {};\n');
    expect(await resolve(join(app, 'tools/helper'))).toEqual({ ...found, invokedFrom: join(app, 'tools/helper') });
    // Positive control: the given root.
    expect(await resolve(join(app, 'subs/b'), '../..')).toEqual({ status: 'resolved', root: app, selection: 'given',
      invokedFrom: join(app, 'subs/b'), configuration: join(app, 'tsconfig.json') });
  });

  it('selects a marked project beneath subs/ or in the root from inside it', async () => {
    const sample = join(app, 'subs/a/fixtures/sample');
    expect(await resolve(join(sample, 'src'))).toEqual({ status: 'resolved', root: sample, selection: 'found',
      invokedFrom: join(sample, 'src'), configuration: join(sample, 'tsconfig.json') });
    const fixtureProject = join(app, 'fixture-project');
    expect(await resolve(join(fixtureProject, 'src'))).toEqual({ status: 'resolved', root: fixtureProject, selection: 'found',
      invokedFrom: join(fixtureProject, 'src'), configuration: join(fixtureProject, 'tsconfig.json') });
    // Marking `b` makes a selection from inside `b` select `b`.
    await put(app, 'subs/b/module.ramify', 'ramify 1\nroot module b\n');
    expect(await resolve(join(app, 'subs/b/src'))).toMatchObject({ status: 'resolved', root: join(app, 'subs/b'), selection: 'found' });
  });

  it('stops at a marked root whose later lines are invalid and acquisition reports their errors', async () => {
    await put(app, 'module.ramify', 'ramify 1\nroot module app tagged [dispatch]\nnot a statement\n');
    expect(await resolve(join(app, 'subs/a/src'))).toMatchObject({ status: 'resolved', root: app, selection: 'found' });
    const result = await read(join(app, 'subs/a/src'));
    // The invalid root contributes no module, so its children are unattributed as before; no selection issue arises.
    expect(result).toMatchObject({ status: 'invalid', inventory: { scope: { root: app, selection: 'found' } } });
    if (result.status !== 'invalid') return;
    expect(result.issues.filter(item => item.path === 'module.ramify'))
      .toEqual([{ code: 'invalid-description', path: 'module.ramify', message: '3:1: unknown-statement: Unknown statement not. [43,46)' }]);
    // An invalid root declares no nested tree, so discovery enters both marked projects and reports them.
    expect(result.issues.map(item => [item.code, item.path])).toEqual([
      ['undeclared-project-boundary', 'fixture-project/module.ramify'], ['invalid-description', 'module.ramify'],
      ['undeclared-project-boundary', 'subs/a/fixtures/sample/module.ramify'], ['stray-description', 'subs/a/module.ramify'],
      ['stray-description', 'subs/a/subs/grand/module.ramify'], ['stray-description', 'subs/b/module.ramify']]);
  });

  it('decides the marker from the decodable lines: an encoding error after the module line keeps it, one before removes it', async () => {
    const header = Buffer.from('ramify 1\nroot module app tagged [dispatch]\n');
    await put(app, 'module.ramify', Buffer.concat([header, Buffer.from([0xff, 0x0a])]));
    expect(await resolve(join(app, 'subs/a/src'))).toMatchObject({ status: 'resolved', root: app });
    const encoded = await read(join(app, 'subs/a/src'));
    expect(encoded).toMatchObject({ status: 'invalid', inventory: { scope: { root: app, selection: 'found' } } });
    if (encoded.status === 'invalid') expect(encoded.issues.filter(item => item.path === 'module.ramify')).toEqual([{ code: 'invalid-description',
      path: 'module.ramify', message: '1:1: invalid-encoding: Description is not valid UTF-8' }]);
    if (encoded.status === 'invalid') expect(encoded.issues.some(item => item.code === 'unmarked-root-description')).toBe(false);
    await put(app, 'module.ramify', Buffer.concat([Buffer.from([0xff, 0x0a]), header]));
    expect(await resolve(join(app, 'subs/a/src'))).toEqual({ status: 'unavailable', issues: [{ code: 'root-not-found',
      path: '.', message: notFound(join(app, 'subs/a/src'), join(app, 'subs/a/module.ramify')) }] });
    // The byte alone gives no module line: the explicit root is unmarked, and no parser runs.
    await put(app, 'module.ramify', Buffer.from([0xff]));
    let parsed = false;
    expect(await read(app, app, { parse: (...args) => { parsed = true; return parse(...args); } })).toMatchObject({ status: 'invalid',
      inventory: null, issues: [{ code: 'unmarked-root-description', message: addMarker(join(app, 'module.ramify')) }] });
    expect(parsed).toBe(false);
  });

  it('reports root-not-found naming the working directory, and the nearest unmarked description when there is one', async () => {
    const outside = join(work, 'outside/deeper');
    await put(work, 'outside/deeper/note.txt', 'no project\n');
    expect(await resolve(outside)).toEqual({ status: 'unavailable', issues: [{ code: 'root-not-found', path: '.', message: notFound(outside) }] });
    // Two unmarked descriptions above the working directory: the nearest is named.
    await put(work, 'outside/module.ramify', 'ramify 1\nmodule outside\n');
    await put(work, 'outside/deeper/module.ramify', 'ramify 1\nmodule deeper\n');
    await put(work, 'outside/deeper/src/value.ts', 'export {};\n');
    expect(await resolve(join(outside, 'src'))).toEqual({ status: 'unavailable', issues: [{ code: 'root-not-found', path: '.',
      message: notFound(join(outside, 'src'), join(outside, 'module.ramify')) }] });
    expect(await read(join(outside, 'src'))).toMatchObject({ status: 'unavailable', inventory: null, sealedInputs: null,
      issues: [{ code: 'root-not-found', message: notFound(join(outside, 'src'), join(outside, 'module.ramify')) }] });
  });

  it('rejects --root on an unmarked description as unmarked-root-description with the add-the-marker message', async () => {
    const given = join(app, 'subs/a');
    expect(await resolve(app, 'subs/a')).toEqual({ status: 'invalid',
      issues: [{ code: 'unmarked-root-description', path: 'subs/a/module.ramify', message: addMarker(join(given, 'module.ramify')) }] });
    expect(await read(app, 'subs/a')).toMatchObject({ status: 'invalid', inventory: null, sealedInputs: null,
      issues: [{ code: 'unmarked-root-description', path: 'subs/a/module.ramify', message: addMarker(join(given, 'module.ramify')) }] });
    // Removing `app`'s marker: a found selection from `app`'s own directory is root-not-found, and an explicit one invalid.
    await put(app, 'module.ramify', 'ramify 1\nmodule app tagged [dispatch]\n');
    expect(await resolve(app)).toEqual({ status: 'unavailable', issues: [{ code: 'root-not-found', path: '.',
      message: notFound(app, join(app, 'module.ramify')) }] });
    expect(await resolve(app, '.')).toMatchObject({ status: 'invalid', issues: [{ code: 'unmarked-root-description', path: 'module.ramify' }] });
  });

  it('makes a reused resolution stale after a marker change and keeps it after a marker-preserving edit', async () => {
    const cwd = join(app, 'subs/a/src');
    const first = await spawned(() => resolveProjectRoot(request(cwd), marker));
    expect(first.value).toMatchObject({ status: 'resolved', root: app });
    expect(first.helpers).toBe(1);
    const reused = async (): Promise<void> => {
      const next = await spawned(() => resolveProjectRoot(request(cwd), marker, undefined, [first.value]));
      expect(next.value).toBe(first.value); expect(next.helpers).toBe(0);
    };
    // Marker-preserving edits of both descriptions the climb read.
    await put(app, 'subs/a/module.ramify', 'ramify 1\nmodule a\nexpose-src api from "api.ts" to parent\n');
    await reused();
    await put(app, 'module.ramify', 'ramify 1\nroot   module app tagged [dispatch]\n// edited\n');
    await reused();
    // A marked description and a configuration above the root are never read: they are not evidence.
    await put(work, 'module.ramify', 'ramify 1\nroot module above\n');
    await put(work, 'tsconfig.json', configuration);
    await reused();
    // `a` gains the marker: the reused resolution is stale and the root moves.
    await put(app, 'subs/a/module.ramify', 'ramify 1\nroot module a\n');
    const moved = await spawned(() => resolveProjectRoot(request(cwd), marker, undefined, [first.value]));
    expect(moved.value).not.toBe(first.value); expect(moved.value).toMatchObject({ status: 'resolved', root: join(app, 'subs/a') });
    // `a` loses it again and `app` loses its own: the resolution of `a` is stale, and the climb reaches `work`.
    await put(app, 'subs/a/module.ramify', 'ramify 1\nmodule a\n');
    await put(app, 'module.ramify', 'ramify 1\nmodule app\n');
    const above = await spawned(() => resolveProjectRoot(request(cwd), marker, undefined, [moved.value]));
    expect(above.value).toMatchObject({ status: 'resolved', root: work, selection: 'found' });
    // `app` regains its marker: the resolution of `work` is stale.
    await put(app, 'module.ramify', 'ramify 1\nroot module app\n');
    expect(await resolveProjectRoot(request(cwd), marker, undefined, [above.value])).toMatchObject({ status: 'resolved', root: app });
    // An explicit root replays its own marker determination too.
    const given = await resolveProjectRoot(request(cwd, app), marker);
    await put(app, 'module.ramify', 'ramify 1\nroot module app tagged [dispatch]\n');
    expect(await resolveProjectRoot(request(cwd, app), marker, undefined, [given])).toBe(given);
    await put(app, 'module.ramify', 'ramify 1\nmodule app tagged [dispatch]\n');
    expect(await resolveProjectRoot(request(cwd, app), marker, undefined, [given]))
      .toMatchObject({ status: 'invalid', issues: [{ code: 'unmarked-root-description' }] });
  }, 60_000);
});

describe('PB1-43: root-marker validity in acquisition', () => {
  it('acquires the marked root with unmarked children, each description as parsed, leaving the declared projects unread', async () => {
    const result = await read(app, app);
    const acquired = inventory(result);
    expect(result.status).toBe('acquired');
    expect(acquired.modules.map(module => [module.id, module.directory]))
      .toEqual([['app', '.'], ['app/a', 'subs/a'], ['app/a/grand', 'subs/a/subs/grand'], ['app/b', 'subs/b']]);
    for (const module of acquired.modules) {
      const path = module.directory === '.' ? 'module.ramify' : `${module.directory}/module.ramify`;
      const text = module.directory === '.' ? appText : module.directory === 'subs/a' ? aText : `ramify 1\nmodule ${module.name}\n`;
      expect(module.description).toEqual(parse(path, text));
    }
    // The declared trees are pruned before descent, so their marked roots are never read; the absent external tree is valid.
    expect(acquired.scope.ownership.exclusions.filter(item => item.kind === 'owned-ignored' || item.kind === 'external')).toEqual([
      { kind: 'external', directory: 'external-project', owner: null },
      { kind: 'owned-ignored', directory: 'fixture-project', owner: 'app' },
      { kind: 'owned-ignored', directory: 'subs/a/fixtures/sample', owner: 'app/a' }]);
    if (result.status === 'acquired') expect(result.view.inputs.filter(input => input.path.startsWith('fixture-project/')
      || input.path.startsWith('subs/a/fixtures/sample/'))).toEqual([]);
    if (result.status === 'acquired') expect(result.view.inputs.filter(input => input.role === 'description').map(input => input.path))
      .toEqual(['module.ramify', 'subs/a/module.ramify', 'subs/a/subs/grand/module.ramify', 'subs/b/module.ramify']);
  });

  it('reports a root description that lost its marker after selection as unmarked-root-description', async () => {
    // The reader answers marked for selection's read, then unmarked: the description changed before acquisition parsed it.
    let calls = 0;
    const changing: ProjectReadOptions['marker'] = (file, text) => calls++ === 0 ? marker(file, text) : null;
    const result = await read(app, app, { marker: changing });
    expect(result).toMatchObject({ status: 'invalid', issues: [{ code: 'unmarked-root-description', path: 'module.ramify',
      message: addMarker('module.ramify') }] });
    if (result.status === 'invalid') expect(result.issues).toHaveLength(1);
    // The selected root still contributes its module, so its children are not misplaced.
    expect(inventory(result).modules.map(module => module.id)).toEqual(['app', 'app/a', 'app/a/grand', 'app/b']);
  });

  it('reports a marked child beneath subs/ as a located undeclared-project-boundary contributing no module', async () => {
    await put(app, 'subs/b/module.ramify', 'ramify 1\nroot module b\n');
    await put(app, 'subs/b/subs/inner/module.ramify', 'ramify 1\nmodule inner\n');
    const result = await read(app, app);
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.issues).toEqual([
      { code: 'undeclared-project-boundary', path: 'subs/b/module.ramify', span: { start: 9, end: 13, line: 2, column: 1 },
        message: 'Invalid module boundary: undeclared-project-boundary at 2:1: a marked project root must lie in a declared nested tree; '
          + 'declare owned-ignored "subs/b" or external "subs/b" in module.ramify' },
      // Its contents belong to no module of this project, as beneath any layout-invalid description.
      { code: 'stray-description', path: 'subs/b/subs/inner/module.ramify', message: 'Invalid module boundary: stray-description' },
    ]);
    const acquired = inventory(result);
    expect(acquired.modules.map(module => module.id)).toEqual(['app', 'app/a', 'app/a/grand']);
    expect(acquired.files.filter(file => file.path.startsWith('subs/b/'))).toEqual([]);
  });

  it('reports a marked description at a stray position or inside src/ as undeclared-project-boundary naming its nearest enclosing module', async () => {
    await put(app, 'tools/module.ramify', 'ramify 1\nroot module tools\n');
    await put(app, 'subs/a/src/vendor/module.ramify', 'ramify 1\nroot module vendor\n');
    await put(app, 'subs/a/src/vendor/index.ts', 'export const vendored = 1;\n');
    const result = await read(app, app);
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.issues).toEqual([
      { code: 'undeclared-project-boundary', path: 'subs/a/src/vendor/module.ramify', span: { start: 9, end: 13, line: 2, column: 1 },
        message: 'Invalid module boundary: undeclared-project-boundary at 2:1: a marked project root must lie in a declared nested tree; '
          + 'declare owned-ignored "src/vendor" in subs/a/module.ramify' },
      { code: 'undeclared-project-boundary', path: 'tools/module.ramify', span: { start: 9, end: 13, line: 2, column: 1 },
        message: 'Invalid module boundary: undeclared-project-boundary at 2:1: a marked project root must lie in a declared nested tree; '
          + 'declare owned-ignored "tools" or external "tools" in module.ramify' },
    ]);
    expect(inventory(result).files.some(file => file.path.startsWith('subs/a/src/vendor/'))).toBe(false);
  });

  it('never reads a marked description in a declared tree, and reports it once its declaration is removed, configuration or not', async () => {
    // Declared, the sample is pruned whether or not it has its own configuration.
    await unlink(join(app, 'subs/a/fixtures/sample/tsconfig.json'));
    const declared = await read(app, app);
    expect(declared.status).toBe('acquired');
    if (declared.status === 'acquired') expect(declared.view.inputs.some(input => input.path.startsWith('subs/a/fixtures/sample/'))).toBe(false);
    // Undeclared, it is walked: a configuration of its own does not stop discovery, and its marked root is a layout error.
    await put(app, 'subs/a/fixtures/sample/tsconfig.json', configuration);
    await put(app, 'subs/a/module.ramify', 'ramify 1\nmodule a\n');
    const result = await read(app, app);
    expect(result).toMatchObject({ status: 'invalid', issues: [issue('undeclared-project-boundary')] });
    if (result.status === 'invalid') expect(result.issues.map(item => item.path)).toEqual(['subs/a/fixtures/sample/module.ramify']);
  });

  it('rebuilds an observed project when a description gains or loses the root marker', async () => {
    const observed = await observeProject({ request: request(app, app), parse, marker, limits, registry: 'registry/1:test' });
    if (observed.status !== 'observing') throw new Error(JSON.stringify(observed));
    views.push(observed.observer);
    // A marker-preserving edit stays a local update.
    await put(app, 'subs/b/module.ramify', 'ramify 1\nmodule b tagged [ui]\n');
    expect((await observed.observer.apply([{ path: 'subs/b/module.ramify', kind: 'changed' }])).kind).toBe('local');
    await put(app, 'subs/b/module.ramify', 'ramify 1\nroot module b\n');
    expect(await observed.observer.apply([{ path: 'subs/b/module.ramify', kind: 'changed' }]))
      .toMatchObject({ kind: 'invalid', issues: [{ code: 'undeclared-project-boundary', path: 'subs/b/module.ramify' }] });
    // Restored, the description matches the last valid inventory again.
    await put(app, 'subs/b/module.ramify', 'ramify 1\nmodule b\n');
    expect((await observed.observer.apply([{ path: 'subs/b/module.ramify', kind: 'changed' }])).kind).toBe('local');
    await put(app, 'module.ramify', 'ramify 1\nmodule app tagged [dispatch]\n');
    expect(await observed.observer.apply([{ path: 'module.ramify', kind: 'changed' }]))
      .toMatchObject({ kind: 'invalid', inventory: null, issues: [{ code: 'unmarked-root-description', path: 'module.ramify' }] });
  });
});
