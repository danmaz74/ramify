import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ipcFixture } from './ipc-fixture.js';
import { eventually } from './socket-fixture.js';
import { encodeJsonFrame } from '../codec.js';
import type { ContextEvent } from '../context-types.js';
import type { DependencyAnalyzerOutcome, DependencyDiagramRunner } from '../../../analysis/src/interfaces/dependency-analyzer.js';
import type { RunControl } from '../../../analysis/src/interfaces/analysis.js';
import { createMeasureDriver } from './measure-driver.js';

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
      expect(Object.keys(revision.timings)).toHaveLength(10);
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

  it('MM09: refuses measure locally when an older daemon does not advertise the capability', async () => {
    const fixture = await ipcFixture({}, true, undefined, undefined, ['contexts', 'check']);
    try {
      const client = await fixture.connect();
      expect(client.daemon.capabilities).not.toContain('measure');
      expect(await client.measure({ token: { context: `ctx/1:${'0'.repeat(64)}`,
        generation: 'gen/1:d5f257c2-2058-499f-9098-045de98690a2' }, requestId: 'old-client',
      freshness: { mode: 'synchronized', expect: [] } })).toEqual({ ok: false, error: {
        code: 'unsupported-operation', message: 'The daemon does not support measure', details: {},
      } });
    } finally { await fixture.dispose(); }
  });

  it('MM08/MM16: joins one revision with architect inventory over transport and synchronizes a pending edit without writing', async () => {
    const runner: DependencyDiagramRunner = { run: async input => ({ status: 'ready', diagram: { inputId: input.report.inputId!,
      modules: ['example'], boundaries: [], headline: { behavioralDependencies: 0, nonBehavioralDependencies: 0 },
      coverage: { state: 'complete', unknownDependencies: 0, limitIds: [] } }, testReferences: null, behaviorRuns: 1,
    timings: { acquireMs: 1, classifyMs: 1, projectMs: 1, totalMs: 3 } }) };
    const fixture = await ipcFixture({}, true, undefined, runner);
    try {
      const client = await fixture.connect();
      expect(client.daemon.capabilities).toContain('measure');
      const setup = { registry: 'default' as const, capabilities: ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog',
        'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const };
      const opened = await client.openContext({ ...fixture.params, setup });
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const token = opened.value.token;
      const materialized = await client.materialize({ token, requestId: 'measure-equality-view',
        freshness: { mode: 'synchronized', expect: [] }, selection: { scope: 'all' }, views: ['architect'] });
      if (!materialized.ok || materialized.value.status !== 'materialized') throw new Error(JSON.stringify(materialized));
      const before = await readFile(join(fixture.project, '.ramify-architect/module.json'), 'utf8');
      const architect = JSON.parse(before) as { metrics: { views: unknown; contextSize: { exact: unknown; subtree: unknown } } };
      const measured = await client.measure({ token, requestId: 'measure-equality-query', freshness: { mode: 'synchronized', expect: [] } });
      if (!measured.ok || measured.value.status !== 'measured') throw new Error(JSON.stringify(measured));
      expect(measured.value.document.revision).toBe(materialized.value.revision.revision);
      expect(measured.value.document.views).toEqual(architect.metrics.views);
      expect(measured.value.document.modules[0]).toMatchObject({ exact: architect.metrics.contextSize.exact,
        subtree: architect.metrics.contextSize.subtree });
      expect(await readFile(join(fixture.project, '.ramify-architect/module.json'), 'utf8')).toBe(before);

      const text = 'export const value = "更新";\n';
      await writeFile(join(fixture.project, 'src/index.ts'), text);
      const sha256 = createHash('sha256').update(text).digest('hex');
      const edited = await client.measure({ token, requestId: 'measure-pending-edit',
        freshness: { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256 }] } });
      if (!edited.ok || edited.value.status !== 'measured') throw new Error(JSON.stringify(edited));
      expect(edited.value.document.revision).not.toBe(measured.value.document.revision);
      expect(edited.value.document.files.find(file => file.path === 'src/index.ts')).toMatchObject({ bytes: Buffer.byteLength(text),
        owner: 'example', area: 'ordinary', kind: 'source' });
      expect(await readFile(join(fixture.project, '.ramify-architect/module.json'), 'utf8')).toBe(before);
    } finally { await fixture.dispose(); }
  }, 60_000);

  it('MM17: enforces the exact escaped UTF-8 response envelope over actual transport', async () => {
    const driver = () => {
      const count = 500;
      const files = Array.from({ length: count }, (_, index) => ({
        path: `src/多字节-\"quote\"-\\slash-${String(index).padStart(4, '0')}-${'x'.repeat(96)}.ts`, owner: 'example',
        area: 'ordinary' as const, kind: 'source' as const, bytes: index + 1,
      }));
      const bucket = { production: { sourceFiles: count, sourceBytes: count * (count + 1) / 2,
        resourceFiles: 0, resourceBytes: 0 }, tests: { sourceFiles: 0, sourceBytes: 0, resourceFiles: 0, resourceBytes: 0 },
      documentation: { files: 0, bytes: 0 } };
      return createMeasureDriver({ modules: [{ id: 'example', dir: '', parent: null, exact: bucket, subtree: bucket }],
        files });
    };
    const run = async (maximum: number) => {
      const fixture = await ipcFixture({ maxResponseBytes: maximum }, true, driver());
      const client = await fixture.connect();
      const opened = await client.openContext(fixture.params);
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const result = await client.measure({ token: opened.value.token, requestId: 'transport-boundary',
        freshness: { mode: 'synchronized', expect: [] } });
      return { fixture, result };
    };
    const generous = await run(32 * 1024 ** 2);
    try {
      if (!generous.result.ok || generous.result.value.status !== 'measured') throw new Error(JSON.stringify(generous.result));
      const encoded = Buffer.byteLength(JSON.stringify({ type: 'response', id: '2', result: generous.result }), 'utf8');
      expect(encoded).toBeGreaterThan(50_000);
      const atLimit = await run(encoded);
      try { expect(atLimit.result).toMatchObject({ ok: true, value: { status: 'measured', document: { files: expect.any(Array) } } }); }
      finally { await atLimit.fixture.dispose(); }
      const over = await run(encoded - 1);
      try { expect(over.result).toEqual({ ok: true, value: { status: 'unavailable', requestId: 'transport-boundary',
        reason: 'resource-unavailable', message: `Measure response exceeds maxResponseBytes (${encoded - 1})` } }); }
      finally { await over.fixture.dispose(); }
    } finally { await generous.fixture.dispose(); }
  }, 60_000);

  it('MM17: interrupts transport response assembly for cancellation and deadline, then recovers', async () => {
    const run = async (requestId: string, deadlineMs?: number) => {
      let projectionReady!: () => void;
      const projected = new Promise<void>(resolve => { projectionReady = resolve; });
      const count = 5_000;
      const files = Array.from({ length: count }, (_, index) => ({
        path: `src/long-${String(index).padStart(5, '0')}-${'x'.repeat(128)}.ts`, owner: 'example',
        area: 'ordinary' as const, kind: 'source' as const, bytes: index + 1,
      }));
      const bucket = { production: { sourceFiles: count, sourceBytes: count * (count + 1) / 2,
        resourceFiles: 0, resourceBytes: 0 }, tests: { sourceFiles: 0, sourceBytes: 0, resourceFiles: 0, resourceBytes: 0 },
      documentation: { files: 0, bytes: 0 } };
      const driver = createMeasureDriver({ modules: [{ id: 'example', dir: '', parent: null, exact: bucket, subtree: bucket }],
        files }, false, { apiView: projectionReady });
      const fixture = await ipcFixture({}, true, driver);
      const client = await fixture.connect();
      const opened = await client.openContext(fixture.params);
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const params = { token: opened.value.token, requestId, freshness: { mode: 'synchronized' as const, expect: [] },
        ...(deadlineMs === undefined ? {} : { deadlineMs }) };
      return { fixture, client, params, projected };
    };

    const cancelled = await run('transport-cancel');
    try {
      const controller = new AbortController();
      const pending = cancelled.client.measure(cancelled.params, { signal: controller.signal });
      await cancelled.projected;
      await new Promise<void>(resolve => setImmediate(resolve));
      controller.abort();
      expect(await pending).toEqual({ ok: true, value: { status: 'cancelled', requestId: 'transport-cancel' } });
      expect(await cancelled.client.measure({ ...cancelled.params, requestId: 'transport-cancel-recovery' }))
        .toMatchObject({ ok: true, value: { status: 'measured', document: { files: expect.any(Array) } } });
    } finally { await cancelled.fixture.dispose(); }

    const deadline = await run('transport-deadline', 1);
    try {
      const pending = deadline.client.measure(deadline.params);
      await deadline.projected;
      await new Promise<void>(resolve => setImmediate(resolve));
      deadline.fixture.environment.clock.advance(1);
      expect(await pending).toMatchObject({ ok: true, value: { status: 'deadline-exceeded', requestId: 'transport-deadline' } });
      expect(await deadline.client.measure({ ...deadline.params, requestId: 'transport-deadline-recovery', deadlineMs: 10_000 }))
        .toMatchObject({ ok: true, value: { status: 'measured', document: { files: expect.any(Array) } } });
    } finally { await deadline.fixture.dispose(); }
  }, 60_000);

  it('A7-08:round-trip carries the same answered document over the socket as the direct binding', async () => {
    const fixture = await ipcFixture({}, true);
    try {
      const client = await fixture.connect();
      expect(client.daemon.capabilities).toContain('affected');
      const setup = { registry: 'default' as const, capabilities: ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog',
        'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const };
      const opened = await client.openContext({ ...fixture.params, setup });
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const token = opened.value.token;
      const params = (requestId: string) => ({ token, requestId, freshness: { mode: 'synchronized' as const, expect: [] },
        modules: ['example'], paths: ['src/index.ts', 'package.json'] });
      const socket = await client.affected(params('socket'));
      const direct = await fixture.environment.service.affected(params('direct'));
      if (!socket.ok || socket.value.status !== 'answered' || !direct.ok || direct.value.status !== 'answered') {
        throw new Error(JSON.stringify([socket, direct]));
      }
      // The one-module fixture: the seed module changed and nothing depends on it. The root owns
      // the manifest by containment, so the path seeds the root and nothing widens.
      const root = { id: 'example', directory: '.' };
      expect(socket.value.result).toMatchObject({ schemaVersion: 'ramify.affected/2',
        paths: [{ path: 'package.json', status: 'owned', module: 'example', basis: 'containment', exclusion: null },
          { path: 'src/index.ts', status: 'owned', module: 'example', basis: 'inventory', exclusion: null }],
        changedModules: [root], affectedModules: [], testModules: [root], selection: 'dependency-closure', widening: [],
        analysisCheck: 'passed' });
      expect(socket.value.revision).toEqual(direct.value.revision);
      expect(socket.value.result).toEqual(direct.value.result);
      expect(JSON.stringify(socket.value.result)).toBe(JSON.stringify(direct.value.result));
      expect(socket.value.timings).toMatchObject({ service: expect.any(Number), clientTransport: expect.any(Number) });
      expect(direct.value.timings).not.toHaveProperty('clientTransport');
    } finally { await fixture.dispose(); }
  }, 60_000);

  it('A7-08:round-trip response-bound refuses an answer over the negotiated response bound whole, over the socket', async () => {
    /** Every JSON number at its shortest form, so the encoded size is a lower bound for the same answer at any timings. */
    const shortest = (value: unknown): unknown => typeof value === 'number' ? 0 : Array.isArray(value) ? value.map(shortest)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shortest(item)])) : value;
    const setup = { registry: 'default' as const, capabilities: ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog',
      'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const };
    const run = async (maximum: number) => {
      const fixture = await ipcFixture({ maxResponseBytes: maximum }, true);
      const client = await fixture.connect();
      const opened = await client.openContext({ ...fixture.params, setup });
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const token = opened.value.token;
      const result = await client.affected({ token, requestId: 'transport-bound', freshness: { mode: 'synchronized', expect: [] },
        modules: ['example'], paths: ['src/index.ts'] });
      return { fixture, token, result };
    };
    const generous = await run(32 * 1024 ** 2);
    try {
      if (!generous.result.ok || generous.result.value.status !== 'answered') throw new Error(JSON.stringify(generous.result));
      // The daemon counts its own envelope: request id '2' after the open, without the client's transport time.
      const { clientTransport, ...timings } = generous.result.value.timings;
      expect(clientTransport).toEqual(expect.any(Number));
      const sent = { ok: true, value: { ...generous.result.value, timings } };
      const encoded = Buffer.byteLength(JSON.stringify({ type: 'response', id: '2', result: shortest(sent) }), 'utf8');
      const over = await run(encoded - 1);
      try {
        const status = await over.fixture.environment.service.contextStatus({ token: over.token });
        if (!status.ok || !status.value.published) throw new Error(JSON.stringify(status));
        expect(over.result).toEqual({ ok: true, value: { status: 'unavailable', requestId: 'transport-bound',
          revision: status.value.published, reason: 'resource-unavailable',
          message: `Affected response exceeds maxResponseBytes (${encoded - 1})`, unknownModules: [] } });
        // Refused whole, never truncated.
        if (!over.result.ok) throw new Error(JSON.stringify(over.result));
        expect(over.result.value).not.toHaveProperty('result');
      } finally { await over.fixture.dispose(); }
    } finally { await generous.fixture.dispose(); }
  }, 60_000);

  it('A7-08:unsupported-peer refuses affected locally when the daemon does not advertise the capability', async () => {
    const fixture = await ipcFixture({}, true, undefined, undefined, ['contexts', 'check', 'measure']);
    try {
      const client = await fixture.connect();
      expect(client.daemon.capabilities).not.toContain('affected');
      expect(await client.affected({ token: { context: `ctx/1:${'0'.repeat(64)}`,
        generation: 'gen/1:d5f257c2-2058-499f-9098-045de98690a2' }, requestId: 'old-daemon',
      freshness: { mode: 'synchronized', expect: [] }, modules: ['example'] })).toEqual({ ok: false, error: {
        code: 'unsupported-operation', message: 'The daemon does not support affected', details: {},
      } });
    } finally { await fixture.dispose(); }
  });

  it('A7-08:disconnect during the request aborts the session query, releases the lease and leaves the daemon usable', async () => {
    const signals: AbortSignal[] = [];
    let blocking = true;
    const driver = createMeasureDriver({ modules: [], files: [] }, false, {
      affected: async (query, control) => {
        if (!blocking) return { status: 'answered', sequence: query.sequence, result: { schemaVersion: 'ramify.affected/2',
          inputId: 'input/1:scripted', paths: [], changedModules: [], affectedModules: [], testModules: [], selection: 'dependency-closure',
          widening: [], scope: { root: '/fixture', selection: 'given', invokedFrom: '/fixture', configuration: 'tsconfig.json',
            walkedAreas: [], ownership: { modules: [], exclusions: [] } }, coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed' } };
        signals.push(control!.signal!);
        return new Promise(resolve => control!.signal!.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true }));
      },
    });
    const fixture = await ipcFixture({}, true, driver);
    try {
      const client = await fixture.connect();
      const opened = await client.openContext(fixture.params);
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const token = opened.value.token;
      const params = { token, requestId: 'dropped', freshness: { mode: 'synchronized' as const, expect: [] } };
      const pending = client.affected(params);
      await eventually(() => signals.length === 1);
      expect(signals[0]!.aborted).toBe(false);
      const busy = await fixture.environment.service.contextStatus({ token });
      expect(busy.ok && busy.value.leases.requests).toBe(1);
      await client.close();
      expect(await pending).toMatchObject({ ok: false, error: { code: 'cancelled' } });
      await eventually(() => signals[0]!.aborted);
      const released = await fixture.environment.service.contextStatus({ token });
      expect(released.ok && released.value.leases.requests).toBe(0);
      expect(await fixture.environment.service.daemonStatus()).toMatchObject({ ok: true, value: { connections: 0 } });

      blocking = false;
      const again = await fixture.connect();
      expect(await again.affected({ ...params, requestId: 'after' })).toMatchObject({ ok: true,
        value: { status: 'answered', requestId: 'after', result: { inputId: 'input/1:scripted' } } });
    } finally { await fixture.dispose(); }
  }, 60_000);
});
