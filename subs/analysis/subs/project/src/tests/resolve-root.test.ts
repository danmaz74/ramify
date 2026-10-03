import { createHook } from 'node:async_hooks';
import { chmod, mkdtemp, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
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
      await put(root, 'module.ramify', 'ramify 1\nroot module fixture\n');
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
      // structural rebuild replaces it with its own. A configuration content
      // edit is not a discovery answer, so both remain valid.
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
        const seed = await spawned(() => resolveProjectRoot(request, undefined, [seeded]));
        expect(seed.value).toBe(seeded); expect(seed.helpers).toBe(0);
        const current = await spawned(() => resolveProjectRoot(request, undefined, [rebuilt]));
        expect(current.value).toBe(rebuilt); expect(current.helpers).toBe(0);
      } finally { await observed.observer.dispose(); }
    } finally { await rm(work, { recursive: true, force: true }); }
  }, 60_000);

  it('resolution-survives-membership: a created or deleted source file in an enumerated directory reuses the resolution', async () => {
    const work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-resolution-membership-')));
    const root = join(work, 'project');
    try {
      await fixture(root);
      const request = found(join(root, 'src'));
      const first = await spawned(() => resolveProjectRoot(request));
      expect(first.helpers).toBe(1);
      const reused = async (): Promise<void> => {
        const next = await spawned(() => resolveProjectRoot(request, undefined, [first.value]));
        expect(next.value).toBe(first.value); expect(next.helpers).toBe(0);
      };
      // The configuration helper enumerated `src`; its membership is not a discovery answer.
      await put(root, 'src/added.ts', 'export const added = 1;\n');
      await reused();
      await put(root, 'src/nested/deeper.ts', 'export const deeper = 1;\n');
      await reused();
      await unlink(join(root, 'src/value.ts'));
      await reused();
      // Acquisition still enumerates the current membership.
      const read = await acquired(root);
      expect(read.view.inventory.files.map(file => file.path)).toEqual(['src/added.ts', 'src/nested/deeper.ts']);
      await read.view.dispose();
      // An observer's seed survives a membership change the same way, and its
      // local update keeps the seed.
      const observed = await observeProject({ request, limits, parse: syntax });
      if (observed.status !== 'observing') throw new Error(JSON.stringify(observed));
      try {
        const seeded = observed.observer.resolution;
        await put(root, 'src/later.ts', 'export const later = 1;\n');
        expect((await observed.observer.apply([{ path: 'src/later.ts', kind: 'created' }])).kind).toBe('local');
        expect(observed.observer.resolution).toBe(seeded);
        await unlink(join(root, 'src/added.ts'));
        expect((await observed.observer.apply([{ path: 'src/added.ts', kind: 'deleted' }])).kind).toBe('local');
        const again = await spawned(() => resolveProjectRoot(request, undefined, [seeded]));
        expect(again.value).toBe(seeded); expect(again.helpers).toBe(0);
      } finally { await observed.observer.dispose(); }
    } finally { await rm(work, { recursive: true, force: true }); }
  }, 60_000);

  it('root-resolution-invalidated, resolution-invalidated-by-discovery: a created or deleted configuration or description on the discovery path, a moved root or a changed canonical path resolves again', async () => {
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
      // A deleted candidate: discovery continues to the ancestor configuration.
      await unlink(join(root, 'tsconfig.json'));
      expect(await resolvedAgain()).toMatchObject({ status: 'resolved', root, configuration: join(parent, 'tsconfig.json') });
      // A created description above makes `child` a descendant: the root moves.
      await put(parent, 'module.ramify', 'ramify 1\nroot module parent\n');
      expect(await resolvedAgain()).toMatchObject({ status: 'resolved', root: parent, configuration: join(parent, 'tsconfig.json') });
      // A deleted description on the climb: the root moves back.
      await unlink(join(parent, 'module.ramify'));
      expect(await resolvedAgain()).toMatchObject({ status: 'resolved', root, configuration: join(parent, 'tsconfig.json') });
      // A description in the working directory is its nearest boundary: the root moves to it.
      await put(root, 'src/module.ramify', 'ramify 1\nroot module moved\n');
      expect(await resolvedAgain()).toMatchObject({ status: 'resolved', root: join(root, 'src') });
      await unlink(join(root, 'src/module.ramify'));
      expect(await resolvedAgain()).toMatchObject({ status: 'resolved', root });
      // The root description is deleted: no project is found, and none is reused.
      await unlink(join(root, 'module.ramify'));
      const deleted = await spawned(() => resolveProjectRoot(request, undefined, [known]));
      expect(deleted.value).toMatchObject({ status: 'unavailable', issues: [{ code: 'root-not-found' }] });
      await put(root, 'module.ramify', 'ramify 1\nroot module fixture\n');
      known = await resolveProjectRoot(request);
      // The root description becomes a symlink: its kind answers differently and a fresh resolution refuses it.
      await rm(join(root, 'module.ramify'));
      await put(work, 'elsewhere.ramify', 'ramify 1\nroot module fixture\n');
      await symlink(join(work, 'elsewhere.ramify'), join(root, 'module.ramify'));
      const linked = await spawned(() => resolveProjectRoot(request, undefined, [known]));
      expect(linked.helpers).toBe(0);
      expect(linked.value).toMatchObject({ status: 'invalid', issues: [{ code: 'symlink-description' }] });
    } finally { await rm(work, { recursive: true, force: true }); }
  }, 60_000);

  it('resolution-invalidated-by-discovery: a changed canonical path of the working directory resolves again', async () => {
    const work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-resolution-canonical-')));
    try {
      await fixture(join(work, 'a/project'));
      await fixture(join(work, 'b/project'));
      await symlink(join(work, 'a'), join(work, 'link'));
      const request = found(join(work, 'link/project/src'));
      const first = await resolveProjectRoot(request);
      expect(first).toMatchObject({ status: 'resolved', root: join(work, 'a/project'), invokedFrom: join(work, 'a/project/src') });
      expect((await spawned(() => resolveProjectRoot(request, undefined, [first]))).value).toBe(first);
      // The same raw request now reaches another directory.
      await unlink(join(work, 'link'));
      await symlink(join(work, 'b'), join(work, 'link'));
      const moved = await spawned(() => resolveProjectRoot(request, undefined, [first]));
      expect(moved.helpers).toBe(1);
      expect(moved.value).toEqual({ status: 'resolved', root: join(work, 'b/project'), invokedFrom: join(work, 'b/project/src'),
        selection: 'found', configuration: join(work, 'b/project/tsconfig.json') });
      // A canonical configuration path that moves beneath an unchanged root: the configuration becomes a symlink.
      const root = join(work, 'b/project');
      const again = moved.value;
      await put(work, 'shared/tsconfig.json', '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["../b/project/src"]}\n');
      await unlink(join(root, 'tsconfig.json'));
      await symlink(join(work, 'shared/tsconfig.json'), join(root, 'tsconfig.json'));
      const relinked = await spawned(() => resolveProjectRoot(request, undefined, [again]));
      expect(relinked.helpers).toBe(1);
      expect(relinked.value).toMatchObject({ status: 'resolved', root, configuration: join(work, 'shared/tsconfig.json') });
    } finally { await rm(work, { recursive: true, force: true }); }
  }, 60_000);

  it('resolution-survives-configuration-bytes: a configuration content edit reuses the resolution and acquisition refuses what resolution no longer re-reads, with the same codes', async () => {
    const work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-resolution-bytes-')));
    const root = join(work, 'project');
    try {
      await fixture(root);
      await put(root, 'ref/tsconfig.json', '{"files":[]}\n');
      const request = found(join(root, 'src'));
      const first = await spawned(() => resolveProjectRoot(request));
      expect(first.helpers).toBe(1);
      const reused = async (): Promise<void> => {
        const next = await spawned(() => resolveProjectRoot(request, undefined, [first.value]));
        expect(next.value).toBe(first.value); expect(next.helpers).toBe(0);
      };
      await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler","target":"ES2022"},"include":["src"]}\n');
      await reused();
      // An extended configuration created and then edited: bytes the helper would read.
      await put(root, 'base.json', '{"compilerOptions":{"strict":true}}\n');
      await writeFile(join(root, 'tsconfig.json'), '{"extends":"./base.json","compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src"]}\n');
      await reused();
      await writeFile(join(root, 'base.json'), '{"compilerOptions":{"strict":false}}\n');
      await reused();
      const observed = await observeProject({ request, limits, parse: syntax });
      if (observed.status !== 'observing') throw new Error(JSON.stringify(observed));
      try {
        // A solution-style rewrite: the resolution is reused, and acquisition refuses it.
        await writeFile(join(root, 'tsconfig.json'), '{"files":[],"references":[{"path":"./ref"}]}\n');
        await reused();
        const fresh = await resolveProjectRoot(request);
        expect(fresh).toMatchObject({ status: 'unavailable', issues: [{ code: 'references-only-configuration' }] });
        expect(await readProject({ request, limits, parse: syntax })).toMatchObject({ status: 'unavailable', sealedInputs: null,
          issues: [{ code: 'references-only-configuration', path: 'tsconfig.json' }] });
        expect(await observed.observer.apply([{ path: 'tsconfig.json', kind: 'changed' }]))
          .toMatchObject({ kind: 'incomplete', issues: [{ code: 'references-only-configuration' }] });
      } finally { await observed.observer.dispose(); }
      await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src"]}\n');
      await reused();
      // An enumerated directory made unreadable: the resolution is reused, and acquisition fails to read it.
      if (process.getuid?.() !== 0) {
        await put(root, 'src/nested/deeper.ts', 'export const deeper = 1;\n');
        await chmod(join(root, 'src/nested'), 0o000);
        try {
          await reused();
          const fresh = await resolveProjectRoot(request);
          expect(fresh).toMatchObject({ status: 'unavailable', issues: [{ code: 'read-failure' }] });
          const read = await readProject({ request, limits, parse: syntax });
          expect(read).toMatchObject({ status: 'incomplete', sealedInputs: null, issues: [{ code: 'read-failure' }] });
        } finally { await chmod(join(root, 'src/nested'), 0o755); }
      }
      await reused();
      // A configuration with references keeps every query: a content edit resolves again.
      await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src"],"references":[{"path":"./ref"}]}\n');
      const referenced = await spawned(() => resolveProjectRoot(request, undefined, [first.value]));
      expect(referenced.value).toBe(first.value); expect(referenced.helpers).toBe(0);
      const withReferences = (await resolveProjectRoot(request)) as ProjectResolution;
      expect(withReferences).toMatchObject({ status: 'resolved', root });
      expect((await spawned(() => resolveProjectRoot(request, undefined, [withReferences]))).helpers).toBe(0);
      await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler","strict":true},"include":["src"],"references":[{"path":"./ref"}]}\n');
      const edited = await spawned(() => resolveProjectRoot(request, undefined, [withReferences]));
      expect(edited.value).not.toBe(withReferences); expect(edited.helpers).toBe(1);
      await put(root, 'src/added.ts', 'export const added = 1;\n');
      const member = await spawned(() => resolveProjectRoot(request, undefined, [edited.value]));
      expect(member.value).not.toBe(edited.value); expect(member.helpers).toBe(1);
    } finally { await rm(work, { recursive: true, force: true }); }
  }, 60_000);
});
