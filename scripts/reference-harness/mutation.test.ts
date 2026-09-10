import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { replaceExactlyOnce, runIsolatedProject } from './mutation.js';

let temporary: string;
let sourceRoot: string;
let workRoot: string;
async function put(path: string, text = 'excluded'): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

beforeEach(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'ramify-copy-'));
  sourceRoot = join(temporary, 'example');
  workRoot = join(sourceRoot, '.reference-work');
  await put(join(sourceRoot, 'module.ramify'), 'ramify 1\nmodule fixture\n');
  await put(join(sourceRoot, 'README.md'), '# Fixture\n\nTiny copy fixture.\n');
  await put(join(sourceRoot, 'package.json'), '{"type":"module"}');
  await put(join(sourceRoot, 'tsconfig.json'), '{"include":["src","subs/**/src"]}');
  await put(join(sourceRoot, 'src/value.ts'), 'export const value = 1;\n');
  await put(join(sourceRoot, 'subs/child/src/tests/owned.test.ts'), 'export {};\n');
  await put(join(sourceRoot, 'node_modules/fixture-dependency/package.json'), '{"name":"fixture-dependency","main":"index.cjs"}');
  await put(join(sourceRoot, 'node_modules/fixture-dependency/index.cjs'), 'module.exports = 1;');
  for (const path of ['dist/output.js', 'build/output.js', 'coverage/data.json', '.reference-work/older/keep', 'subs/child/node_modules/skip/file', '.git/config']) {
    await put(join(sourceRoot, path));
  }
});
afterEach(async () => { await rm(temporary, { recursive: true, force: true }); });

function copy(preserveOnFailure = false) {
  return { workRoot, instanceId: 'I1-01:baseline', fixture: { kind: 'copy' as const, sourceRoot }, preserveOnFailure };
}

describe('isolated reference mutation copies', () => {
  it('copies a toolkit into a work area nested several directories below its root', async () => {
    const nestedWork = join(sourceRoot, 'examples/demo/.reference-work');
    await put(join(sourceRoot, 'examples/demo/src/entry.ts'), 'export {};');
    await put(join(nestedWork, 'older/keep'));
    const result = await runIsolatedProject({ ...copy(), workRoot: nestedWork }, async ({ root }) => {
      expect(await readFile(join(root, 'examples/demo/src/entry.ts'), 'utf8')).toBe('export {};');
      expect(existsSync(join(root, 'examples/demo/.reference-work'))).toBe(false);
      expect(existsSync(join(root, 'node_modules'))).toBe(false);
      return 'copied';
    });
    expect(result).toEqual({ ok: true, value: 'copied' });
    expect(await readdir(nestedWork)).toEqual(['older']);
  });
  it('copies into the example work area, resolves its own dependencies, mutates and removes only its copy', async () => {
    let copiedRoot = '';
    const result = await runIsolatedProject(copy(), async (project) => {
      copiedRoot = project.root;
      expect(project.request).toEqual({ root: copiedRoot, workingDirectory: copiedRoot, configuration: 'discover', scope: 'whole-project' });
      expect(await readFile(join(copiedRoot, 'README.md'), 'utf8')).toContain('Tiny copy fixture.');
      expect(await readFile(join(copiedRoot, 'subs/child/src/tests/owned.test.ts'), 'utf8')).toBe('export {};\n');
      for (const path of ['node_modules', 'dist', 'build', 'coverage', '.reference-work', '.git', 'subs/child/node_modules']) {
        expect(existsSync(join(copiedRoot, path))).toBe(false);
      }
      const require = createRequire(join(copiedRoot, 'package.json'));
      expect(require.resolve('fixture-dependency')).toBe(join(sourceRoot, 'node_modules/fixture-dependency/index.cjs'));
      await replaceExactlyOnce(join(copiedRoot, 'src/value.ts'), 'value = 1', 'value = 2');
      expect(await readFile(join(copiedRoot, 'src/value.ts'), 'utf8')).toContain('value = 2');
      return 42;
    });
    expect(result).toEqual({ ok: true, value: 42 });
    expect(existsSync(copiedRoot)).toBe(false);
    expect(await readFile(join(sourceRoot, 'src/value.ts'), 'utf8')).toContain('value = 1');
    expect(await readdir(workRoot)).toEqual(['older']);
  });

  it('cleans a failed operation by default and keeps its original error', async () => {
    const error = new Error('independent assertion failed');
    const result = await runIsolatedProject(copy(), async () => { throw error; });
    expect(result).toEqual({ ok: false, error });
    expect(await readdir(workRoot)).toEqual(['older']);
  });

  it('preserves changed bytes only for an explicitly requested failure', async () => {
    const result = await runIsolatedProject(copy(true), async ({ root }) => {
      await replaceExactlyOnce(join(root, 'src/value.ts'), 'value = 1', 'value = 9');
      throw new Error('inspect this failure');
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected a failure');
    expect(result.preservedDirectory).toBeTruthy();
    expect(await readFile(join(result.preservedDirectory!, 'I1-01:baseline/project/src/value.ts'), 'utf8')).toContain('value = 9');
    expect(await readFile(join(sourceRoot, 'src/value.ts'), 'utf8')).toContain('value = 1');
    expect(await readdir(workRoot)).toHaveLength(2);
  });

  it('still cleans successful operations when preservation is enabled', async () => {
    expect(await runIsolatedProject(copy(true), async () => 'done')).toEqual({ ok: true, value: 'done' });
    expect(await readdir(workRoot)).toEqual(['older']);
  });

  it('keeps concurrent runs with the same instance ID isolated', async () => {
    const roots: string[] = [];
    let release!: () => void;
    const together = new Promise<void>((resolve) => { release = resolve; });
    const results = await Promise.all([1, 2].map((value) => runIsolatedProject(copy(), async ({ root }) => {
      roots.push(root);
      if (roots.length === 2) release();
      await together;
      await replaceExactlyOnce(join(root, 'src/value.ts'), 'value = 1', `value = ${value + 10}`);
      expect(await readFile(join(root, 'src/value.ts'), 'utf8')).toContain(`value = ${value + 10}`);
      return root;
    })));
    expect(new Set(roots).size).toBe(2);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(roots.every((root) => !existsSync(root))).toBe(true);
    expect(await readdir(workRoot)).toEqual(['older']);
  });

  it('cleans failed fixture creation and failed source acquisition', async () => {
    const failedCopy = await runIsolatedProject({ ...copy(), fixture: { kind: 'copy', sourceRoot: join(temporary, 'missing') } }, async () => {});
    expect(failedCopy.ok).toBe(false);
    const failedCreation = await runIsolatedProject({ ...copy(), fixture: { kind: 'create', create: async (root) => {
      await put(join(root, 'partial.ts'));
      throw new Error('creation failed');
    } } }, async () => {});
    expect(failedCreation.ok).toBe(false);
    expect(await readdir(workRoot)).toEqual(['older']);
  });

  it.each(['../escape', 'I1-01:baseline/../../escape', '/absolute'])('rejects unsafe instance directory %s before creating a run', async (instanceId) => {
    await expect(runIsolatedProject({ ...copy(), instanceId }, async () => {})).rejects.toThrow('Invalid instance directory ID');
    expect(await readdir(workRoot)).toEqual(['older']);
  });

  it('rejects missing and repeated mutation anchors without changing bytes', async () => {
    const path = join(sourceRoot, 'src/value.ts');
    await expect(replaceExactlyOnce(path, 'missing', '')).rejects.toThrow('exactly one');
    await writeFile(path, 'anchor anchor');
    await expect(replaceExactlyOnce(path, 'anchor', 'changed')).rejects.toThrow('exactly one');
    expect(await readFile(path, 'utf8')).toBe('anchor anchor');
  });
});
