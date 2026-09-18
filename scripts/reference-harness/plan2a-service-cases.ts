import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQuickEnvironment } from '../../src/tests/quick-environment.js';
import { capabilities } from '../../subs/cli/src/command-support.js';
import { dispatchServiceRequest } from '../../subs/daemon/src/service.js';
import type { ContextToken } from '../../subs/daemon/src/context-types.js';
import type { ApiViewSelection } from '../../subs/analysis/src/interfaces/session.js';
import { writeMaterializeFixture } from './plan2a-materialize-fixture.js';
import type { InstanceHandler } from './runner.js';

async function flush(): Promise<void> { for (let index = 0; index < 100; index++) await Promise.resolve(); }

async function withFixture<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-plan2a-service-'));
  try { await writeMaterializeFixture(root); return await run(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

async function openFixture(quick: Awaited<ReturnType<typeof createQuickEnvironment>>, root: string) {
  const connected = await quick.connect({ start: 'if-needed' });
  if (connected.status !== 'connected') throw new Error(`Expected a connection: ${connected.status}`);
  const connection = connected.connection;
  const opened = await connection.openContext({ project: { cwd: root, scope: 'whole-project', configuration: 'discover' },
    setup: { registry: 'default', capabilities } });
  if (!opened.ok || opened.value.status !== 'opened') throw new Error(`Expected an opened context: ${JSON.stringify(opened)}`);
  return { connection, token: opened.value.token };
}

function materializeRequest(token: ContextToken, selection: ApiViewSelection,
  requestId: string = randomUUID(), extra: Record<string, unknown> = {}) {
  return { token, requestId, freshness: { mode: 'synchronized' as const, expect: [] }, selection, ...extra };
}

export const plan2aServiceHandlers: ReadonlyMap<string, InstanceHandler> = new Map<string, InstanceHandler>([
  ['I2A-09:request-validation', { kind: 'memory', run: async ({ assertions: a }) => {
    await withFixture(async root => {
      const quick = await createQuickEnvironment();
      try {
        const { token } = await openFixture(quick, root);
        const all = await quick.request('materialize', materializeRequest(token, { scope: 'all' }));
        a.equal('a valid all-selection request is structurally accepted and dispatched', all.ok, true);
        const module = await quick.request('materialize', materializeRequest(token, { scope: 'module', from: '.' }));
        a.equal('a valid module-selection request is structurally accepted and dispatched', module.ok, true);
        const invalidCases: readonly [string, unknown][] = [
          ['unknown field', { ...materializeRequest(token, { scope: 'all' }), extra: true }],
          ['malformed request id', materializeRequest(token, { scope: 'all' }, '')],
          ['published freshness mode', { ...materializeRequest(token, { scope: 'all' }), freshness: { mode: 'published', wait: false } }],
          ['escaping from path', materializeRequest(token, { scope: 'module', from: '../outside' })],
          ['absolute from path', materializeRequest(token, { scope: 'module', from: '/abs' })],
          ['both scopes', { ...materializeRequest(token, { scope: 'all' }), selection: { scope: 'all', from: '.' } }],
          ['deadline above the ceiling', materializeRequest(token, { scope: 'all' }, randomUUID(), { deadlineMs: 600_001 })],
          ['deadline zero', materializeRequest(token, { scope: 'all' }, randomUUID(), { deadlineMs: 0 })],
          ['missing selection', { token, requestId: randomUUID(), freshness: { mode: 'synchronized', expect: [] } }],
        ];
        for (const [label, params] of invalidCases) {
          const result = await quick.request('materialize', params);
          a.equal(`rejects ${label}`, result.ok ? 'ok' : result.error.code, 'invalid-request');
        }
      } finally { await quick.dispose(); }
    });
  } }],

  ['I2A-09:one-revision-service', { kind: 'memory', run: async ({ assertions: a }) => {
    await withFixture(async root => {
      const quick = await createQuickEnvironment();
      try {
        const { connection, token } = await openFixture(quick, root);
        const response = await connection.materialize(materializeRequest(token, { scope: 'all' }));
        if (!response.ok || response.value.status !== 'materialized') throw new Error(`Expected materialized: ${JSON.stringify(response)}`);
        const outcome = response.value;
        const meta = JSON.parse(await readFile(join(root, 'subs/app/src/.ramify/_meta.json'), 'utf8')) as { revision: string };
        a.equal('the published metadata names the exact context revision', meta.revision, outcome.revision.revision);
        a.equal('the outcome carries a real positive sequence', outcome.revision.sequence > 0, true);
      } finally { await quick.dispose(); }
    });
  } }],

  ['I2A-09:module-and-all', { kind: 'memory', run: async ({ assertions: a }) => {
    await withFixture(async root => {
      const quick = await createQuickEnvironment();
      try {
        const { connection, token } = await openFixture(quick, root);
        const moduleResponse = await connection.materialize(materializeRequest(token, { scope: 'module', from: 'subs/app/src/index.ts' }));
        if (!moduleResponse.ok || moduleResponse.value.status !== 'materialized') throw new Error(JSON.stringify(moduleResponse));
        const moduleOutcome = moduleResponse.value;
        a.equal('a file inside app resolves to the innermost owner: app ordinary plus its pre-existing tests area',
          moduleOutcome.targets.map(target => [target.module, target.area]).sort(),
          [['materialize-fixture/app', 'ordinary'], ['materialize-fixture/app', 'tests']].sort());
        // `widget` is available to app's ordinary area (imported from `lib`, a
        // sibling) and, since lib's own `expose-src ... to parent` also grants
        // automatic visibility to the root's own ordinary source (independent of
        // the root's further `to descendants` relay), to the root's own area too;
        // app's tests area repeats it since neither carries a blocking tag.
        a.equal('module selection has exactly one available entry, on app ordinary', moduleOutcome.targets.find(target => target.area === 'ordinary')?.entries, 1);
        const allResponse = await connection.materialize(materializeRequest(token, { scope: 'all' }));
        if (!allResponse.ok || allResponse.value.status !== 'materialized') throw new Error(JSON.stringify(allResponse));
        const allOutcome = allResponse.value;
        // The fixture's root module declares no `src/` of its own (a pure
        // `expose-sub` aggregator), so it contributes no ordinary target: `--all`
        // publishes one ordinary target per module that owns real `src/`, in
        // module byte order, plus only the pre-existing tests area (ordinary
        // before testing within one module).
        a.equal('all selection publishes one ordinary target per module that owns src/, in module byte order, plus only the pre-existing tests area',
          allOutcome.targets.map(target => [target.module, target.area]),
          [['materialize-fixture/app', 'ordinary'], ['materialize-fixture/app', 'tests'], ['materialize-fixture/lib', 'ordinary']]);
        a.equal('app ordinary and app tests each see the one available entry; lib (nothing exposed to it) sees none',
          allOutcome.targets.map(target => target.entries), [1, 1, 0]);
      } finally { await quick.dispose(); }
    });
  } }],

  ['I2A-09:failure-mapping', { kind: 'memory', run: async ({ assertions: a }) => {
    await withFixture(async root => {
      const quick = await createQuickEnvironment();
      try {
        const { connection, token } = await openFixture(quick, root);
        // The context's deadline is scheduled on the quick environment's own
        // controlled clock, not real wall-clock time; a real materialize easily
        // completes inside a real 1 ms, so the deadline is forced by advancing
        // that clock past it before the request settles, exactly as `session-
        // counters.test.ts` advances it to force other timing-dependent outcomes.
        const coldRequest = connection.materialize(materializeRequest(token, { scope: 'all' }, randomUUID(), { deadlineMs: 1 }));
        await flush();
        quick.clock.advance(2);
        const cold = await coldRequest;
        a.equal('a synchronized request against a never-published context with an exhausted deadline is explicitly cold, not success or internal error',
          cold.ok ? cold.value.status : cold.error.code, 'cold');
        const controller = new AbortController();
        const pending = connection.materialize(materializeRequest(token, { scope: 'all' }), { signal: controller.signal });
        controller.abort();
        const cancelled = await pending;
        a.equal('an aborted request is explicitly cancelled, never success or internal error',
          cancelled.ok ? cancelled.value.status : cancelled.error.code, 'cancelled');
      } finally { await quick.dispose(); }
    });
    for (const [label, publisherReason, expectedReason] of [
      ['an out-of-scope staged path folds to invalid-location', 'invalid-path', 'invalid-location'],
      ['a publisher resource limit folds to resource-unavailable', 'resource-limit', 'resource-unavailable'],
      ['a symlink refusal passes through unchanged', 'symlink', 'symlink'],
      ['a rollback failure passes through unchanged', 'rollback-failure', 'rollback-failure'],
    ] as const) {
      await withFixture(async root => {
        // The publisher's own domain outcome is stubbed directly (not a real
        // filesystem fault) since only the daemon service's reason mapping is
        // under test here; `api-view-publisher.test.ts` already proves the
        // real publisher produces each of these reasons from a genuine fault.
        const publisher = { async publish() { return { status: 'unavailable' as const, reason: publisherReason, message: `injected ${publisherReason}` }; } };
        const quick = await createQuickEnvironment({}, { publisher });
        try {
          const { connection, token } = await openFixture(quick, root);
          const result = await connection.materialize(materializeRequest(token, { scope: 'all' }));
          a.equal(label, result.ok && result.value.status === 'unavailable' ? result.value.reason : result, expectedReason);
        } finally { await quick.dispose(); }
      });
    }
  } }],

  ['I2A-09:compact-wire', { kind: 'memory', run: async ({ assertions: a }) => {
    await withFixture(async root => {
      const quick = await createQuickEnvironment();
      try {
        const { connection, token } = await openFixture(quick, root);
        const response = await connection.materialize(materializeRequest(token, { scope: 'all' }));
        if (!response.ok || response.value.status !== 'materialized') throw new Error(JSON.stringify(response));
        const outcome = response.value;
        const encoded = JSON.stringify(outcome);
        for (const forbidden of ['documentation', 'signature', 'projection', 'widget', 'entries":[', 'markdown', 'Markdown']) {
          a.equal(`the wire response never mentions "${forbidden}"`, encoded.includes(forbidden), false);
        }
        for (const target of outcome.targets) {
          a.equal(`target for ${target.module}/${target.area} carries only summary fields`,
            Object.keys(target).sort(), ['area', 'bytes', 'changed', 'entries', 'files', 'module', 'path', 'view'].sort());
        }
      } finally { await quick.dispose(); }
    });
  } }],

  ['I2A-09:actual-ipc', { kind: 'memory', run: async ({ assertions: a }) => {
    await withFixture(async root => {
      const quick = await createQuickEnvironment();
      try {
        const { connection, token } = await openFixture(quick, root);
        const response = await connection.materialize(materializeRequest(token, { scope: 'all' }));
        if (!response.ok || response.value.status !== 'materialized') throw new Error(JSON.stringify(response));
        const outcome = response.value;
        // 3 targets: the fixture's root module owns no `src/` (a pure
        // `expose-sub` aggregator), so it contributes no ordinary target; app
        // (ordinary + tests) and lib (ordinary) remain. Entries: app ordinary
        // (1) + app tests (1) + lib (0).
        a.equal('a real socket request dispatches and materializes through the shared service, returning the compact summary',
          [outcome.targets.length, outcome.targets.reduce((sum, target) => sum + target.entries, 0), outcome.bytesWritten > 0],
          [3, 2, true]);
        const direct = await quick.service.materialize(materializeRequest(token, { scope: 'all' }));
        a.equal('the direct in-process channel produces the same target shape as the wire channel',
          direct.ok && direct.value.status === 'materialized' ? direct.value.targets.map(t => [t.module, t.area, t.entries]) : direct,
          outcome.targets.map(t => [t.module, t.area, t.entries]));
      } finally { await quick.dispose(); }
    });
    // Peer incompatibility is gated at the connection handshake (a mismatched
    // buildKey refuses the whole connection as `incompatible`; there is no
    // partial connection with a per-operation gap in this protocol). What
    // `materialize` gets, like every other operation, is the shared
    // dispatcher's own explicit refusal of an operation name its switch does
    // not recognize, exercised here against a real, fully-conforming service.
    await withFixture(async root => {
      const quick = await createQuickEnvironment();
      try {
        const rejected = await dispatchServiceRequest(quick.service, 'materialize-v2', {});
        a.equal('a peer dispatcher never silently executes or crashes on a name it does not recognize; it answers unsupported-operation explicitly',
          rejected.ok ? rejected.value : rejected.error.code, 'unsupported-operation');
      } finally { await quick.dispose(); }
    });
  } }],

  ['I2A-09:lease-cleanup', { kind: 'memory', run: async ({ assertions: a }) => {
    await withFixture(async root => {
      const quick = await createQuickEnvironment();
      try {
        const { connection, token } = await openFixture(quick, root);
        const controller = new AbortController();
        const pending = connection.materialize(materializeRequest(token, { scope: 'all' }), { signal: controller.signal });
        controller.abort();
        const result = await pending;
        a.equal('the aborted request is explicitly cancelled', result.ok ? result.value.status : result.error.code, 'cancelled');
        // Match a real generated `.ramify` path *segment*, never a `module.ramify`
        // description file (whose name merely ends with the same four letters).
        const generated = await readdir(root, { recursive: true })
          .then(entries => entries.filter(entry => entry.toString().split('/').includes('.ramify')));
        a.equal('cancellation before publication leaves no generated output', generated, []);
        const status = await quick.service.daemonStatus();
        if (!status.ok) throw new Error('Expected daemon status');
        a.equal('no request or subscription lease remains after cancellation', status.value.contexts.map(item =>
          [item.pending.requests, item.leases.requests, item.leases.subscriptions]), [[0, 0, 0]]);
      } finally { await quick.dispose(); }
    });
  } }],
]);
