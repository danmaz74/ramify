import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { SessionUpdate } from '../interfaces/session.js';
import { audited, equalToBatch, fixture, fixtureFiles, opened, paths, put, replace, timeout } from './session-test-fixture.js';

// Every root resolution that is not reused reads the configuration through the
// helper; acquisition's own configuration reads use the module's internal binding.
const resolutions = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../subs/project/src/configuration.js', async original => {
  const actual = await original<typeof import('../../subs/project/src/configuration.js')>();
  return { ...actual, readConfiguration: (...args: Parameters<typeof actual.readConfiguration>) => {
    resolutions.count++;
    return actual.readConfiguration(...args);
  } };
});

/** Root resolutions performed by one operation, beside its result. */
async function counted(operation: () => Promise<SessionUpdate>): Promise<{ result: SessionUpdate; resolutions: number }> {
  const before = resolutions.count;
  const result = await operation();
  return { result, resolutions: resolutions.count - before };
}

describe('invocation checks reuse the session resolution', () => {
  it('invocation-check-reused: an update with the session invocation performs no root resolution', () => fixture(async (root, inputs) => {
    const { handle, revision } = await opened(inputs);
    try {
      const invocation = { project: inputs.project, capabilities: inputs.capabilities };
      // The observer's acquisition already resolved this request.
      const same = await counted(() => handle.update([], {}, invocation));
      expect(same.resolutions).toBe(0);
      expect(same.result).toEqual({ status: 'revised', revision, identical: true, timings: { invocationCheck: expect.any(Number) } });
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

  it('root-resolution-invalidated: a configuration edit resolves again and a moved root is refused', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      const invocation = { project: { cwd: join(root, 'subs/branch/src'), scope: 'whole-project' as const, configuration: 'discover' as const },
        capabilities: inputs.capabilities };
      expect((await counted(() => handle.update([], {}, invocation))).resolutions).toBe(1);
      expect((await counted(() => handle.update([], {}, invocation))).resolutions).toBe(0);
      // A configuration edit changes a read the resolution made.
      const config = JSON.parse(fixtureFiles['tsconfig.json']!) as { compilerOptions: Record<string, unknown> };
      await put(root, 'tsconfig.json', JSON.stringify({ ...config, compilerOptions: { ...config.compilerOptions, strict: true } }));
      const edited = await counted(() => handle.update([{ path: 'tsconfig.json', kind: 'changed' }], {}, invocation));
      expect(edited.resolutions).toBe(1);
      expect(edited.result).toMatchObject({ status: 'revised', identical: false });
      expect((await counted(() => handle.update([], {}, invocation))).resolutions).toBe(0);
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
