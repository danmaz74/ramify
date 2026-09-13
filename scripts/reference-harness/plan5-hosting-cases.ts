import { createHook } from 'node:async_hooks';
import { channel } from 'node:diagnostics_channel';
import { cp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { analyzeProject } from '../../subs/analysis/src/analyze-project.js';
import type { AnalysisReport } from '../../subs/analysis/src/interfaces/analysis.js';
import type { RetainedSession, SessionInputs, SessionRevision, SessionUpdate } from '../../subs/analysis/src/interfaces/session.js';
import { openRetainedSession } from '../../subs/analysis/src/retained-session.js';
import type { SessionWorker } from '../../subs/analysis/src/session-supervisor.js';
import { materializeSynthetic } from '../measurements/materialize.js';
import { firstDifference } from './equivalence-comparison.js';
import { coreDirectory, referenceRoot } from './fixtures/plan2/reference.js';
import { replaceExactlyOnce } from './mutation.js';
import { recordObservation } from './observations.js';
import { applyTextMutation, residentTextMutations } from './resident-mutations.js';
import { inspectPlainReport, sessionInputs } from './session-expectations.js';
import type { Assertions, InstanceHandler, ProjectContext } from './runner.js';

const sessionLimits = { updateDeadlineMs: 2_000, sweepIntervalMs: 30_000, workerHeapMiB: 512, maxRetainedFactBytes: 96 * 1024 ** 2 };
// The deadline witness retains two broad S1000 versions and an audit candidate.
// This is continued-work evidence, not acceptance of the default memory budget.
const s1000DeadlineLimits = { ...sessionLimits, workerHeapMiB: 1024, maxRetainedFactBytes: 256 * 1024 ** 2 };
const coreCatalog = `${coreDirectory}/src/catalog.ts`;
const reviewsRouter = 'subs/workspace/subs/reviews/src/router.ts';
const zodDeclaration = 'node_modules/zod/index.d.cts';
const timingKeys = ['accesses', 'classify', 'compiler', 'decide', 'descriptions', 'inventory', 'link', 'publish', 'total'];
const comparable = (report: AnalysisReport): unknown => ({ ...report, runId: 'compared' });
const pause = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));

interface WorkerObservation {
  readonly worker: SessionWorker;
  readonly threads: number[];
  readonly online: number[];
  readonly exits: number[];
}

/** The parent handle reports the real thread's lifecycle from its supervisor. */
function observeWorkers(): { readonly workers: WorkerObservation[]; readonly stop: () => void } {
  const workers: WorkerObservation[] = [];
  const detach: (() => void)[] = [];
  const capture = (message: unknown): void => {
    const worker = (message as { worker: SessionWorker }).worker;
    const observation: WorkerObservation = { worker, threads: [], online: [], exits: [] };
    workers.push(observation);
    const created = (id: number): void => { observation.threads.push(id); };
    const online = (): void => { observation.online.push(worker.threadId); };
    const exited = (code: number): void => { observation.exits.push(code); };
    worker.on('thread-created', created); worker.on('online', online); worker.on('exit', exited);
    detach.push(() => { worker.off('thread-created', created); worker.off('online', online); worker.off('exit', exited); });
  };
  const events = channel('ramify:session-worker');
  events.subscribe(capture);
  return { workers, stop: () => { events.unsubscribe(capture); for (const remove of detach) remove(); } };
}

function inputs(root: string, limits = sessionLimits): SessionInputs {
  return { ...sessionInputs(root), session: limits };
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}

async function gone(pid: number | null): Promise<boolean> {
  const deadline = Date.now() + 5_000;
  while (pid !== null && alive(pid) && Date.now() < deadline) await pause(10);
  return pid === null || !alive(pid);
}

async function dispose(session: RetainedSession, assertions: Assertions): Promise<void> {
  const pid = session.status().compiler.pid;
  await session.dispose();
  await session.dispose();
  assertions.ok('disposal reaps the last compiler process', await gone(pid));
  assertions.equal('disposal releases current and historical facts', [session.current, session.status().factBytes, await session.report()], [null, 0, null]);
}

interface Context { readonly root: string; readonly assertions: Assertions; readonly session: RetainedSession }

async function open(root: string, assertions: Assertions, limits = sessionLimits): Promise<Extract<Awaited<ReturnType<typeof openRetainedSession>>, { status: 'opened' }>> {
  const opened = await openRetainedSession(inputs(root, limits));
  if (opened.status !== 'opened') throw new Error(`The worker session did not open: ${JSON.stringify(opened).slice(0, 4000)}`);
  try {
    assertions.equal('the cold worker revision completed without findings', [opened.revision.outcome.execution, opened.revision.summary.errors], ['completed', 0]);
    assertions.equal('a cold worker publishes exactly its first revision', [opened.revision.sequence, opened.session.current?.sequence], [1, 1]);
    assertions.equal('the cold worker is hot and owns a compiler process', [opened.session.status().level, typeof opened.session.status().compiler.pid], ['hot', 'number']);
    assertions.ok('the compiler PID identifies a live process', alive(opened.session.status().compiler.pid!));
    return opened;
  } catch (error) { await opened.session.dispose(); throw error; }
}

async function withSession(context: ProjectContext, run: (context: Context, cold: SessionRevision) => Promise<void>, synthetic = false, limits = sessionLimits): Promise<void> {
  const root = synthetic ? join(context.root, 'synthetic') : context.root;
  const opened = await open(root, context.assertions, limits);
  try { await run({ ...context, root, session: opened.session }, opened.revision); }
  finally { await dispose(opened.session, context.assertions); }
}

/** Save the projection before an audit can repair it; compare every batch field. */
async function equalBatch({ root, session, assertions }: Context, name: string): Promise<AnalysisReport> {
  const report = await session.report();
  if (!report) throw new Error(`${name}: the current report is absent`);
  const audit = await session.verify();
  assertions.equal(`${name}: the session audit reports equal`, audit.status, 'equal');
  const expected = await analyzeProject(sessionInputs(root));
  if (expected.status !== 'reported') throw new Error(`${name}: the batch oracle was cancelled`);
  assertions.equal(`${name}: all report fields equal batch except runId`, firstDifference(comparable(expected.report), comparable(report)), null);
  return report;
}

function revised(assertions: Assertions, name: string, result: SessionUpdate | { readonly status: 'unchanged' }): SessionRevision {
  recordObservation('plan5-hosting-update', { name, status: result.status,
    ...(result.status === 'reported' ? { outcome: result.report.outcome, diagnostics: result.report.diagnostics } : {}),
    ...(result.status === 'revised' ? { sequence: result.revision.sequence, checked: result.revision.checked.path } : {}) });
  assertions.equal(`${name}: the update publishes a changed revision`, [result.status, result.status === 'revised' && result.identical], ['revised', false]);
  if (result.status !== 'revised') throw new Error(`${name}: ${JSON.stringify(result).slice(0, 2000)}`);
  return result.revision;
}

async function bodyEdit(root: string): Promise<string> {
  await replaceExactlyOnce(join(root, coreCatalog), 'return chain;', 'return chain.slice();');
  return coreCatalog;
}

async function configurationEdit(root: string): Promise<void> {
  // Both reviewed fixtures use JSONC-compatible TypeScript configurations.
  await replaceExactlyOnce(join(root, 'tsconfig.json'), '"compilerOptions": {',
    '"compilerOptions": {\n    "noFallthroughCasesInSwitch": true,');
}

/** Each dependency mutation uses a private declaration, never a symlink target. */
async function prepareReference(root: string): Promise<void> {
  const source = join(referenceRoot, 'node_modules'), target = join(root, 'node_modules');
  await mkdir(target);
  for (const entry of await readdir(source)) {
    if (entry === 'zod') await cp(join(source, entry), join(target, entry), { recursive: true, dereference: true });
    else await symlink(join(source, entry), join(target, entry));
  }
}

const referenceHandler = {
  kind: 'project' as const,
  fixture: { kind: 'copy' as const, sourceRoot: referenceRoot },
  prepare: ({ root }: { readonly root: string }) => prepareReference(root),
  baseline: async ({ root, assertions }: ProjectContext) => {
    assertions.ok('the reference fixture contains the selected body edit anchor', (await readFile(join(root, coreCatalog), 'utf8')).includes('return chain;'));
    assertions.ok('the reference dependency declaration is materialized', (await readFile(join(root, zodDeclaration), 'utf8')).length > 0);
  },
  mutate: async () => {},
};

const syntheticHandler = {
  kind: 'project' as const,
  fixture: { kind: 'create' as const, create: async (root: string) => {
    recordObservation('plan5-hosting-fixture', await materializeSynthetic(join(root, 'synthetic'), 'S1000'));
  } },
  baseline: async ({ root, assertions }: ProjectContext) => {
    assertions.equal('the synthetic fixture materializes its thousandth owner', (await readFile(join(root, 'synthetic/subs/m999/module.ramify'), 'utf8')).split('\n')[1], 'module "m999" tagged []');
    assertions.ok('the synthetic fixture includes real source bytes', (await readFile(join(root, 'synthetic/subs/m999/src/impl0.ts'), 'utf8')).includes('export function run0'));
  },
  mutate: async () => {},
};

const handlers = new Map<string, InstanceHandler>();

handlers.set('I5-08:worker-nonblocking', {
  ...syntheticHandler,
  run: async (context: ProjectContext) => {
    const ticks: number[] = [performance.now()];
    const timer = setInterval(() => ticks.push(performance.now()), 10);
    let opened: Awaited<ReturnType<typeof open>> | undefined;
    try {
      opened = await open(join(context.root, 'synthetic'), context.assertions);
      ticks.push(performance.now());
      clearInterval(timer);
      const gaps = ticks.slice(1).map((tick, index) => tick - ticks[index]);
      recordObservation('plan5-worker-responsiveness', { fixture: 'S1000', ticks: ticks.length, maximumGapMs: Math.max(...gaps), status: opened.session.status() });
      context.assertions.ok('the host timer keeps ticking throughout a real cold S1000 open', ticks.length > 10);
      context.assertions.ok('no pair of timer ticks is separated by more than 100 ms', Math.max(...gaps) <= 100);
      context.assertions.equal('the worker cold revision includes all thousand owners', opened.revision.summary.owners, 1000);
      const revision = inspectPlainReport(opened.revision);
      context.assertions.ok('the cold revision is frozen plain data without a report snapshot', revision.objects > 0 && !('snapshot' in opened.revision));
      recordObservation('plan5-worker-revision-message', { fixture: 'S1000', revisionBytes: revision.bytes, frozenObjects: revision.objects });
    } finally { clearInterval(timer); if (opened) await dispose(opened.session, context.assertions); }
  },
});

handlers.set('I5-08:resource-limit-explicit', {
  ...syntheticHandler,
  run: async ({ root, assertions }: ProjectContext) => {
    const observation = observeWorkers();
    let opened: Awaited<ReturnType<typeof openRetainedSession>> | undefined;
    try {
      opened = await openRetainedSession(inputs(join(root, 'synthetic'), { ...sessionLimits, workerHeapMiB: 8 }));
      assertions.equal('an undersized S1000 worker produces an unpublished engine report', opened.status, 'reported');
      if (opened.status !== 'reported') throw new Error('The undersized worker did not report resource unavailability');
      assertions.equal('the attempt creates exactly one supervised worker handle', observation.workers.length, 1);
      assertions.ok('the supervisor reports a real resource-limited thread before failure',
        observation.workers.every(item => item.threads.length === 1 && item.threads[0] > 0));
      assertions.ok('the failed worker exits and its supervisor process is reaped',
        observation.workers.every(item => item.worker.threadId === -1 && item.exits.length === 1 && !alive(item.worker.pid)));
      assertions.equal('the failed worker cannot claim completed execution', opened.report.outcome.execution, 'unavailable');
      assertions.ok('the report contains the explicit resource-limit diagnostic', opened.report.diagnostics.some(item => item.code === 'resource-limit'));
      assertions.equal('no session handle or published revision escapes the failed open', ['session' in opened, 'revision' in opened], [false, false]);
      recordObservation('plan5-worker-resource-limit', { fixture: 'S1000', workerHeapMiB: 8,
        workers: observation.workers.map(item => ({ supervisorPid: item.worker.pid, threadIds: item.threads, onlineIds: item.online,
          exitCodes: item.exits, finalThreadId: item.worker.threadId })), outcome: opened.report.outcome, diagnostics: opened.report.diagnostics });
    } finally {
      try { if (opened?.status === 'opened') await opened.session.dispose(); }
      finally { observation.stop(); }
    }
  },
});

handlers.set('I5-08:warm-demotion-rebuild', {
  ...referenceHandler,
  run: (context: ProjectContext) => withSession(context, async (current, cold) => {
    const { session, assertions, root } = current;
    const before = session.status();
    await session.releaseCompiler();
    const warm = session.status();
    assertions.equal('demotion keeps the revision, observations and exact fact size', [warm.level, warm.sequence, warm.observedInputs, warm.factBytes, session.current], ['warm', before.sequence, before.observedInputs, before.factBytes, cold]);
    assertions.equal('demotion releases compiler identity and accounting', warm.compiler, { pid: null, rss: null });
    assertions.ok('demotion actually reaps the old compiler', await gone(before.compiler.pid));
    const path = await bodyEdit(root);
    const revision = revised(assertions, 'warm rebuild', await session.update([{ path, kind: 'changed' }]));
    assertions.equal('the next edit rebuilds broadly and publishes once', [revision.checked.path, revision.sequence, session.status().level], ['broad', cold.sequence + 1, 'hot']);
    assertions.ok('the rebuilt compiler is a different live process', session.status().compiler.pid !== before.compiler.pid && alive(session.status().compiler.pid!));
    assertions.equal('the rebuilt facts retain a clean project', revision.summary.errors, 0);
    await equalBatch(current, 'warm rebuild');
    recordObservation('plan5-worker-levels', { before, warm, rebuilt: session.status(), checked: revision.checked });
  }),
});

handlers.set('I5-08:sweep-scheduled', {
  ...referenceHandler,
  run: (context: ProjectContext) => withSession(context, async (current, cold) => {
    const { session, root, assertions } = current;
    assertions.equal('a settled sweep reports unchanged', (await session.sweep()).status, 'unchanged');
    assertions.equal('an unchanged sweep publishes no revision', session.current?.sequence, cold.sequence);
    assertions.ok('a completed sweep records its time', session.status().lastSweepAt !== null);
    const before = session.status().lastSweepAt!;
    const path = join(root, zodDeclaration);
    await writeFile(path, `${await readFile(path, 'utf8')}\nexport declare const hostingSweepWitness: number;\n`);
    const revision = revised(assertions, 'dependency sweep', await session.sweep());
    assertions.ok('the sweep finds the changed dependency without an event', revision.changed.includes(zodDeclaration));
    assertions.equal('dependency re-observation runs broad analysis once', [revision.checked.path, revision.sequence], ['broad', cold.sequence + 1]);
    assertions.ok('the new sweep advances its completion timestamp', session.status().lastSweepAt! >= before);
    await equalBatch(current, 'dependency sweep');
    assertions.equal('the next settled sweep has no change', (await session.sweep()).status, 'unchanged');
    recordObservation('plan5-worker-sweep', { trigger: 'dependency', changed: revision.changed, lastSweepAt: session.status().lastSweepAt });
  }),
});

handlers.set('I5-08:sweep-after-configuration', {
  ...referenceHandler,
  run: (context: ProjectContext) => withSession(context, async (current, cold) => {
    await configurationEdit(current.root);
    const revision = revised(current.assertions, 'configuration sweep', await current.session.sweep());
    current.assertions.equal('the undelivered configuration edit causes one broad revision', [revision.checked.path, revision.sequence], ['broad', cold.sequence + 1]);
    current.assertions.ok('the changed input list includes the configuration', revision.changed.includes('tsconfig.json'));
    current.assertions.ok('the configuration receives a new input identity', revision.inputId !== cold.inputId);
    const report = await equalBatch(current, 'configuration sweep');
    current.assertions.equal('the revision identity equals the batch capture identity', revision.inputId, report.inputId);
    current.assertions.equal('a settled configuration sweep is unchanged', (await current.session.sweep()).status, 'unchanged');
    recordObservation('plan5-worker-sweep', { trigger: 'configuration', inputId: revision.inputId, changed: revision.changed });
  }),
});

handlers.set('I5-08:deadline-exceeded-explicit', {
  ...syntheticHandler,
  run: (context: ProjectContext) => withSession(context, async (current, cold) => {
    recordObservation('plan5-worker-deadline-capacity', { fixture: 'S1000', defaults: sessionLimits, configured: s1000DeadlineLimits,
      acceptance: 'continued work after caller wait; not default memory budget acceptance' });
    await configurationEdit(current.root);
    const acknowledgedSequence = current.session.current!.sequence;
    const started = performance.now();
    let complete = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The reviewed session port has cancellation, but no deadline outcome.
    // This caller owns only its wait; contexts owns the wire outcome in I5-09.
    const update = current.session.update([{ path: 'tsconfig.json', kind: 'changed' }]).then(value => { complete = true; return value; });
    try {
      const result = await Promise.race([
        update.then(value => ({ status: 'session-completed' as const, value })),
        new Promise<{ readonly status: 'caller-deadline'; readonly sequence: number }>(resolve => {
          timer = setTimeout(() => resolve({ status: 'caller-deadline', sequence: acknowledgedSequence }), 200);
        }),
      ]);
      current.assertions.equal('the 200 ms caller wait expires with its acknowledgment sequence', result, { status: 'caller-deadline', sequence: cold.sequence });
      current.assertions.equal('the session is still doing the requested work at the caller deadline', complete, false);
      const elapsedMs = performance.now() - started;
      const revision = revised(current.assertions, 'update after caller deadline', await update);
      current.assertions.equal('the uncancelled session publishes the broad revision after the wait expires', [revision.checked.path, revision.sequence, current.session.current?.sequence], ['broad', cold.sequence + 1, cold.sequence + 1]);
      current.assertions.equal('the eventual result has completed execution without a synthetic deadline outcome', [revision.outcome.execution, revision.summary.errors], ['completed', 0]);
      await equalBatch(current, 'S1000 after caller deadline');
      recordObservation('plan5-worker-caller-deadline', { fixture: 'S1000', deadlineMs: 200, elapsedMs, acknowledgedSequence, publishedSequence: revision.sequence });
    } finally { if (timer) clearTimeout(timer); await update; }
  }, true, s1000DeadlineLimits),
});

handlers.set('I5-08:timings-recorded', {
  ...referenceHandler,
  run: (context: ProjectContext) => withSession(context, async (current, cold) => {
    const revisions = [cold];
    const edit = async (name: string, paths: readonly string[], expected: SessionRevision['checked']['path']): Promise<void> => {
      const revision = revised(current.assertions, name, await current.session.update(paths.map(path => ({ path, kind: 'changed' }))));
      current.assertions.equal(`${name}: the intended path actually ran`, revision.checked.path, expected);
      revisions.push(revision);
      await equalBatch(current, name);
    };
    await edit('body edit', [await bodyEdit(current.root)], 'unchanged-surface');
    await replaceExactlyOnce(join(current.root, reviewsRouter), "import type { ProtocolFacilities } from '../../../../../src/interfaces/protocol.js';\n", "import type { ProtocolFacilities } from '../../../../../src/interfaces/protocol.js';\nimport type { RevisionScope } from '../../contracts/src/interfaces/vocabulary.js';\n");
    await edit('source import', [reviewsRouter], 'source');
    await edit('description exposure', await applyTextMutation(current.root, residentTextMutations['remove-hop']), 'description');
    await edit('README metadata', await applyTextMutation(current.root, residentTextMutations['readme-edit']), 'metadata');
    await configurationEdit(current.root);
    await edit('configuration broad', ['tsconfig.json'], 'broad');
    current.assertions.equal('the recorded sequence covers every revision path exactly once', revisions.map(revision => revision.checked.path), ['cold', 'unchanged-surface', 'source', 'description', 'metadata', 'broad']);
    for (const revision of revisions) {
      const name = revision.checked.path;
      current.assertions.equal(`${name}: all timing fields are present`, Object.keys(revision.timings).sort(), timingKeys);
      current.assertions.ok(`${name}: each timing is finite and non-negative`, Object.values(revision.timings).every(value => Number.isFinite(value) && value >= 0));
      current.assertions.ok(`${name}: total covers every measured phase`, Object.values(revision.timings).every(value => value <= revision.timings.total));
      current.assertions.ok(`${name}: the published message is frozen plain data`, inspectPlainReport(revision).objects > 0);
    }
    const metadata = revisions.find(revision => revision.checked.path === 'metadata')!;
    current.assertions.equal('metadata does no compiler, link or decision work', [metadata.timings.compiler, metadata.timings.link, metadata.timings.decide], [0, 0, 0]);
    const status = current.session.status();
    current.assertions.ok('status accounts for worker heap and process RSS', status.worker.heapUsed > 0 && status.worker.rss >= status.worker.heapUsed);
    current.assertions.ok('status accounts for the live compiler RSS', status.compiler.rss !== null && status.compiler.rss > 0);
    current.assertions.equal('status records the published sequence and observed count', [status.sequence, status.observedInputs], [current.session.current!.sequence, current.session.current!.inputs.length]);
    recordObservation('plan5-worker-timings', revisions.map(revision => ({ path: revision.checked.path, sequence: revision.sequence, timings: revision.timings })));
  }),
});

handlers.set('I5-08:dispose-releases', {
  ...referenceHandler,
  run: async (context: ProjectContext) => {
    const observation = observeWorkers();
    const resources = new Map<number, { readonly type: string; destroyed: boolean }>();
    const hook = createHook({
      init(id, type) { if (['WORKER', 'PROCESSWRAP', 'PIPEWRAP', 'MESSAGEPORT', 'Timeout', 'FSEVENTWRAP'].includes(type)) resources.set(id, { type, destroyed: false }); },
      destroy(id) { const resource = resources.get(id); if (resource) resource.destroyed = true; },
    }).enable();
    let opened: Awaited<ReturnType<typeof open>> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      opened = await open(context.root, context.assertions);
      context.assertions.equal('the session owns exactly one supervised worker handle', observation.workers.length, 1);
      context.assertions.ok('the supervisor reports a live worker thread and online event', observation.workers.every(item =>
        item.threads.length === 1 && item.online.length === 1 && item.worker.threadId === item.threads[0]
        && item.online[0] === item.worker.threadId && item.worker.threadId > 0 && alive(item.worker.pid)));
      const session = opened.session;
      // Sweep scheduling is owned by the caller. Its timer has the same
      // lifetime as its session and is cancelled before releasing the handle.
      let sweeps = 0;
      timer = setTimeout(() => { sweeps++; void session.sweep(); }, 30_000);
      context.assertions.ok('disposal starts with a scheduled sweep', timer.hasRef());
      clearTimeout(timer);
      await dispose(session, context.assertions);
      opened = undefined;
      // Resource destroy callbacks are delivered after termination settles.
      for (let index = 0; index < 4; index++) await new Promise<void>(resolve => setImmediate(resolve));
      context.assertions.ok('every real worker exited and every supervisor process was reaped', observation.workers.every(item =>
        item.worker.threadId === -1 && item.exits.length === 1 && !alive(item.worker.pid)));
      context.assertions.equal('every process, worker, pipe and message port created by the session was destroyed',
        [...resources.values()].filter(resource => ['WORKER', 'PROCESSWRAP', 'PIPEWRAP', 'MESSAGEPORT'].includes(resource.type) && !resource.destroyed), []);
      context.assertions.equal('no session timer or watcher handle remains', [...resources.values()].filter(resource => ['Timeout', 'FSEVENTWRAP'].includes(resource.type) && !resource.destroyed), []);
      context.assertions.equal('the cancelled sweep never runs after disposal', sweeps, 0);
      recordObservation('plan5-worker-disposal', { resources: [...resources.values()],
        workers: observation.workers.map(item => ({ supervisorPid: item.worker.pid, threadIds: item.threads, onlineIds: item.online,
          exitCodes: item.exits, finalThreadId: item.worker.threadId })), compilerGone: true, timerCancelled: true });
    } finally {
      if (timer) clearTimeout(timer);
      try { if (opened) await opened.session.dispose(); }
      finally { hook.disable(); observation.stop(); }
    }
  },
});

export const plan5HostingHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
