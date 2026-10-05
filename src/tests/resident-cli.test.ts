import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { createQuickEnvironment } from './quick-environment.js';
import type { QuickEnvironment } from './quick-environment.js';
import { fixture, put } from './fixture.js';
import { runCli } from '../../subs/cli/src/run-cli.js';
import type { CheckDocument, WatchLine } from '../../subs/cli/src/interfaces/cli.js';
import type { CheckOutcome, ContextEvent } from '../../subs/daemon/src/context-types.js';
import type { CheckParams } from '../interfaces/service.js';
import { analyzeDependencyDiagram } from '../../subs/analysis/src/index.js';
import type { AnalysisReport, DependencyAnalyzerOutcome, DependencyDiagramRunner, ProjectRequest } from '../../subs/analysis/src/index.js';
import { createFilesystemApiViewPublisher } from '../../subs/daemon/src/api-view-publisher.js';
import type { ApiViewPublisher, PublishApiViewOutcome, PublishInput } from '../../subs/daemon/src/interfaces/daemon.js';
import { limits } from '../batch.js';
import { dependencyAnalyzerCapacity } from '../dependency-analyzer-process.js';
import { residentPublishLimits } from '../resident-assembly.js';

async function until(predicate: () => boolean): Promise<void> {
  const deadline = performance.now() + 15_000;
  while (!predicate()) { if (performance.now() >= deadline) throw new Error('Expected watch state did not arrive'); await delay(5); }
}

/** Capture the public CLI boundary while the quick adapter runs real analysis. */
async function invokeResident(quick: QuickEnvironment, cwd: string, argv: readonly string[]) {
  const stdout: string[] = [], stderr: string[] = [];
  const requests: CheckParams[] = [], outcomes: CheckOutcome[] = [];
  let batchCalls = 0;
  const exitCode = await runCli(argv, { cwd, version: '0.0.0',
    stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); },
    batch: async () => { batchCalls++; throw new Error('Resident command unexpectedly invoked batch'); },
    connect: async options => {
      const connected = await quick.connect(options);
      if (connected.status !== 'connected') return connected;
      return { ...connected, connection: { ...connected.connection, check: async (params, control) => {
        requests.push(structuredClone(params));
        const result = await connected.connection.check(params, control);
        if (result.ok) outcomes.push(result.value);
        return result;
      } } };
    },
  });
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join(''), writes: stdout.length,
    batchCalls, requests, outcomes };
}

function checkDocument(result: Awaited<ReturnType<typeof invokeResident>>): CheckDocument {
  expect(result.writes).toBe(1);
  expect(result.stderr).toBe('');
  expect(result.batchCalls).toBe(0);
  const document = JSON.parse(result.stdout) as CheckDocument;
  expect(document.schemaVersion).toBe('ramify.check/2');
  expect(document.exitCode).toBe(result.exitCode);
  return document;
}

async function expectReleased(quick: QuickEnvironment): Promise<void> {
  const status = await quick.service.daemonStatus();
  if (!status.ok) throw new Error('Expected daemon status after CLI completion');
  expect(status.value.connections).toBe(0);
  expect(status.value.subscriptions).toBe(0);
  for (const context of status.value.contexts) {
    expect(context.leases).toEqual({ subscriptions: 0, requests: 0 });
    expect(context.pending.requests).toBe(0);
  }
}

describe('changed-file CLI through the real resident service', () => {
  it('discovers the whole root, hashes multiple paths in the CLI and reuses a covering revision', () => fixture(async root => {
    const quick = await createQuickEnvironment();
    try {
      const paths = ['src/interfaces/api.ts', 'subs/consumer/src/use.ts'];
      const expected = await Promise.all(paths.map(async path => ({ path,
        sha256: createHash('sha256').update(await readFile(join(root, path))).digest('hex') })));
      const args = ['check', '--changed', ...paths, '--deadline', '10000', '--format', 'json'];
      const cwd = join(root, 'subs/consumer/src');
      const first = await invokeResident(quick, cwd, args), document = checkDocument(first);
      expect(first.exitCode).toBe(0);
      // The first request obtains the daemon's classification of both paths; both are
      // analyzed source, so the second carries the CLI's hashes of both.
      expect(first.requests).toHaveLength(2);
      expect(first.requests[0]).toMatchObject({ scope: 'delta', deadlineMs: 10_000, paths, classification: null,
        freshness: { mode: 'synchronized', expect: [] } });
      expect(first.requests[1]).toMatchObject({ scope: 'delta', paths, classification: 1,
        freshness: { mode: 'synchronized', expect: expected } });
      const modules = ['fixture', 'fixture/consumer'];
      expect(document).toMatchObject({ root, outcome: 'checked', reason: null, execution: 'completed',
        paths: expected.map((content, index) => ({ ...content, disposition: 'checked', module: modules[index], exclusion: null, reason: 'content' })),
        findings: [], removed: [], revision: { path: 'cold' }, checked: { path: 'cold' } });
      expect(document.revision?.id).toMatch(/^rev\/1:/);
      expect(document.timings.daemon?.total).toBeGreaterThanOrEqual(0);
      expect(document.timings.waitedMs).toBeGreaterThanOrEqual(0);
      expect(document.timings.totalMs).toBeGreaterThanOrEqual(document.timings.waitedMs);
      expect(first.outcomes).toEqual([expect.objectContaining({ status: 'classification-changed' }),
        expect.objectContaining({ status: 'reported', published: true, report: null })]);

      const before = await quick.service.daemonStatus();
      const second = await invokeResident(quick, cwd, args), reused = checkDocument(second);
      const after = await quick.service.daemonStatus();
      expect(reused.revision).toEqual(document.revision);
      expect(second.outcomes).toEqual([expect.objectContaining({ status: 'classification-changed' }),
        expect.objectContaining({ status: 'reported', published: true, report: null,
          freshness: expect.objectContaining({ verified: true, reusedRevision: true, captureStarted: null }) })]);
      if (!before.ok || !after.ok) throw new Error('Expected daemon counters');
      expect(after.value.counters.analyses).toBe(before.value.counters.analyses);
      expect(after.value.counters.coveredRequests).toBe(before.value.counters.coveredRequests + 1);
      await expectReleased(quick);
    } finally { await quick.dispose(); }
    expect(quick.watcher.active).toBe(0);
    expect(quick.clock.pending).toBe(0);
  }), 30_000);

  it('reports importer findings after a provider edit, marks new and removed identities, and keeps plain JSON bare', () => fixture(async root => {
    const quick = await createQuickEnvironment();
    try {
      const args = ['check', '--changed', 'module.ramify', '--format', 'json'];
      const initial = checkDocument(await invokeResident(quick, root, args));
      expect(initial.exitCode).toBe(0);
      if (!initial.revision) throw new Error('Expected initial covering revision');
      const originalDescription = await readFile(join(root, 'module.ramify'), 'utf8');
      await put(root, 'module.ramify', 'ramify 1\nroot module fixture\n');
      const deniedResult = await invokeResident(quick, root, [...args, '--since', initial.revision.id]);
      const denied = checkDocument(deniedResult);
      expect(denied).toMatchObject({ outcome: 'checked', execution: 'completed', exitCode: 1, since: initial.revision.id,
        paths: [{ path: 'module.ramify', disposition: 'checked', module: 'fixture', exclusion: null, reason: 'content',
          sha256: createHash('sha256').update('ramify 1\nroot module fixture\n').digest('hex') }] });
      expect(denied.findings).toEqual([expect.objectContaining({ code: 'not-visible', new: true,
        location: expect.objectContaining({ file: 'subs/consumer/src/use.ts' }) })]);
      if (!denied.revision) throw new Error('Expected denial covering revision');
      expect(denied.revision.sequence).toBeGreaterThan(initial.revision.sequence);
      const outcome = deniedResult.outcomes.at(-1);
      if (outcome?.status !== 'reported' || !outcome.published) throw new Error('Expected published daemon outcome');
      expect(denied.revision.path).toBe(outcome.revision.checked.path);
      expect(denied.checked).toEqual(outcome.revision.checked);

      const repeated = checkDocument(await invokeResident(quick, root, [...args, '--since', denied.revision.id]));
      expect(repeated.exitCode).toBe(1);
      expect(repeated.revision).toEqual(denied.revision);
      expect(repeated.findings).toEqual(denied.findings.map(finding => ({ ...finding, new: false })));
      expect(repeated.removed).toEqual([]);
      const plain = await invokeResident(quick, root, ['check', '--format', 'json']);
      expect(plain.exitCode).toBe(1);
      expect(plain.writes).toBe(1);
      expect(plain.stderr).toBe('');
      expect(plain.batchCalls).toBe(0);
      const report = JSON.parse(plain.stdout);
      expect(report.schemaVersion).toBe('ramify.analysis/2');
      expect(report).not.toHaveProperty('revision');
      expect(report).not.toHaveProperty('mode');
      expect(report).not.toHaveProperty('findings');
      expect(report.diagnostics).toEqual(denied.findings.map(({ new: _new, ...finding }) => finding));
      expect(report.snapshot).not.toBeNull();
      const lean = await invokeResident(quick, root, ['check', '--format', 'json', '--no-snapshot']);
      expect([lean.exitCode, lean.writes, lean.stderr, lean.batchCalls]).toEqual([1, 1, '', 0]);
      expect(JSON.parse(lean.stdout)).toEqual({ ...report, runId: expect.any(String), snapshot: null });

      await put(root, 'module.ramify', originalDescription);
      const repaired = checkDocument(await invokeResident(quick, root, [...args, '--since', denied.revision.id]));
      expect(repaired).toMatchObject({ outcome: 'checked', execution: 'completed', exitCode: 0,
        findings: [], removed: denied.findings.map(finding => finding.id) });
      await expectReleased(quick);
    } finally { await quick.dispose(); }
  }), 30_000);

  it('covers an observed deletion as absent, leaves a never-observed owned path not analyzed and refuses an outside path', () => fixture(async root => {
    const quick = await createQuickEnvironment();
    try {
      const path = 'subs/consumer/src/use.ts';
      // Keep a real compiler probe of the deleted path in the current inputs.
      // An unreferenced deleted source is no longer observed by batch or session.
      await put(root, 'subs/consumer/src/keep.ts', "import './use.js';\n");
      const args = ['check', '--changed', path, '--format', 'json'];
      expect(checkDocument(await invokeResident(quick, root, args)).exitCode).toBe(0);
      await rm(join(root, path));
      const result = await invokeResident(quick, root, args), deleted = checkDocument(result);
      expect(result.requests[1]?.freshness).toEqual({ mode: 'synchronized', expect: [{ path, sha256: null }] });
      expect(deleted).toMatchObject({ outcome: 'checked', exitCode: 0, findings: [],
        paths: [{ path, disposition: 'checked', module: 'fixture/consumer', exclusion: null, reason: 'deleted', sha256: null }] });
      expect(deleted.coverage).toEqual([expect.objectContaining({ code: 'unresolved-target',
        location: expect.objectContaining({ file: 'subs/consumer/src/keep.ts' }) })]);

      // An owned path that is no file and no analysis input is one the complete check does
      // not analyze: not analyzed, and the healthy project's exit 0 stands.
      const inert = checkDocument(await invokeResident(quick, root, ['check', '--changed', 'never-observed.txt', '--format', 'json']));
      expect(inert).toMatchObject({ outcome: 'checked', reason: null, exitCode: 0,
        paths: [{ path: 'never-observed.txt', disposition: 'not-analyzed', module: 'fixture', exclusion: null, reason: 'owned-non-source' }] });
      const outside = checkDocument(await invokeResident(quick, root, ['check', '--changed', '../outside.ts', '--format', 'json']));
      expect(outside).toMatchObject({ outcome: 'not-checked', reason: 'unobserved-input', exitCode: 2,
        paths: [{ disposition: 'not-checked', reason: 'unobserved-input' }] });
      await expectReleased(quick);
    } finally { await quick.dispose(); }
  }), 30_000);

  it('refuses an evicted since revision instead of inventing new-finding marks', () => fixture(async root => {
    const quick = await createQuickEnvironment({ maxHistoryRevisions: 1 });
    try {
      const path = 'subs/consumer/src/use.ts', args = ['check', '--changed', path, '--format', 'json'];
      const first = checkDocument(await invokeResident(quick, root, args));
      if (!first.revision) throw new Error('Expected first covering revision');
      await put(root, path, "import { value } from '../../../src/interfaces/api.js'; void value;\n// Later revision\n");
      const current = checkDocument(await invokeResident(quick, root, args));
      expect(current.exitCode).toBe(0);
      expect(current.revision?.sequence).toBeGreaterThan(first.revision.sequence);
      const result = await invokeResident(quick, root, [...args, '--since', first.revision.id]);
      expect(result.requests[0]?.since).toBe(first.revision.id);
      expect(checkDocument(result)).toMatchObject({ outcome: 'not-checked', reason: 'evicted-revision',
        since: first.revision.id, exitCode: 2, findings: [] });
      await expectReleased(quick);
    } finally { await quick.dispose(); }
  }), 30_000);
});

describe('changed-path dispositions through the real resident service', () => {
  it('gives the complete check\'s verdict with each named path classified by the project\'s ownership', () => fixture(async root => {
    // An owned-ignored tree with its own manifest, inert prose, a scratch file and an
    // unreferenced source; the session's observer and Project's classifier are real.
    await put(root, 'module.ramify', 'ramify 1\nroot module fixture\nowned-ignored "vendor"\nexpose-src value from "interfaces/api.ts" to descendants\n');
    await put(root, 'vendor/package.json', '{"name":"vendor"}');
    await put(root, 'vendor/src/broken.ts', "import { nothing } from './missing.js';\n");
    await put(root, 'docs/guide.md', '# Guide\n');
    await put(root, 'src/tmp/scratch.ts', 'export const scratch = 1;\n');
    await put(root, 'src/extra.ts', 'export const extra = 1;\n');
    const quick = await createQuickEnvironment();
    const changed = async (...named: string[]) => {
      const result = await invokeResident(quick, root, ['check', '--changed', ...named, '--deadline', '10000', '--format', 'json']);
      return { document: checkDocument(result), requests: result.requests };
    };
    const brief = (document: CheckDocument) => document.paths.map(item => [item.path, item.disposition, item.module, item.reason]);
    try {
      const clean = await changed('src/extra.ts');
      expect([clean.document.exitCode, brief(clean.document)]).toEqual([0, [['src/extra.ts', 'checked', 'fixture', 'content']]]);
      // A manifest inside the owned-ignored tree is not analyzed and no configuration change.
      const manifest = await changed('vendor/package.json', 'docs/guide.md', 'src/tmp/scratch.ts');
      expect([manifest.document.exitCode, manifest.document.outcome, manifest.document.reason]).toEqual([0, 'checked', null]);
      expect(brief(manifest.document)).toEqual([['vendor/package.json', 'not-analyzed', 'fixture', 'owned-ignored'],
        ['docs/guide.md', 'not-analyzed', 'fixture', 'owned-non-source'], ['src/tmp/scratch.ts', 'not-analyzed', 'fixture', 'scratch']]);
      // Neither the ignored tree's nor the scratch file's bytes were sent; the inert file's were.
      expect(manifest.requests.map(request => request.freshness.mode === 'synchronized' ? request.freshness.expect.map(item => item.path) : null))
        .toEqual([[], ['docs/guide.md']]);
      expect(manifest.document.paths.filter(item => item.disposition !== 'checked').every(item => !('sha256' in item))).toBe(true);
      // Deleting the unreferenced source is checked by its removal.
      await rm(join(root, 'src/extra.ts'));
      const deleted = await changed('src/extra.ts');
      expect([deleted.document.exitCode, deleted.document.paths]).toEqual([0,
        [{ path: 'src/extra.ts', disposition: 'checked', module: 'fixture', exclusion: null, reason: 'deleted', sha256: null }]]);
      // With a definite violation in the project, naming only not-analyzed paths gives the
      // complete check's exit 1 and its findings.
      await put(root, 'subs/consumer/src/use.ts', "import { privateValue } from '../../../src/interfaces/api.js'; void privateValue;\n");
      const denied = await changed('subs/consumer/src/use.ts');
      expect(denied.document.exitCode).toBe(1);
      const ignored = await changed('vendor/package.json', 'vendor/src/broken.ts');
      expect([ignored.document.exitCode, ignored.document.outcome, brief(ignored.document)]).toEqual([1, 'checked',
        [['vendor/package.json', 'not-analyzed', 'fixture', 'owned-ignored'], ['vendor/src/broken.ts', 'not-analyzed', 'fixture', 'owned-ignored']]]);
      expect(ignored.document.findings.map(finding => [finding.code, finding.location?.file])).toEqual([['not-visible', 'subs/consumer/src/use.ts']]);
      const complete = await invokeResident(quick, root, ['check', '--format', 'json', '--no-snapshot']);
      expect(complete.exitCode).toBe(ignored.document.exitCode);
      expect((JSON.parse(complete.stdout) as AnalysisReport).diagnostics.map(item => item.id)).toEqual(ignored.document.findings.map(item => item.id));
      await expectReleased(quick);
    } finally { await quick.dispose(); }
  }), 60_000);
});

describe('resident CLI status and eviction stream', () => {
  it('prints real watcher failure status and an eviction before attempting a reopen', async () => {
    await fixture(async root => {
      const quick = await createQuickEnvironment();
      const lines: WatchLine[] = [];
      const controller = new AbortController();
      let deliver: ((event: ContextEvent) => void) | undefined;
      const running = runCli(['watch', '--format', 'json'], { cwd: root, version: '0.0.0', batch: quick.batch,
        stdout: line => { lines.push(JSON.parse(line) as WatchLine); }, stderr() {},
        connect: async options => {
          const result = await quick.connect(options);
          if (result.status !== 'connected') return result;
          return { ...result, connection: { ...result.connection, subscribe: (params, listener) => {
            deliver = listener; return result.connection.subscribe(params, listener);
          } } };
        } }, { signal: controller.signal });
      try {
        await until(() => lines.some(line => line.event === 'revision'));
        quick.watcher.emit(root, [{ path: '.', kind: 'error' }]);
        await until(() => lines.some(line => line.event === 'status' && line.current.watcher === 'unavailable'));
        const first = lines.find(line => line.event === 'status');
        if (first?.event !== 'status') throw new Error('No status');
        // Inject only an event at the CLI boundary; the real service still owns
        // opening, subscriptions, reports and cleanup on either side of it.
        deliver!({ type: 'context-evicted', token: { ...first.current.token, generation: `gen/1:${randomUUID()}` }, reason: 'pressure' });
        await until(() => lines.some(line => line.event === 'evicted'));
        const index = lines.findIndex(line => line.event === 'evicted');
        expect(lines[index]).toEqual({ schemaVersion: 'ramify.watch/2', event: 'evicted', reason: 'pressure' });
        await until(() => lines.slice(index + 1).some(line => line.event === 'status'));
        controller.abort(); expect(await running).toBe(130);
        const status = await quick.service.daemonStatus();
        expect(status.ok && status.value.subscriptions).toBe(0);
      } finally { controller.abort(); await running; await quick.dispose(); }
    });
  }, 30_000);
});

describe('resident materialize with views (AV28)', () => {
  it('publishes the API and architect views in one transaction from one revision and prints the architect line', () => fixture(async root => {
    // A function the consumer calls in production and in its test, so dependencies and test references are both measured.
    await put(root, 'module.ramify', 'ramify 1\nroot module fixture\nexpose-src value, run from "interfaces/api.ts" to descendants\n');
    await put(root, 'src/interfaces/api.ts', 'export const value: number = 1; export const privateValue = 2;\nexport function run(): number { return value; }\n');
    await put(root, 'subs/consumer/src/use.ts', "import { run } from '../../../src/interfaces/api.js'; run();\n");
    await put(root, 'subs/consumer/src/tests/use.test.ts',
      "import { run } from '../../../../src/interfaces/api.js';\ndescribe('use', () => { it('runs', () => { run(); }); });\n");
    const runs: DependencyAnalyzerOutcome[] = [];
    // The analyzer in process, over the same report the process runner would receive.
    const dependencyDiagrams: DependencyDiagramRunner = { async run(input, control) {
      const outcome = await analyzeDependencyDiagram({ ...input, limits: { source: limits.source,
        maxResultBytes: dependencyAnalyzerCapacity.maxResultBytes, deadlineMs: dependencyAnalyzerCapacity.analysisDeadlineMs } }, control);
      runs.push(outcome); return outcome;
    } };
    const publishes: { readonly revision: string; readonly input: PublishInput; readonly outcome: PublishApiViewOutcome }[] = [];
    const filesystem = createFilesystemApiViewPublisher(residentPublishLimits);
    const publisher: ApiViewPublisher = { async publish(target, revision, input, requestId, control) {
      const outcome = await filesystem.publish(target, revision, input, requestId, control);
      publishes.push({ revision, input, outcome }); return outcome;
    } };
    const quick = await createQuickEnvironment({}, { dependencyDiagrams, publisher });
    try {
      const stdout: string[] = [], stderr: string[] = [];
      const exitCode = await runCli(['materialize', '--view', 'api', '--view', 'architect', '--all'], { cwd: root, version: '0.0.0',
        stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); }, connect: quick.connect,
        batch: async () => { throw new Error('Resident command unexpectedly invoked batch'); } });
      expect([exitCode, stderr.join('')]).toEqual([0, '']);
      // One publish call carried both views, and published every target of both: the API areas, then the architect view.
      expect(publishes).toHaveLength(1);
      const [publish] = publishes;
      expect(publish!.input.api).toBeNull();
      expect(publish!.input.renderedApi).toHaveLength(3);
      expect(publish!.input.architect).toMatchObject({ modules: 2, dependencies: 'measured' });
      if (publish!.outcome.status !== 'published') throw new Error(JSON.stringify(publish!.outcome));
      expect(publish!.outcome.targets.map(target => [target.view, target.path])).toEqual([['api', 'src/.ramify'],
        ['api', 'subs/consumer/src/.ramify'], ['api', 'subs/consumer/src/tests/.ramify'], ['architect', '.ramify-architect']]);
      const lines = stdout.join('').split('\n');
      expect(lines).toHaveLength(4);
      expect(lines[0]).toBe(`Root: ${root}`);
      expect(lines[1]).toMatch(/^Materialized: revision 1; 4 target\(s\), \d+ entries, \d+ bytes written, 0 unchanged$/);
      expect(lines.slice(2)).toEqual([`Architect view: .ramify-architect, 2 modules, ${publish!.input.architect!.records} records, dependencies measured`, '']);
      expect(runs.map(outcome => outcome.status)).toEqual(['ready']);

      const meta = JSON.parse(await readFile(join(root, '.ramify-architect/_meta.json'), 'utf8')) as Record<string, unknown>;
      const apiMeta = JSON.parse(await readFile(join(root, 'src/.ramify/_meta.json'), 'utf8')) as Record<string, unknown>;
      expect(meta).toMatchObject({ schema: 'ramify.architect-view/2', revision: publish!.revision, modules: 2, dependencies: 'measured',
        testReferences: 'measured' });
      expect(apiMeta).toMatchObject({ schema: 'ramify.api-view/1', revision: publish!.revision });
      // The consumer's production call and its test's call, from the same analyzer run.
      expect(await readFile(join(root, '.ramify-architect/behavior.jsonl'), 'utf8')).toContain('"behavioral":["fixture/consumer"]');
      expect(await readFile(join(root, '.ramify-architect/consumer/tests.jsonl'), 'utf8')).toContain('"exercises":["fixture#run"]');
      await expectReleased(quick);
    } finally { await quick.dispose(); }
  }), 60_000);
});

describe('resident materialize after another invocation form reached the context (AV40)', () => {
  const analyzerLimits = { source: limits.source, maxResultBytes: dependencyAnalyzerCapacity.maxResultBytes,
    deadlineMs: dependencyAnalyzerCapacity.analysisDeadlineMs };
  it.each([
    ['check from the root, then materialize naming the root from another directory', false, true],
    ['check --root ., then materialize from the root without --root', true, false],
  ] as const)('%s: the analyzer verifies the captured request and the view has measured dependencies', (_name, given, elsewhere) => fixture(async root => {
    await put(root, 'module.ramify', 'ramify 1\nroot module fixture\nexpose-src value, run from "interfaces/api.ts" to descendants\n');
    await put(root, 'src/interfaces/api.ts', 'export const value: number = 1; export const privateValue = 2;\nexport function run(): number { return value; }\n');
    await put(root, 'subs/consumer/src/use.ts', "import { run } from '../../../src/interfaces/api.js'; run();\n");
    const runs: { readonly project: ProjectRequest; readonly report: AnalysisReport; readonly outcome: DependencyAnalyzerOutcome }[] = [];
    const dependencyDiagrams: DependencyDiagramRunner = { async run(input, control) {
      const outcome = await analyzeDependencyDiagram({ ...input, limits: analyzerLimits }, control);
      runs.push({ ...input, outcome }); return outcome;
    } };
    const other = await realpath(await mkdtemp(join(tmpdir(), 'ramify-cli-elsewhere-')));
    const quick = await createQuickEnvironment({}, { dependencyDiagrams });
    try {
      const opened = await invokeResident(quick, root, given ? ['check', '--root', '.'] : ['check']);
      expect([opened.exitCode, opened.stderr]).toEqual([0, '']);
      const stdout: string[] = [], stderr: string[] = [];
      const exitCode = await runCli(['materialize', '--view', 'architect', ...(elsewhere ? ['--root', root] : [])], { cwd: elsewhere ? other : root,
        version: '0.0.0', stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); }, connect: quick.connect,
        batch: async () => { throw new Error('Resident command unexpectedly invoked batch'); } });
      expect([exitCode, stderr.join('')]).toEqual([0, '']);
      expect(stdout.join('').split('\n')[2]).toMatch(/^Architect view: \.ramify-architect, 2 modules, \d+ records, dependencies measured$/);
      // The context republished its inputs for the materializing invocation; the analyzer ran once, with the opening request.
      const status = await quick.service.daemonStatus();
      if (!status.ok) throw new Error('Expected daemon status');
      expect(status.value.contexts.map(context => [context.published?.sequence, context.published?.cause])).toEqual([[2, 'request']]);
      expect(runs.map(run => run.outcome.status)).toEqual(['ready']);
      const [run] = runs;
      const opening: ProjectRequest = { cwd: root, ...(given ? { root: '.' } : {}), scope: 'whole-project', configuration: 'discover' };
      expect(run!.project).toEqual(opening);
      expect(run!.report.request.project).toEqual({ cwd: elsewhere ? other : root, ...(elsewhere ? { root } : {}),
        scope: 'whole-project', configuration: 'discover' });
      expect(await readFile(join(root, '.ramify-architect/behavior.jsonl'), 'utf8')).toContain('"behavioral":["fixture/consumer"]');
      // A real input change still answers inputs-changed for the same request and report.
      await put(root, 'subs/consumer/src/use.ts', "import { run } from '../../../src/interfaces/api.js'; run(); run();\n");
      expect(await analyzeDependencyDiagram({ project: run!.project, report: run!.report, limits: analyzerLimits }))
        .toEqual({ status: 'inputs-changed', paths: ['subs/consumer/src/use.ts'] });
      await expectReleased(quick);
    } finally { await quick.dispose(); await rm(other, { recursive: true, force: true }); }
  }), 60_000);
});
