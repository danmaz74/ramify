import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { observeProject } from '../observer.js';
import { readProject } from '../read-project.js';
import type { ProjectInputView, ProjectIssue, ProjectObserver, ProjectRead, ProjectReadOptions } from '../interfaces/project.js';
import { declaration, limits, marker, put } from './fixtures.js';

// PB1-03, PB1-04, PB1-05 (inventory part), PB1-06 and PB1-09 (pruning) at the
// iteration 8A boundary, and PB1-07 (auxiliary and inert inventories) with the
// observer's auxiliary bridge from iteration 8C: declared nested trees are pruned before descent and
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

// PB1-11 at the iteration 8B boundary: compiler-selected source inside an
// owned-ignored tree or a module's scratch directory yields one nonblocking
// warning per tree or directory, with a bounded byte-ordered file list and the
// total count, and is neither inventoried nor read. Message texts are this
// slice's choice where the contracts leave them open.
describe('PB1-11: compiler-selected exclusion warnings', () => {
  const selecting = (exclude: readonly string[] = []): string => JSON.stringify({ compilerOptions: { types: [], module: 'ESNext',
    moduleResolution: 'bundler' }, include: ['src', 'subs', 'fixtures', 'vendor', 'tools'], exclude }) + '\n';
  const ownedIgnored = (count: number): string => `${count} compiler-selected file${count === 1 ? '' : 's'} in an owned-ignored tree `
    + 'of module app, which Ramify does not analyze; exclude the tree from the compiler configuration';
  const scratch = (module: string, count: number): string => `${count} compiler-selected file${count === 1 ? '' : 's'} in the scratch `
    + `directory of module ${module}, which Ramify does not analyze; exclude the directory from the compiler configuration`;
  const unanalyzed = ['fixtures/a.ts', 'fixtures/deep/b.ts', 'src/tmp/draft.ts', 'subs/a/src/tmp/draft.ts', 'vendor/lib.ts'];
  beforeEach(async () => {
    await put(app, 'module.ramify', root('owned-ignored "fixtures"', 'external "vendor"'));
    await put(app, 'tsconfig.json', selecting());
    for (const path of unanalyzed) await put(app, path, 'export const value = 1;\n');
    // Positive control: selected source outside every src/ is the root's auxiliary source, inventoried and read, with no warning.
    await put(app, 'tools/loose.ts', 'export const loose = 1;\n');
  });

  it('warns once per owned-ignored tree and scratch directory, distinctly, and neither inventories nor reads those files', async () => {
    const view = acquired(await read());
    expect(view.inventory.warnings).toEqual([
      { code: 'compiler-selected-owned-ignored', path: 'fixtures', message: ownedIgnored(2), files: ['fixtures/a.ts', 'fixtures/deep/b.ts'], count: 2 },
      { code: 'compiler-selected-scratch', path: 'src/tmp', message: scratch('app', 1), files: ['src/tmp/draft.ts'], count: 1 },
      { code: 'compiler-selected-scratch', path: 'subs/a/src/tmp', message: scratch('app/a', 1), files: ['subs/a/src/tmp/draft.ts'], count: 1 },
    ]);
    // An external tree's selected file is not the enclosing project's and warns about nothing.
    expect(view.inventory.files.map(file => [file.path, file.placement])).toEqual([['src/main.ts', 'src'], ['subs/a/src/api.ts', 'src'], ['tools/loose.ts', 'auxiliary']]);
    // Their bytes are never read. The compiler's selection observes only that
    // they exist (a kind observation without bytes), while the auxiliary file is read as source.
    expect(view.inputs.filter(input => input.path === 'tools/loose.ts').map(input => [input.role, input.bytes > 0])).toEqual([['source', true]]);
    expect(view.inputs.filter(input => unanalyzed.includes(input.path)).map(input => [input.path, input.role, input.bytes]))
      .toEqual(unanalyzed.map(path => [path, 'dependency', 0]));
  });

  it('bounds the listed files and states the total count', async () => {
    for (let index = 0; index < 25; index++) await put(app, `fixtures/many/f${String(index).padStart(2, '0')}.ts`, 'export {};\n');
    const warning = acquired(await read()).inventory.warnings.find(item => item.path === 'fixtures');
    const all = ['fixtures/a.ts', 'fixtures/deep/b.ts', ...Array.from({ length: 25 }, (_, index) => `fixtures/many/f${String(index).padStart(2, '0')}.ts`)];
    expect(warning).toEqual({ code: 'compiler-selected-owned-ignored', path: 'fixtures', message: ownedIgnored(27), files: all.slice(0, 20), count: 27 });
  });

  it('reports no exclusion warning once the compiler configuration excludes those directories', async () => {
    await put(app, 'tsconfig.json', selecting(['fixtures', 'src/tmp', 'subs/a/src/tmp']));
    const view = acquired(await read());
    expect(view.inventory.warnings).toEqual([]);
    expect(view.inventory.files.map(file => file.path)).toEqual(['src/main.ts', 'subs/a/src/api.ts', 'tools/loose.ts']);
  });
});

describe('PB1-07: auxiliary compiler source inventory', () => {
  const entry = (file: { path: string; owner: string; area: string; kind: string; placement: string }) =>
    [file.path, file.owner, file.area, file.kind, file.placement];
  const configure = (options: Record<string, unknown>): string => JSON.stringify({ compilerOptions: { types: [], module: 'ESNext',
    moduleResolution: 'bundler', ...options }, include: ['src', 'subs/a/src', 'tools'] }) + '\n';

  it('inventories owned compiler source outside src/, selected or not, including loose subs source, under its nearest owner', async () => {
    await put(app, 'tsconfig.json', configure({}));
    await put(app, 'tools/selected.ts', 'export const selected = 1;\n');
    await put(app, 'scripts/unselected.ts', 'export const unselected = 1;\n');
    await put(app, 'subs/loose.ts', 'export const loose = 1;\n');
    await put(app, 'subs/a/scripts/a-tool.ts', 'export const tool = 1;\n');
    await put(app, 'subs/a/tests/sibling.test.ts', 'export const sibling = 1;\n');
    const view = acquired(await read());
    expect(view.inventory.files.map(entry)).toEqual([
      ['scripts/unselected.ts', 'app', 'ordinary', 'source', 'auxiliary'],
      ['src/main.ts', 'app', 'ordinary', 'source', 'src'],
      ['subs/a/scripts/a-tool.ts', 'app/a', 'ordinary', 'source', 'auxiliary'],
      ['subs/a/src/api.ts', 'app/a', 'ordinary', 'source', 'src'],
      // A sibling tests/ directory has no testing classification: its source is ordinary auxiliary source.
      ['subs/a/tests/sibling.test.ts', 'app/a', 'ordinary', 'source', 'auxiliary'],
      // Loose source beneath subs/ outside every child belongs to the parent.
      ['subs/loose.ts', 'app', 'ordinary', 'source', 'auxiliary'],
      ['tools/selected.ts', 'app', 'ordinary', 'source', 'auxiliary'],
    ]);
    expect(view.inventory.warnings).toEqual([]);
    expect(view.inventory).not.toHaveProperty('outsideModuleFiles');
    // Each auxiliary file is an application input read for its bytes.
    for (const path of ['scripts/unselected.ts', 'subs/loose.ts', 'tools/selected.ts']) {
      expect(view.inputs.filter(input => input.path === path).map(input => [input.role, input.bytes > 0]), path).toEqual([['source', true]]);
    }
  });

  it('keeps inert owned files out of the inventory and admits JavaScript only when the configuration does', async () => {
    const javaScript = ['scripts/build.js', 'scripts/legacy.cjs', 'scripts/run.mjs', 'scripts/view.jsx'];
    const inert = ['data/fixture.json', 'notes/plan.md', 'scripts/README.md'];
    for (const path of [...javaScript, ...inert]) await put(app, path, path.endsWith('.json') ? '{}\n' : 'export {};\n');
    await put(app, 'scripts/types.d.ts', 'export type Id = string;\n');
    const auxiliary = (view: ProjectInputView): string[] => view.inventory.files.filter(file => file.placement === 'auxiliary').map(file => file.path);
    // Without allowJs, a JavaScript file is an inert owned file: neither inventoried nor read.
    await put(app, 'tsconfig.json', configure({}));
    const plain = acquired(await read());
    expect(auxiliary(plain)).toEqual(['scripts/types.d.ts']);
    expect(plain.inputs.filter(input => [...javaScript, ...inert].includes(input.path) && input.bytes > 0)).toEqual([]);
    // allowJs admits JavaScript; checkJs alone admits it too, as the compiler defaults allowJs to it.
    for (const options of [{ allowJs: true }, { checkJs: true }]) {
      await put(app, 'tsconfig.json', configure(options));
      const admitted = acquired(await read());
      expect(auxiliary(admitted), JSON.stringify(options)).toEqual(['scripts/build.js', 'scripts/legacy.cjs', 'scripts/run.mjs', 'scripts/types.d.ts', 'scripts/view.jsx']);
      expect(admitted.inventory.files.filter(file => inert.includes(file.path))).toEqual([]);
    }
    await put(app, 'tsconfig.json', configure({ allowJs: false, checkJs: true }));
    expect(auxiliary(acquired(await read()))).toEqual(['scripts/types.d.ts']);
  });

  it('never turns an external compiler dependency or an external tree into application files', async () => {
    await put(app, 'module.ramify', root('external "vendor"'));
    await put(app, 'node_modules/dep/package.json', '{"name":"dep","types":"index.d.ts"}\n');
    await put(app, 'node_modules/dep/index.d.ts', 'export declare const dep: number;\n');
    await put(app, 'vendor/lib.ts', 'export const lib = 1;\n');
    await put(app, 'src/main.ts', "import { dep } from 'dep';\nexport const main = dep;\n");
    const view = acquired(await read());
    expect(view.inventory.files.map(file => file.path)).toEqual(['src/main.ts', 'subs/a/src/api.ts']);
  });
});

describe('observation of auxiliary source', () => {
  it('updates an edited auxiliary file in place and recomputes the inventory when auxiliary source is added or removed', async () => {
    await put(app, 'scripts/tool.ts', 'export const tool = 1;\n');
    const result = await observeProject({ request: { cwd: app, root: app, scope: 'whole-project', configuration: 'discover' },
      parse: declaration, marker, limits, registry: 'registry/1:test' });
    if (result.status !== 'observing') throw new Error(JSON.stringify(result));
    const observer: ProjectObserver = result.observer;
    opened.push(observer);
    const before = observer.inventory.files.find(file => file.path === 'scripts/tool.ts')!;
    expect(before).toMatchObject({ owner: 'app', placement: 'auxiliary' });

    await put(app, 'scripts/tool.ts', 'export const tool = 2;\n');
    const edited = await observer.apply([{ path: 'scripts/tool.ts', kind: 'changed' }]);
    expect(edited).toMatchObject({ kind: 'local', changed: ['scripts/tool.ts'], created: [], deleted: [] });
    if (edited.kind !== 'local') throw new Error(edited.kind);
    expect(edited.inventory.files.find(file => file.path === 'scripts/tool.ts')!.sha256).not.toBe(before.sha256);

    // Inert files and JavaScript the configuration does not admit change nothing.
    await put(app, 'scripts/notes.md', 'notes\n');
    await put(app, 'scripts/run.mjs', 'export {};\n');
    expect((await observer.apply([{ path: 'scripts/notes.md', kind: 'created' }, { path: 'scripts/run.mjs', kind: 'created' }])).kind).toBe('unchanged');

    await put(app, 'scripts/new.ts', 'export const added = 1;\n');
    const created = await observer.apply([{ path: 'scripts/new.ts', kind: 'created' }]);
    expect(created.kind).toBe('structural');
    if (created.kind !== 'structural') throw new Error(created.kind);
    expect(created.inventory.files.filter(file => file.placement === 'auxiliary').map(file => file.path)).toEqual(['scripts/new.ts', 'scripts/tool.ts']);

    await rm(join(app, 'scripts/tool.ts'));
    const deleted = await observer.apply([{ path: 'scripts/tool.ts', kind: 'deleted' }]);
    expect(deleted.kind).toBe('structural');
    if (deleted.kind !== 'structural') throw new Error(deleted.kind);
    expect(deleted.inventory.files.filter(file => file.placement === 'auxiliary').map(file => file.path)).toEqual(['scripts/new.ts']);

    // Removing a directory above an inventoried auxiliary file recomputes too.
    await rm(join(app, 'scripts'), { recursive: true });
    const removed = await observer.apply([{ path: 'scripts', kind: 'deleted' }]);
    expect(removed.kind).toBe('structural');
    if (removed.kind !== 'structural') throw new Error(removed.kind);
    expect(removed.inventory.files.filter(file => file.placement === 'auxiliary')).toEqual([]);
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
