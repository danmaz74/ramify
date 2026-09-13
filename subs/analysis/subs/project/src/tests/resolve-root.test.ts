import { createHook } from 'node:async_hooks';
import { mkdtemp, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { observeProject } from '../observer.js';
import { readProject } from '../read-project.js';
import { resolveProjectRoot } from '../resolve-root.js';
import { fixture, limits, put, syntax } from './fixtures.js';
import type { ProjectRead, ProjectRequest, ProjectResolution } from '../interfaces/project.js';

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

/** Configuration helpers spawned while `operation` runs: the cost a reused resolution avoids. */
async function spawned<T>(operation: () => Promise<T>): Promise<{ value: T; helpers: number }> {
  let helpers = 0;
  const hook = createHook({ init(_id, type) { if (type === 'PROCESSWRAP') helpers++; } }).enable();
  try { return { value: await operation(), helpers }; } finally { hook.disable(); }
}
const found = (cwd: string): ProjectRequest => ({ cwd, scope: 'whole-project', configuration: 'discover' });

describe('reused project-root resolution', () => {
  it('root-resolution-reused: an equal request reuses a known resolution while every discovery query answers the same', async () => {
    const work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-resolution-reuse-')));
    const root = join(work, 'project');
    try {
      await fixture(root);
      const request = found(join(root, 'src'));
      const first = await spawned(() => resolveProjectRoot(request));
      expect(first.value).toEqual({ status: 'resolved', root, invokedFrom: join(root, 'src'), selection: 'found', configuration: join(root, 'tsconfig.json') });
      expect(first.helpers).toBe(1);
      const again = await spawned(() => resolveProjectRoot(request, undefined, [first.value]));
      expect(again.value).toBe(first.value); expect(again.helpers).toBe(0);
      // A source edit changes only stat metadata of a probed file, not an answer.
      await writeFile(join(root, 'src/value.ts'), 'export const value = 2;\n');
      const edited = await spawned(() => resolveProjectRoot(request, undefined, [first.value]));
      expect(edited.value).toBe(first.value); expect(edited.helpers).toBe(0);
      // Only a resolution of an equal request is a candidate; the first such is validated.
      const other = found(root);
      const elsewhere = await spawned(() => resolveProjectRoot(other, undefined, [first.value]));
      expect(elsewhere.value).not.toBe(first.value); expect(elsewhere.helpers).toBe(1);
      expect(elsewhere.value).toMatchObject({ status: 'resolved', root, invokedFrom: root });
      const both = await spawned(() => resolveProjectRoot(request, undefined, [elsewhere.value, first.value]));
      expect(both.value).toBe(first.value); expect(both.helpers).toBe(0);
      // An observer's acquisition records the same resolution evidence, and a
      // structural rebuild replaces it with its own.
      const observed = await observeProject({ request, limits, parse: syntax });
      if (observed.status !== 'observing') throw new Error(JSON.stringify(observed));
      try {
        const seeded = observed.observer.resolution;
        expect(seeded).toEqual(first.value);
        const reused = await spawned(() => resolveProjectRoot(request, undefined, [seeded]));
        expect(reused.value).toBe(seeded); expect(reused.helpers).toBe(0);
        await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler","strict":true},"include":["src"]}\n');
        expect((await observed.observer.apply([{ path: 'tsconfig.json', kind: 'changed' }])).kind).toBe('structural');
        const rebuilt = observed.observer.resolution;
        expect(rebuilt).not.toBe(seeded);
        const stale = await spawned(() => resolveProjectRoot(request, undefined, [seeded]));
        expect(stale.value).not.toBe(seeded); expect(stale.helpers).toBe(1);
        const current = await spawned(() => resolveProjectRoot(request, undefined, [rebuilt]));
        expect(current.value).toBe(rebuilt); expect(current.helpers).toBe(0);
      } finally { await observed.observer.dispose(); }
    } finally { await rm(work, { recursive: true, force: true }); }
  }, 60_000);

  it('root-resolution-invalidated: a configuration edit, a created or deleted candidate, membership or a moved root resolves again', async () => {
    const work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-resolution-invalidated-')));
    // `child` is an independent root: a grouping directory, not `subs/`, holds it.
    const parent = join(work, 'parent'), root = join(parent, 'subs/group/child');
    try {
      await put(parent, 'tsconfig.json', '{"compilerOptions":{"types":[]},"include":["subs"]}\n');
      await fixture(root);
      await unlink(join(root, 'tsconfig.json'));
      const request = found(join(root, 'src'));
      let known: ProjectResolution = (await resolveProjectRoot(request));
      expect(known).toMatchObject({ status: 'resolved', root, configuration: join(parent, 'tsconfig.json') });
      /** Resolve with the previous resolution known; it must not be returned. */
      const resolvedAgain = async (): Promise<ProjectResolution> => {
        const next = await spawned(() => resolveProjectRoot(request, undefined, [known]));
        expect(next.value).not.toBe(known); expect(next.helpers).toBe(1);
        const unchanged = await spawned(() => resolveProjectRoot(request, undefined, [next.value]));
        expect(unchanged.value).toBe(next.value); expect(unchanged.helpers).toBe(0);
        known = next.value; return next.value;
      };
      // A created configuration candidate on the discovery path.
      await put(root, 'tsconfig.json', '{"compilerOptions":{"types":[]},"include":["src"]}\n');
      expect(await resolvedAgain()).toMatchObject({ status: 'resolved', root, configuration: join(root, 'tsconfig.json') });
      // A configuration edit.
      await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"types":[],"strict":true},"include":["src"]}\n');
      expect(await resolvedAgain()).toMatchObject({ status: 'resolved', root, configuration: join(root, 'tsconfig.json') });
      // Membership of an enumerated directory: the compiler's file selection answered differently.
      await put(root, 'src/added.ts', 'export const added = 1;\n');
      expect(await resolvedAgain()).toMatchObject({ status: 'resolved', root });
      // A deleted candidate: discovery continues to the ancestor configuration.
      await unlink(join(root, 'tsconfig.json'));
      expect(await resolvedAgain()).toMatchObject({ status: 'resolved', root, configuration: join(parent, 'tsconfig.json') });
      // A description above makes `child` a descendant: the root moves.
      await put(parent, 'module.ramify', 'ramify 1\nmodule parent\n');
      expect(await resolvedAgain()).toMatchObject({ status: 'resolved', root: parent, configuration: join(parent, 'tsconfig.json') });
      // A configuration that becomes references-only is unavailable, never a reused resolution.
      await writeFile(join(parent, 'tsconfig.json'), '{"files":[],"references":[{"path":"./subs"}]}\n');
      const refused = await spawned(() => resolveProjectRoot(request, undefined, [known]));
      expect(refused.helpers).toBe(1);
      expect(refused.value).toMatchObject({ status: 'unavailable', issues: [{ code: 'references-only-configuration' }] });
    } finally { await rm(work, { recursive: true, force: true }); }
  }, 60_000);
});
