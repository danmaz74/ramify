import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { SessionUpdate } from '../interfaces/session.js';
import type { resolveProjectRoot } from '../../subs/project/src/resolve-root.js';
import { analyzeProject } from '../index.js';
import { audited, equalToBatch, fixture, fixtureFiles, opened, paths, put, replace, timeout } from './session-test-fixture.js';

// Every root resolution that is not reused reads the configuration through the
// helper process. The resolver is wrapped through its exposed binding: each call
// counts the helper processes spawned while it runs and whether it returned a
// resolution it was not given. Acquisition's own configuration reads do not pass
// through it.
const resolutions = vi.hoisted(() => ({ helpers: 0, fresh: 0 }));
vi.mock('../../subs/project/src/resolve-root.js', async original => {
  const actual = await original<{ resolveProjectRoot: typeof resolveProjectRoot }>();
  const { createHook } = await import('node:async_hooks');
  return { ...actual, resolveProjectRoot: async (...args: Parameters<typeof resolveProjectRoot>) => {
    const hook = createHook({ init(_id, type) { if (type === 'PROCESSWRAP') resolutions.helpers++; } }).enable();
    try {
      const resolution = await actual.resolveProjectRoot(...args);
      if (!(args[2] ?? []).includes(resolution)) resolutions.fresh++;
      return resolution;
    } finally { hook.disable(); }
  } };
});

/** Root resolutions performed by one operation, beside its result. */
async function counted(operation: () => Promise<SessionUpdate>): Promise<{ result: SessionUpdate; resolutions: number }> {
  const helpers = resolutions.helpers, fresh = resolutions.fresh;
  const result = await operation();
  // A resolution the session did not already hold is exactly one that spawned its helper.
  expect(resolutions.fresh - fresh).toBe(resolutions.helpers - helpers);
  return { result, resolutions: resolutions.helpers - helpers };
}

describe('invocation checks reuse the session resolution', () => {
  it('invocation-check-reused: an update with the session invocation performs no root resolution', () => fixture(async (root, inputs) => {
    const { handle, revision } = await opened(inputs);
    try {
      const invocation = { project: inputs.project, capabilities: inputs.capabilities };
      // The observer's acquisition already resolved this request.
      const same = await counted(() => handle.update([], {}, invocation));
      expect(same.resolutions).toBe(0);
      expect(same.result).toEqual({ status: 'revised', revision, identical: true, timings: { invocationCheck: expect.any(Number), promotion: 0 } });
      // The reused check still validates its discovery answers on disk, and reports that work.
      expect(same.result.status === 'revised' && same.result.timings!.invocationCheck).toBeGreaterThan(0);
      // A source edit is not a discovery answer.
      await replace(root, paths.provider, '  return 2;', '  void 0;\n  return 2;');
      const edited = await counted(() => handle.update([{ path: paths.provider, kind: 'changed' }], {}, invocation));
      expect(edited.resolutions).toBe(0);
      expect(edited.result).toMatchObject({ status: 'revised', identical: false, revision: { checked: { path: 'unchanged-surface' } } });
      // A different request resolves once, and is then reused as well.
      const nested = { ...invocation, project: { cwd: join(root, 'subs/branch/src'), scope: 'whole-project' as const, configuration: 'discover' as const } };
      const first = await counted(() => handle.update([], {}, nested));
      expect(first.resolutions).toBe(1);
      expect(first.result).toMatchObject({ status: 'revised', identical: false, timings: { invocationCheck: expect.any(Number) } });
      const second = await counted(() => handle.update([], {}, nested));
      expect(second.resolutions).toBe(0);
      const back = await counted(() => handle.update([], {}, invocation));
      expect(back.resolutions).toBe(0);
      expect(back.result).toMatchObject({ status: 'revised' });
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('resolution-survives-membership: a created or deleted source file reuses the resolution in the invocation check', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      const invocation = { project: inputs.project, capabilities: inputs.capabilities };
      const nested = { ...invocation, project: { cwd: join(root, 'subs/branch/src'), scope: 'whole-project' as const, configuration: 'discover' as const } };
      expect((await counted(() => handle.update([], {}, nested))).resolutions).toBe(1);
      // The configuration helper enumerated `subs/branch/src`; its membership is not a discovery answer.
      await put(root, paths.extra, 'export const extra = 1;\n');
      const created = await counted(() => handle.update([{ path: paths.extra, kind: 'created' }], {}, invocation));
      expect(created.resolutions).toBe(0);
      expect(created.result).toMatchObject({ status: 'revised', identical: false });
      expect(created.result.status === 'revised' && created.result.revision.inputs.some(input => input.path === paths.extra)).toBe(true);
      expect((await counted(() => handle.update([], {}, nested))).resolutions).toBe(0);
      expect((await counted(() => handle.update([], {}, invocation))).resolutions).toBe(0);
      await audited(handle);
      await equalToBatch(handle, inputs);
      await rm(join(root, paths.extra));
      const deleted = await counted(() => handle.update([{ path: paths.extra, kind: 'deleted' }], {}, invocation));
      expect(deleted.resolutions).toBe(0);
      expect(deleted.result).toMatchObject({ status: 'revised', identical: false });
      expect(deleted.result.status === 'revised' && deleted.result.revision.inputs.some(input => input.path === paths.extra)).toBe(false);
      expect((await counted(() => handle.update([], {}, nested))).resolutions).toBe(0);
      expect((await counted(() => handle.update([], {}, invocation))).resolutions).toBe(0);
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('resolution-survives-configuration-bytes: a configuration edit reuses the resolution and a solution-style rewrite is refused by acquisition', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      const invocation = { project: inputs.project, capabilities: inputs.capabilities };
      const config = JSON.parse(fixtureFiles['tsconfig.json']!) as { compilerOptions: Record<string, unknown> };
      await put(root, 'tsconfig.json', JSON.stringify({ ...config, compilerOptions: { ...config.compilerOptions, strict: true } }));
      const edited = await counted(() => handle.update([{ path: 'tsconfig.json', kind: 'changed' }], {}, invocation));
      expect(edited.resolutions).toBe(0);
      expect(edited.result).toMatchObject({ status: 'revised', identical: false });
      await audited(handle);
      await equalToBatch(handle, inputs);
      // A solution-style rewrite passes the invocation check; the observer's reacquisition refuses it.
      await put(root, 'ref/tsconfig.json', '{"files":[]}');
      await put(root, 'tsconfig.json', '{"files":[],"references":[{"path":"./ref"}]}');
      const refused = await counted(() => handle.update([{ path: 'tsconfig.json', kind: 'changed' }], {}, invocation));
      expect(refused.resolutions).toBe(0);
      const { session: _session, ...request } = inputs;
      const batch = await analyzeProject(request);
      if (batch.status !== 'reported') throw new Error('Batch comparison was cancelled');
      expect(batch.report.diagnostics).toMatchObject([{ code: 'references-only-configuration' }]);
      // The engine projects a failed reacquisition as a failure diagnostic carrying the acquisition's message.
      expect(refused.result).toMatchObject({ status: 'reported', report: { diagnostics: [{ code: 'internal-error', message: batch.report.diagnostics[0]!.message }] } });
      // Restoring the configuration revises without a resolution.
      await put(root, 'tsconfig.json', fixtureFiles['tsconfig.json']!);
      const restored = await counted(() => handle.update([{ path: 'tsconfig.json', kind: 'changed' }], {}, invocation));
      expect(restored.resolutions).toBe(0);
      expect(restored.result).toMatchObject({ status: 'revised' });
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('root-resolution-invalidated, resolution-invalidated-by-discovery: a created or deleted description or configuration on the discovery path resolves again and a moved root is refused', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      const invocation = { project: { cwd: join(root, 'subs/branch/src'), scope: 'whole-project' as const, configuration: 'discover' as const },
        capabilities: inputs.capabilities };
      expect((await counted(() => handle.update([], {}, invocation))).resolutions).toBe(1);
      expect((await counted(() => handle.update([], {}, invocation))).resolutions).toBe(0);
      // The configuration found on the discovery path is deleted: the invocation no longer
      // resolves, and discovery fails before any helper could be spawned.
      await rm(join(root, 'tsconfig.json'));
      const deleted = await handle.update([], {}, invocation);
      expect(deleted.status === 'reported' && deleted.report.diagnostics[0]!.message)
        .toBe('The invocation does not resolve to a project: No tsconfig.json at the root or its ancestors');
      // Created again, every discovery query answers as recorded: the earlier resolution is valid again.
      await put(root, 'tsconfig.json', fixtureFiles['tsconfig.json']!);
      const created = await counted(() => handle.update([], {}, invocation));
      expect(created.resolutions).toBe(0);
      expect(created.result).toMatchObject({ status: 'revised' });
      // A description in `src/` is the nearest boundary of this working directory:
      // the invocation now resolves to an independent root, not the session's.
      await put(root, 'subs/branch/src/module.ramify', 'ramify 1\nmodule moved\n');
      const moved = await counted(() => handle.update([], {}, invocation));
      expect(moved.resolutions).toBe(1);
      // The engine's failure projection reports an invocation refusal as an internal error with its message.
      expect(moved.result).toMatchObject({ status: 'reported', report: { diagnostics: [{ code: 'internal-error' }] } });
      expect(moved.result.status === 'reported' && moved.result.report.diagnostics[0]!.message)
        .toBe(`The invocation resolves to ${join(root, 'subs/branch/src')}, not this session's ${root}`);
      // The refused resolution is never reused for the session's root.
      const again = await counted(() => handle.update([], {}, invocation));
      expect(again.result.status === 'reported' && again.result.report.diagnostics[0]!.message).toContain('The invocation resolves to');
      await rm(join(root, 'subs/branch/src/module.ramify'));
      const restored = await counted(() => handle.update([], {}, invocation));
      expect(restored.resolutions).toBe(1);
      expect(restored.result).toMatchObject({ status: 'revised' });
      // The session's own invocation is unaffected throughout.
      const own = await counted(() => handle.update([], {}, { project: inputs.project, capabilities: inputs.capabilities }));
      expect(own.resolutions).toBe(0);
      expect(own.result).toMatchObject({ status: 'revised' });
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);
});
