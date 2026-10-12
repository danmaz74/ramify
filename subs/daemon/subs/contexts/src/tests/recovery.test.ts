import { describe, expect, it } from 'vitest';
import { createContextManager } from '../context-manager.js';
import { RecoveryHistory } from '../recovery.js';
import { createGenerationId } from '../tokens.js';
import { createControlledClock, createControlledWatcher } from './controlled-ports.js';
import { capture, createScriptedDriver, flush, testBudgets } from './scripted-driver.js';
import type { ContextBudgets, ContextRevision, ContextToken, RecoveryEvidence } from '../interfaces/contexts.js';

function fixture(limits: Partial<ContextBudgets> = {}) {
  const script = createScriptedDriver(), clock = createControlledClock(), watcher = createControlledWatcher();
  const manager = createContextManager({ driver: script.driver, clock, watcher,
    budgets: { ...testBudgets, ...limits }, engine: 'recovery-test', generationId: createGenerationId });
  let request = 0;
  const open = async () => {
    const result = await manager.open({ cwd: '/fixture', root: '/fixture', scope: 'whole-project', configuration: 'discover' },
      { registry: 'default', capabilities: [] }, 'lease');
    if (result.status !== 'opened') throw new Error(result.status);
    return result.token;
  };
  const check = (token: ContextToken) => manager.check({ token, requestId: String(++request), scope: 'report',
    freshness: { mode: 'synchronized', expect: [] } }, 'lease');
  const recovery = (token: ContextToken): RecoveryEvidence => {
    const result = manager.recovery(token);
    if ('status' in result) throw new Error(result.status);
    return result;
  };
  const retained = (token: ContextToken): number => {
    const status = manager.status(token);
    if ('reason' in status) throw new Error(status.reason);
    return status.retainedBytes + status.history.bytes;
  };
  const events = (items: readonly { path: string; kind: 'changed' | 'created' | 'deleted' | 'renamed' | 'overflow' | 'error' }[]) =>
    watcher.emit('/fixture', items);
  const settle = async () => { clock.advance(100); await flush(); };
  return { script, clock, watcher, manager, open, check, recovery, retained, events, settle,
    dispose: () => manager.dispose() };
}

describe('context recovery history', () => {
  it('FR15: a failed outcome keeps the recovery captured at completion across a later publication', async () => {
    const f = fixture();
    try {
      const token = await f.open(); await f.check(token);
      const baseline = f.recovery(token).lastCompleted;
      f.script.pending.push(() => capture(2, 'invalid'));
      f.events([{ path: 'src/failed.ts', kind: 'changed' }]);
      await f.settle();
      const failed = await f.check(token);
      expect(failed).toMatchObject({ status: 'reported',
        recovery: { lastCompleted: baseline, changes: { paths: ['src/failed.ts'] } } });
      if (failed.status !== 'reported' || !failed.recovery) throw new Error('Missing failed capture');
      const captured = failed.recovery;
      f.script.pending.push(() => capture(3));
      await f.check(token);
      expect(f.recovery(token).lastCompleted?.revision).not.toBe(baseline?.revision);
      expect(f.recovery(token).changes.paths).toEqual([]);
      expect(failed.recovery).toBe(captured);
      expect(failed.recovery).toMatchObject({ lastCompleted: baseline, changes: { paths: ['src/failed.ts'] } });
      expect(Object.isFrozen(failed.recovery.changes.paths)).toBe(true);
    } finally { await f.dispose(); }
  });

  it('FR15: an immediate pending answer captures its live context before later work', async () => {
    const f = fixture(); let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
    try {
      f.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
      const token = await f.open();
      const pending = await f.manager.check({ token, requestId: 'immediate', scope: 'report',
        freshness: { mode: 'published', wait: false } }, 'lease');
      expect(pending).toMatchObject({ status: 'pending', recovery: { lastCompleted: null,
        changes: { coverage: 'unavailable', reason: 'no-completed-baseline' } } });
      finish?.(capture(1)); await flush();
      expect(f.recovery(token).lastCompleted).not.toBeNull();
      if (pending.status !== 'pending') throw new Error('Expected pending');
      expect(pending.recovery?.lastCompleted).toBeNull();
    } finally { finish?.(capture(1)); await flush(); await f.dispose(); }
  });
  it('FR12/FR13: retains A across invalid B/C and an unsuccessful update, then completes failing D', async () => {
    const f = fixture();
    try {
      const token = await f.open(); await f.check(token);
      const a = f.recovery(token).lastCompleted;
      f.script.pending.push(() => capture(2, 'invalid'));
      f.events([{ path: 'src/b.ts', kind: 'deleted' }]); await f.settle();
      expect(f.recovery(token)).toMatchObject({ lastCompleted: a, changes: { paths: ['src/b.ts'], coverage: 'observed' } });
      f.script.pending.push(() => capture(3, 'invalid'));
      f.events([{ path: 'src/c.ts', kind: 'created' }]); await f.settle();
      expect(f.recovery(token).changes.paths).toEqual(['src/b.ts', 'src/c.ts']);
      f.script.pending.push(() => ({ status: 'reported', report: capture(4, 'incomplete').report }));
      f.events([{ path: 'src/failed.ts', kind: 'changed' }]); await f.settle();
      expect(f.recovery(token).changes.paths).toEqual(['src/b.ts', 'src/c.ts', 'src/failed.ts']);
      const d = capture(4);
      const denied = { ...d.report, outcome: { ...d.report.outcome, check: 'failed' as const } };
      f.script.pending.push(() => ({ ...d, report: denied }));
      await f.check(token);
      expect(f.recovery(token).lastCompleted?.revision).not.toBe(a?.revision);
      expect(f.recovery(token).changes.paths).toEqual([]);
      expect(f.manager.status(token)).toMatchObject({ lastValid: { outcome: { execution: 'completed', check: 'failed' } } });
    } finally { await f.dispose(); }
  });

  it('FR14/FR15: deduplicates byte-ordered observations and preserves a path seen after capture', async () => {
    const f = fixture(); let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
    try {
      const token = await f.open(); await f.check(token);
      f.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
      f.events([{ path: 'z.ts', kind: 'created' }, { path: 'a.ts', kind: 'renamed' },
        { path: 'b.ts', kind: 'renamed' }, { path: 'é.ts', kind: 'changed' }, { path: 'z.ts', kind: 'deleted' }]);
      const before = f.recovery(token);
      expect(before.changes.paths).toEqual(['a.ts', 'b.ts', 'z.ts', 'é.ts']);
      expect(Object.isFrozen(before.changes.paths)).toBe(true);
      const pending = f.check(token); await flush();
      f.events([{ path: 'z.ts', kind: 'changed' }, { path: 'later.ts', kind: 'changed' }]);
      finish!(capture(2)); await pending; await flush();
      expect(f.recovery(token).changes.paths).toEqual(['later.ts', 'z.ts']);
      expect(before.changes.paths).toEqual(['a.ts', 'b.ts', 'z.ts', 'é.ts']);
    } finally { finish?.(capture(2)); await flush(); await f.dispose(); }
  });

  it('FR13: a completed failed check is the baseline even after its history entry is evicted', async () => {
    const f = fixture({ maxHistoryRevisions: 1 });
    try {
      const initial = capture(1);
      f.script.pending.push(() => ({ ...initial,
        report: { ...initial.report, outcome: { ...initial.report.outcome, check: 'failed' as const } } }));
      const token = await f.open(); await f.check(token);
      const a = f.recovery(token).lastCompleted;
      expect(a).not.toBeNull();
      f.script.pending.push(() => capture(2, 'invalid'));
      f.events([{ path: 'src/changed.ts', kind: 'changed' }]); await f.settle();
      expect(f.manager.status(token)).toMatchObject({ history: { retained: 1 } });
      expect(f.recovery(token)).toMatchObject({ lastCompleted: a,
        changes: { paths: ['src/changed.ts'] } });
      const repaired = capture(3);
      f.script.pending.push(() => ({ ...repaired,
        report: { ...repaired.report, outcome: { ...repaired.report.outcome, check: 'failed' as const } } }));
      await f.check(token);
      expect(f.recovery(token).lastCompleted?.revision).not.toBe(a?.revision);
      expect(f.manager.status(token)).toMatchObject({ lastValid: { outcome: { check: 'failed' } } });
    } finally { await f.dispose(); }
  });

  it('FR12/FR14: request observations persist through invalid analysis and are deduplicated with watcher events', async () => {
    const f = fixture();
    try {
      const token = await f.open(); await f.check(token);
      const a = f.recovery(token).lastCompleted;
      f.script.pending.push(() => capture(2, 'invalid'));
      const request = f.manager.check({ token, requestId: 'changed-path', scope: 'report',
        freshness: { mode: 'synchronized', expect: [{ path: 'src/request.ts', sha256: null }] } }, 'lease');
      await request;
      f.events([{ path: 'src/request.ts', kind: 'changed' }]);
      expect(f.recovery(token)).toMatchObject({ lastCompleted: a, changes: { paths: ['src/request.ts'] } });
    } finally { await f.dispose(); }
  });

  it('FR16: initial invalid analysis has no baseline and eviction cannot reuse an old identity', async () => {
    const f = fixture({ maxContexts: 1 });
    try {
      f.script.pending.push(() => capture(1, 'invalid'));
      const token = await f.open(); await f.check(token);
      expect(f.recovery(token)).toMatchObject({ lastCompleted: null,
        changes: { coverage: 'unavailable', reason: 'no-completed-baseline' } });
      const other = await f.manager.open({ cwd: '/other', root: '/other', scope: 'whole-project', configuration: 'discover' },
        { registry: 'default', capabilities: [] }, 'other');
      expect(other.status).toBe('opened');
      expect(f.manager.recovery(token)).toMatchObject({ status: 'unavailable', reason: 'unknown-context' });
      const reopened = await f.open();
      expect(reopened.generation).not.toBe(token.generation);
      expect(f.recovery(reopened)).toMatchObject({ lastCompleted: null,
        changes: { coverage: 'unavailable', reason: 'no-completed-baseline; context-evicted' } });
    } finally { await f.dispose(); }
  });

  it('FR17: path overflow and watcher loss keep bounded observations and a gap through an unsuccessful sweep', async () => {
    const f = fixture({ maxQueuedPaths: 2 });
    try {
      const token = await f.open(); await f.check(token);
      f.events([{ path: 'a.ts', kind: 'changed' }, { path: 'b.ts', kind: 'changed' },
        { path: 'c.ts', kind: 'changed' }, { path: '', kind: 'overflow' }]);
      const snapshot = f.recovery(token);
      expect(snapshot.changes.paths).toEqual(['a.ts', 'b.ts']);
      expect(snapshot.changes.reason).toBe('watcher-loss; path-overflow');
      f.script.pending.push(() => ({ status: 'reported', report: capture(2, 'incomplete').report }));
      await f.settle();
      expect(f.recovery(token).changes.reason).toBe('watcher-loss; path-overflow');
    } finally { await f.dispose(); }
  });

  it('FR17: baseline and mandatory gap markers respect exact injected byte limits', async () => {
    const measured = fixture();
    let completedBytes: number;
    let markerBytes: number;
    try {
      const token = await measured.open(); await measured.check(token);
      completedBytes = measured.retained(token);
      measured.events([{ path: '', kind: 'overflow' }]);
      markerBytes = measured.retained(token) - completedBytes;
      expect(markerBytes).toBeGreaterThan(0);
    } finally { await measured.dispose(); }

    const baselineTight = fixture({ maxRetainedBytesPerContext: completedBytes! - 1 });
    try {
      const token = await baselineTight.open();
      expect(await baselineTight.check(token)).toMatchObject({ status: 'unavailable', reason: 'resource-unavailable' });
      expect(baselineTight.recovery(token).lastCompleted).toBeNull();
      expect(baselineTight.retained(token)).toBeLessThanOrEqual(completedBytes! - 1);
    } finally { await baselineTight.dispose(); }

    const markerFits = fixture({ maxRetainedBytesPerContext: completedBytes! + markerBytes! });
    try {
      const token = await markerFits.open(); await markerFits.check(token);
      markerFits.events([{ path: '', kind: 'overflow' }]);
      expect(markerFits.recovery(token).changes.reason).toBe('watcher-loss');
      expect(markerFits.retained(token)).toBeLessThanOrEqual(completedBytes! + markerBytes!);
    } finally { await markerFits.dispose(); }

    const pathTight = fixture({ maxRetainedBytesPerContext: completedBytes! + 100 });
    try {
      const token = await pathTight.open(); await pathTight.check(token);
      pathTight.events([{ path: `${'x'.repeat(1024)}.ts`, kind: 'changed' }]);
      expect(pathTight.recovery(token).changes).toMatchObject({ paths: [], reason: 'byte-pressure' });
      expect(pathTight.retained(token)).toBeLessThanOrEqual(completedBytes! + 100);
    } finally { await pathTight.dispose(); }

    const markerTight = fixture({ maxRetainedBytesPerContext: completedBytes! + markerBytes! - 1 });
    try {
      const token = await markerTight.open(); await markerTight.check(token);
      markerTight.events([{ path: '', kind: 'overflow' }]);
      expect(markerTight.manager.recovery(token)).toMatchObject({ status: 'unavailable', reason: 'unknown-context' });
      expect(markerTight.manager.list()).toEqual([]);
    } finally { await markerTight.dispose(); }
  });

  it('FR17: disposal releases every recovery byte', () => {
    const history = new RecoveryHistory(2, () => true);
    history.observe('a.ts'); history.watcherLost();
    expect(history.bytes).toBeGreaterThan(0);
    history.dispose();
    expect(history.bytes).toBe(0);
  });

  it('FR17: exact compact byte accounting stays linear through 10,000 paths and repeated overflow', () => {
    let ceiling = Number.POSITIVE_INFINITY;
    const history = new RecoveryHistory(10_000, () => history.bytes <= ceiling);
    const state = history as unknown as { readonly baseline: RecoveryEvidence['lastCompleted'];
      readonly sequence: number; readonly paths: Map<string, number>; readonly gaps: Map<string, number> };
    const exact = () => Buffer.byteLength(JSON.stringify({ baseline: state.baseline, sequence: state.sequence,
      paths: [...state.paths], gaps: [...state.gaps] }), 'utf8');
    expect(history.bytes).toBe(exact());
    for (let index = 0; index < 10_000; index++) {
      expect(history.observe(`src/${index}.ts`)).toBe(true);
      if (index % 1000 === 0) expect(history.bytes).toBe(exact());
    }
    for (let index = 0; index < 1000; index++) expect(history.observe(`extra/${index}.ts`)).toBe(true);
    expect(history.pathCount).toBe(10_000);
    expect(history.snapshot().changes.reason).toBe('no-completed-baseline; path-overflow');
    expect(history.bytes).toBe(exact());
    history.observe('src/0.ts');
    expect(history.bytes).toBe(exact());

    const cutoff = history.capturedSequence;
    history.observe('src/0.ts');
    history.observe('later.ts'); // bounded: this produces another overflow gap
    const revision = { token: { context: 'ctx', generation: 'gen' }, revision: 'rev',
      fingerprints: { inputId: 'input' } } as ContextRevision;
    const projected = Buffer.byteLength(JSON.stringify({ baseline: { context: 'ctx', generation: 'gen', revision: 'rev', inputId: 'input' },
      sequence: state.sequence, paths: [...state.paths].filter(([, sequence]) => sequence > cutoff),
      gaps: [...state.gaps].filter(([, sequence]) => sequence > cutoff) }), 'utf8');
    expect(history.completedBytes(revision, cutoff)).toBe(projected);
    history.complete(revision, cutoff);
    expect(history.bytes).toBe(exact());
    expect(history.snapshot().changes.paths).toEqual(['src/0.ts']);

    ceiling = history.bytes + 20;
    history.observe('x'.repeat(1024));
    expect(history.snapshot().changes.reason).toContain('byte-pressure');
    expect(history.bytes).toBe(exact());
    ceiling = history.bytes - 1;
    expect(history.watcherLost()).toBe(false);
    expect(history.bytes).toBe(exact());
    history.dispose();
    expect(history.bytes).toBe(0);

    let dropCeiling = Number.POSITIVE_INFINITY;
    const dropping = new RecoveryHistory(100, () => dropping.bytes <= dropCeiling);
    for (let index = 0; index < 20; index++) dropping.observe(`drop/${index}.ts`);
    dropCeiling = dropping.bytes - 30;
    expect(dropping.watcherLost()).toBe(true);
    const dropState = dropping as unknown as typeof state;
    expect(dropping.pathCount).toBeLessThan(20);
    expect(dropping.bytes).toBe(Buffer.byteLength(JSON.stringify({ baseline: dropState.baseline,
      sequence: dropState.sequence, paths: [...dropState.paths], gaps: [...dropState.gaps] }), 'utf8'));
  });

  it('FR17: two contexts include recovery in the global admission total', async () => {
    const probe = fixture(); let combined = 0;
    try {
      const first = await probe.open(); await probe.check(first);
      const second = await probe.manager.open({ cwd: '/other', root: '/other', scope: 'whole-project', configuration: 'discover' },
        { registry: 'default', capabilities: [] }, 'other');
      if (second.status !== 'opened') throw new Error(second.status);
      await probe.check(second.token);
      combined = probe.retained(first) + probe.retained(second.token);
    } finally { await probe.dispose(); }

    const limited = fixture({ maxRetainedBytesGlobal: combined - 1 });
    try {
      const first = await limited.open(); await limited.check(first);
      const second = await limited.manager.open({ cwd: '/other', root: '/other', scope: 'whole-project', configuration: 'discover' },
        { registry: 'default', capabilities: [] }, 'other');
      if (second.status !== 'opened') throw new Error(second.status);
      expect(await limited.check(second.token)).toMatchObject({ status: 'unavailable', reason: 'resource-unavailable' });
      expect(limited.recovery(second.token).lastCompleted).toBeNull();
      expect(limited.retained(first) + limited.retained(second.token)).toBeLessThanOrEqual(combined - 1);
    } finally { await limited.dispose(); }
  });
});
