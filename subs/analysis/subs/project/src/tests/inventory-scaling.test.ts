import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readProject } from '../read-project.js';
import { scratchDirectory, withinAnyDirectory } from '../ownership.js';
import { declaration, limits, marker, put } from './fixtures.js';

// Path containment calls made by this owner, counted without changing them.
const containment = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../data.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../data.js')>();
  return { ...actual, within: (parent: string, path: string) => { containment.calls++; return actual.within(parent, path); } };
});

/** One lookup per prefix of a path, counted. */
class CountingSet extends Set<string> {
  lookups = 0;
  override has(value: string): boolean { this.lookups++; return super.has(value); }
}

describe('pruned-directory classification of compiler-selected files', () => {
  it('looks up each prefix of a path once, however many directories there are', () => {
    const directories = new CountingSet(Array.from({ length: 1000 }, (_, index) => scratchDirectory(`subs/m${index}`)));
    const cases: readonly [string, boolean][] = [
      ['subs/m999/src/tmp/a.ts', true], ['subs/m0/src/tmp', true], ['subs/m0/src/tmp/deep/b.ts', true],
      ['subs/m0/src/tmpx/a.ts', false], ['subs/m0/src/a.ts', false], ['subs/m1000/src/tmp/a.ts', false], ['src/tmp/a.ts', false],
    ];
    for (const [path, expected] of cases) {
      directories.lookups = 0;
      expect(withinAnyDirectory(directories, path), path).toBe(expected);
      expect(directories.lookups, path).toBeLessThanOrEqual(path.split('/').length);
    }
  });

  let root = '';
  beforeEach(async () => { root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-inventory-scaling-'))); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('classifies selected files against every module scratch directory with containment work linear in the modules', async () => {
    // Every module contributes its scratch directory, so a test of each selected
    // file against each pruned directory would take modules x files x 2 calls.
    const modules = 150;
    await put(root, 'module.ramify', 'ramify 1\nroot module app\n');
    await put(root, 'README.md', '# App\n\nThe application.\n');
    await put(root, 'package.json', '{"type":"module"}\n');
    await put(root, 'tsconfig.json', '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src","subs"]}\n');
    await put(root, 'src/value.ts', 'export const value = 1;\n');
    await put(root, 'src/tmp/scratch.ts', 'export const scratch = 1;\n');
    for (let index = 0; index < modules; index++) {
      await put(root, `subs/m${index}/module.ramify`, `ramify 1\nmodule m${index}\n`);
      await put(root, `subs/m${index}/src/value.ts`, 'export const value = 1;\n');
    }
    containment.calls = 0;
    const read = await readProject({ request: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      parse: declaration, marker, limits });
    if (read.status !== 'acquired') throw new Error(JSON.stringify(read));
    try {
      const { inventory } = read.view;
      expect(inventory.modules).toHaveLength(modules + 1);
      expect(inventory.files).toHaveLength(modules + 1);
      // The warning and the pruning are unchanged: the selected scratch file is
      // reported and observed to exist, never inventoried or read.
      expect(inventory.warnings.map(item => [item.code, item.path, item.files])).toEqual([['compiler-selected-scratch', 'src/tmp', ['src/tmp/scratch.ts']]]);
      expect(inventory.outsideModuleFiles).toEqual([]);
      expect(read.view.inputs.filter(input => input.path === 'src/tmp/scratch.ts').map(input => [input.role, input.bytes])).toEqual([['dependency', 0]]);
      expect(containment.calls).toBeLessThan(modules * modules);
    } finally { await read.view.dispose(); }
  });
});
