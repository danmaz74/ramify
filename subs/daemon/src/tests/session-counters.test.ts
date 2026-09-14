import { describe, expect, it } from 'vitest';
import type { RetainedSession, SessionRevision } from '../../../analysis/src/interfaces/session.js';
import type { AnalysisDriver, ContextBudgets } from '../../subs/contexts/src/interfaces/contexts.js';
import { createControlledClock, createControlledWatcher } from '../../subs/contexts/src/tests/controlled-ports.js';
import type { LogEntry } from '../interfaces/daemon.js';
import { createDaemonService } from '../service.js';

const budgets: ContextBudgets = {
  maxContexts: 8, maxHotContexts: 2, maxHistoryRevisions: 8, maxHistoryBytes: 1024 ** 2,
  maxRetainedBytesPerContext: 1024 ** 2, maxRetainedBytesGlobal: 8 * 1024 ** 2,
  maxQueuedPaths: 100, maxConcurrentAnalyses: 1, warmIdleMs: 1000, coldRetainMs: 2000,
  debounceMs: 10, sweepIntervalMs: 100, updateDeadlineMs: 2000, demoteDeadlineMs: 5000,
};
async function flush(): Promise<void> { for (let index = 0; index < 100; index++) await Promise.resolve(); }
function revision(sequence: number): SessionRevision {
  return { sequence, inputId: `input/1:scripted-${sequence}`, inputs: [], changed: [],
    checked: { path: sequence === 1 ? 'cold' : 'source', files: [], accesses: 0, modelRebuilt: false },
    outcome: { execution: 'completed', check: 'passed', coverage: 'complete' },
    summary: { complete: true, owners: 0, sourceFiles: 0, resources: 0, originals: 0, accesses: 0,
      allowed: 0, denied: 0, errors: 0, warnings: 0, coverageNotes: 0, external: 0 },
    diagnostics: [], warnings: [], coverage: [], delta: { added: [], removed: [], positionOnly: [] },
    timings: { classify: 0, inventory: 0, compiler: 0, descriptions: 0, accesses: 0, link: 0, decide: 0, publish: 0, total: 0 } };
}

describe('daemon session audit accounting', () => {
  it('increments and logs an audit mismatch once while an equal audit leaves the mismatch counter unchanged', async () => {
    const clock = createControlledClock(); const watcher = createControlledWatcher(); const logs: LogEntry[] = [];
    let current = revision(1); let verifyCalls = 0; let sessionDisposed = false; let driverDisposed = false;
    const session: RetainedSession = {
      get current() { return current; },
      async update() { current = revision(current.sequence + 1); return { status: 'revised', revision: current, identical: false, reacquired: false }; },
      async sweep() { return { status: 'unchanged' }; },
      async verify() {
        verifyCalls++;
        if (verifyCalls > 1) return { status: 'equal', sequence: current.sequence, elapsedMs: 1 };
        const sequence = current.sequence; current = revision(sequence + 1);
        return { status: 'mismatch', sequence, fields: ['diagnostics', 'summary'], revision: current };
      },
      async report() { return null; }, async releaseRevision() {},
      status() { return { level: 'hot', sequence: current.sequence, observedInputs: 0, factBytes: 100,
        worker: { heapUsed: 100, rss: 100 }, compiler: { pid: null, rss: null }, lastSweepAt: null }; },
      async releaseCompiler() {}, async dispose() { sessionDisposed = true; },
    };
    const driver: AnalysisDriver = {
      async resolve(request) { return { status: 'resolved', root: '/fixture', selection: 'given', invokedFrom: request.cwd, configuration: 'tsconfig.json' }; },
      async open() { return { status: 'opened', session, revision: current }; },
      async dispose() { driverDisposed = true; },
    };
    const service = createDaemonService({ driver, watcher, clock, budgets,
      instance: { instanceId: 'audit-counter-test', pid: process.pid, version: '0.0.0', engine: 'test-engine', buildKey: '0000000000000000' },
      log: entry => logs.push(entry) });
    try {
      const opened = await service.openContext({ project: { cwd: '/fixture', root: '/fixture', scope: 'whole-project', configuration: 'discover' },
        setup: { registry: 'default', capabilities: [] } });
      expect(opened).toMatchObject({ ok: true, value: { status: 'opened' } }); await flush();
      const before = await service.daemonStatus();
      expect(before.ok && before.value.counters).toMatchObject({ audits: 0, auditMismatches: 0 });
      clock.advance(100); await flush(); clock.advance(1); await flush();
      const repaired = await service.daemonStatus();
      expect(repaired.ok && repaired.value.counters).toMatchObject({ audits: 1, auditMismatches: 1 });
      expect(repaired.ok && repaired.value.contexts[0]?.published).toMatchObject({ cause: 'verify', sequence: 2 });
      expect(logs.filter(entry => entry.event === 'audit-mismatch')).toEqual([{ at: expect.any(Number), level: 'error',
        event: 'audit-mismatch', message: 'Retained analysis audit mismatch: diagnostics, summary' }]);
      watcher.emit('/fixture', [{ path: 'src/index.ts', kind: 'changed' }]);
      clock.advance(10); await flush(); clock.advance(100); await flush(); clock.advance(1); await flush();
      const equal = await service.daemonStatus();
      expect(equal.ok && equal.value.counters).toMatchObject({ audits: 2, auditMismatches: 1 });
      expect(logs.filter(entry => entry.event === 'audit-mismatch')).toHaveLength(1);
    } finally {
      try { await service.dispose(); expect(sessionDisposed).toBe(true); expect(driverDisposed).toBe(true);
        expect(clock.pending).toBe(0); expect(watcher.active).toBe(0); }
      finally { await watcher.dispose(); clock.dispose(); }
    }
  });
});

describe('daemon racing-hook attribution', () => {
  it('counts a hook covered on publication as a covered request with only the watcher update analysed', async () => {
    const clock = createControlledClock(); const watcher = createControlledWatcher();
    const observed = (content: string): SessionRevision => ({ ...revision(1), inputs: [{ path: 'src/index.ts', role: 'source', sha256: content, bytes: 1 }] });
    let current = observed('a'.repeat(64)); let finish: (() => void) | undefined;
    const session: RetainedSession = {
      get current() { return current; },
      async update() {
        await new Promise<void>(resolve => { finish = resolve; });
        current = { ...observed('b'.repeat(64)), sequence: current.sequence + 1, checked: { ...current.checked, path: 'source' } };
        return { status: 'revised', revision: current, identical: false, reacquired: false };
      },
      async sweep() { return { status: 'unchanged' }; }, async verify() { return { status: 'equal', sequence: current.sequence, elapsedMs: 1 }; },
      async report() { return null; }, async releaseRevision() {},
      status() { return { level: 'hot', sequence: current.sequence, observedInputs: 1, factBytes: 100,
        worker: { heapUsed: 100, rss: 100 }, compiler: { pid: null, rss: null }, lastSweepAt: null }; },
      async releaseCompiler() {}, async dispose() {},
    };
    const driver: AnalysisDriver = {
      async resolve(request) { return { status: 'resolved', root: '/fixture', selection: 'given', invokedFrom: request.cwd, configuration: 'tsconfig.json' }; },
      async open() { return { status: 'opened', session, revision: current }; },
      async dispose() {},
    };
    const service = createDaemonService({ driver, watcher, clock, budgets: { ...budgets, sweepIntervalMs: 60_000, warmIdleMs: 60_000, coldRetainMs: 120_000 },
      instance: { instanceId: 'racing-attribution-test', pid: process.pid, version: '0.0.0', engine: 'test-engine', buildKey: '0000000000000000' },
      log: () => {} });
    try {
      const opened = await service.openContext({ project: { cwd: '/fixture', root: '/fixture', scope: 'whole-project', configuration: 'discover' },
        setup: { registry: 'default', capabilities: [] } });
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected an opened context');
      await flush();
      const before = await service.daemonStatus();
      watcher.emit('/fixture', [{ path: 'src/index.ts', kind: 'changed' }]); clock.advance(10); await flush();
      expect(finish).toBeDefined();
      const hook = service.check({ token: opened.value.token, requestId: 'racing', scope: 'delta',
        freshness: { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: 'b'.repeat(64) }] } });
      await flush(); finish!();
      expect(await hook).toMatchObject({ ok: true, value: { status: 'reported', revision: { sequence: 2, cause: 'watch' },
        freshness: { captureStarted: null, verified: true, reusedRevision: true } } });
      await flush();
      const after = await service.daemonStatus();
      if (!before.ok || !after.ok) throw new Error('Expected daemon counters');
      expect(after.value.counters.analyses - before.value.counters.analyses).toBe(1);
      expect(after.value.counters.revisions - before.value.counters.revisions).toBe(1);
      expect(after.value.counters.coveredRequests - before.value.counters.coveredRequests).toBe(1);
    } finally { finish?.(); await service.dispose(); await watcher.dispose(); clock.dispose(); }
  });
});

describe('daemon sweep accounting after reacquisition', () => {
  it('sweep-skipped-after-reacquire, sweep-kept: a reacquiring configuration hook counts one analysis and no sweep, an update that keeps the capture one of each', async () => {
    const clock = createControlledClock(); const watcher = createControlledWatcher();
    const content = 'c'.repeat(64);
    const observed = (sequence: number): SessionRevision => ({ ...revision(sequence), inputs: [
      { path: 'subs/tool/package.json', role: 'dependency', sha256: content, bytes: 1 }, { path: 'tsconfig.json', role: 'configuration', sha256: content, bytes: 1 }] });
    let current = observed(1);
    const session: RetainedSession = {
      get current() { return current; },
      async update(changes) {
        current = observed(current.sequence + 1);
        // Only the recorded root configuration makes the observer acquire the project again.
        return { status: 'revised', revision: current, identical: false, reacquired: changes.some(change => change.path === 'tsconfig.json') };
      },
      async sweep() { return { status: 'unchanged' }; }, async verify() { return { status: 'equal', sequence: current.sequence, elapsedMs: 1 }; },
      async report() { return null; }, async releaseRevision() {},
      status() { return { level: 'hot', sequence: current.sequence, observedInputs: 0, factBytes: 100,
        worker: { heapUsed: 100, rss: 100 }, compiler: { pid: null, rss: null }, lastSweepAt: null }; },
      async releaseCompiler() {}, async dispose() {},
    };
    const driver: AnalysisDriver = {
      async resolve(request) { return { status: 'resolved', root: '/fixture', selection: 'given', invokedFrom: request.cwd, configuration: 'tsconfig.json' }; },
      async open() { return { status: 'opened', session, revision: current }; },
      async dispose() {},
    };
    const service = createDaemonService({ driver, watcher, clock, budgets: { ...budgets, sweepIntervalMs: 60_000, warmIdleMs: 60_000, coldRetainMs: 120_000 },
      instance: { instanceId: 'reacquisition-sweep-test', pid: process.pid, version: '0.0.0', engine: 'test-engine', buildKey: '0000000000000000' },
      log: () => {} });
    const counted = async (): Promise<{ analyses: number; sweeps: number }> => {
      const status = await service.daemonStatus();
      if (!status.ok) throw new Error('Expected daemon counters');
      return { analyses: status.value.counters.analyses, sweeps: status.value.counters.sweeps };
    };
    const delta = (after: { analyses: number; sweeps: number }, before: { analyses: number; sweeps: number }) =>
      ({ analyses: after.analyses - before.analyses, sweeps: after.sweeps - before.sweeps });
    try {
      const opened = await service.openContext({ project: { cwd: '/fixture', root: '/fixture', scope: 'whole-project', configuration: 'discover' },
        setup: { registry: 'default', capabilities: [] } });
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected an opened context');
      await flush();
      const token = opened.value.token;
      const hook = (path: string) => service.check({ token, requestId: `hook-${path}`, scope: 'delta',
        freshness: { mode: 'synchronized', expect: [{ path, sha256: content }] } });
      // A hook that names a configuration path is answered at once; its capture runs behind the reply.
      let before = await counted();
      watcher.emit('/fixture', [{ path: 'tsconfig.json', kind: 'changed' }]);
      expect(await hook('tsconfig.json')).toMatchObject({ ok: true, value: { status: 'unavailable', reason: 'configuration-changed' } });
      expect(delta(await counted(), before)).toEqual({ analyses: 0, sweeps: 0 });
      clock.advance(budgets.debounceMs); await flush();
      expect(delta(await counted(), before)).toEqual({ analyses: 1, sweeps: 0 });
      before = await counted();
      watcher.emit('/fixture', [{ path: 'subs/tool/package.json', kind: 'changed' }]);
      expect(await hook('subs/tool/package.json')).toMatchObject({ ok: true, value: { status: 'unavailable', reason: 'configuration-changed' } });
      clock.advance(budgets.debounceMs); await flush();
      expect(delta(await counted(), before)).toEqual({ analyses: 2, sweeps: 1 });
    } finally { await service.dispose(); await watcher.dispose(); clock.dispose(); }
  });
});
