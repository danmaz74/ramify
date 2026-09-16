import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isRamifyGeneratedPath, isRamifyGeneratedSegment } from '../generated-path.js';
import { readProject } from '../read-project.js';
import type { ProjectInputView } from '../interfaces/project.js';
import { fixture, limits, put, syntax } from './fixtures.js';

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

describe('generated-output isolation at the project acquisition boundary', () => {
  let work: string, root: string;
  const views: ProjectInputView[] = [];
  beforeEach(async () => { work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-generated-path-'))); root = join(work, 'project'); await fixture(root); });
  afterEach(async () => { for (const view of views.splice(0)) await view.dispose(); await rm(work, { recursive: true, force: true }); });
  async function read() {
    const result = await readProject({ request: { cwd: root, root, configuration: 'discover', scope: 'whole-project' }, parse: syntax, limits });
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
