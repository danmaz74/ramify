import { describe, expect, it } from 'vitest';
import type { AnalysisReport } from '../../../../../analysis/src/interfaces/analysis.js';
import type { CheckOutcome } from '../interfaces/contexts.js';
import { sessionEnvironment } from './session-fixture.js';
import { capture, flush, hash } from './scripted-driver.js';

const hook = { mode: 'synchronized' as const, expect: [{ path: 'src/index.ts', sha256: hash('1') }] };
function reported(outcome: CheckOutcome): AnalysisReport {
  if (outcome.status !== 'reported' || !outcome.report) throw new Error(`Expected a report, received ${outcome.status}`);
  return outcome.report;
}

describe('project-root resolution on open', () => {
  it('root-resolution-reused: reopening a known context with a live session performs no root resolution', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      expect(e.status(opened.token)).toMatchObject({ state: 'warm', synchronization: 'synchronized' });
      const [first] = e.script.resolveCalls;
      expect(first).toMatchObject({ known: [], reused: false });
      // Each hook invocation opens with a new lease before checking.
      for (const lease of ['hook-1', 'hook-2']) {
        const again = await e.open('/fixture', lease);
        expect(again).toMatchObject({ status: 'opened', token: opened.token, created: false });
        expect(e.script.resolveCalls.at(-1)).toMatchObject({ reused: true });
        expect(await e.check(again.token, hook, {}, lease)).toMatchObject({ status: 'reported', published: true, revision: { sequence: 1 } });
      }
      const reusedKnown = e.script.resolveCalls.at(-1)!.known;
      expect(reusedKnown).toHaveLength(1);
      // A different working directory is a different request: it resolves once, then is reused.
      await e.open('/fixture', 'nested', '/fixture/src');
      expect(e.script.resolveCalls.at(-1)).toMatchObject({ known: [], reused: false });
      await e.open('/fixture', 'nested-again', '/fixture/src');
      expect(e.script.resolveCalls.at(-1)).toMatchObject({ reused: true, known: [{ invokedFrom: '/fixture/src' }] });
      expect(e.script.resolutions).toBe(2);
      expect(e.script.openCalls).toHaveLength(1);
    } finally { await e.dispose(); }
  });

  it('lease-scope-invocation: leases with different working directories each receive their own selection and invokedFrom', async () => {
    const e = sessionEnvironment();
    try {
      const first = capture(1);
      const scope = { root: '/fixture', selection: 'given' as const, invokedFrom: '/fixture',
        configuration: 'tsconfig.json', walkedAreas: ['src'], independentScopes: [] };
      e.script.pending.push(() => ({ ...first, report: { ...first.report, scope } }));
      const given = await e.open('/fixture', 'given'); await flush();
      // The second lease finds the same root by climbing from a subdirectory: one context, two invocations.
      const found = await e.manager.open({ cwd: '/fixture/subs/workspace', scope: 'whole-project', configuration: 'discover' },
        { registry: 'default', capabilities: [] }, 'found');
      expect(found).toMatchObject({ status: 'opened', token: given.token, created: false });
      const own = reported(await e.check(given.token, hook, { scope: 'report' }, 'given'));
      const theirs = reported(await e.check(given.token, hook, { scope: 'report' }, 'found'));
      expect(own.scope).toEqual(scope);
      expect(theirs.scope).toEqual({ ...scope, selection: 'found', invokedFrom: '/fixture/subs/workspace' });
      // Everything the context published is shared: the stated root selection and the echoed
      // request are the caller's own, and the captured inputs and their identity are the context's.
      expect({ ...theirs, scope: null, request: null }).toEqual({ ...own, scope: null, request: null });
      expect([own.request.project, theirs.request.project]).toEqual([
        { cwd: '/fixture', root: '/fixture', scope: 'whole-project', configuration: 'discover' },
        { cwd: '/fixture/subs/workspace', scope: 'whole-project', configuration: 'discover' }]);
      expect(e.script.openCalls).toHaveLength(1);
    } finally { await e.dispose(); }
  });

  it('root-resolution-reused: an opening, cold or evicted context resolves again', async () => {
    const e = sessionEnvironment({ warmIdleMs: 100, coldRetainMs: 200, sweepIntervalMs: 1000 });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    try {
      e.script.pending.push(async () => { await gate; return capture(1); });
      const opened = await e.open(); await flush();
      // The session is still opening: no live session holds the resolution.
      expect(e.status(opened.token)).toMatchObject({ state: 'opening', session: null });
      await e.open('/fixture', 'while-opening');
      expect(e.script.resolveCalls.at(-1)).toMatchObject({ known: [], reused: false });
      release(); await flush();
      await e.open('/fixture', 'opened');
      expect(e.script.resolveCalls.at(-1)).toMatchObject({ reused: true });
      e.manager.release('lease'); e.manager.release('while-opening'); e.manager.release('opened');
      e.clock.advance(100); await flush(); e.clock.advance(200); await flush();
      expect(e.status(opened.token)).toMatchObject({ state: 'cold', session: null });
      const cold = await e.open('/fixture', 'cold');
      expect(cold).toMatchObject({ token: opened.token, created: false });
      expect(e.script.resolveCalls.at(-1)).toMatchObject({ known: [], reused: false });
      await flush();
      await e.open('/fixture', 'rewarmed');
      expect(e.script.resolveCalls.at(-1)).toMatchObject({ reused: true });
      e.manager.release('cold'); e.manager.release('rewarmed');
      e.clock.advance(100); await flush(); e.clock.advance(200); await flush(); e.clock.advance(200); await flush();
      expect(e.manager.list()).toHaveLength(0);
      const evicted = await e.open('/fixture', 'evicted');
      expect(evicted.token.generation).not.toBe(opened.token.generation);
      expect(e.script.resolveCalls.at(-1)).toMatchObject({ known: [], reused: false });
    } finally { release(); await flush(); await e.dispose(); }
  });

  it('resolution-survives-membership, resolution-survives-configuration-bytes: hooks for a created or deleted file or a configuration edit reopen with the known resolution', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      const created = { path: 'src/created.ts', role: 'source' as const, sha256: hash('created'), bytes: 7 };
      const index = { path: 'src/index.ts', role: 'source' as const, sha256: hash('1'), bytes: 1 };
      // The driver's discovery answers are unchanged throughout: only files and bytes the
      // resolution does not validate change, so every reopen is offered and reuses it.
      const hookFor = async (lease: string, contents: readonly { path: string; sha256: string | null }[]) => {
        const reopened = await e.open('/fixture', lease);
        expect(reopened).toMatchObject({ token: opened.token, created: false });
        expect(e.script.resolveCalls.at(-1)).toMatchObject({ reused: true, known: [expect.anything()] });
        return e.check(reopened.token, { mode: 'synchronized', expect: contents }, {}, lease);
      };
      e.script.pending.push(() => capture(2, 'completed', [created, index]));
      expect(await hookFor('created', [{ path: created.path, sha256: created.sha256 }]))
        .toMatchObject({ status: 'reported', published: true, revision: { sequence: 2 } });
      expect(e.script.updateCalls.at(-1)?.inputs.changes).toEqual([{ path: created.path, kind: 'changed' }]);
      e.script.pending.push(() => capture(3, 'completed', [{ path: created.path, role: 'absent', sha256: hash(''), bytes: 0 }, index]));
      expect(await hookFor('deleted', [{ path: created.path, sha256: null }]))
        .toMatchObject({ status: 'reported', published: true, revision: { sequence: 3 } });
      // A configuration edit arrives through the watcher and requires a sweep; the next hook still reuses.
      e.script.pending.push(() => capture(4, 'completed', [index]));
      e.watcher.emit('/fixture', [{ path: 'tsconfig.json', kind: 'changed' }]);
      expect(await hookFor('configuration', [{ path: index.path, sha256: index.sha256 }]))
        .toMatchObject({ status: 'reported', published: true });
      expect(e.script.updateCalls.some(call => call.inputs.changes.some(change => change.path === 'tsconfig.json'))).toBe(true);
      expect(e.script.resolutions).toBe(1);
      expect(e.script.openCalls).toHaveLength(1);
    } finally { await e.dispose(); }
  });

  it('root-resolution-invalidated: changed discovery answers resolve again and a moved root opens its own context', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      const original = e.script.resolveCalls[0]!;
      // A changed discovery answer, such as a created configuration candidate: the known resolution is not returned, the root is unchanged.
      e.script.changeDiscovery();
      const edited = await e.open('/fixture', 'edited');
      expect(edited).toMatchObject({ token: opened.token, created: false });
      expect(e.script.resolveCalls.at(-1)).toMatchObject({ reused: false, known: [expect.anything()] });
      // The stale resolution is withdrawn; only the new one is offered next.
      await e.open('/fixture', 'after-edit');
      const after = e.script.resolveCalls.at(-1)!;
      expect(after.reused).toBe(true); expect(after.known).toHaveLength(1);
      expect(after.known[0]).not.toBe(original.known[0]);
      // A moved root never reaches the context of the previous root.
      e.script.changeDiscovery('/moved');
      const moved = await e.open('/fixture', 'moved');
      expect(e.script.resolveCalls.at(-1)).toMatchObject({ reused: false });
      expect(moved.token.context).not.toBe(opened.token.context);
      expect(moved).toMatchObject({ created: true, current: { selection: { root: '/moved' } } });
      await flush();
      await e.open('/fixture', 'moved-again');
      const offered = e.script.resolveCalls.at(-1)!;
      expect(offered).toMatchObject({ reused: true, known: [{ root: '/moved' }] });
      expect(e.script.resolutions).toBe(3);
    } finally { await e.dispose(); }
  });
});
