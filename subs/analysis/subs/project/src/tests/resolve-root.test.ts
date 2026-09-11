import { createHook } from 'node:async_hooks';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readProject } from '../read-project.js';
import { resolveProjectRoot } from '../resolve-root.js';
import { fixture, limits, put, syntax } from './fixtures.js';
import type { ProjectRead } from '../interfaces/project.js';

async function acquired(root: string, retained?: Extract<ProjectRead, { status: 'acquired' }>['configuration']) {
  const result = await readProject({ request: { cwd: root, root, scope: 'whole-project', configuration: 'discover' }, limits, parse: syntax, retained });
  expect(result.status).toBe('acquired'); if (result.status !== 'acquired') throw new Error(JSON.stringify(result)); return result;
}
describe('project resolution and captured configuration reuse', () => {
  it('reuses the helper product for source edits, but recomputes when configuration bytes or directory membership change', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-config-reuse-'));
    try {
      await fixture(root);
      const first = await acquired(root); const retained = first.configuration; await first.view.dispose();
      await writeFile(join(root, 'src/value.ts'), 'export const value = 2;\n');
      let helpers = 0;
      const hook = createHook({ init(_id, type) { if (type === 'PROCESSWRAP') helpers++; } }).enable();
      let next: Awaited<ReturnType<typeof acquired>>;
      try { next = await acquired(root, retained); } finally { hook.disable(); }
      expect(next.reusedConfiguration).toBe(true); expect(helpers).toBe(0); await next.view.dispose();
      await put(root, 'src/added.ts', 'export const added = 1;\n');
      const added = await acquired(root, retained); expect(added.reusedConfiguration).toBe(false);
      expect(added.view.inventory.files.some(file => file.path === 'src/added.ts')).toBe(true); await added.view.dispose();
      await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"types":[],"strict":true},"include":["src"]}');
      const changed = await acquired(root, retained); expect(changed.reusedConfiguration).toBe(false); await changed.view.dispose();
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);
  it('cancels a real configuration helper and rejects the resolver without leaving it alive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-resolution-cancel-'));
    const controller = new AbortController(); let spawned = 0;
    const hook = createHook({ init(_id, type) { if (type === 'PROCESSWRAP') { spawned++; controller.abort(); } } });
    try {
      await fixture(root); hook.enable();
      await expect(resolveProjectRoot({ cwd: root, root, scope: 'whole-project', configuration: 'discover' }, controller.signal))
        .rejects.toMatchObject({ name: 'AbortError' });
      expect(spawned).toBe(1);
    } finally { hook.disable(); await rm(root, { recursive: true, force: true }); }
  }, 10_000);
  it('classifies missing roots/configuration and references-only configurations consistently', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-project-resolution-'));
    const request = { cwd: root, scope: 'whole-project' as const, configuration: 'discover' as const };
    try {
      expect(await resolveProjectRoot(request)).toMatchObject({ status: 'unavailable', issues: [{ code: 'root-not-found' }] });
      await put(root, 'module.ramify', 'ramify 1\nmodule fixture\n');
      expect(await resolveProjectRoot(request)).toMatchObject({ status: 'unavailable', issues: [{ code: 'configuration-not-found' }] });
      await fixture(root);
      await put(root, 'ref/tsconfig.json', '{"files":[]}');
      await put(root, 'tsconfig.json', '{"files":[],"references":[{"path":"./ref"}]}');
      expect(await resolveProjectRoot(request)).toMatchObject({ status: 'unavailable', issues: [{ code: 'references-only-configuration' }] });
      const read = await readProject({ request, limits, parse: syntax });
      expect(read).toMatchObject({ status: 'unavailable', sealedInputs: null, issues: [{ code: 'references-only-configuration' }] });
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);
});
