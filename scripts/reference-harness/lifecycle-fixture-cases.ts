import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { withLifecycleProjects } from './fixtures/plan2/lifecycle.js';
import { projectFixtureFiles } from './fixtures/plan1/project.js';

async function inWorkRoot(run: (workRoot: string) => Promise<void>): Promise<void> {
  const workRoot = await mkdtemp(join(tmpdir(), 'ramify-lifecycle-fixture-'));
  try {
    await writeFile(join(workRoot, 'caller-owned'), 'keep');
    await run(workRoot);
    assert.deepEqual(await readdir(workRoot), ['caller-owned']);
    assert.equal(await readFile(join(workRoot, 'caller-owned'), 'utf8'), 'keep');
  } finally { await rm(workRoot, { recursive: true, force: true }); }
}

/** Shared with the focused runner: fixture qualification earns no I2 credit. */
export const lifecycleFixtureCases: readonly { readonly name: string; readonly run: () => Promise<void> }[] = [
  { name: 'creates nine complete independent F projects in stable opening order', run: () => inWorkRoot(async workRoot => {
    let created: readonly string[] = [];
    const value = await withLifecycleProjects(workRoot, async roots => {
      created = roots;
      assert.equal(roots.length, 9);
      assert.deepEqual(roots.map(root => basename(root)), ['fixture-1', 'fixture-2', 'fixture-3', 'fixture-4', 'fixture-5',
        'fixture-6', 'fixture-7', 'fixture-8', 'fixture-9']);
      assert.equal(new Set(await Promise.all(roots.map(root => realpath(root)))).size, 9);
      for (const root of roots) {
        assert.ok((await stat(join(root, 'src'))).isDirectory());
        for (const [path, expected] of Object.entries(projectFixtureFiles)) {
          assert.equal(await readFile(join(root, path), 'utf8'), expected, `${basename(root)}: ${path}`);
        }
      }
      const path = 'subs/consumer/src/probe.ts';
      await writeFile(join(roots[0], path), 'export const changed = 1;\n');
      await writeFile(join(roots[8], 'README.md'), '# Ninth fixture\n\nChanged ninth purpose.\n');
      assert.equal(await readFile(join(roots[0], path), 'utf8'), 'export const changed = 1;\n');
      for (const root of roots.slice(1)) assert.equal(await readFile(join(root, path), 'utf8'), projectFixtureFiles[path]);
      for (const root of roots.slice(0, 8)) assert.equal(await readFile(join(root, 'README.md'), 'utf8'), projectFixtureFiles['README.md']);
      return 'all nine observed';
    });
    assert.equal(value, 'all nine observed');
    for (const root of created) await assert.rejects(stat(root), { code: 'ENOENT' });
  }) },
  { name: 'keeps overlapping nine-project scopes independent under the same work root', run: () => inWorkRoot(async workRoot => {
    await withLifecycleProjects(workRoot, async outer => {
      await withLifecycleProjects(workRoot, async inner => {
        assert.equal(new Set([...outer, ...inner]).size, 18);
        await writeFile(join(inner[0], 'README.md'), 'inner change');
        assert.equal(await readFile(join(outer[0], 'README.md'), 'utf8'), projectFixtureFiles['README.md']);
      });
      for (const root of outer) assert.ok((await stat(root)).isDirectory());
    });
  }) },
  { name: 'removes all nine projects on callback failure while preserving the cause', run: () => inWorkRoot(async workRoot => {
    const failure = new Error('deliberate fixture callback failure');
    let created: readonly string[] = [];
    await assert.rejects(withLifecycleProjects(workRoot, async roots => {
      created = roots;
      assert.equal(roots.length, 9);
      await writeFile(join(roots[4], 'callback-created'), 'cleanup this too');
      throw failure;
    }), error => error === failure);
    for (const root of created) await assert.rejects(stat(root), { code: 'ENOENT' });
  }) },
];
