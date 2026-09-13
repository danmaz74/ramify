import { describe, expect, it } from 'vitest';
import { sessionEnvironment } from './session-fixture.js';
import { capture, flush, hash } from './scripted-driver.js';

const hook = { mode: 'synchronized' as const, expect: [{ path: 'src/index.ts', sha256: hash('1') }] };

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

  it('root-resolution-invalidated: changed discovery answers resolve again and a moved root opens its own context', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      const original = e.script.resolveCalls[0]!;
      // A configuration edit: the known resolution is not returned, the root is unchanged.
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
