import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { observeProject } from '../observer.js';
import { readProject } from '../read-project.js';
import type { ProjectInputView, ProjectIssue, ProjectObserver, ProjectRead, ProjectReadOptions } from '../interfaces/project.js';
import { declaration, limits, marker, put } from './fixtures.js';

// PB1-03, PB1-04, PB1-05 (inventory part), PB1-06 and PB1-09 (pruning) at the
// iteration 8A boundary: declared nested trees are pruned before descent and
// validated on the filesystem, a package manifest or a marked description in
// an undeclared directory is a layout error, and a configuration alone never
// stops discovery. Expected codes, paths, spans and inventories follow the
// project-boundary contracts and the module description specification,
// independently of the implementation. The header and nested-tree parser is
// this owner's local double over real bytes.

let work: string, app: string;
const opened: { dispose(): Promise<void> }[] = [];
const configuration = '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src","subs/a/src"]}\n';
const root = (...declarations: string[]): string => ['ramify 1', 'root module app', ...declarations, ''].join('\n');

beforeEach(async () => {
  work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-boundary-inventory-')));
  app = join(work, 'app');
  await put(app, 'module.ramify', root());
  await put(app, 'tsconfig.json', configuration);
  await put(app, 'package.json', '{"type":"module"}\n');
  await put(app, 'src/main.ts', 'export const main = 1;\n');
  await put(app, 'subs/a/module.ramify', 'ramify 1\nmodule a\n');
  await put(app, 'subs/a/src/api.ts', 'export function api(): number { return 1; }\n');
});
afterEach(async () => {
  for (const item of opened.splice(0)) await item.dispose();
  await rm(work, { recursive: true, force: true });
});

async function read(changes: Partial<ProjectReadOptions> = {}): Promise<ProjectRead> {
  const result = await readProject({ request: { cwd: app, root: app, scope: 'whole-project', configuration: 'discover' },
    parse: declaration, marker, limits, ...changes });
  if (result.status === 'acquired') opened.push(result.view);
  return result;
}
function acquired(result: ProjectRead): ProjectInputView {
  expect(result.status, JSON.stringify(result.status === 'acquired' ? {} : result)).toBe('acquired');
  if (result.status !== 'acquired') throw new Error('Expected an acquired project');
  return result.view;
}
function invalid(result: ProjectRead): readonly ProjectIssue[] {
  expect(result.status, JSON.stringify(result.status === 'acquired' ? result.view.inventory.scope : result)).toBe('invalid');
  if (result.status !== 'invalid') throw new Error('Expected an invalid project');
  return result.issues;
}
/** The directory span of the `line`-th line of a description whose statement is `keyword "value"`. */
function directorySpan(text: string, line: number): ProjectIssue['span'] {
  const lines = text.split('\n');
  const start = lines.slice(0, line - 1).reduce((total, entry) => total + entry.length + 1, 0);
  const column = lines[line - 1]!.indexOf('"') + 1;
  return { start: start + column - 1, end: start + lines[line - 1]!.length, line, column };
}
const located = (code: ProjectIssue['code'], path: string, text: string, line: number) =>
  expect.objectContaining({ code, path, span: directorySpan(text, line), message: expect.stringContaining(`${code} at ${line}:`) });
/** Every captured input path beneath a directory, the directory's own observation excluded. */
const beneath = (view: ProjectInputView, directory: string): string[] =>
  view.inputs.map(input => input.path).filter(path => path.startsWith(`${directory}/`));

describe('PB1-03: boundary layout validation', () => {
  it.each([
    ['an escape from the declaring module', 'subs/a', 'ramify 1\nmodule a\nowned-ignored "../b"\n', 3],
    ['an external tree beneath its module src/', '.', root('external "src/vendor"'), 3],
    ['a declaration inside a child module', '.', root('owned-ignored "subs/a/data"'), 3],
    ['a declaration at an always-excluded path', '.', root('external "node_modules/cache"'), 3],
    ['a malformed directory string', '.', root('owned-ignored "data//one"'), 3],
  ])('rejects %s as invalid-nested-tree at the declared directory', async (_name, module, text, line) => {
    await mkdir(join(app, 'subs/a/data'), { recursive: true });
    await mkdir(join(app, 'subs/b'), { recursive: true });
    const path = module === '.' ? 'module.ramify' : `${module}/module.ramify`;
    await put(app, path, text);
    expect(invalid(await read())).toEqual([located('invalid-nested-tree', path, text, line)]);
  });

  it('rejects a missing owned-ignored directory and accepts an absent external one', async () => {
    const text = root('owned-ignored "fixtures/absent"', 'external "tool-cache"');
    await put(app, 'module.ramify', text);
    expect(invalid(await read())).toEqual([located('missing-owned-ignored', 'module.ramify', text, 3)]);
    // Positive control: the owned-ignored directory exists; the external one stays absent.
    await mkdir(join(app, 'fixtures/absent'), { recursive: true });
    const view = acquired(await read());
    expect(view.inventory.scope.ownership.exclusions.filter(item => item.kind === 'owned-ignored' || item.kind === 'external')).toEqual([
      { kind: 'owned-ignored', directory: 'fixtures/absent', owner: 'app' },
      { kind: 'external', directory: 'tool-cache', owner: null }]);
  });

  it('rejects a declared path that exists but is not a real directory, for either kind', async () => {
    await put(app, 'data.txt', 'plain\n');
    for (const kind of ['owned-ignored', 'external']) {
      const text = root(`${kind} "data.txt"`);
      await put(app, 'module.ramify', text);
      expect(invalid(await read())).toEqual([located('invalid-nested-tree', 'module.ramify', text, 3)]);
    }
  });
});

describe('PB1-04: declaration ambiguity and symlinks', () => {
  it('rejects equal normalized directories and nested declarations across kinds and modules, every participant', async () => {
    await mkdir(join(app, 'data/inner'), { recursive: true });
    const equal = root('owned-ignored "data"', 'external "./data"');
    await put(app, 'module.ramify', equal);
    expect(invalid(await read())).toEqual([located('overlapping-nested-tree', 'module.ramify', equal, 3),
      located('overlapping-nested-tree', 'module.ramify', equal, 4)]);
    const nested = root('owned-ignored "data"', 'external "data/inner"');
    await put(app, 'module.ramify', nested);
    expect(invalid(await read())).toEqual([located('overlapping-nested-tree', 'module.ramify', nested, 3),
      located('overlapping-nested-tree', 'module.ramify', nested, 4)]);
    // Across modules a parent's tree can only meet a child's inside that child, which is already invalid.
    await mkdir(join(app, 'subs/a/cache/deep'), { recursive: true });
    const outer = root('external "subs/a/cache"');
    await put(app, 'module.ramify', outer);
    await put(app, 'subs/a/module.ramify', 'ramify 1\nmodule a\nowned-ignored "cache/deep"\n');
    expect(invalid(await read())).toEqual([expect.objectContaining({ code: 'invalid-nested-tree', path: 'module.ramify',
      span: directorySpan(outer, 3), message: expect.stringContaining('lies inside a child module') })]);
  });

  it('accepts equivalent spellings of distinct non-overlapping real directories', async () => {
    await mkdir(join(app, 'data/one'), { recursive: true });
    await mkdir(join(app, 'subs/a/data/two'), { recursive: true });
    await put(app, 'module.ramify', root('owned-ignored "./data/one"', 'external "data/./two/../three"'));
    await put(app, 'subs/a/module.ramify', 'ramify 1\nmodule a\nowned-ignored "data/two"\n');
    const view = acquired(await read());
    expect(view.inventory.scope.ownership.exclusions.filter(item => item.kind === 'owned-ignored' || item.kind === 'external')).toEqual([
      { kind: 'owned-ignored', directory: 'data/one', owner: 'app' },
      { kind: 'external', directory: 'data/three', owner: null },
      { kind: 'owned-ignored', directory: 'subs/a/data/two', owner: 'app/a' }]);
  });

  it('rejects a declared directory that is a symbolic link or lies beneath one, without traversing it', async () => {
    // The link targets lie outside the project, so only the links themselves are discovery entries.
    await put(work, 'outside/sample/module.ramify', 'ramify 1\nroot module sample\n');
    await symlink(join(work, 'outside'), join(app, 'linked'));
    await symlink(join(work, 'outside/sample'), join(app, 'sample-link'));
    for (const [text, detail] of [[root('owned-ignored "linked/sample"'), 'traverses the symbolic link linked'],
      [root('external "sample-link"'), 'is a symbolic link']] as const) {
      await put(app, 'module.ramify', text);
      const result = await read();
      expect(invalid(result)).toEqual([expect.objectContaining({ code: 'invalid-nested-tree', path: 'module.ramify',
        span: directorySpan(text, 3), message: expect.stringContaining(detail) })]);
      // Nothing behind the link is observed: neither the target directory's members nor its description.
      if (result.status === 'invalid') expect((result.sealedInputs ?? []).map(input => input.path)
        .filter(path => path.startsWith('linked/') || path.startsWith('sample-link/'))).toEqual([]);
    }
  });
});

describe('PB1-05: excluded discovery and separate roots (inventory)', () => {
  beforeEach(async () => {
    await put(app, 'module.ramify', root('owned-ignored "fixture-project"', 'external "external-project"'));
    await put(app, 'subs/a/module.ramify', 'ramify 1\nmodule a\nowned-ignored "fixtures/sample"\n');
    for (const directory of ['fixture-project', 'external-project', 'subs/a/fixtures/sample']) {
      await put(app, `${directory}/module.ramify`, 'ramify 1\nroot module nested\n');
      await put(app, `${directory}/tsconfig.json`, configuration);
      await put(app, `${directory}/package.json`, '{"type":"module"}\n');
      await put(app, `${directory}/src/world.ts`, 'export const world = 1;\n');
      await put(app, `${directory}/src/tests/world.test.ts`, 'export {};\n');
      // Invalid if interpreted by the enclosing project: a malformed and a misplaced description.
      await put(app, `${directory}/broken/module.ramify`, 'not a description\n');
      await put(app, `${directory}/src/inner/module.ramify`, 'ramify 1\nroot module inner\n');
    }
  });

  it('never enters an owned-ignored or external tree: no description, module, file or input beneath it', async () => {
    const view = acquired(await read());
    expect(view.inventory.modules.map(module => module.id)).toEqual(['app', 'app/a']);
    expect(view.inventory.files.map(file => file.path)).toEqual(['src/main.ts', 'subs/a/src/api.ts']);
    for (const directory of ['fixture-project', 'external-project', 'subs/a/fixtures/sample']) {
      expect(beneath(view, directory)).toEqual([]);
      // The tree's own directory is observed as boundary existence evidence.
      expect(view.inputs.some(input => input.path === directory && input.role === 'directory')).toBe(true);
    }
  });

  it('evaluates an ignored project independently when it is selected as its own root', async () => {
    const sample = join(app, 'subs/a/fixtures/sample');
    await rm(join(sample, 'broken'), { recursive: true });
    await rm(join(sample, 'src/inner'), { recursive: true });
    const result = await readProject({ request: { cwd: join(sample, 'src'), scope: 'whole-project', configuration: 'discover' },
      parse: declaration, marker, limits });
    if (result.status === 'acquired') opened.push(result.view);
    const view = acquired(result);
    expect([view.inventory.scope.root, view.inventory.scope.selection]).toEqual([sample, 'found']);
    expect(view.inventory.modules.map(module => module.id)).toEqual(['nested']);
    expect(view.inventory.files.map(file => [file.path, file.area])).toEqual([['src/tests/world.test.ts', 'tests'], ['src/world.ts', 'ordinary']]);
  });

  it('keeps boundary existence in the captured inputs while bytes beneath the tree are not inputs', async () => {
    await put(app, 'module.ramify', root('owned-ignored "fixture-project"', 'external "external-project"', 'external "tool-cache"'));
    const view = acquired(await read());
    // An edit beneath a declared tree changes no input.
    await put(app, 'fixture-project/src/world.ts', 'export const world = 2;\n');
    await put(app, 'external-project/notes.md', 'new\n');
    expect((await view.seal()).status).toBe('coherent');
    const again = acquired(await read());
    // An absent external tree appearing is a change of the recorded boundary evidence.
    await mkdir(join(app, 'tool-cache'));
    expect(await again.seal()).toEqual({ status: 'changed', paths: expect.arrayContaining(['tool-cache']) });
    const third = acquired(await read());
    // An owned-ignored tree disappearing is one too, and the next acquisition rejects it.
    await rm(join(app, 'fixture-project'), { recursive: true });
    expect(await third.seal()).toEqual({ status: 'changed', paths: expect.arrayContaining(['fixture-project']) });
    expect(invalid(await read()).map(item => item.code)).toEqual(['missing-owned-ignored']);
  });
});

describe('PB1-06: undeclared project migration', () => {
  it('reports a package manifest in an undeclared non-module directory, suggesting a declaration, and attributes nothing beneath it', async () => {
    await put(app, 'tools/package.json', '{"name":"tools"}\n');
    await put(app, 'tools/subs/x/module.ramify', 'ramify 1\nmodule x\n');
    await put(app, 'subs/a/src/vendor/package.json', '{"name":"vendor"}\n');
    await put(app, 'subs/a/src/vendor/index.ts', 'export const vendored = 1;\n');
    const issues = invalid(await read());
    expect(issues).toEqual([
      { code: 'undeclared-project-boundary', path: 'subs/a/src/vendor/package.json',
        message: 'Invalid module boundary: undeclared-project-boundary: a directory with a package manifest must be a module\'s own directory '
          + 'or lie in a declared nested tree; declare owned-ignored "src/vendor" in subs/a/module.ramify' },
      { code: 'undeclared-project-boundary', path: 'tools/package.json',
        message: 'Invalid module boundary: undeclared-project-boundary: a directory with a package manifest must be a module\'s own directory '
          + 'or lie in a declared nested tree; declare owned-ignored "tools" or external "tools" in module.ramify' },
      { code: 'stray-description', path: 'tools/subs/x/module.ramify', message: 'Invalid module boundary: stray-description' },
    ]);
    const result = await read();
    if (result.status === 'invalid') expect(result.inventory?.files.map(file => file.path)).toEqual(['src/main.ts', 'subs/a/src/api.ts']);
    // Declared, both are pruned and the project is valid.
    await put(app, 'module.ramify', root('external "tools"'));
    await put(app, 'subs/a/module.ramify', 'ramify 1\nmodule a\nowned-ignored "src/vendor"\n');
    expect(acquired(await read()).inventory.files.map(file => file.path)).toEqual(['src/main.ts', 'subs/a/src/api.ts']);
  });

  it('reports a marked description in an undeclared directory despite its own configuration', async () => {
    await put(app, 'demo/module.ramify', 'ramify 1\nroot module demo\n');
    await put(app, 'demo/tsconfig.json', configuration);
    await put(app, 'demo/package.json', '{"type":"module"}\n');
    await put(app, 'demo/src/demo.ts', 'export {};\n');
    expect(invalid(await read())).toEqual([{ code: 'undeclared-project-boundary', path: 'demo/module.ramify',
      span: { start: 9, end: 13, line: 2, column: 1 },
      message: 'Invalid module boundary: undeclared-project-boundary at 2:1: a marked project root must lie in a declared nested tree; '
        + 'declare owned-ignored "demo" or external "demo" in module.ramify' }]);
  });

  it('never stops discovery at a directory holding only a compiler configuration', async () => {
    await put(app, 'tools/tsconfig.json', configuration);
    await put(app, 'tools/inner/module.ramify', 'ramify 1\nmodule inner\n');
    expect(invalid(await read())).toEqual([{ code: 'stray-description', path: 'tools/inner/module.ramify',
      message: 'Invalid module boundary: stray-description' }]);
  });
});

describe('PB1-09: scratch position', () => {
  // The configuration names its files, so the compiler's own selection
  // enumerates no directory: every input beneath scratch would be discovery's.
  // (An `include` pattern covering scratch makes the compiler list it to
  // compute the selection, even when `exclude` names it.)
  beforeEach(() => put(app, 'tsconfig.json', '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},'
    + '"files":["src/main.ts","subs/a/src/api.ts"]}\n'));
  it('prunes only tmp directly beneath each module src/; src/tests/tmp and src/tools/tmp stay owned source in their areas', async () => {
    for (const path of ['src/tmp/throwaway.test.ts', 'subs/a/src/tmp/throwaway.ts', 'src/tests/tmp/real.test.ts', 'src/tools/tmp/helper.ts',
      'subs/a/src/tests/tmp/real.test.ts']) await put(app, path, 'export {};\n');
    // A description in scratch is never read, marked or not.
    await put(app, 'src/tmp/module.ramify', 'ramify 1\nroot module scratch\n');
    await put(app, 'subs/a/src/tmp/package.json', '{}\n');
    const view = acquired(await read());
    expect(view.inventory.files.map(file => [file.path, file.owner, file.area])).toEqual([
      ['src/main.ts', 'app', 'ordinary'], ['src/tests/tmp/real.test.ts', 'app', 'tests'], ['src/tools/tmp/helper.ts', 'app', 'ordinary'],
      ['subs/a/src/api.ts', 'app/a', 'ordinary'], ['subs/a/src/tests/tmp/real.test.ts', 'app/a', 'tests']]);
    expect([...beneath(view, 'src/tmp'), ...beneath(view, 'subs/a/src/tmp')]).toEqual([]);
    expect(view.inventory.scope.ownership.exclusions.filter(item => item.kind === 'scratch')).toEqual([
      { kind: 'scratch', directory: 'src/tmp', owner: 'app' }, { kind: 'scratch', directory: 'subs/a/src/tmp', owner: 'app/a' }]);
  });

  it('rejects an exact source reference into scratch without listing it', async () => {
    await put(app, 'subs/a/src/tmp/draft.ts', 'export const draft = 1;\n');
    const result = await read({ parse: (file, text) => {
      const parsed = declaration(file, text);
      if (file !== 'subs/a/module.ramify' || parsed.status !== 'valid') return parsed;
      const span = { start: 0, end: 0, line: 3, column: 1 };
      return { ...parsed, document: { ...parsed.document, statements: [{ index: 0, kind: 'expose-src', span,
        selection: { kind: 'named', names: [{ name: 'draft', alias: 'draft', span }] }, from: { value: 'tmp/draft.ts', span },
        destinations: ['parent'], tags: null }] } };
    } });
    expect(invalid(result).map(item => item.code)).toEqual(['invalid-path']);
    if (result.status === 'invalid') expect((result.sealedInputs ?? []).filter(input => input.path.startsWith('subs/a/src/tmp/'))).toEqual([]);
  });
});

describe('observation of declared trees', () => {
  it('ignores changes beneath a declared tree and rebuilds when its directory disappears', async () => {
    await put(app, 'module.ramify', root('owned-ignored "fixture-project"'));
    await put(app, 'fixture-project/module.ramify', 'ramify 1\nroot module nested\n');
    const result = await observeProject({ request: { cwd: app, root: app, scope: 'whole-project', configuration: 'discover' },
      parse: declaration, marker, limits, registry: 'registry/1:test' });
    if (result.status !== 'observing') throw new Error(JSON.stringify(result));
    const observer: ProjectObserver = result.observer;
    opened.push(observer);
    await put(app, 'fixture-project/src/new.ts', 'export {};\n');
    await put(app, 'src/tmp/new.ts', 'export {};\n');
    expect((await observer.apply([{ path: 'fixture-project/src/new.ts', kind: 'created' }, { path: 'src/tmp/new.ts', kind: 'created' }])).kind)
      .toBe('unchanged');
    await rm(join(app, 'fixture-project'), { recursive: true });
    expect(await observer.apply([{ path: 'fixture-project', kind: 'deleted' }]))
      .toMatchObject({ kind: 'invalid', issues: [{ code: 'missing-owned-ignored', path: 'module.ramify' }] });
  });

  it('rebuilds when a description adds or removes a nested-tree declaration', async () => {
    await put(app, 'tools/inner/module.ramify', 'ramify 1\nmodule inner\n');
    await put(app, 'module.ramify', root('owned-ignored "tools"'));
    const result = await observeProject({ request: { cwd: app, root: app, scope: 'whole-project', configuration: 'discover' },
      parse: declaration, marker, limits, registry: 'registry/1:test' });
    if (result.status !== 'observing') throw new Error(JSON.stringify(result));
    opened.push(result.observer);
    // Removing the declaration reopens the tree: its stray description is a layout error.
    await put(app, 'module.ramify', root());
    expect(await result.observer.apply([{ path: 'module.ramify', kind: 'changed' }]))
      .toMatchObject({ kind: 'invalid', issues: [{ code: 'stray-description', path: 'tools/inner/module.ramify' }] });
  });
});
