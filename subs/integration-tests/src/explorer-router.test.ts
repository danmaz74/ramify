import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQuickEnvironment, type QuickEnvironment } from '../../../src/tests/quick-environment.js';
import type { DependencyDiagramRunner } from '../../analysis/src/interfaces/dependency-analyzer.js';
import type { ContextEvent } from '../../daemon/src/context-types.js';
import type { ServiceConnection } from '../../daemon/src/interfaces/daemon.js';
import { createProjectBinding, type ProjectBinding } from '../../service-api/src/project-binding.js';
import { createExplorerRouter } from '../../service-api/src/router.js';

const capabilities = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking',
  'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const;

const setup = { registry: 'default', capabilities } as const;

async function until(predicate: () => boolean | Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error('Condition not reached');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

/** A real binding over the quick environment, with access to its subscription for forced eviction. */
function bind(environment: QuickEnvironment, root: string) {
  const listeners: ((event: ContextEvent) => void)[] = [];
  const subscriptions: string[] = [];
  /** Every service request the binding's connection sent, with its parameters. */
  const requests: { readonly operation: string; readonly params: string }[] = [];
  let raw: ServiceConnection | undefined;
  const binding: ProjectBinding = createProjectBinding({ root, setup, clock: environment.clock,
    connect: async ({ start }) => {
      const outcome = await environment.connect({ start });
      if (outcome.status !== 'connected') return outcome;
      const connection = outcome.connection;
      raw = connection;
      const recorded = Object.fromEntries((['openContext', 'contextStatus', 'check', 'explorerDetails', 'dependencyDiagram',
        'materialize', 'unsubscribe', 'closeContext', 'daemonStatus'] as const).map(operation => [operation,
        (params: unknown, control?: unknown) => {
          requests.push({ operation, params: JSON.stringify(params) ?? '' });
          return (connection[operation] as (params: unknown, control?: unknown) => unknown)(params, control);
        }]));
      return { ...outcome, connection: { ...connection, ...recorded, get state() { return connection.state; },
        get reason() { return connection.reason; },
        async subscribe(params, listener) {
          listeners.push(listener);
          requests.push({ operation: 'subscribe', params: JSON.stringify(params) });
          const result = await connection.subscribe(params, listener);
          if (result.ok) subscriptions.push(result.value.subscription);
          return result;
        } } };
    } });
  return { binding, listeners, subscriptions, requests, raw: () => raw! };
}

async function readyToken(binding: ProjectBinding) {
  await until(() => binding.state().kind === 'ready');
  const state = binding.state();
  if (state.kind !== 'ready') throw new Error(JSON.stringify(state));
  return state.token;
}

async function put(root: string, path: string, value: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), value);
}

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-explorer-router-')));
  try {
    for (const [path, value] of Object.entries({
      'module.ramify': 'ramify 1\nmodule fixture\nexpose-src value from "interfaces/api.ts" to descendants\n',
      'README.md': '# Fixture\n\nAn explorer fixture.\n',
      'package.json': '{"type":"module"}',
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', types: [], skipLibCheck: true }, include: ['src', 'subs'] }),
      'src/interfaces/api.ts': 'export const value = 1; export const privateValue = 2;\n',
      'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
      'subs/consumer/README.md': '# Consumer\n\nConsumes the public value.\n',
      'subs/consumer/src/use.ts': "import * as React from 'react'; import { readFile } from 'node:fs/promises'; import { value } from '../../../src/interfaces/api.js'; void React; void readFile; void value;\n",
    })) await put(root, path, value);
    await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'));
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe('RS07-RS08: token-free explorer router over a real project binding', () => {
  it('RS07: accepts no token, returns latest, reports server status and is unavailable while not ready', () => fixture(async root => {
    const environment = await createQuickEnvironment({ maxHistoryRevisions: 1 });
    const { binding } = bind(environment, root);
    try {
      const caller = createExplorerRouter({ binding, requestId: () => 'explorer-test' }).createCaller({});
      // The binding starts connecting on creation; nothing is served until it is ready.
      expect(binding.state().kind).toBe('connecting');
      expect(await caller.projectView({})).toEqual({ status: 'unavailable', reason: 'Connecting to the project' });
      expect(await caller.serverStatus()).toEqual({ root, binding: 'connecting', message: null, published: null, daemonPid: null });

      const token = await readyToken(binding);
      const published = await environment.service.check({ token, requestId: 'await-opening', scope: 'report',
        freshness: { mode: 'published', wait: true } });
      if (!published.ok || published.value.status !== 'reported') throw new Error(JSON.stringify(published));
      const reportAccesses = published.value.report?.snapshot?.accesses ?? [];
      expect(reportAccesses.some(access => access.target.kind === 'external'
        && access.target.resolution === 'package')).toBe(true);
      expect(reportAccesses.some(access => access.target.kind === 'external'
        && access.target.resolution === 'builtin')).toBe(true);

      const first = await caller.projectView({});
      expect(first.status).toBe('ready');
      if (first.status !== 'ready') throw new Error(JSON.stringify(first));
      expect(first.revision.token).toEqual(token);
      expect(first.view.modules.map(module => module.id)).toEqual(expect.arrayContaining(['fixture', 'fixture/consumer']));
      const moduleIds = new Set(first.view.modules.map(module => module.id));
      expect(first.view.edges.length).toBeGreaterThan(0);
      expect(first.view.edges.every(edge => moduleIds.has(edge.consumer) && moduleIds.has(edge.provider))).toBe(true);
      const wireJson = JSON.stringify(first.view);
      expect(wireJson).not.toContain('otherTargets');
      expect(wireJson).not.toContain('targetIds');
      expect(wireJson).not.toContain('node:fs/promises');
      expect(wireJson).not.toContain('react');
      expect(first.revision.revision).toBe(first.view.revision);
      expect(await caller.projectView({ revision: first.revision.revision })).toMatchObject({
        status: 'ready', revision: { revision: first.revision.revision },
      });
      expect(await caller.serverStatus()).toEqual({ root, binding: 'ready', message: null,
        published: expect.objectContaining({ revision: first.revision.revision, token }), daemonPid: process.pid });

      // No procedure accepts a token.
      await expect(caller.projectView({ token } as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(caller.projectView({ token, revision: first.revision.revision } as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(caller.projectView({ revision: 'rev/invalid' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(caller.serverStatus({ token } as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(Object.keys(caller)).not.toContain('contextStatus');

      const loadable = first.view.modules.flatMap(module => module.exports)
        .find(item => item.signature.state === 'loadable');
      if (!loadable || loadable.signature.state !== 'loadable') throw new Error('Expected a loadable export');
      await expect(caller.explorerDetails({ token, revision: first.revision.revision,
        requests: [loadable.signature.request] } as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(await caller.explorerDetails({ revision: first.revision.revision, requests: [loadable.signature.request] }))
        .toMatchObject({ status: 'ready', revision: { revision: first.revision.revision }, details: [{ state: 'described' }] });

      // A newer revision in the same generation: old details are superseded, latest is served without a revision.
      await put(root, 'src/interfaces/api.ts', 'export const value = 2; export const privateValue = 2;\n');
      const sha256 = createHash('sha256').update(await readFile(join(root, 'src/interfaces/api.ts'))).digest('hex');
      const next = await environment.service.check({ token, requestId: 'publish-next', scope: 'report',
        freshness: { mode: 'synchronized', expect: [{ path: 'src/interfaces/api.ts', sha256 }] } });
      if (!next.ok || next.value.status !== 'reported' || next.value.revision === null) throw new Error(JSON.stringify(next));
      expect(next.value.revision.revision).not.toBe(first.revision.revision);
      expect(await caller.explorerDetails({ revision: first.revision.revision, requests: [loadable.signature.request] }))
        .toEqual({ status: 'superseded', reason: 'The displayed revision is no longer current' });
      expect(await caller.projectView({})).toMatchObject({ status: 'ready', revision: { revision: next.value.revision.revision } });
      expect(await caller.serverStatus()).toMatchObject({ binding: 'ready', published: { revision: next.value.revision.revision } });

      await binding.close();
      expect(await caller.projectView({})).toEqual({ status: 'unavailable', reason: 'Project binding closed' });
      expect(await caller.explorerDetails({ revision: next.value.revision.revision, requests: [] }))
        .toEqual({ status: 'unavailable', reason: 'Project binding closed' });
      expect(await caller.serverStatus()).toEqual({ root, binding: 'project-unavailable', message: 'Project binding closed',
        published: null, daemonPid: null });
    } finally { await binding.close(); await environment.dispose(); }
  }), 120_000);

  it('RS08: after a forced eviction, details for the previous generation are superseded and latest is served', () => fixture(async root => {
    const environment = await createQuickEnvironment({ warmIdleMs: 10, coldRetainMs: 10 });
    const bound = bind(environment, root);
    const { binding } = bound;
    try {
      const caller = createExplorerRouter({ binding, requestId: () => 'explorer-test' }).createCaller({});
      const token = await readyToken(binding);
      const published = await environment.service.check({ token, requestId: 'await-opening', scope: 'report',
        freshness: { mode: 'published', wait: true } });
      if (!published.ok || published.value.status !== 'reported') throw new Error(JSON.stringify(published));
      const first = await caller.projectView({});
      if (first.status !== 'ready') throw new Error(JSON.stringify(first));
      const loadable = first.view.modules.flatMap(module => module.exports)
        .find(item => item.signature.state === 'loadable');
      if (!loadable || loadable.signature.state !== 'loadable') throw new Error('Expected a loadable export');
      const request = loadable.signature.request;

      // Release the subscription's hold so the real context manager evicts the context on idle.
      expect(await bound.raw().unsubscribe({ subscription: bound.subscriptions[0]! })).toEqual({ ok: true, value: null });
      await until(async () => {
        environment.clock.advance(10);
        const status = await environment.service.daemonStatus();
        return status.ok && status.value.contexts.length === 0;
      });
      // The eviction's notification reached no subscriber; deliver it at the binding boundary.
      bound.listeners[0]!({ type: 'context-evicted', token, reason: 'idle' });
      expect(await caller.explorerDetails({ revision: first.revision.revision, requests: [request] }))
        .toEqual({ status: 'unavailable', reason: 'Connecting to the project' });

      const reopened = await readyToken(binding);
      expect(reopened.context).toBe(token.context);
      expect(reopened.generation).not.toBe(token.generation);
      expect(await caller.explorerDetails({ revision: first.revision.revision, requests: [request] }))
        .toEqual({ status: 'superseded', reason: 'The displayed revision is no longer current' });

      const again = await environment.service.check({ token: reopened, requestId: 'await-reopened', scope: 'report',
        freshness: { mode: 'published', wait: true } });
      if (!again.ok || again.value.status !== 'reported' || again.value.revision === null) throw new Error(JSON.stringify(again));
      // A revision of the previous generation is ignored: the newest revision of the current generation is returned.
      const latest = await caller.projectView({ revision: first.revision.revision });
      expect(latest).toMatchObject({ status: 'ready', revision: { revision: again.value.revision.revision, token: reopened } });
      expect(await caller.serverStatus()).toMatchObject({ binding: 'ready',
        published: { token: reopened, revision: again.value.revision.revision } });
      if (latest.status !== 'ready') throw new Error(JSON.stringify(latest));
      expect(await caller.explorerDetails({ revision: latest.revision.revision, requests: [request] }))
        .toMatchObject({ status: 'ready', revision: { revision: again.value.revision.revision } });
    } finally { await binding.close(); await environment.dispose(); }
  }), 120_000);

  it('BD29: dependencyView reaches ready at one input ID through the real resident service; only dependencyDiagram reaches the analyzer', () => fixture(async root => {
    const runs: Parameters<DependencyDiagramRunner['run']>[0][] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const runner: DependencyDiagramRunner = {
      async run(input) {
        runs.push(input);
        await gate;
        const report = input.report;
        return { status: 'ready', behaviorRuns: 1, testReferences: null, timings: { acquireMs: 1, classifyMs: 1, projectMs: 1, totalMs: 3 },
          diagram: { inputId: report.inputId!, modules: report.snapshot!.inventory.modules.map(module => module.id),
            headline: { behavioralDependencies: 1, nonBehavioralDependencies: 0 },
            boundaries: [{ consumer: 'fixture/consumer', importedModule: 'fixture', originalOwner: 'fixture',
              original: { kind: 'code', owner: 'fixture', file: 'interfaces/api.ts', binding: 'value' }, classification: 'behavioral',
              consumerFiles: ['subs/consumer/src/use.ts'], importedFiles: ['src/interfaces/api.ts'], originalFiles: ['src/interfaces/api.ts'],
              accessIds: ['access'], status: 'allowed', reasons: ['exposed'], limitIds: [] }],
            coverage: { state: 'complete', unknownDependencies: 0, limitIds: [] } } };
      },
    };
    const environment = await createQuickEnvironment({}, { dependencyDiagrams: runner });
    const bound = bind(environment, root);
    const { binding } = bound;
    try {
      const caller = createExplorerRouter({ binding, requestId: () => 'explorer-test' }).createCaller({});
      const token = await readyToken(binding);
      const published = await environment.service.check({ token, requestId: 'await-opening', scope: 'report',
        freshness: { mode: 'published', wait: true } });
      if (!published.ok || published.value.status !== 'reported' || published.value.revision === null) throw new Error(JSON.stringify(published));
      const revision = published.value.revision;
      // Existing procedures stay compatible and never start the analyzer.
      const view = await caller.projectView({ revision: revision.revision });
      if (view.status !== 'ready') throw new Error(JSON.stringify(view));
      expect(await caller.serverStatus()).toMatchObject({ binding: 'ready', published: { revision: revision.revision } });
      const loadable = view.view.modules.flatMap(module => module.exports).find(item => item.signature.state === 'loadable');
      if (!loadable || loadable.signature.state !== 'loadable') throw new Error('Expected a loadable export');
      expect(await caller.explorerDetails({ revision: revision.revision, requests: [loadable.signature.request] })).toMatchObject({ status: 'ready' });
      expect(runs).toHaveLength(0);

      expect(await caller.dependencyView({ revision: revision.revision })).toEqual({ status: 'pending', revision, phase: 'analyzing' });
      await until(() => runs.length > 0);
      expect(await caller.dependencyView({ revision: revision.revision })).toEqual({ status: 'pending', revision, phase: 'analyzing' });
      expect(runs).toHaveLength(1);
      expect(runs[0]!.report.inputId).toBe(revision.fingerprints.inputId);
      release();
      let ready: Awaited<ReturnType<typeof caller.dependencyView>> | undefined;
      await until(async () => (ready = await caller.dependencyView({ revision: revision.revision })).status === 'ready');
      if (ready?.status !== 'ready') throw new Error(JSON.stringify(ready));
      expect(ready.revision).toEqual(revision);
      expect(ready.view).toMatchObject({ inputId: revision.fingerprints.inputId, state: 'complete', project: { behavioral: 1, nonBehavioral: 0 } });
      expect(ready.view.modules.map(module => module.id)).toEqual(view.view.modules.map(module => module.id).sort());
      expect(ready.view.importedModuleEdges.map(edge => [edge.consumer, edge.provider])).toEqual([['fixture/consumer', 'fixture']]);
      for (let index = 0; index < 10; index++) expect(await caller.dependencyView({ revision: revision.revision })).toMatchObject({ status: 'ready' });
      expect(runs).toHaveLength(1);
      const daemon = await environment.service.daemonStatus();
      if (!daemon.ok) throw new Error(JSON.stringify(daemon));
      expect(daemon.value.counters).toMatchObject({ dependencyDiagrams: 1, behaviorRuns: 1 });

      // Only dependencyDiagram requests the diagram; no request the explorer sends names the capability.
      const operations = new Set(bound.requests.map(request => request.operation));
      expect([...operations].sort()).toEqual(['check', 'contextStatus', 'daemonStatus', 'dependencyDiagram', 'explorerDetails', 'openContext', 'subscribe']);
      expect(bound.requests.filter(request => request.operation === 'dependencyDiagram').map(request => JSON.parse(request.params)))
        .toEqual([{ token, requestId: 'explorer-test', revision: revision.revision }]);
      expect(bound.requests.filter(request => request.params.includes('dependency-behavior'))).toEqual([]);
      expect(runs[0]!.report.request.capabilities).not.toContain('dependency-behavior');
      expect(published.value.report?.request.capabilities).not.toContain('dependency-behavior');
    } finally { await binding.close(); await environment.dispose(); }
  }), 120_000);
});
