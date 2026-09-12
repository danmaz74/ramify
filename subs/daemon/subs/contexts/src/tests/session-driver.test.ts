import { describe, expect, it } from 'vitest';
import type { AnalysisDiagnostic } from '../../../../../analysis/src/interfaces/analysis.js';
import type { CheckOutcome } from '../interfaces/contexts.js';
import { createFingerprints } from '../tokens.js';
import { sessionEnvironment } from './session-fixture.js';
import { capture, flush, hash } from './scripted-driver.js';

const diagnostic = (id: string): AnalysisDiagnostic => ({ id, category: 'execution', code: 'internal-error', message: id,
  location: null, related: [], importer: null, original: null, accessId: null });

describe('contexts on one retained session', () => {
  it.each(['throw', 'reject'])('settles publication waiters when the opening session fails by %s and permits recovery', async mode => {
    const e = sessionEnvironment();
    let fail!: () => void;
    const gate = new Promise<void>(resolve => { fail = resolve; });
    e.script.pending.push(async () => {
      await gate;
      if (mode === 'throw') throw new Error('first session failed');
      return Promise.reject(new Error('first session failed'));
    });
    try {
      const opened = await e.open(); await flush();
      const replies: CheckOutcome[] = [];
      const waiting = [1, 2].map(() => e.check(opened.token, { mode: 'published', wait: true }, { scope: 'report' })
        .then(result => { replies.push(result); }));
      const controller = new AbortController();
      const cancelled = e.manager.check({ token: opened.token, requestId: 'cancelled', scope: 'report',
        freshness: { mode: 'published', wait: true } }, 'lease', { signal: controller.signal });
      controller.abort(); expect((await cancelled).status).toBe('cancelled');
      await flush(); expect(replies).toEqual([]);
      fail(); await flush();
      // Assert settlement before awaiting so this defect fails without hanging.
      expect(replies).toHaveLength(2);
      expect(replies.every(result => result.status === 'unavailable' && result.reason === 'analysis-failed')).toBe(true);
      await Promise.all(waiting);
      expect(e.status(opened.token)).toMatchObject({ published: null, synchronization: 'reconciling', pending: { requests: 0 } });
      expect(e.script.openCalls).toHaveLength(1);
      const recovered = await e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('1') }] });
      expect(recovered).toMatchObject({ status: 'reported', published: true, revision: { sequence: 1 } });
      expect(e.script.openCalls).toHaveLength(2);
    } finally { fail(); await flush(); await e.dispose(); }
  });

  it('opens once per canonical context and obtains subsequent revisions from its session', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush(); const same = await e.open('/fixture', 'second');
      expect(same.token).toEqual(opened.token); expect(same.created).toBe(false);
      for (let version = 2; version <= 4; version++) {
        e.script.version = version;
        const result = await e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash(String(version)) }] });
        expect(result).toMatchObject({ status: 'reported', published: true, report: null, revision: { sequence: version } });
      }
      expect(e.script.openCalls).toHaveLength(1); expect(e.script.sessions).toHaveLength(1);
      expect(e.script.updateCalls).toHaveLength(3); expect(e.script.reportCalls).toHaveLength(0);
    } finally { await e.dispose(); }
  });

  it('builds fingerprints and extended revision headers from the observed session revision', async () => {
    const e = sessionEnvironment();
    const supplied = capture(7, 'completed', [
      { path: 'module.ramify', role: 'description', sha256: hash('description'), bytes: 11 },
      { path: 'src/index.ts', role: 'source', sha256: hash('source'), bytes: 6 },
      { path: 'tsconfig.json', role: 'configuration', sha256: hash('config'), bytes: 6 },
    ]);
    e.script.pending.push(() => supplied);
    try {
      const opened = await e.open(); await flush(); const revision = e.status(opened.token).published!;
      expect(revision.fingerprints).toEqual(createFingerprints(supplied.revision.inputId, supplied.revision.inputs, 'default', 'test-engine'));
      expect(revision).toMatchObject({ sequence: 1, checked: supplied.revision.checked, timings: supplied.revision.timings,
        changed: supplied.revision.changed, delta: { added: 0, removed: 0, positionOnly: 0 } });
      expect(revision).not.toHaveProperty('reused');
      e.script.version = 8; await e.check(opened.token, { mode: 'synchronized', expect: [] });
      expect(e.status(opened.token).published?.sequence).toBe(2);
    } finally { await e.dispose(); }
  });

  it('keeps compact history and projects the exact sequence only when a report is requested', async () => {
    const e = sessionEnvironment({ maxHistoryRevisions: 2 });
    try {
      const opened = await e.open(); await flush();
      const first = e.status(opened.token).published!.revision;
      e.script.version = 2;
      await e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('2') }] });
      expect(e.script.reportCalls).toEqual([]);
      expect(e.status(opened.token).history.bytes).toBeLessThan(4096);
      const read = await e.check(opened.token, { mode: 'published', wait: true, revision: first }, { scope: 'report' });
      expect(read.status === 'reported' && [read.revision?.sequence, read.report?.summary.owners]).toEqual([1, 1]);
      expect(e.script.reportCalls).toEqual([{ root: '/fixture', sequence: 1 }]);
      e.script.version = 3; await e.check(opened.token, { mode: 'synchronized', expect: [] });
      expect(e.script.sessions[0]?.releasedRevisions).toContain(1);
      expect(await e.check(opened.token, { mode: 'published', wait: true, revision: first }, { scope: 'report' })).toMatchObject({ reason: 'evicted-revision' });
      expect(e.script.reportCalls).toHaveLength(1);
    } finally { await e.dispose(); }
  });

  it('does not substitute the current report when an exact session projection is unavailable', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush(); const first = e.status(opened.token).published!.revision;
      e.script.version = 2; await e.check(opened.token, { mode: 'synchronized', expect: [] });
      e.script.missingReports.add(1);
      expect(await e.check(opened.token, { mode: 'published', wait: true, revision: first }, { scope: 'report' })).toMatchObject({ status: 'unavailable', reason: 'evicted-revision' });
      expect(e.script.reportCalls.at(-1)?.sequence).toBe(1);
    } finally { await e.dispose(); }
  });

  it('computes complete findings and removed identities against an exact since revision', async () => {
    const e = sessionEnvironment();
    const firstCapture = capture(1);
    e.script.pending.push(() => ({ ...firstCapture, report: { ...firstCapture.report, diagnostics: [diagnostic('old'), diagnostic('stay')] } }));
    try {
      const opened = await e.open(); await flush(); const first = e.status(opened.token).published!.revision;
      const next = capture(2);
      e.script.pending.push(() => ({ ...next, report: { ...next.report, diagnostics: [diagnostic('stay'), diagnostic('new')] } }));
      const result = await e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('2') }] }, { since: first });
      expect(result.status === 'reported' && result.delta).toMatchObject({ since: first, findings: [{ id: 'stay', new: false }, { id: 'new', new: true }], removed: ['old'] });
      expect(e.script.reportCalls).toHaveLength(0);
      const defaultSince = await e.check(opened.token, { mode: 'published', wait: true });
      expect(defaultSince.status === 'reported' && defaultSince.delta).toEqual(result.status === 'reported' ? result.delta : null);
    } finally { await e.dispose(); }
  });

  it('pins the since baseline from acknowledgment while the covering update replaces full history', async () => {
    const e = sessionEnvironment({ maxHistoryRevisions: 2 });
    const firstCapture = capture(1);
    e.script.pending.push(() => ({ ...firstCapture, report: { ...firstCapture.report, diagnostics: [diagnostic('baseline')] } }));
    try {
      const opened = await e.open(); await flush(); const first = e.status(opened.token).published!.revision;
      e.script.version = 2; await e.check(opened.token, { mode: 'synchronized', expect: [] });
      const next = capture(3);
      e.script.pending.push(() => ({ ...next, report: { ...next.report, diagnostics: [diagnostic('baseline'), diagnostic('added')] } }));
      const result = await e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('3') }] }, { since: first });
      expect(result.status === 'reported' && result.delta).toMatchObject({ since: first,
        findings: [{ id: 'baseline', new: false }, { id: 'added', new: true }] });
      expect(e.status(opened.token).history.retained).toBe(2);
      expect(e.script.sessions[0]?.releasedRevisions).not.toContain(1);
      expect(e.script.sessions[0]?.releasedRevisions).toContain(2);
    } finally { await e.dispose(); }
  });

  it('releases an intermediate session version when an update and its required sweep both revise', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      e.watcher.emit('/fixture', [{ path: 'tsconfig.json', kind: 'changed' }]);
      e.script.pending.push(() => capture(2), () => capture(3));
      const result = await e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('3') }] });
      expect(result).toMatchObject({ status: 'reported', published: true, revision: { sequence: 2, summary: { owners: 3 } } });
      await flush();
      expect(e.script.updateCalls).toHaveLength(1); expect(e.script.sweepCalls).toHaveLength(1);
      expect(e.script.sessions[0]?.session.current?.sequence).toBe(3);
      expect(e.script.sessions[0]?.releasedRevisions).toEqual([2]);
      const report = await e.check(opened.token, { mode: 'published', wait: true }, { scope: 'report' });
      expect(report.status === 'reported' && report.report?.summary.owners).toBe(3);
      expect(e.script.reportCalls.at(-1)?.sequence).toBe(3);
      expect(e.status(opened.token).history.retained).toBe(2);
    } finally { await e.dispose(); }
  });

  it.each([true, false])('reclaims unpinned history and retries a fact-limit outcome once (retry succeeds: %s)', async succeeds => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      e.script.version = 2; await e.check(opened.token, { mode: 'synchronized', expect: [] });
      const publication = e.status(opened.token).published;
      const failed = capture(3, 'incomplete');
      const failure = { status: 'reported' as const, report: { ...failed.report, diagnostics: [{ ...diagnostic('fact-limit'),
        category: 'limit' as const, code: 'resource-limit' as const,
        limit: { name: 'maxRetainedFactBytes', maximum: 100, observed: 101, collectedPrefix: true as const } }] } };
      e.script.pending.push(() => {
        expect(e.script.sessions[0]?.session.current?.sequence).toBe(2);
        expect(e.status(opened.token).published).toEqual(publication);
        return failure;
      }, () => {
        expect(e.script.sessions[0]?.releasedRevisions).toContain(1);
        expect(e.script.sessions[0]?.session.current?.sequence).toBe(2);
        return succeeds ? capture(3) : failure;
      });
      const before = e.script.updateCalls.length;
      const result = await e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('3') }] });
      await flush();
      expect(e.script.updateCalls).toHaveLength(before + 2);
      if (succeeds) {
        expect(result).toMatchObject({ status: 'reported', published: true, revision: { sequence: 3 } });
        expect(e.script.sessions[0]?.session.current?.sequence).toBe(3);
      } else {
        expect(result).toMatchObject({ status: 'reported', published: false, revision: null, delta: null, report: failure.report });
        expect(e.status(opened.token).published).toEqual(publication);
        expect(e.script.sessions[0]?.session.current?.sequence).toBe(2);
      }
      expect(e.script.sessions[0]?.releasedRevisions).toContain(1);
      expect(e.script.sessions[0]?.releasedRevisions).not.toContain(2);
      expect(e.script.sessions[0]?.disposeCalls).toBe(0);
    } finally { await e.dispose(); }
  });

  it('rejects an evicted since revision even if the changed identity is already covered', async () => {
    const e = sessionEnvironment({ maxHistoryRevisions: 2 });
    try {
      const opened = await e.open(); await flush(); const first = e.status(opened.token).published!.revision;
      for (const version of [2, 3]) { e.script.version = version; await e.check(opened.token, { mode: 'synchronized', expect: [] }); }
      const before = e.script.calls.length;
      expect(await e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('3') }] }, { since: first })).toMatchObject({ reason: 'evicted-revision' });
      expect(e.script.calls).toHaveLength(before);
    } finally { await e.dispose(); }
  });
});
