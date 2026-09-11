import { describe, it, expect } from 'vitest';
import { createContextManager } from '../context-manager.js';
import { createGenerationId } from '../tokens.js';
import { createControlledClock, createControlledWatcher } from './controlled-ports.js';
import { createScriptedDriver, testBudgets, capture, flush, hash } from './scripted-driver.js';
import type { ContextBudgets, ContextToken, ContextStatus } from '../interfaces/contexts.js';

function environment(budgets: Partial<ContextBudgets> = {}) {
  const script = createScriptedDriver(); const clock = createControlledClock(); const watcher = createControlledWatcher();
  const manager = createContextManager({ driver: script.driver, clock, watcher, budgets: { ...testBudgets, ...budgets }, engine: 'test-engine', generationId: createGenerationId });
  let sequence = 0;
  async function open(root = '/fixture', lease = 'lease', cwd = root) {
    const result = await manager.open({ cwd, root, scope: 'whole-project', configuration: 'discover' }, { registry: 'default', capabilities: [] }, lease);
    expect(result.status).toBe('opened');
    if (result.status !== 'opened') throw new Error(result.status);
    return result;
  }
  const check = (token: ContextToken, lease = 'lease') => manager.check({ token, requestId: `r${++sequence}`, freshness: { mode: 'synchronized', expect: [] } }, lease);
  const status = (token: ContextToken) => manager.status(token) as ContextStatus;
  async function dispose() { await manager.dispose(); expect(manager.list()).toEqual([]); expect(clock.pending).toBe(0); expect(watcher.active).toBe(0); expect(script.disposed).toBe(true); }
  return { manager, script, clock, watcher, open, check, status, dispose };
}

describe('context queue and publication', () => {
  it('starts opening, publishes atomically, reuses exact reports and advances revision sequence', async () => {
    const e = environment();
    try {
      const opened = await e.open(); expect(opened.current.state).toBe('opening'); expect(opened.current.published).toBeNull();
      const result = await e.check(opened.token); expect(result.status).toBe('reported');
      expect(e.status(opened.token).published?.sequence).toBe(1);
      const again = await e.check(opened.token); expect(again.status === 'reported' && again.freshness.reusedRevision).toBe(true);
      for (let version = 2; version <= 5; version++) { e.script.version = version; await e.check(opened.token); }
      expect(e.status(opened.token).published?.sequence).toBe(5);
    } finally { await e.dispose(); }
  });
  it('isolates roots, shares canonical selections and preserves each lease invocation', async () => {
    const e = environment();
    try {
      const first = await e.open('/one', 'a', '/one/src'); const same = await e.open('/one', 'b', '/other'); const other = await e.open('/two', 'c');
      expect(first.token).toEqual(same.token); expect(same.created).toBe(false); expect(first.token.context).not.toBe(other.token.context);
      const start = e.script.calls.length;
      await Promise.all([e.check(first.token, 'a'), e.check(same.token, 'b')]);
      expect(e.script.calls.slice(start).filter(call => call.inputs.project.root === '/one').map(call => call.inputs.project.cwd)).toEqual(['/one/src', '/other']);
    } finally { await e.dispose(); }
  });
  it('answers acknowledged requests in order from captures started after acknowledgement', async () => {
    const e = environment();
    try {
      const opened = await e.open(); await flush();
      const finished: string[] = [];
      const requests = [1, 2, 3].map(index => e.manager.check({ token: opened.token, requestId: String(index), freshness: { mode: 'synchronized', expect: [] } }, 'lease').then(result => { finished.push(result.requestId); return result; }));
      const results = await Promise.all(requests);
      expect(finished).toEqual(['1', '2', '3']);
      for (const result of results) { expect(result.status).toBe('reported'); if (result.status === 'reported') expect(result.freshness.captureStarted).toBeGreaterThanOrEqual(result.freshness.acknowledged); }
      expect(e.script.calls.length).toBe(2);
    } finally { await e.dispose(); }
  });
  it('cancels requests, aborts their driver and never publishes cancelled work', async () => {
    const e = environment();
    try {
      const opened = await e.open(); await flush();
      e.script.pending.push(call => new Promise(resolve => call.signal!.addEventListener('abort', () => resolve({ status: 'cancelled' }))));
      const controller = new AbortController();
      const result = e.manager.check({ token: opened.token, requestId: 'cancel-me', freshness: { mode: 'synchronized', expect: [] } }, 'lease', { signal: controller.signal });
      await flush(); controller.abort();
      expect(await result).toEqual({ status: 'cancelled', requestId: 'cancel-me' }); await flush();
      expect(e.script.calls.at(-1)?.signal?.aborted).toBe(true); expect(e.status(opened.token).published?.sequence).toBe(1);
    } finally { await e.dispose(); }
  });
  it('waits for first publication but a non-waiting read is pending', async () => {
    const e = environment(); let finish!: (value: ReturnType<typeof capture>) => void;
    e.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
    try {
      const opened = await e.open(); await flush();
      const now = await e.manager.check({ token: opened.token, requestId: 'now', freshness: { mode: 'published', wait: false } }, 'lease'); expect(now.status).toBe('pending');
      const later = e.manager.check({ token: opened.token, requestId: 'later', freshness: { mode: 'published', wait: true } }, 'lease');
      finish(capture()); expect((await later).status).toBe('reported');
    } finally { await e.dispose(); }
  });
  it('publishes invalid current inputs while retaining only historical lastValid', async () => {
    const e = environment();
    try {
      const opened = await e.open(); await e.check(opened.token);
      const valid = e.status(opened.token).lastValid;
      e.script.pending.push(() => capture(2, 'invalid')); const bad = await e.check(opened.token);
      expect(bad.status === 'reported' && bad.report.outcome.execution).toBe('invalid'); expect(e.status(opened.token).lastValid).toEqual(valid);
      e.script.version = 3; await e.check(opened.token); expect(e.status(opened.token).lastValid).toEqual(e.status(opened.token).published);
    } finally { await e.dispose(); }
  });
  it('delivers incomplete reports unpublished before inspecting expectations', async () => {
    const e = environment();
    try {
      const opened = await e.open(); await flush();
      e.script.pending.push(() => capture(2, 'incomplete'));
      const result = await e.manager.check({ token: opened.token, requestId: 'incomplete', freshness: { mode: 'synchronized', expect: [{ path: 'missing', sha256: null }] } }, 'lease');
      expect(result.status === 'reported' && [result.published, result.revision, result.freshness.verified]).toEqual([false, null, false]);
      expect(e.status(opened.token).synchronization).toBe('reconciling'); expect(e.status(opened.token).published?.sequence).toBe(1);
    } finally { await e.dispose(); }
  });
  it('distinguishes mismatched, absent, unobserved and directory-only expectations', async () => {
    const e = environment();
    try {
      const opened = await e.open(); await flush();
      const request = (path: string, sha256: string | null) => e.manager.check({ token: opened.token, requestId: path, freshness: { mode: 'synchronized', expect: [{ path, sha256 }] } }, 'lease');
      expect((await request('src/index.ts', hash('old'))).status).toBe('superseded');
      expect(await request('missing', null)).toMatchObject({ status: 'unavailable', reason: 'unobserved-input' });
      e.script.pending.push(() => capture(2, 'completed', [{ path: 'absent.ts', role: 'absent', sha256: hash('absent'), bytes: 0 }, { path: 'src', role: 'directory', sha256: hash('directory'), bytes: 0 }]));
      expect((await request('absent.ts', null)).status).toBe('reported');
      e.script.pending.push(() => capture(2, 'completed', [{ path: 'src', role: 'directory', sha256: hash('directory'), bytes: 0 }]));
      expect(await request('src', null)).toMatchObject({ reason: 'unobserved-input' });
    } finally { await e.dispose(); }
  });
});

describe('watcher reconciliation and retention', () => {
  it('debounces 0/50/90ms events to 190ms and coalesces every distinct path', async () => {
    const e = environment();
    try {
      const opened = await e.open(); await flush(); const before = e.script.calls.length;
      const event = (path: string) => e.watcher.emit('/fixture', [{ path, kind: 'changed' }]);
      event('a'); e.clock.advance(50); event('b'); e.clock.advance(40); event('a');
      e.clock.advance(99); await flush(); expect(e.script.calls.length).toBe(before);
      e.script.version = 2; e.clock.advance(1); await flush();
      expect(e.script.calls.length).toBe(before + 1); expect(e.script.calls.at(-1)?.inputs.changes).toEqual([{ path: 'a', kind: 'changed' }, { path: 'b', kind: 'changed' }]);
      expect(e.status(opened.token).published?.cause).toBe('watch');
    } finally { await e.dispose(); }
  });
  it('cancels superseded background work and preserves the union of changes', async () => {
    const e = environment();
    try {
      const opened = await e.open(); await flush();
      e.script.pending.push(call => new Promise(resolve => call.signal!.addEventListener('abort', () => resolve(capture(2)))));
      e.watcher.emit('/fixture', [{ path: 'a', kind: 'changed' }]); e.clock.advance(100); await flush();
      e.watcher.emit('/fixture', [{ path: 'b', kind: 'changed' }]); await flush();
      expect(e.status(opened.token).published?.sequence).toBe(1);
      e.script.version = 3; e.clock.advance(100); await flush();
      expect(e.script.calls.at(-1)?.inputs.changes?.map(item => item.path).sort()).toEqual(['a', 'b']);
      expect(e.status(opened.token).published?.summary.owners).toBe(3);
    } finally { await e.dispose(); }
  });
  it('overflow and lost watcher reconcile conservatively, then reattach', async () => {
    const e = environment({ maxQueuedPaths: 2 });
    try {
      const opened = await e.open(); await flush();
      e.watcher.emit('/fixture', ['a', 'b', 'c'].map(path => ({ path, kind: 'changed' })));
      expect(e.status(opened.token).synchronization).toBe('conservative');
      e.clock.advance(100); await flush(); expect(e.script.calls.at(-1)?.inputs.changes).toBeNull();
      e.watcher.emit('/fixture', [{ path: '', kind: 'error' }]); expect(e.status(opened.token).synchronization).toBe('watcher-unavailable');
      await e.check(opened.token); await flush(); expect(e.watcher.active).toBe(1); expect(e.status(opened.token).synchronization).toBe('synchronized');
    } finally { await e.dispose(); }
  });
  it('verifies excluded dependencies and schedules the next verification after revision reuse', async () => {
    const e = environment();
    try {
      const opened = await e.open(); await flush();
      e.script.pending.push(() => capture(2, 'completed', [{ path: 'node_modules/pkg/index.d.ts', role: 'dependency', sha256: hash('changed'), bytes: 7 }]));
      e.clock.advance(60_000); await flush();
      expect(e.script.calls.at(-1)?.inputs.changes).toEqual([]); expect(e.status(opened.token).published).toMatchObject({ cause: 'verify', changed: ['node_modules/pkg/index.d.ts'] });
      const before = e.script.calls.length; e.clock.advance(60_000); await flush(); expect(e.script.calls.length).toBe(before + 1);
    } finally { await e.dispose(); }
  });
  it('keeps eight of twelve reports and answers exact retained revisions', async () => {
    const e = environment();
    try {
      const opened = await e.open(); await flush(); const revisions: string[] = [];
      for (let version = 1; version <= 12; version++) { e.script.version = version; await e.check(opened.token); revisions.push(e.status(opened.token).published!.revision); }
      expect(e.status(opened.token).history.retained).toBe(8);
      const read = (revision: string) => e.manager.check({ token: opened.token, requestId: revision, freshness: { mode: 'published', revision, wait: true } }, 'lease');
      expect(await read(revisions[0]!)).toMatchObject({ reason: 'evicted-revision' });
      const retained = await read(revisions[5]!);
      expect(retained.status === 'reported' && [retained.revision?.revision, retained.report.summary.owners, retained.freshness.verified, retained.freshness.captureStarted]).toEqual([revisions[5], 6, false, null]);
    } finally { await e.dispose(); }
  });
  it('cools and releases products, rewarms conservatively, then evicts with a new generation', async () => {
    const e = environment({ warmIdleMs: 100, coldRetainMs: 200, verificationIntervalMs: 1000 });
    try {
      const opened = await e.open(); await flush(); e.clock.advance(100); await flush();
      expect(e.manager.list()[0]).toMatchObject({ state: 'cold', retainedBytes: 0, watcher: 'disposed' }); expect(e.watcher.active).toBe(0);
      await e.check(opened.token); await flush(); expect(e.script.calls.at(-1)?.inputs.changes).toBeNull(); expect(e.watcher.active).toBe(1);
      e.clock.advance(100); await flush(); e.clock.advance(200); await flush(); expect(e.manager.list()).toHaveLength(0);
      const reopened = await e.open(); expect(reopened.token.generation).not.toBe(opened.token.generation);
      expect(await e.check(opened.token)).toMatchObject({ reason: 'expired-generation' });
    } finally { await e.dispose(); }
  });
  it('evicts least active unleased contexts but refuses pressure when all are leased', async () => {
    const e = environment({ maxContexts: 2 });
    try {
      const first = await e.open('/first'); await flush(); e.clock.advance(1);
      const second = await e.open('/second'); await flush();
      const lease = e.manager.subscribe(first.token, 'subscriber', () => {}); expect('id' in lease).toBe(true);
      const third = await e.open('/third'); expect(e.manager.status(second.token)).toMatchObject({ reason: 'unknown-context' });
      e.manager.subscribe(third.token, 'other', () => {});
      expect(await e.manager.open({ cwd: '/fourth', root: '/fourth', scope: 'whole-project', configuration: 'discover' }, { registry: 'default', capabilities: [] }, 'lease')).toMatchObject({ reason: 'resource-unavailable' });
    } finally { await e.dispose(); }
  });
  it('rejects a publication that cannot fit without replacing the previous revision', async () => {
    const e = environment({ maxHistoryBytes: 10 });
    try {
      const opened = await e.open(); const result = await e.check(opened.token);
      expect(result).toMatchObject({ status: 'unavailable', reason: 'resource-unavailable' }); expect(e.status(opened.token).published).toBeNull();
    } finally { await e.dispose(); }
  });
  it('starts the warm idle interval only after the final long-lived lease ends', async () => {
    const e = environment({ warmIdleMs: 100, verificationIntervalMs: 1000 });
    try {
      const opened = await e.open(); await flush();
      const subscription = e.manager.subscribe(opened.token, 'watch', () => {});
      if (!('id' in subscription)) throw new Error('Expected subscription');
      e.clock.advance(500); await flush();
      expect(e.manager.list()[0]?.state).toBe('warm');
      subscription.close();
      e.clock.advance(99); await flush(); expect(e.manager.list()[0]?.state).toBe('warm');
      e.clock.advance(1); await flush(); expect(e.manager.list()[0]?.state).toBe('cold');
    } finally { await e.dispose(); }
  });
  it('applies the global budget to retained products even when the report is reused', async () => {
    const e = environment({ maxRetainedBytesGlobal: 5000 });
    try {
      const opened = await e.open(); await flush();
      const before = e.status(opened.token);
      const run = capture(1);
      e.script.pending.push(() => ({ ...run, retained: { ...run.retained!, bytes: 6000 } }));
      expect(await e.check(opened.token)).toMatchObject({ reason: 'resource-unavailable' });
      expect(e.status(opened.token).published).toEqual(before.published);
      expect(e.status(opened.token).retainedBytes).toBe(100);
    } finally { await e.dispose(); }
  });
  it('drops oversized retained products and makes the next capture conservative', async () => {
    const e = environment({ maxRetainedBytesPerContext: 50 });
    try {
      const opened = await e.open(); await flush();
      expect(e.status(opened.token).retainedBytes).toBe(0);
      e.script.version = 2; await e.check(opened.token);
      expect(e.script.calls.at(-1)?.inputs.previous).toBeNull();
      expect(e.script.calls.at(-1)?.inputs.changes).toBeNull();
      expect(e.status(opened.token).published?.changed).toBeNull();
      expect(e.status(opened.token).published?.cause).toBe('conservative');
    } finally { await e.dispose(); }
  });
  it('bounds the union after a background capture is superseded', async () => {
    const e = environment({ maxQueuedPaths: 2 });
    try {
      const opened = await e.open(); await flush();
      e.script.pending.push(call => new Promise(resolve => call.signal!.addEventListener('abort', () => resolve(capture(2)))));
      e.watcher.emit('/fixture', [{ path: 'a', kind: 'changed' }, { path: 'b', kind: 'changed' }]);
      e.clock.advance(100); await flush();
      e.watcher.emit('/fixture', [{ path: 'c', kind: 'changed' }]);
      expect(e.status(opened.token).pending.changedPaths).toBe(0);
      expect(e.status(opened.token).synchronization).toBe('conservative');
      await flush(); e.clock.advance(100); await flush();
      expect(e.script.calls.at(-1)?.inputs.changes).toBeNull();
    } finally { await e.dispose(); }
  });
  it('contains sync throws and async rejection and remains usable', async () => {
    const e = environment();
    try {
      const opened = await e.open(); await flush();
      for (const failure of [() => { throw new Error('sync'); }, () => Promise.reject(new Error('async'))]) {
        e.script.pending.push(failure); expect(await e.check(opened.token)).toMatchObject({ reason: 'analysis-failed' });
      }
      expect((await e.check(opened.token)).status).toBe('reported');
    } finally { await e.dispose(); }
  });
});
