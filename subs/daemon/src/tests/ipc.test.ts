import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ipcFixture } from './ipc-fixture.js';
import { eventually } from './socket-fixture.js';
import { encodeJsonFrame } from '../codec.js';
import type { ContextEvent } from '../context-types.js';
import type { DependencyAnalyzerOutcome, DependencyDiagramRunner } from '../../../analysis/src/interfaces/dependency-analyzer.js';
import type { RunControl } from '../../../analysis/src/interfaces/analysis.js';

 describe('IPC framing and shared service dispatch', () => {
  it('preserves validation errors and tokens while releasing subscription leases on close', async () => {
    const fixture = await ipcFixture();
    try {
      const client = await fixture.connect();
      const invalid = { nonsense: true } as never;
      expect(await client.openContext(invalid)).toEqual(await fixture.environment.service.openContext(invalid));
      const opened = await client.openContext(fixture.params);
      expect(opened).toMatchObject({ ok: true, value: { status: 'opened' } });
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const token = opened.value.token;
      const status = await client.contextStatus({ token });
      expect(status).toEqual(await fixture.environment.service.contextStatus({ token }));
      const subscribed = await client.subscribe({ token }, () => {});
      expect(subscribed).toMatchObject({ ok: true, value: { replay: 'not-available' } });
      expect(await fixture.environment.service.daemonStatus()).toMatchObject({ ok: true, value: { subscriptions: 1 } });
      await client.close();
      expect(await fixture.environment.service.daemonStatus()).toMatchObject({ ok: true, value: { subscriptions: 0 } });
    } finally { await fixture.dispose(); }
  });
  it('closes malformed and oversized requests without compromising another connection', async () => {
    const fixture = await ipcFixture({ maxRequestBytes: 1024 });
    try {
      for (const bytes of [Buffer.alloc(4), encodeJsonFrame(null, 1024), Buffer.from([0, 0, 4, 1]), Buffer.from([0, 0, 0, 1, 255])]) {
        const raw = await fixture.raw(false); raw.socket.write(bytes); await raw.closed;
        expect(raw.messages).toContainEqual(expect.objectContaining({ type: 'goodbye', reason: expect.objectContaining({ kind: 'failure' }) }));
      }
      const client = await fixture.connect();
      expect(await client.daemonStatus()).toMatchObject({ ok: true });
    } finally { await fixture.dispose(); }
  });
  it('rejects incompatibility and connection exhaustion before welcome', async () => {
    const fixture = await ipcFixture({ maxConnections: 1 });
    try {
      const incompatible = await fixture.raw(false);
      incompatible.socket.write(encodeJsonFrame({ type: 'hello', handshake: { protocol: 'ramify.ipc/0', buildKey: 'foreign', engine: 'foreign', client: { name: 'test', version: 'old' } } }, 1024));
      await incompatible.closed;
      expect(incompatible.messages).toMatchObject([{ type: 'reject', error: { code: 'incompatible' } }]);
      const client = await fixture.connect();
      const rejected = await fixture.raw(); await rejected.closed;
      expect(rejected.messages).toMatchObject([{ type: 'reject', error: { code: 'resource-unavailable' } }]);
      expect(await client.daemonStatus()).toMatchObject({ ok: true });
    } finally { await fixture.dispose(); }
  });
  it('rejects a response beyond the negotiated bound and keeps the connection usable', async () => {
    const fixture = await ipcFixture({ maxResponseBytes: 700 });
    try {
      const client = await fixture.connect();
      expect(await client.daemonStatus()).toMatchObject({ ok: false, error: { code: 'resource-unavailable' } });
      expect(await client.stopDaemon({ instanceId: 'wrong' })).toMatchObject({ ok: false, error: { code: 'wrong-instance' } });
    } finally { await fixture.dispose(); }
  });
  it('dispatches cancellation under the original request id', async () => {
    const fixture = await ipcFixture();
    try {
      const client = await fixture.connect();
      const opened = await client.openContext(fixture.params);
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const token = opened.value.token;
      const control = new AbortController();
      const result = client.check({ token, requestId: 'cancelled-check', freshness: { mode: 'synchronized', expect: [] } }, { signal: control.signal });
      control.abort();
      expect(await result).toMatchObject({ ok: true, value: { status: 'cancelled', requestId: 'cancelled-check' } });
    } finally { await fixture.dispose(); }
  });
  it('answers duplicate request ids and checks exact no-argument operation parameters', async () => {
    const fixture = await ipcFixture();
    try {
      const raw = await fixture.raw(); await eventually(() => raw.messages.length > 0);
      raw.send({ type: 'request', id: 'one', op: 'daemonStatus', params: { extra: true } });
      await eventually(() => raw.messages.length > 1);
      expect(raw.messages[1]).toMatchObject({ type: 'response', result: { ok: false, error: { code: 'invalid-request' } } });
      raw.send({ type: 'request', id: 'one', op: 'daemonStatus', params: {} });
      await eventually(() => raw.messages.length > 2);
      expect(raw.messages[2]).toMatchObject({ type: 'response', result: { ok: false, error: { code: 'invalid-request' } } });
    } finally { await fixture.dispose(); }
  });
  it('preserves a completed revision with partial source coverage in notifications', async () => {
    const fixture = await ipcFixture();
    try {
      const client = await fixture.connect();
      const opened = await client.openContext(fixture.params);
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const events: unknown[] = [];
      await client.subscribe({ token: opened.value.token }, event => events.push(event));
      await writeFile(join(fixture.project, 'src/index.ts'), 'export async function load(path: string) { return import(path); }\n');
      const report = await client.check({ token: opened.value.token, requestId: 'partial-coverage', freshness: { mode: 'synchronized', expect: [] } });
      expect(report).toMatchObject({ ok: true, value: { status: 'reported', published: true, report: { outcome: { execution: 'completed', coverage: 'partial' } } } });
      await eventually(() => events.some(event => (event as { type: string }).type === 'revision-published'));
      expect(events).toContainEqual(expect.objectContaining({ type: 'revision-published', revision: expect.objectContaining({ outcome: expect.objectContaining({ coverage: 'partial' }) }) }));
    } finally { await fixture.dispose(); }
  });
  it('timing-fields: a socket check reply carries session work, publication, service handling and client transport', async () => {
    const fixture = await ipcFixture();
    try {
      const client = await fixture.connect();
      const opened = await client.openContext(fixture.params);
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const token = opened.value.token;
      const events: ContextEvent[] = [];
      await client.subscribe({ token }, event => events.push(event));
      expect(await client.check({ token, requestId: 'opened', scope: 'delta', freshness: { mode: 'published', wait: true } })).toMatchObject({ ok: true, value: { status: 'reported' } });
      const text = 'export const value = 2;\n';
      await writeFile(join(fixture.project, 'src/index.ts'), text);
      const result = await client.check({ token, requestId: 'timings', scope: 'delta',
        freshness: { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: createHash('sha256').update(text).digest('hex') }] } });
      if (!result.ok || result.value.status !== 'reported' || !result.value.published) throw new Error(JSON.stringify(result));
      const { revision } = result.value, timings = result.value.timings!;
      expect(Object.keys(revision.timings)).toHaveLength(9);
      expect(Object.keys(timings).sort()).toEqual(['clientTransport', 'invocationCheck', 'promotion', 'publication', 'service', 'sweep', 'workerRoundTrip', 'workerStatus']);
      expect(Object.values(timings).every(value => Number.isFinite(value) && value >= 0)).toBe(true);
      expect([timings.invocationCheck > 0, timings.promotion > 0, timings.workerStatus > 0, timings.workerRoundTrip > 0]).toEqual([true, true, true, true]);
      // Service handling brackets the capture's round trip and publication.
      expect(timings.service).toBeGreaterThanOrEqual(timings.workerRoundTrip + timings.publication);
      // One update answered the request, so the revision's capture reports the same session work.
      expect(revision.capture).toEqual({ invocationCheck: timings.invocationCheck, promotion: timings.promotion, workerStatus: timings.workerStatus,
        workerRoundTrip: timings.workerRoundTrip, sweep: timings.sweep, watch: null });
      await eventually(() => events.some(event => event.type === 'revision-published' && event.revision.sequence === revision.sequence));
      const published = events.find(event => event.type === 'revision-published' && event.revision.sequence === revision.sequence);
      expect(published?.type === 'revision-published' && published.revision.capture).toEqual(revision.capture);
    } finally { await fixture.dispose(); }
  });

  it('BD23: negotiates dependencyDiagram and maps every outcome through the public client, framing a large result', async () => {
    let next: (control?: RunControl) => Promise<DependencyAnalyzerOutcome> = async () => ({ status: 'cancelled' });
    const runner: DependencyDiagramRunner = { run: (_input, control) => next(control) };
    const fixture = await ipcFixture({}, true, undefined, runner);
    try {
      const client = await fixture.connect();
      expect(client.daemon.capabilities).toContain('dependencyDiagram');
      const opened = await client.openContext(fixture.params);
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const token = opened.value.token;
      const checked = await client.check({ token, requestId: 'publish', freshness: { mode: 'synchronized', expect: [] } });
      if (!checked.ok || checked.value.status !== 'reported' || !checked.value.published) throw new Error('Publication failed');
      const revision = checked.value.revision;
      const request = (requestId: string, value = revision.revision) => ({ token, requestId, revision: value });

      next = async () => ({ status: 'unavailable', reason: 'resource-limit', message: 'Diagram exceeds 16777216 bytes' });
      expect(await client.dependencyDiagram(request('limit'))).toEqual({ ok: true, value: { status: 'unavailable', requestId: 'limit',
        reason: 'resource-limit', message: 'resource-limit: Diagram exceeds 16777216 bytes' } });
      next = async () => ({ status: 'unavailable', reason: 'analysis-failed', message: 'helper exited' });
      expect(await client.dependencyDiagram(request('failed'))).toMatchObject({ ok: true, value: { status: 'unavailable', reason: 'analysis-failed' } });
      next = async () => ({ status: 'inputs-changed', paths: ['src/index.ts'] });
      expect(await client.dependencyDiagram(request('changed'))).toEqual({ ok: true, value: { status: 'busy', requestId: 'changed', revision, reason: 'inputs-changed' } });

      // Cancellation over the wire detaches the only caller and aborts the job.
      let aborted: Promise<void> | undefined;
      next = control => new Promise(resolve => {
        aborted = new Promise(done => control!.signal!.addEventListener('abort', () => { done(); resolve({ status: 'cancelled' }); }, { once: true }));
      });
      const controller = new AbortController();
      const cancelled = client.dependencyDiagram(request('cancelled'), { signal: controller.signal });
      await eventually(() => aborted !== undefined);
      controller.abort();
      expect(await cancelled).toEqual({ ok: true, value: { status: 'cancelled', requestId: 'cancelled' } });
      await aborted;

      // A large ready result is framed within the negotiated response capacity.
      const modules = Array.from({ length: 600_000 }, (_, index) => `module-${String(index).padStart(12, '0')}`);
      const diagram = { inputId: revision.fingerprints.inputId, modules, boundaries: [],
        headline: { behavioralDependencies: 0, nonBehavioralDependencies: 0 }, coverage: { state: 'complete' as const, unknownDependencies: 0, limitIds: [] } };
      const encoded = Buffer.byteLength(JSON.stringify(diagram));
      expect(encoded).toBeGreaterThan(12 * 1024 ** 2);
      expect(encoded).toBeLessThan(fixture.budgets.maxResponseBytes);
      next = async () => ({ status: 'ready', diagram, testReferences: null, behaviorRuns: 1,
        timings: { acquireMs: 1, classifyMs: 1, projectMs: 1, totalMs: 3 } });
      const ready = await client.dependencyDiagram(request('ready'));
      expect(ready.ok && ready.value.status === 'ready' && ready.value.diagram.modules.length).toBe(modules.length);
      expect(ready).toMatchObject({ ok: true, value: { status: 'ready', requestId: 'ready', revision } });
      expect(await client.dependencyDiagram(request('superseded', revision.revision.replace(/:1$/, ':5'))))
        .toEqual({ ok: true, value: { status: 'superseded', requestId: 'superseded', revision } });
      expect(await client.dependencyDiagram({ ...request('unknown'), token: { ...token, context: `ctx/1:${'0'.repeat(64)}` } }))
        .toMatchObject({ ok: false, error: { code: 'unknown-context' } });
      expect(await client.dependencyDiagram({ ...request('invalid'), extra: true } as never)).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
      const status = await client.daemonStatus();
      expect(status.ok && status.value.counters).toMatchObject({ dependencyDiagrams: 5, behaviorRuns: 1, dependencyDiagramInputChanges: 1 });
      // Existing operations keep their requests and outputs.
      expect(await client.check({ token, requestId: 'after', freshness: { mode: 'published', wait: false } }))
        .toMatchObject({ ok: true, value: { status: 'reported', published: true, revision: { revision: revision.revision } } });
    } finally { await fixture.dispose(); }
  }, 60_000);

  it('AV25: advertises materialize-views and carries views through the public client unchanged', async () => {
    const runner: DependencyDiagramRunner = { run: async () => ({ status: 'unavailable', reason: 'analysis-failed', message: 'scripted' }) };
    const fixture = await ipcFixture({}, true, undefined, runner);
    try {
      const client = await fixture.connect();
      expect(client.daemon.capabilities).toContain('materialize-views');
      const opened = await client.openContext({ ...fixture.params, setup: { registry: 'default', capabilities: ['registry', 'layout', 'metadata',
        'descriptions', 'source-catalog', 'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access',
        'symbol-free-access', 'resource-access', 'coverage'] } });
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const request = { token: opened.value.token, requestId: 'views', freshness: { mode: 'synchronized' as const, expect: [] },
        selection: { scope: 'all' as const }, views: ['architect' as const] };
      const materialized = await client.materialize(request);
      expect(materialized).toMatchObject({ ok: true, value: { status: 'materialized', requestId: 'views',
        targets: [{ view: 'architect', path: '.ramify-architect' }],
        architect: { modules: 1, dependencies: { unavailable: 'analysis-failed' } } } });
      expect(await client.materialize({ ...request, requestId: 'invalid', views: ['architect', 'architect'] as never }))
        .toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    } finally { await fixture.dispose(); }
  }, 60_000);
});
