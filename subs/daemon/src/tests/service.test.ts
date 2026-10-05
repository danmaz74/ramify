import { cp, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { createQuickEnvironment } from '../../../../src/tests/quick-environment.js';
import type { MaterializeViewId } from '../../../../src/interfaces/service.js';
import { dependencyWait, dispatchServiceRequest } from '../service.js';
import { createFilesystemApiViewPublisher } from '../api-view-publisher.js';
import type { ApiViewPublisher, PublishInput } from '../interfaces/daemon.js';
import type { ContextRevision } from '../context-types.js';
import type { QuickEnvironment } from '../../../../src/tests/quick-environment.js';
import type { AnalysisReport, RunControl } from '../../../analysis/src/interfaces/analysis.js';
import type { DependencyAnalyzerOutcome, DependencyDiagramRunner } from '../../../analysis/src/interfaces/dependency-analyzer.js';
import type { ApiViewSelection } from '../../../analysis/src/interfaces/session.js';
import type { ProjectRequest } from '../../../analysis/subs/project/src/interfaces/project.js';

const roots: string[] = [], environments: QuickEnvironment[] = [];
afterEach(async () => { for (const environment of environments.splice(0)) await environment.dispose(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(dependencyDiagrams?: DependencyDiagramRunner) {
  const root = await mkdtemp(join(tmpdir(), 'ramify-service-test-')); roots.push(root);
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'module.ramify'), 'ramify 1\nroot module fixture\n');
  await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src"]}');
  await writeFile(join(root, 'src/index.ts'), 'export const value = 1;\n');
  const environment = await createQuickEnvironment({}, dependencyDiagrams ? { dependencyDiagrams } : {}); environments.push(environment);
  return { root, environment, params: { project: { cwd: root, root, scope: 'whole-project' as const, configuration: 'discover' as const }, setup: { registry: 'default' as const, capabilities: ['registry', 'layout', 'descriptions'] as const } } };
}

describe('validated daemon service', () => {
  it('returns compact covering replies, forwards since and preserves the plain report default', async () => {
    const { environment, params } = await fixture();
    const opened = await environment.service.openContext(params);
    if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected opened context');
    const token = opened.value.token;
    const plain = await environment.service.check({ token, requestId: 'plain', freshness: { mode: 'synchronized', expect: [] } });
    expect(plain).toMatchObject({ ok: true, value: { status: 'reported', published: true, report: { schemaVersion: 'ramify.analysis/2' } } });
    if (!plain.ok || plain.value.status !== 'reported' || !plain.value.published) throw new Error('Expected publication');
    const since = plain.value.revision.revision;
    const sha256 = createHash('sha256').update('export const value = 1;\n').digest('hex');
    const compact = await environment.service.check({ token, requestId: 'compact', scope: 'delta', since, deadlineMs: 2000,
      freshness: { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256 }] } });
    expect(compact).toMatchObject({ ok: true, value: { status: 'reported', published: true, report: null,
      delta: { since, findings: [], removed: [] }, revision: { revision: since } } });
    const evicted = await environment.service.check({ token, requestId: 'evicted', scope: 'delta',
      since: 'rev/1:d5f257c2-2058-499f-9098-045de98690a2:1', freshness: { mode: 'synchronized', expect: [] } });
    expect(evicted).toMatchObject({ ok: true, value: { status: 'unavailable', reason: 'evicted-revision' } });
  });

  it('forwards deadlines and counts explicit cold and warm outcomes while analysis continues', async () => {
    const { environment, params } = await fixture();
    const opened = await environment.service.openContext(params);
    if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected opened context');
    const token = opened.value.token;
    const cold = environment.service.check({ token, requestId: 'cold', scope: 'delta', deadlineMs: 7,
      freshness: { mode: 'synchronized', expect: [] } });
    environment.clock.advance(7);
    expect(await cold).toMatchObject({ ok: true, value: { status: 'cold', elapsedMs: 7 } });
    const completed = await environment.service.check({ token, requestId: 'completed', freshness: { mode: 'synchronized', expect: [] } });
    expect(completed).toMatchObject({ ok: true, value: { status: 'reported', published: true } });
    const warm = environment.service.check({ token, requestId: 'deadline', scope: 'delta', deadlineMs: 9,
      freshness: { mode: 'synchronized', expect: [] } });
    environment.clock.advance(9);
    expect(await warm).toMatchObject({ ok: true, value: { status: 'deadline-exceeded', elapsedMs: 9 } });
    const continued = await environment.service.check({ token, requestId: 'continued', freshness: { mode: 'synchronized', expect: [] } });
    expect(continued).toMatchObject({ ok: true, value: { status: 'reported', published: true } });
    const status = await environment.service.daemonStatus();
    expect(status.ok && status.value.counters).toMatchObject({ coldOutcomes: 1, deadlineOutcomes: 1 });
  });

  it('rejects malformed compact parameters through codec-backed dispatch before manager work', async () => {
    const { environment, params } = await fixture();
    const opened = await environment.service.openContext(params);
    if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected opened context');
    const token = opened.value.token;
    for (const extension of [{ scope: 'changed' }, { since: 'rev/1:bad' }, { deadlineMs: 0 }, { deadlineMs: 600_001 }, { deadlineMs: '2000' }]) {
      expect(await environment.request('check', { token, requestId: 'invalid', freshness: { mode: 'synchronized', expect: [] }, ...extension }))
        .toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    }
    const status = await environment.service.daemonStatus();
    expect(status.ok && status.value.counters.rejectedRequests).toBe(5);
  });

  it('validates structure before context work and keeps unsupported setup as a value', async () => {
    const { environment, params } = await fixture();
    const invalid = await environment.service.openContext({ ...params, hidden: true } as never);
    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(await environment.service.openContext({ ...params, setup: { ...params.setup, registry: 'custom' } } as never)).toMatchObject({ ok: true, value: { status: 'unavailable', reason: 'unsupported-setup' } });
    // Batch-only opt-in evidence never configures or queues resident work.
    expect(await environment.service.openContext({ ...params, setup: { ...params.setup, capabilities: [...params.setup.capabilities, 'dependency-behavior'] } } as never))
      .toMatchObject({ ok: true, value: { status: 'unavailable', reason: 'unsupported-setup' } });
    const status = await environment.service.daemonStatus(); expect(status.ok && status.value.contexts).toEqual([]);
    expect(await dispatchServiceRequest(environment.service, 'unknown', {})).toMatchObject({ ok: false, error: { code: 'unsupported-operation' } });
  });
  it('exposes revision-bound explorer details through direct, shared and codec-backed dispatch', async () => {
    const { environment, params } = await fixture();
    const opened = await environment.service.openContext(params);
    if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected opened context');
    const checked = await environment.service.check({ token: opened.value.token, requestId: 'publish-details',
      freshness: { mode: 'synchronized', expect: [] } });
    if (!checked.ok || checked.value.status !== 'reported' || !checked.value.published) throw new Error('Expected publication');
    const request = { token: opened.value.token, revision: checked.value.revision.revision,
      requests: [{ original: { kind: 'code' as const, owner: 'fixture', file: 'index.ts', binding: 'value' }, exportName: 'value' }] };
    const direct = await environment.service.explorerDetails({ ...request, requestId: 'details-direct' });
    expect(direct).toMatchObject({ ok: true, value: { status: 'ready', details: [{ state: 'described', signature: 'const value: 1' }] } });
    const shared = await dispatchServiceRequest(environment.service, 'explorerDetails', { ...request, requestId: 'details-shared' });
    expect(shared).toMatchObject({ ok: true, value: { status: 'ready', revision: checked.value.revision } });
    const codec = await environment.request('explorerDetails', { ...request, requestId: 'details-codec' });
    expect(codec).toMatchObject({ ok: true, value: { status: 'ready', details: [{ exportName: 'value' }] } });
  });
  it('BD23: serves dependency diagrams through direct, shared and codec-backed dispatch with validation and counters', async () => {
    const runs: { readonly project: ProjectRequest; readonly report: AnalysisReport }[] = [];
    let next: (input: { readonly report: AnalysisReport }) => DependencyAnalyzerOutcome = () => { throw new Error('No scripted outcome'); };
    const { environment, params, root } = await fixture({ async run(input) { runs.push(input); return next(input); } });
    const opened = await environment.service.openContext(params);
    if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected opened context');
    const token = opened.value.token;
    const checked = await environment.service.check({ token, requestId: 'publish-diagram', freshness: { mode: 'synchronized', expect: [] } });
    if (!checked.ok || checked.value.status !== 'reported' || !checked.value.published) throw new Error('Expected publication');
    const revision = checked.value.revision;
    const diagram = { inputId: revision.fingerprints.inputId, modules: ['fixture'], boundaries: [],
      headline: { behavioralDependencies: 0, nonBehavioralDependencies: 0 }, coverage: { state: 'complete' as const, unknownDependencies: 0, limitIds: [] } };
    // The analyzer's test references never reach the public answer, which carries the diagram alone.
    const testReferences = { inputId: diagram.inputId, files: [{ file: 'src/tests/a.test.ts',
      exercises: [{ kind: 'code' as const, owner: 'fixture', file: 'a.ts', binding: 'a' }], unclassified: 1 }] };
    next = () => ({ status: 'ready', diagram, testReferences, behaviorRuns: 1, timings: { acquireMs: 1, classifyMs: 1, projectMs: 1, totalMs: 3 } });
    const before = await environment.service.daemonStatus();
    if (!before.ok) throw new Error('Expected daemon status');
    expect(before.value.counters).toMatchObject({ behaviorRuns: 0, dependencyDiagrams: 0, dependencyDiagramInputChanges: 0 });

    const request = { token, revision: revision.revision };
    expect(await environment.service.dependencyDiagram({ ...request, requestId: 'diagram-direct' }))
      .toEqual({ ok: true, value: { status: 'ready', requestId: 'diagram-direct', revision, diagram } });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.project).toEqual(runs[0]!.report.request.project);
    expect([runs[0]!.report.inputId, runs[0]!.report.outcome.execution]).toEqual([revision.fingerprints.inputId, 'completed']);
    expect(await dispatchServiceRequest(environment.service, 'dependencyDiagram', { ...request, requestId: 'diagram-shared' }))
      .toEqual({ ok: true, value: { status: 'ready', requestId: 'diagram-shared', revision, diagram } });
    expect(await environment.request('dependencyDiagram', { ...request, requestId: 'diagram-codec' }))
      .toEqual({ ok: true, value: { status: 'ready', requestId: 'diagram-codec', revision, diagram } });
    expect(runs).toHaveLength(1);
    expect(await environment.service.dependencyDiagram({ ...request, requestId: 'diagram-old', revision: revision.revision.replace(/:1$/, ':7') }))
      .toEqual({ ok: true, value: { status: 'superseded', requestId: 'diagram-old', revision } });
    expect(await environment.service.dependencyDiagram({ token: { ...token, context: `ctx/1:${'0'.repeat(64)}` }, requestId: 'diagram-unknown', revision: revision.revision }))
      .toMatchObject({ ok: false, error: { code: 'unknown-context' } });
    for (const invalid of [{ ...request, requestId: 'x', extra: true }, { ...request, requestId: 'x', revision: 'rev/1:bad' }, request]) {
      expect(await environment.request('dependencyDiagram', invalid)).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    }
    const status = await environment.service.daemonStatus();
    if (!status.ok) throw new Error('Expected daemon status');
    expect(status.value.counters).toMatchObject({ behaviorRuns: 1, dependencyDiagrams: 1, dependencyDiagramInputChanges: 0,
      rejectedRequests: before.value.counters.rejectedRequests + 3 });
    const context = status.value.contexts.find(item => item.token.context === token.context)!;
    const factBytes = context.session?.factBytes ?? 0;
    // The references are retained beside the diagram for the architect view, and counted with it.
    expect(context.retainedBytes).toBe(factBytes + Buffer.byteLength(JSON.stringify(diagram)) + Buffer.byteLength(JSON.stringify(testReferences)));

    // A newer revision releases the result; an analyzer that sees changed inputs answers busy and is counted.
    await writeFile(join(root, 'src/index.ts'), 'export const value = 2;\n');
    const edited = await environment.service.check({ token, requestId: 'publish-edit', freshness: { mode: 'synchronized', expect: [] } });
    if (!edited.ok || edited.value.status !== 'reported' || !edited.value.published) throw new Error('Expected publication');
    expect(edited.value.report).toMatchObject({ outcome: { execution: 'completed' } });
    const released = await environment.service.daemonStatus();
    expect(released.ok && released.value.contexts[0]!.retainedBytes).toBe(released.ok ? released.value.contexts[0]!.session?.factBytes ?? 0 : -1);
    next = () => ({ status: 'inputs-changed', paths: ['src/index.ts'] });
    expect(await environment.service.dependencyDiagram({ token, requestId: 'diagram-changed', revision: edited.value.revision.revision }))
      .toEqual({ ok: true, value: { status: 'busy', requestId: 'diagram-changed', revision: edited.value.revision, reason: 'inputs-changed' } });
    const counted = await environment.service.daemonStatus();
    expect(counted.ok && counted.value.counters).toMatchObject({ behaviorRuns: 1, dependencyDiagrams: 2, dependencyDiagramInputChanges: 1 });
  });
  it('releases one client/context pair while retaining its other subscription', async () => {
    const { environment, params, root } = await fixture();
    const secondRoot = await mkdtemp(join(tmpdir(), 'ramify-service-second-')); roots.push(secondRoot);
    const { cp } = await import('node:fs/promises'); await cp(root, secondRoot, { recursive: true });
    const lease = environment.service.lease('client');
    const first = await lease.service.openContext(params); const second = await lease.service.openContext({ ...params, project: { ...params.project, root: secondRoot, cwd: secondRoot } });
    if (!first.ok || first.value.status !== 'opened' || !second.ok || second.value.status !== 'opened') throw new Error('Expected opened contexts');
    await lease.service.subscribe({ token: first.value.token }, () => {});
    await lease.service.subscribe({ token: second.value.token }, () => {});
    expect(await lease.service.closeContext({ token: first.value.token })).toEqual({ ok: true, value: null });
    const secondToken = second.value.token;
    const status = await lease.service.daemonStatus();
    expect(status.ok && status.value.subscriptions).toBe(1);
    expect(status.ok && status.value.contexts.find(context => context.token.context === secondToken.context)?.leases.subscriptions).toBe(1);
    lease.release();
    expect(await lease.service.daemonStatus()).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    const released = await environment.service.daemonStatus(); expect(released.ok && released.value.subscriptions).toBe(0);
  });
  it('binds subscription cancellation to the owning client and validates stop instance', async () => {
    const { environment, params } = await fixture();
    const first = environment.service.lease('first'), second = environment.service.lease('second');
    const opened = await first.service.openContext(params); if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected open');
    const subscription = await first.service.subscribe({ token: opened.value.token }, () => {}); if (!subscription.ok) throw new Error('Expected subscription');
    expect(await second.service.unsubscribe({ subscription: subscription.value.subscription })).toMatchObject({ ok: false, error: { code: 'unknown-subscription' } });
    expect(await second.service.stopDaemon({ instanceId: 'wrong' })).toMatchObject({ ok: false, error: { code: 'wrong-instance' } });
    const stops: unknown[] = []; environment.service.onStop(event => stops.push(event));
    expect(await first.service.stopDaemon({ instanceId: environment.service.instance.instanceId })).toMatchObject({ ok: true, value: { stopping: true } });
    expect(stops).toEqual([{ reason: 'explicit', requestId: null, at: environment.clock.now() }]);
    first.release(); second.release();
  });
});

/** The CLI's context capabilities: the architect projection needs the catalog and exposures. */
const cliCapabilities = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking', 'static-access',
  'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const;

interface ControlledRun {
  readonly input: { readonly project: ProjectRequest; readonly report: AnalysisReport };
  readonly signal: AbortSignal;
  settle(outcome: DependencyAnalyzerOutcome): void;
}

/** A dependency runner whose runs wait for the test; an aborted run settles as cancelled, as the process runner does. */
function controlledRunner() {
  const runs: ControlledRun[] = [];
  const runner: DependencyDiagramRunner = {
    run(input, control) {
      return new Promise(resolve => {
        const signal = control!.signal!;
        runs.push({ input, signal, settle: resolve });
        signal.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true });
      });
    },
  };
  return { runner, runs };
}

async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = performance.now() + 20_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await delay(5);
  }
}

/** A root module with one exported function and one test file that calls it, a controlled runner
 * and a publisher that records every input before publishing it for real. */
async function architectFixture(architectMetricsPolicy: 'measure' | 'omit' = 'measure', withChild = false) {
  const root = await mkdtemp(join(tmpdir(), 'ramify-materialize-views-')); roots.push(root);
  await mkdir(join(root, 'src/tests'), { recursive: true });
  await writeFile(join(root, 'module.ramify'), 'ramify 1\nroot module fixture\n');
  await writeFile(join(root, 'README.md'), '# Fixture\n\nThe fixture project.\n');
  await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src","subs"]}');
  await writeFile(join(root, 'src/index.ts'), 'export function run(input: string): string { return input; }\nexport const value = 1;\n');
  await writeFile(join(root, 'src/tests/index.test.ts'),
    "import { run } from '../index.js';\ndescribe('run', () => { it('returns its input', () => { run('a'); }); });\n");
  if (withChild) {
    await mkdir(join(root, 'subs/child/src'), { recursive: true });
    await writeFile(join(root, 'subs/child/module.ramify'), 'ramify 1\nmodule child\n');
    await writeFile(join(root, 'subs/child/README.md'), '# Child\n\nA child fixture.\n');
    await writeFile(join(root, 'subs/child/src/index.ts'), 'export const child = 1;\n');
  }
  const controlled = controlledRunner();
  const inputs: PublishInput[] = [];
  const filesystem = createFilesystemApiViewPublisher({ maxAreaBytes: 32 * 1024 ** 2, maxArchitectBytes: 64 * 1024 ** 2,
    maxInvocationBytes: 256 * 1024 ** 2, maxStagedBytes: 256 * 1024 ** 2 });
  const publisher: ApiViewPublisher = { publish(target, revision, input, requestId, control) {
    inputs.push(input); return filesystem.publish(target, revision, input, requestId, control);
  } };
  const environment = await createQuickEnvironment({}, { dependencyDiagrams: controlled.runner, publisher,
    architectMetricsPolicy }); environments.push(environment);
  // Every delay the service and its contexts schedule on the controlled clock, to find the dependency wait's pauses.
  const delays: number[] = [];
  const schedule = environment.clock.schedule.bind(environment.clock);
  Object.assign(environment.clock, { schedule: (delayMs: number, run: () => void) => { delays.push(delayMs); return schedule(delayMs, run); } });
  const pauses = () => delays.filter(delayMs => delayMs === dependencyWait.intervalMs).length;
  const project = { cwd: root, root, scope: 'whole-project' as const, configuration: 'discover' as const };
  const opened = await environment.service.openContext({ project, setup: { registry: 'default', capabilities: cliCapabilities } });
  if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected opened context');
  const token = opened.value.token;
  let sequence = 0;
  const materialize = (views: readonly MaterializeViewId[] | undefined, control?: RunControl, deadlineMs?: number,
    selection: ApiViewSelection = { scope: 'all' }) => environment.service.materialize({
    token, requestId: `materialize-${++sequence}`, freshness: { mode: 'synchronized', expect: [] }, selection,
    ...(views ? { views } : {}), ...(deadlineMs === undefined ? {} : { deadlineMs }) }, control);
  const measure = (control?: RunControl, deadlineMs?: number) => environment.service.measure({
    token, requestId: `measure-${++sequence}`, freshness: { mode: 'synchronized', expect: [] },
    ...(deadlineMs === undefined ? {} : { deadlineMs }) }, control);
  const ready = (revision: ContextRevision): DependencyAnalyzerOutcome => {
    const inputId = revision.fingerprints.inputId;
    return { status: 'ready', diagram: { inputId, modules: withChild ? ['fixture', 'fixture/child'] : ['fixture'], boundaries: [],
      headline: { behavioralDependencies: 0, nonBehavioralDependencies: 0 }, coverage: { state: 'complete', unknownDependencies: 0, limitIds: [] } },
    testReferences: { inputId, files: [{ file: 'src/tests/index.test.ts', exercises: [{ kind: 'code', owner: 'fixture', file: 'index.ts', binding: 'run' }],
      unclassified: 0 }] }, behaviorRuns: 1, timings: { acquireMs: 1, classifyMs: 1, projectMs: 1, totalMs: 3 } };
  };
  const view = async (path: string) => readFile(join(root, '.ramify-architect', path), 'utf8');
  const meta = async () => JSON.parse(await view('_meta.json')) as Record<string, unknown>;
  const published = async (): Promise<ContextRevision> => {
    const status = await environment.service.contextStatus({ token });
    if (!status.ok || !status.value.published) throw new Error('Expected a published revision');
    return status.value.published;
  };
  return { root, environment, token, project, runs: controlled.runs, inputs, delays, pauses, materialize, measure, ready, view, meta, published };
}

describe('materialize views (AV25-AV27)', { timeout: 60_000 }, () => {
  it('AV27 ready: renders measured dependencies with the test references of the same run, alone when only the architect view is requested', async () => {
    const f = await architectFixture();
    const pending = f.materialize(['architect']);
    await until(() => f.runs.length === 1, 'the dependency run');
    const revision = await f.published();
    expect([f.runs[0]!.input.report.inputId, f.runs[0]!.input.report.outcome.execution]).toEqual([revision.fingerprints.inputId, 'completed']);
    f.runs[0]!.settle(f.ready(revision));
    const result = await pending;
    if (!result.ok || result.value.status !== 'materialized') throw new Error(JSON.stringify(result));
    expect(result.value.architect).toEqual({ modules: 1, records: result.value.targets[0]!.entries, dependencies: 'measured' });
    expect(result.value.targets).toEqual([expect.objectContaining({ view: 'architect', module: null, area: null, path: '.ramify-architect', changed: true })]);
    expect(f.inputs).toHaveLength(1);
    expect(f.inputs[0]!.api).toBeNull();
    expect(f.inputs[0]!.renderedApi).toEqual([]);
    expect(f.inputs[0]!.architect).toMatchObject({ modules: 1, dependencies: 'measured' });
    expect(await f.meta()).toMatchObject({ schema: 'ramify.architect-view/2', revision: revision.revision, input: revision.fingerprints.inputId,
      dependencies: 'measured', dependencyScope: 'production', testReferences: 'measured', metrics: 'measured' });
    expect(JSON.parse(await f.view('module.json'))).toMatchObject({ metrics: { state: 'measured', views: 'measured',
      contextSize: { exact: { production: { sourceFiles: 1 }, tests: { sourceFiles: 1 },
        documentation: { files: 2 }, views: { ordinaryBytes: expect.any(Number), testsBytes: expect.any(Number) } } } } });
    // The renderer received the references: the suite record names the function its file calls.
    expect((await f.view('tests.jsonl')).trim().split('\n').map(line => JSON.parse(line) as unknown)).toEqual([
      { module: 'fixture', file: 'src/tests/index.test.ts', suite: ['run'], tests: ['returns its input'], exercises: ['fixture#run'] }]);
    expect(await f.view('behavior.jsonl')).toContain('"name":"run"');
    await expect(readFile(join(f.root, 'src/.ramify/_meta.json'))).rejects.toMatchObject({ code: 'ENOENT' });

    // Unchanged: the retained facts answer at once, with no new run, and nothing is written.
    const repeat = await f.materialize(['architect']);
    expect(repeat).toMatchObject({ ok: true, value: { status: 'materialized', bytesWritten: 0, architect: { dependencies: 'measured' } } });
    expect(f.runs).toHaveLength(1);
    // Without views, nothing asks for dependency facts and nothing reports the architect view.
    const api = await f.materialize(undefined);
    if (!api.ok || api.value.status !== 'materialized') throw new Error(JSON.stringify(api));
    expect(api.value).not.toHaveProperty('architect');
    expect(api.value.targets.map(target => target.view)).toEqual(['api', 'api']);
    expect(f.inputs.at(-1)!.architect).toBeNull();
    expect(f.runs).toHaveLength(1);
  });

  it('AV27 busy: waits the interval on the service clock while another job runs, then succeeds', async () => {
    const f = await architectFixture();
    // Another context's job holds the daemon's single analyzer slot.
    const other = await mkdtemp(join(tmpdir(), 'ramify-materialize-other-')); roots.push(other);
    await cp(f.root, other, { recursive: true });
    const opened = await f.environment.service.openContext({ project: { ...f.project, cwd: other, root: other },
      setup: { registry: 'default', capabilities: cliCapabilities } });
    if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected the other context');
    const otherToken = opened.value.token;
    const checked = await f.environment.service.check({ token: otherToken, requestId: 'other', freshness: { mode: 'synchronized', expect: [] } });
    if (!checked.ok || checked.value.status !== 'reported' || !checked.value.published) throw new Error('Expected publication');
    const otherDiagram = f.environment.service.dependencyDiagram({ token: otherToken, requestId: 'other-diagram', revision: checked.value.revision.revision });
    await until(() => f.runs.length === 1, 'the other context\'s run');

    const pending = f.materialize(['api', 'architect']);
    await until(() => f.pauses() === 1, 'the busy pause');
    // Nothing asks again before the interval ends, and the busy answer started no work.
    f.environment.clock.advance(dependencyWait.intervalMs - 1); await delay(20);
    expect([f.runs.length, f.pauses(), f.inputs.length]).toEqual([1, 1, 0]);
    f.runs[0]!.settle(f.ready(checked.value.revision));
    await otherDiagram;
    f.environment.clock.advance(1);
    await until(() => f.runs.length === 2, 'the second request');
    expect(f.pauses()).toBe(1);
    f.runs[1]!.settle(f.ready(await f.published()));
    const result = await pending;
    if (!result.ok || result.value.status !== 'materialized') throw new Error(JSON.stringify(result));
    expect(result.value.architect?.dependencies).toBe('measured');
    // One transaction: the API targets and the architect target, which switches last.
    expect(f.inputs).toHaveLength(1);
    expect(result.value.targets.map(target => target.view)).toEqual(['api', 'api', 'architect']);
    expect(f.inputs[0]!.api).toBeNull();
    expect(f.inputs[0]!.renderedApi).toHaveLength(2);
    const metrics = (JSON.parse(await f.view('module.json')) as { metrics: { contextSize: { exact: { views: { ordinaryBytes: number; testsBytes: number } } } } }).metrics;
    const apiTargets = result.value.targets.filter(target => target.view === 'api');
    expect(metrics.contextSize.exact.views).toEqual({ ordinaryBytes: apiTargets.find(target => target.area === 'ordinary')!.bytes,
      testsBytes: apiTargets.find(target => target.area === 'tests')!.bytes });
    expect(await f.meta()).toMatchObject({ dependencies: 'measured', testReferences: 'measured' });
  });

  it('measures every module while combined publication retains only the selected module API target', async () => {
    const f = await architectFixture('measure', true);
    const pending = f.materialize(['api', 'architect'], undefined, undefined,
      { scope: 'module', from: 'subs/child' });
    await until(() => f.runs.length === 1, 'the dependency run');
    f.runs[0]!.settle(f.ready(await f.published()));
    const result = await pending;
    if (!result.ok || result.value.status !== 'materialized') throw new Error(JSON.stringify(result));
    const apiTargets = result.value.targets.filter(target => target.view === 'api');
    expect(apiTargets).toEqual([expect.objectContaining({ module: 'fixture/child', area: 'ordinary' })]);
    expect(f.inputs).toHaveLength(1);
    expect(f.inputs[0]!.api).toBeNull();
    expect(f.inputs[0]!.renderedApi).toEqual([
      expect.objectContaining({ module: 'fixture/child', area: 'ordinary' }),
    ]);

    const root = JSON.parse(await f.view('module.json')) as { metrics: { contextSize: {
      exact: { views: { ordinaryBytes: number; testsBytes: number } };
      subtree: { views: { ordinaryBytes: number; testsBytes: number } } } } };
    const child = JSON.parse(await f.view('child/module.json')) as { metrics: { contextSize: {
      exact: { views: { ordinaryBytes: number; testsBytes: number } } } } };
    expect(child.metrics.contextSize.exact.views.ordinaryBytes).toBe(apiTargets[0]!.bytes);
    expect(root.metrics.contextSize.subtree.views).toEqual({
      ordinaryBytes: root.metrics.contextSize.exact.views.ordinaryBytes + child.metrics.contextSize.exact.views.ordinaryBytes,
      testsBytes: root.metrics.contextSize.exact.views.testsBytes + child.metrics.contextSize.exact.views.testsBytes,
    });
  });

  it('fixed omit policy keeps inventory measured, marks views not requested and still publishes selected API targets', async () => {
    const f = await architectFixture('omit');
    const pending = f.materialize(['api', 'architect']);
    await until(() => f.runs.length === 1, 'the dependency run');
    f.runs[0]!.settle(f.ready(await f.published()));
    const result = await pending;
    if (!result.ok || result.value.status !== 'materialized') throw new Error(JSON.stringify(result));
    expect(result.value.targets.map(target => target.view)).toEqual(['api', 'api', 'architect']);
    expect(f.inputs[0]!.api).not.toBeNull();
    expect(f.inputs[0]!.renderedApi).toBeUndefined();
    expect(JSON.parse(await f.view('module.json'))).toMatchObject({ metrics: { state: 'measured',
      views: { state: 'unavailable', reason: 'not-requested' }, contextSize: { exact: { production: { sourceFiles: 1 } } } } });
    const query = await f.measure();
    if (!query.ok || query.value.status !== 'measured') throw new Error(JSON.stringify(query));
    expect(query.value.document).toMatchObject({ schema: 'ramify.measure/2', revision: result.value.revision.revision,
      views: 'measured', modules: [{ id: 'fixture', exact: { production: { sourceFiles: 1 },
        views: { ordinaryBytes: expect.any(Number), testsBytes: expect.any(Number) } } }] });
    const architect = (JSON.parse(await f.view('module.json')) as { metrics: { contextSize: { exact: Record<string, unknown> } } }).metrics;
    const { views: _views, ...queryInventory } = query.value.document.modules[0]!.exact;
    expect(queryInventory).toEqual(architect.contextSize.exact);
    const first = await f.view('module.json');
    const repeat = await f.materialize(['api', 'architect']);
    expect(repeat).toMatchObject({ ok: true, value: { status: 'materialized', bytesWritten: 0 } });
    expect(await f.view('module.json')).toBe(first);
  });

  it('AV27 wait limit: publishes without dependencies when the facts are not ready within the limit, a running job included', async () => {
    const f = await architectFixture();
    const pending = f.materialize(['architect']);
    await until(() => f.runs.length === 1, 'the first run');
    // The limit is scheduled once, from the first request.
    expect(f.delays.filter(delayMs => delayMs === dependencyWait.limitMs)).toHaveLength(1);
    f.runs[0]!.settle({ status: 'inputs-changed', paths: ['src/index.ts'] });
    await until(() => f.pauses() === 1, 'the busy pause');
    f.environment.clock.advance(dependencyWait.intervalMs);
    await until(() => f.runs.length === 2, 'the second run');
    f.environment.clock.advance(dependencyWait.limitMs - dependencyWait.intervalMs - 1); await delay(20);
    expect(f.runs[1]!.signal.aborted).toBe(false);
    f.environment.clock.advance(1);
    const result = await pending;
    if (!result.ok || result.value.status !== 'materialized') throw new Error(JSON.stringify(result));
    expect(result.value.architect).toMatchObject({ dependencies: { unavailable: 'wait-limit' } });
    expect(f.runs[1]!.signal.aborted).toBe(true);
    expect(await f.meta()).toMatchObject({ dependencies: 'unavailable', dependencyReason: 'wait-limit', testReferences: 'unavailable' });
    expect(await f.view('tests.jsonl')).not.toContain('exercises');
  });

  it('AV27 unavailable: publishes the view with the reason of unavailable facts', async () => {
    const f = await architectFixture();
    for (const [outcome, reason] of [
      [{ status: 'unavailable', reason: 'analysis-failed', message: 'crashed' }, 'analysis-failed'],
      [{ status: 'unavailable', reason: 'resource-limit', message: 'too large' }, 'resource-limit'],
    ] as const) {
      const pending = f.materialize(['architect']);
      await until(() => f.runs.length === f.inputs.length + 1, 'the dependency run');
      f.runs.at(-1)!.settle(outcome);
      const result = await pending;
      expect(result, reason).toMatchObject({ ok: true, value: { status: 'materialized', architect: { dependencies: { unavailable: reason } } } });
      expect(await f.meta(), reason).toMatchObject({ dependencies: 'unavailable', dependencyReason: reason });
    }
  });

  it('AV27 superseded and cancelled: a newer revision or a cancellation during the wait publishes nothing', async () => {
    const f = await architectFixture();
    const pending = f.materialize(['api', 'architect']);
    await until(() => f.runs.length === 1, 'the dependency run');
    await writeFile(join(f.root, 'src/index.ts'), 'export function run(input: string): string { return input; }\nexport const value = 2;\n');
    const edited = await f.environment.service.check({ token: f.token, requestId: 'edit', freshness: { mode: 'synchronized', expect: [] } });
    if (!edited.ok || edited.value.status !== 'reported' || !edited.value.published) throw new Error('Expected publication');
    expect(await pending).toEqual({ ok: true, value: { status: 'superseded', requestId: 'materialize-1', revision: edited.value.revision } });
    expect(f.runs[0]!.signal.aborted).toBe(true);
    expect(f.inputs).toEqual([]);

    const controller = new AbortController();
    const cancelled = f.materialize(['architect'], { signal: controller.signal });
    await until(() => f.runs.length === 2, 'the second run');
    controller.abort();
    expect(await cancelled).toEqual({ ok: true, value: { status: 'cancelled', requestId: 'materialize-2' } });
    expect(f.runs[1]!.signal.aborted).toBe(true);
    expect(f.inputs).toEqual([]);
    await expect(readFile(join(f.root, '.ramify-architect/_meta.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(f.root, 'src/.ramify/_meta.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('carries the request deadline through metric rendering and dependency wait, then recovers', async () => {
    const f = await architectFixture();
    const limited = f.materialize(['architect'], undefined, 5);
    await until(() => f.runs.length === 1, 'the dependency run');
    f.environment.clock.advance(5);
    expect(await limited).toMatchObject({ ok: true, value: { status: 'deadline-exceeded', requestId: 'materialize-1', elapsedMs: 5 } });
    expect(f.inputs).toEqual([]);
    expect(f.runs[0]!.signal.aborted).toBe(true);

    const recovery = f.materialize(['architect']);
    await until(() => f.runs.length === 2, 'the recovery dependency run');
    f.runs[1]!.settle(f.ready(await f.published()));
    expect(await recovery).toMatchObject({ ok: true, value: { status: 'materialized' } });
  });

  it('AV25: validates views before any context work', async () => {
    const f = await architectFixture();
    const base = { token: f.token, requestId: 'invalid', freshness: { mode: 'synchronized', expect: [] }, selection: { scope: 'all' } };
    for (const views of [[], ['api', 'api'], ['other'], 'architect', [null]]) {
      expect(await f.environment.request('materialize', { ...base, views }), JSON.stringify(views)).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    }
    expect(f.runs).toEqual([]);
    expect(f.inputs).toEqual([]);
  });
});
