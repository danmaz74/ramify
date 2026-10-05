import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isRamifyGeneratedPath, isRamifyGeneratedSegment } from '../generated-path.js';
import { readProject } from '../read-project.js';
import type { ProjectInputView } from '../interfaces/project.js';
import { fixture, limits, marker, put, syntax } from './fixtures.js';

describe('isRamifyGeneratedSegment / isRamifyGeneratedPath', () => {
  it('recognizes exactly the final catalog and the two transient publisher forms', () => {
    for (const segment of ['.ramify', '.ramify.tmp-a', '.ramify.tmp-1a2b3c', '.ramify.old-a', '.ramify.old-deadbeef']) {
      expect(isRamifyGeneratedSegment(segment)).toBe(true);
    }
  });
  it('treats every near-miss as ordinary, a closed enumeration rather than a prefix match', () => {
    for (const segment of ['.ramify-other', '.ramify2', '.ramify.tmp', '.ramifyx', '.ramify.tmp-', '.ramify.old-', 'ramify', '.RAMIFY']) {
      expect(isRamifyGeneratedSegment(segment)).toBe(false);
    }
  });
  it('matches at any path segment position, not only directly under src/ or src/tests/', () => {
    expect(isRamifyGeneratedPath('src/.ramify')).toBe(true);
    expect(isRamifyGeneratedPath('src/tests/.ramify')).toBe(true);
    expect(isRamifyGeneratedPath('src/.ramify/nested/deep/file.ts')).toBe(true);
    expect(isRamifyGeneratedPath('src/.ramify.tmp-abc/staged.ts')).toBe(true);
    expect(isRamifyGeneratedPath('subs/child/src/.ramify.old-abc/rolled.ts')).toBe(true);
    expect(isRamifyGeneratedPath('.ramify')).toBe(true);
    expect(isRamifyGeneratedPath('src/value.ts')).toBe(false);
    expect(isRamifyGeneratedPath('src/.ramify-other/real.ts')).toBe(false);
  });
});

describe('the architect view\'s reserved names (AV19)', () => {
  const marker = (sibling: string) => `${sibling}.marker.json`;
  it('reserves .ramify-architect, its two transient siblings and their marker files', () => {
    const suffix = '0123456789abcdef0123456789abcdef';
    for (const segment of ['.ramify-architect', '.ramify-architect.tmp-a', `.ramify-architect.tmp-${suffix}`,
      '.ramify-architect.old-a', `.ramify-architect.old-${suffix}`,
      marker(`.ramify-architect.tmp-${suffix}`), marker(`.ramify-architect.old-${suffix}`)]) {
      expect(isRamifyGeneratedSegment(segment), segment).toBe(true);
    }
  });
  it('keeps every near miss ordinary', () => {
    for (const segment of ['.ramify-architects', '.ramify-other', '.ramify-architect.tmp', '.ramify-architect.old',
      '.ramify-architect.tmp-', '.ramify-architect.old-', '.ramify-architect-x', '.ramify-architectx', '.ramify-architect.new-a',
      '.ramify-other.tmp-a', 'ramify-architect', '.RAMIFY-ARCHITECT', 'x.ramify-architect']) {
      expect(isRamifyGeneratedSegment(segment), segment).toBe(false);
    }
  });
  it('matches at any depth, at the project root as well as beneath a module', () => {
    expect(isRamifyGeneratedPath('.ramify-architect')).toBe(true);
    expect(isRamifyGeneratedPath('.ramify-architect/README.md')).toBe(true);
    expect(isRamifyGeneratedPath('.ramify-architect/core/engine/behavior.jsonl')).toBe(true);
    expect(isRamifyGeneratedPath('subs/child/src/.ramify-architect/x.ts')).toBe(true);
    expect(isRamifyGeneratedPath('.ramify-architect.tmp-abc/_meta.json')).toBe(true);
    expect(isRamifyGeneratedPath('subs/child/.ramify-architect.old-abc/module.json')).toBe(true);
    expect(isRamifyGeneratedPath(marker('.ramify-architect.tmp-abc'))).toBe(true);
    expect(isRamifyGeneratedPath('.ramify-architects/real.ts')).toBe(false);
    expect(isRamifyGeneratedPath('src/.ramify-architect.tmp/real.ts')).toBe(false);
  });
});

/** Independent of the predicate under test: a segment naming the architect view or one of its transient siblings. */
function architectPath(path: string): boolean {
  return path.split('/').some(segment => /^\.ramify-architect(?:\.(?:tmp|old)-.+)?$/.test(segment));
}

describe('generated-output isolation at the project acquisition boundary', () => {
  let work: string, root: string;
  const views: ProjectInputView[] = [];
  beforeEach(async () => { work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-generated-path-'))); root = join(work, 'project'); await fixture(root); });
  afterEach(async () => { for (const view of views.splice(0)) await view.dispose(); await rm(work, { recursive: true, force: true }); });
  async function read() {
    const result = await readProject({ request: { cwd: root, root, configuration: 'discover', scope: 'whole-project' }, parse: syntax, marker, limits });
    expect(result.status).toBe('acquired');
    if (result.status !== 'acquired') throw new Error('unreachable');
    views.push(result.view);
    return result.view;
  }

  it('excludes final and transient generated directories and their contents from inventory, at any depth', async () => {
    await put(root, 'src/.ramify/child/api.ts.md', '# api\n');
    await put(root, 'src/.ramify/weird.xyz', 'not source\n');
    await put(root, 'src/.ramify.tmp-abc123/staged.ts', 'export const staged = 1;\n');
    await put(root, 'src/.ramify.old-abc123/rolled.ts', 'export const rolled = 1;\n');
    const view = await read();
    const paths = view.inventory.files.map(file => file.path);
    expect(paths.some(path => isRamifyGeneratedPath(path))).toBe(false);
    expect(paths).toContain('src/value.ts');
    expect(view.inputs.some(input => isRamifyGeneratedPath(input.path))).toBe(false);
  });

  it('keeps a near-miss segment as ordinary, owned application source', async () => {
    await put(root, 'src/.ramify-other/real.ts', 'export const nearMiss = 1;\n');
    const view = await read();
    expect(view.inventory.files.map(file => file.path)).toContain('src/.ramify-other/real.ts');
  });

  it('excludes the architect view and its transient siblings from inventory at the root and at any depth', async () => {
    const suffix = '0123456789abcdef0123456789abcdef';
    await put(root, '.ramify-architect/_meta.json', '{"schema":"ramify.architect-view/1"}\n');
    await put(root, '.ramify-architect/core/engine/behavior.jsonl', '{"name":"run"}\n');
    await put(root, '.ramify-architect/stray.ts', 'export const stray = 1;\n');
    await put(root, `.ramify-architect.tmp-${suffix}/_meta.json`, '{}\n');
    await put(root, `.ramify-architect.tmp-${suffix}.marker.json`, '{}\n');
    await put(root, `.ramify-architect.old-${suffix}/staged.ts`, 'export const staged = 1;\n');
    await put(root, `.ramify-architect.old-${suffix}.marker.json`, '{}\n');
    await put(root, 'src/.ramify-architect/owned.ts', 'export const generated = 1;\n');
    await put(root, 'src/.ramify-architect.tmp-abc/staged.ts', 'export const staged = 1;\n');
    await put(root, 'src/.ramify-architects/real.ts', 'export const nearMiss = 1;\n');
    const view = await read();
    expect(view.inventory.files.map(file => file.path)).toEqual(['src/.ramify-architects/real.ts', 'src/value.ts']);
    expect(view.inputs.filter(input => architectPath(input.path))).toEqual([]);
  });

  it('keeps the architect view out of the configuration host\'s directory listings and explicit compiler selection', async () => {
    // A dot-prefixed include makes the compiler walk the root for `.ramify-*`
    // directories. The listings the configuration host serves never show the
    // reserved one (the capture omits it before the host's own filter), and an
    // explicit `files` entry naming it is dropped from the selection, while
    // the near miss is inventoried as the root's auxiliary source.
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { types: [], module: 'ESNext', moduleResolution: 'bundler' },
      include: ['src', '.ramify-*/**/*'], files: ['.ramify-architect/explicit.ts'] }) + '\n');
    await put(root, '.ramify-architect/generated.ts', 'export const generated = 1;\n');
    await put(root, '.ramify-architect/explicit.ts', 'export const explicit = 1;\n');
    await put(root, '.ramify-architects/near.ts', 'export const nearMiss = 1;\n');
    const view = await read();
    expect(view.inventory.files.filter(file => file.placement === 'auxiliary').map(file => [file.path, file.owner]))
      .toEqual([['.ramify-architects/near.ts', view.inventory.modules[0]!.id]]);
    expect(view.inputs.filter(input => architectPath(input.path))).toEqual([]);
    expect(view.inputs.some(input => input.path.startsWith('.ramify-architects'))).toBe(true);
    expect(view.inventory.files.map(file => file.path)).toContain('src/value.ts');
  });

  // Restored pre-Plan-2A rule (user decision): `src/tests` presence is exactly
  // directory existence, with no generated-content awareness. `materialize`
  // itself never creates `src/tests/` (enforced at the publisher, not here),
  // so a `src/tests/` holding only generated content, as simulated below, is
  // a deliberately out-of-band case: presence still reports true, while the
  // generated content itself remains unowned.
  it('reports a tests area present once src/tests exists at all, even holding only generated content', async () => {
    await put(root, 'src/tests/.ramify/child/api.ts.md', '# api\n');
    const view = await read();
    expect(view.inventory.modules[0]!.areas.find(area => area.kind === 'tests')?.present).toBe(true);
    expect(view.inventory.files.some(file => file.area === 'tests')).toBe(false);
  });

  it('reports a tests area present once real testing content joins generated content', async () => {
    await put(root, 'src/tests/.ramify/child/api.ts.md', '# api\n');
    await put(root, 'src/tests/real.test.ts', 'export const spec = 1;\n');
    const view = await read();
    expect(view.inventory.modules[0]!.areas.find(area => area.kind === 'tests')?.present).toBe(true);
    expect(view.inventory.files.filter(file => file.area === 'tests').map(file => file.path)).toEqual(['src/tests/real.test.ts']);
  });
});
