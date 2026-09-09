import { writeFileSync } from 'node:fs';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProject } from '../read-project.js';
import type { ProjectRead, ProjectReadOptions, ProjectInputView } from '../interfaces/project.js';
import { fixture, limits, put, syntax } from './fixtures.js';

let work: string, root: string;
const views: ProjectInputView[] = [];
beforeEach(async () => { work = await mkdtemp(join(tmpdir(), 'ramify-project-')); root = join(work, 'project'); await fixture(root); });
afterEach(async () => { for (const view of views.splice(0)) await view.dispose(); await rm(work, { recursive: true, force: true }); });
async function read(changes: Partial<ProjectReadOptions> = {}): Promise<ProjectRead> {
  const result = await readProject({ request: { cwd: root, root, configuration: 'discover', scope: 'whole-project' }, parse: syntax, limits, ...changes });
  if (result.status === 'acquired') views.push(result.view);
  return result;
}
function view(result: ProjectRead): ProjectInputView {
  expect(result.status, JSON.stringify(result.status === 'acquired' ? {} : result)).toBe('acquired');
  if (result.status !== 'acquired') throw new Error('Expected acquired view');
  return result.view;
}

describe('real project configuration and scope', () => {
  it('uses inherited JSONC compiler selection and retains every owned file, including binary resources', async () => {
    await put(root, 'base.json', '{ /* inherited */ "compilerOptions": {"allowJs": true, "checkJs": true, "types": [],}, "include": ["src", "tests"], "exclude": ["src/omitted.ts", "tests/unselected.ts"],}');
    await put(root, 'tsconfig.json', '{"extends":"./base.json"}');
    for (const file of ['src/omitted.ts', 'src/tests/helper.ts', 'src/helpers/tests/ordinary.ts', 'tests/selected.js', 'tests/unselected.ts']) await put(root, file, 'export {};');
    await put(root, 'src/icon.bin', new Uint8Array([0xff, 0xfe]));
    const acquired = view(await read());
    expect(acquired.inventory.files.map(f => [f.path, f.area])).toEqual([
      ['src/helpers/tests/ordinary.ts', 'ordinary'], ['src/icon.bin', 'ordinary'], ['src/omitted.ts', 'ordinary'], ['src/tests/helper.ts', 'tests'], ['src/value.ts', 'ordinary'],
    ]);
    expect(acquired.inventory.outsideModuleFiles).toEqual(['tests/selected.js']);
    expect(acquired.inputs.filter(i => i.role === 'configuration').map(i => i.path)).toEqual(['base.json', 'tsconfig.json']);
    expect((await acquired.seal()).status).toBe('coherent');
  });
  it('finds ancestor compiler configuration without adopting the ancestor owner', async () => {
    await rm(join(root, 'tsconfig.json'));
    await put(work, 'tsconfig.json', '{"include":["project/src", "outside.ts"]}');
    await put(work, 'module.ramify', 'invalid ancestor'); await put(work, 'outside.ts', 'export {};');
    const acquired = view(await read());
    expect(acquired.inventory.scope.configuration).toBe(join(work, 'tsconfig.json'));
    expect(acquired.inventory.modules.map(m => m.id)).toEqual(['fixture']);
    expect(acquired.inventory.outsideModuleFiles).toEqual([]);
    expect(acquired.inputs.some(i => i.role === 'configuration' && i.path.startsWith('external:'))).toBe(true);
    expect(acquired.inputs.some(i => i.role === 'description' && i.path.startsWith('external:'))).toBe(false);
  });
  it('captures package-based extends through the same host without running package code', async () => {
    await put(root, 'node_modules/config-base/package.json', '{"name":"config-base","tsconfig":"config.json","main":"evil.js"}');
    await put(root, 'node_modules/config-base/config.json', '{"compilerOptions":{"allowJs":true},"include":["../../tests"]}');
    await put(root, 'node_modules/config-base/evil.js', 'throw new Error("must not execute");');
    await put(root, 'tsconfig.json', '{"extends":"config-base"}');
    await put(root, 'tests/selected.js', 'export {};');
    const acquired = view(await read());
    expect(acquired.inventory.outsideModuleFiles).toEqual(['tests/selected.js']);
    expect(acquired.inputs.some(i => i.path === 'node_modules/config-base/package.json' && i.bytes > 0)).toBe(true);
    expect(acquired.inputs.some(i => i.path === 'node_modules/config-base/config.json' && i.role === 'configuration')).toBe(true);
  });
  it('transfers a permitted large config in bounded chunks', async () => {
    await put(root, 'tsconfig.json', `/*${'x'.repeat(2 * 1024 ** 2)}*/\n{"include":["src"]}`);
    const acquired = view(await read());
    expect(acquired.inventory.files.map(f => f.path)).toEqual(['src/value.ts']);
    expect(acquired.inputs.find(i => i.path === 'tsconfig.json')?.bytes).toBeGreaterThan(1024 ** 2);
  });
  it('reports missing compiler configuration as unavailable', async () => {
    await rm(join(root, 'tsconfig.json'));
    expect(await read()).toMatchObject({ status: 'unavailable', issues: [{ code: 'configuration-not-found' }] });
  });
  it('reports references-only configurations with their referenced paths', async () => {
    await put(root, 'tsconfig.json', '{"files":[],"references":[{"path":"./child"}]}');
    const result = await read();
    expect(result).toMatchObject({ status: 'unavailable', issues: [{ code: 'references-only-configuration', message: expect.stringContaining('./child') }] });
  });
  it('permits a valid empty compiler selection while inventorying owned source', async () => {
    await put(root, 'tsconfig.json', '{"files":[]}');
    expect(view(await read()).inventory.files.map(f => f.path)).toEqual(['src/value.ts']);
  });
  it('does not turn malformed configuration into an empty successful acquisition', async () => {
    await put(root, 'tsconfig.json', '{broken config');
    expect(await read()).toMatchObject({ status: 'incomplete', issues: [{ code: 'read-failure' }] });
  });
  it('does not accept missing influencing extends configuration', async () => {
    await put(root, 'tsconfig.json', '{"extends":"./absent.json"}');
    expect(await read()).toMatchObject({ status: 'incomplete', issues: [{ code: 'read-failure', message: expect.stringContaining('absent.json') }] });
  });
  it('rejects malformed description UTF-8 before calling the parser', async () => {
    await put(root, 'module.ramify', new Uint8Array([0xff]));
    let called = false;
    const result = await read({ parse: (...args) => { called = true; return syntax(...args); } });
    expect(called).toBe(false);
    expect(result).toMatchObject({ status: 'invalid', issues: [{ code: 'invalid-description', message: expect.stringContaining('invalid-encoding') }] });
  });
  it('canonicalizes implicit cwd symlinks', async () => {
    await symlink(join(root, 'src'), join(work, 'source-link'));
    const acquired = view(await read({ request: { cwd: join(work, 'source-link'), configuration: 'discover', scope: 'whole-project' } }));
    expect(acquired.inventory.scope).toMatchObject({ root, invokedFrom: join(root, 'src'), selection: 'found' });
  });
  it('rejects a missing parent marker above a child directly under subs', async () => {
    const child = join(work, 'orphan/subs/child'); await fixture(child);
    expect(await read({ request: { cwd: join(child, 'src'), configuration: 'discover', scope: 'whole-project' } }))
      .toMatchObject({ status: 'invalid', issues: [{ code: 'missing-root-description', message: expect.stringContaining('parent description') }] });
  });
  it.each(['src', 'subs', 'src/tests', 'src/interfaces'])('rejects a marker at %s', async path => {
    await put(root, `${path}/module.ramify`, 'ramify 1\nmodule child\n');
    const result = await read();
    expect(result).toMatchObject({ status: 'invalid', issues: [expect.objectContaining({ path: `${path}/module.ramify`, code: path === 'subs' ? 'reserved-container' : 'description-in-src' })] });
  });
  it('discovers stray markers even when a compiler exclusion silences their files', async () => {
    await put(root, 'tsconfig.json', '{"include":["src"],"exclude":["tests"]}');
    await put(root, 'tests/helper.ts', 'export {};');
    await put(root, 'tests/module.ramify', 'ramify 1\nmodule child\n');
    const result = await read();
    expect(result).toMatchObject({ status: 'invalid', inventory: { warnings: [] },
      issues: [{ code: 'stray-description', path: 'tests/module.ramify' }] });
  });
  it('does not apply a compiler src/subs exclusion to owned discovery', async () => {
    await put(root, 'tsconfig.json', '{"include":["tests"],"exclude":["src", "subs"]}');
    await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child\n');
    await put(root, 'subs/child/src/file.ts', 'export {};');
    const acquired = view(await read());
    expect(acquired.inventory.modules.map(m => m.id)).toEqual(['fixture', 'fixture/child']);
    expect(acquired.inventory.files.map(f => f.path)).toEqual(['src/value.ts', 'subs/child/src/file.ts']);
  });
  it.each(['src', 'subs', 'subs/child/src', 'subs/child/src/tests'])('keeps dependency directories beneath %s outside application discovery', async area => {
    await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child\n');
    await put(root, 'subs/child/src/kept.ts', 'export {};');
    await put(root, 'src/tests/kept.ts', 'export {};');
    await put(root, `${area}/node_modules/lib/index.ts`, 'export const dependency = 1;');
    await put(root, `${area}/node_modules/lib/package.json`, '{"name":"lib"}');
    const acquired = view(await read());
    expect(acquired.inventory.modules.map(module => module.id)).toEqual(['fixture', 'fixture/child']);
    expect(acquired.inventory.files.map(file => file.path)).toEqual(['src/tests/kept.ts', 'src/value.ts', 'subs/child/src/kept.ts']);
    expect(acquired.inventory.warnings).toEqual([]);
  });
  it.each(['src/generated', 'subs/generated', 'subs/child/src/generated', 'subs/child/src/tests/generated'])('keeps compiler output at %s outside application discovery', async outDir => {
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { outDir, allowJs: true }, include: ['src', 'subs/**/src'] }));
    await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child\n');
    await put(root, 'subs/child/src/kept.ts', 'export {};');
    await put(root, 'src/tests/kept.ts', 'export {};');
    await put(root, `${outDir}/generated.js`, 'export const generated = 1;');
    const acquired = view(await read());
    expect(acquired.inventory.modules.map(module => module.id)).toEqual(['fixture', 'fixture/child']);
    expect(acquired.inventory.files.map(file => file.path)).toEqual(['src/tests/kept.ts', 'src/value.ts', 'subs/child/src/kept.ts']);
    expect(acquired.inventory.warnings).toEqual([]);
  });
  it.each(['src/node_modules/lib', 'subs/node_modules/lib', 'src/generated', 'subs/generated'])('does not let explicit compiler selection reopen discovery at %s', async excluded => {
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { outDir: excluded.endsWith('/generated') ? excluded : 'dist' }, files: [`${excluded}/index.ts`] }));
    await put(root, `${excluded}/index.ts`, 'export {};');
    await put(root, `${excluded}/module.ramify`, 'ramify 1\nmodule excluded\n');
    const acquired = view(await read());
    expect(acquired.inventory.modules.map(module => module.id)).toEqual(['fixture']);
    expect(acquired.inventory.files.map(file => file.path)).toEqual(['src/value.ts']);
    expect(acquired.inventory.outsideModuleFiles).toEqual([]);
    expect(acquired.inventory.warnings).toEqual([]);
    expect(acquired.inputs.some(input => input.path === `${excluded}/module.ramify`)).toBe(false);
  });
  it('keeps independent projects out of enclosing discovery', async () => {
    await fixture(join(root, 'examples/demo'));
    const acquired = view(await read());
    expect(acquired.inventory.scope.independentScopes).toEqual(['examples/demo']);
    expect(acquired.inventory.modules).toHaveLength(1);
  });
});

describe('acquisition limits and cancellation', () => {
  it.each([
    { maxFileBytes: 10 }, { maxApplicationFiles: 1 }, { maxApplicationBytes: 1 }, { maxInputBytes: 16 }, { maxFiles: 1 }, { maxOwners: 1 }, { maxDepth: 1 },
  ])('returns incomplete for exceeded limits %j', async changed => {
    await put(root, 'src/another.ts', 'export {};');
    await put(root, 'subs/a/module.ramify', 'ramify 1\nmodule child\n');
    await put(root, 'subs/a/subs/b/module.ramify', 'ramify 1\nmodule child\n');
    expect(await read({ limits: { ...limits, ...changed } })).toMatchObject({ status: 'incomplete', issues: [{ code: 'resource-limit' }] });
  });
  it.each([
    ['resource-limit', 'x'.repeat(1024)],
    ['read-failure', new Uint8Array([0xff])],
  ] as const)('retains collected layout findings and partial inventory when %s stops acquisition', async (code, bytes) => {
    await put(root, 'src/module.ramify', 'ramify 1\nmodule hidden\n');
    await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child\n');
    await put(root, 'subs/child/src/kept.ts', 'export {};');
    await put(root, 'src/z-failure.ts', bytes);
    const result = await read({ limits: { ...limits, maxFileBytes: 512 } });
    expect(result.status).toBe('incomplete');
    if (result.status !== 'incomplete') throw new Error('Expected incomplete acquisition');
    expect(result.issues.map(issue => [issue.code, issue.path])).toEqual([
      ['description-in-src', 'src/module.ramify'], [code, 'src/z-failure.ts'],
    ]);
    expect(result.inventory?.modules.map(module => module.id)).toEqual(['fixture', 'fixture/child']);
    expect(result.inventory?.files.map(file => file.path)).toEqual(['subs/child/src/kept.ts']);
    expect(result.inventory?.warnings).toEqual([{ code: 'outside-module-source', entry: 'src', count: 2, files: ['src/value.ts', 'src/z-failure.ts'] }]);
    expect(Object.isFrozen(result.inventory)).toBe(true);
    expect(Object.isFrozen(result.issues)).toBe(true);
  });
  it('retains collected layout findings when an owned source read stops discovery', async () => {
    await put(root, 'src/module.ramify', 'ramify 1\nmodule hidden\n');
    await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child\n');
    await put(root, 'subs/child/src/a-kept.ts', 'export {};');
    await put(root, 'subs/child/src/z-failure.ts', 'x'.repeat(1024));
    const result = await read({ limits: { ...limits, maxFileBytes: 512 } });
    expect(result.status).toBe('incomplete');
    if (result.status !== 'incomplete') throw new Error('Expected incomplete acquisition');
    expect(result.issues.map(issue => [issue.code, issue.path])).toEqual([
      ['description-in-src', 'src/module.ramify'], ['resource-limit', 'subs/child/src/z-failure.ts'],
    ]);
    expect(result.inventory?.modules.map(module => module.id)).toEqual(['fixture', 'fixture/child']);
    expect(result.inventory?.files.map(file => file.path)).toEqual(['subs/child/src/a-kept.ts']);
  });
  it('retains collected layout findings when final input validation exhausts retries', async () => {
    await put(root, 'src/module.ramify', 'ramify 1\nmodule hidden\n');
    let calls = 0;
    const result = await read({ parse: (file, text) => {
      writeFileSync(join(root, 'module.ramify'), `ramify 1\nmodule fixture\n// ${++calls}\n`);
      return syntax(file, text);
    } });
    expect(calls).toBe(3);
    expect(result.status).toBe('incomplete');
    if (result.status !== 'incomplete') throw new Error('Expected incomplete acquisition');
    expect(result.issues.map(issue => [issue.code, issue.path])).toEqual([
      ['changed-input', '.'], ['description-in-src', 'src/module.ramify'],
    ]);
    expect(result.inventory?.modules.map(module => module.id)).toEqual(['fixture']);
    expect(result.inventory?.outsideModuleFiles).toEqual(['src/value.ts']);
  });
  it('returns cancelled for an already aborted request', async () => {
    const controller = new AbortController(); controller.abort();
    expect(await read({ signal: controller.signal })).toEqual({ status: 'cancelled' });
  });
  it('stops a running helper on cancellation while the parent stays responsive', async () => {
    await put(root, 'tsconfig.json', `/*${'x'.repeat(4 * 1024 ** 2)}*/\n{"include":["src"]}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);
    try { expect(await read({ signal: controller.signal })).toEqual({ status: 'cancelled' }); }
    finally { clearTimeout(timer); }
  });
  it('enforces the total acquisition deadline', async () => {
    expect(await read({ limits: { ...limits, deadlineMs: 1 } })).toMatchObject({ status: 'incomplete', issues: [{ code: 'resource-limit' }] });
  });
  it('retries the entire capture after a controlled parser-time edit', async () => {
    let calls = 0;
    const result = await read({ parse: (file, text) => {
      // This injected parser barrier is test-only; the real parser is pure.
      if (!calls++) writeFileSync(join(root, 'module.ramify'), 'ramify 1\nmodule fixture\n// changed\n');
      return syntax(file, text);
    } });
    expect(calls).toBe(2);
    expect(await view(result).readFile('module.ramify')).toContain('// changed');
  });
  it('returns incomplete after the finite retry policy is exhausted', async () => {
    let calls = 0;
    const result = await read({ parse: (file, text) => {
      writeFileSync(join(root, 'module.ramify'), `ramify 1\nmodule fixture\n// ${++calls}\n`);
      return syntax(file, text);
    } });
    expect(calls).toBe(3);
    expect(result).toMatchObject({ status: 'incomplete', issues: [{ code: 'changed-input' }] });
  });
});
