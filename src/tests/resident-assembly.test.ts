import { describe, expect, it } from 'vitest';
import { createSessionDriver } from '../resident-assembly.js';
import { fixture } from './fixture.js';
import { analyzeProject } from '../../subs/analysis/src/index.js';
import { createQuickEnvironment } from './quick-environment.js';

const setup = { registry: 'default' as const, capabilities: ['static-access', 'coverage'] as const };

describe('resident analysis driver resolution lifetime', () => {
  it.each(['caller', 'driver'] as const)('cancels pending resolution when the %s ends it', mode => fixture(async root => {
    const driver = createSessionDriver(), controller = new AbortController();
    const pending = driver.resolve({ cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    if (mode === 'caller') controller.abort();
    try {
      await driver.dispose();
      await rejected;
      await expect(driver.resolve({ cwd: root, root, scope: 'whole-project', configuration: 'discover' }))
        .rejects.toThrow('disposed');
    } finally { await driver.dispose(); }
  }));

  it('opens a retained session whose first projection equals batch and disposes the compiler with its driver', () => fixture(async root => {
    const driver = createSessionDriver();
    const project = { cwd: root, root, scope: 'whole-project' as const, configuration: 'discover' as const };
    try {
      const opened = await driver.open(project, setup);
      expect(opened.status).toBe('opened');
      if (opened.status !== 'opened') throw new Error(JSON.stringify(opened));
      const { session, revision } = opened;
      expect(revision.sequence).toBe(1);
      expect(revision.checked.path).toBe('cold');
      expect(revision.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' });
      expect(session.current).toBe(revision);
      const report = await session.report(undefined, revision.sequence);
      if (!report) throw new Error('The opening revision has no report');
      const batch = await analyzeProject(report.request);
      if (batch.status !== 'reported') throw new Error('Batch unexpectedly cancelled');
      expect({ ...report, runId: 'compared' }).toEqual({ ...batch.report, runId: 'compared' });
      expect(report.inputId).toBe(revision.inputId);
      expect(report.snapshot?.inputs).toEqual(revision.inputs);
      expect(await session.update([])).toEqual({ status: 'revised', revision, identical: true, reacquired: false,
        timings: { invocationCheck: 0, promotion: 0, workerStatus: expect.any(Number), workerRoundTrip: expect.any(Number) } });
      const pid = session.status().compiler.pid;
      expect(pid).toBeGreaterThan(0);
      await driver.dispose();
      expect(() => process.kill(pid!, 0)).toThrowError(expect.objectContaining({ code: 'ESRCH' }));
      expect(session.current).toBeNull();
      await expect(session.dispose()).resolves.toBeUndefined();
      await expect(driver.open(project, setup)).resolves.toEqual({ status: 'cancelled' });
    } finally { await driver.dispose(); }
  }), 120_000);

  it.each(['caller', 'driver'] as const)('cancels an opening session when the %s ends it', mode => fixture(async root => {
    const driver = createSessionDriver(), controller = new AbortController();
    const project = { cwd: root, root, scope: 'whole-project' as const, configuration: 'discover' as const };
    try {
      const pending = driver.open(project, setup, { signal: controller.signal });
      if (mode === 'caller') controller.abort();
      else await driver.dispose();
      expect(await pending).toEqual({ status: 'cancelled' });
    } finally { await driver.dispose(); }
  }), 120_000);

  it('enforces a smaller assembly retention budget inside the session before publication', () => fixture(async root => {
    const environment = await createQuickEnvironment({ maxRetainedBytesPerContext: 1 });
    try {
      const opened = await environment.service.openContext({ project: { cwd: root, root,
        scope: 'whole-project', configuration: 'discover' }, setup });
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected an opening context');
      const checked = await environment.service.check({ token: opened.value.token, requestId: 'worker-retention-cap',
        freshness: { mode: 'published', wait: true } });
      if (!checked.ok || checked.value.status !== 'reported') throw new Error(JSON.stringify(checked));
      expect(checked.value.published).toBe(false);
      expect(checked.value.report?.outcome.check).not.toBe('passed');
      expect(checked.value.report?.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'resource-limit', limit: expect.objectContaining({ name: 'maxRetainedFactBytes', maximum: 1 }) }),
      ]));
    } finally { await environment.dispose(); }
  }), 120_000);
});
