import { describe, expect, it } from 'vitest';
import type { AnalysisReport, RunControl } from '../../../../../analysis/src/interfaces/analysis.js';
import type { DependencyAnalyzerOutcome, DependencyDiagramRunner } from '../../../../../analysis/src/interfaces/dependency-analyzer.js';
import type { DependencyDiagramFacts } from '../../../../../analysis/src/interfaces/dependency-diagram.js';
import type { ProjectRequest } from '../../../../../analysis/subs/project/src/interfaces/project.js';
import type { ContextBudgets, ContextToken } from '../interfaces/contexts.js';
import { capture, flush, testBudgets } from './scripted-driver.js';
import { sessionEnvironment } from './session-fixture.js';

interface Run {
  readonly input: { readonly project: ProjectRequest; readonly report: AnalysisReport };
  readonly signal: AbortSignal;
  settle(outcome: DependencyAnalyzerOutcome): void;
}

/** A controllable runner: each run waits until the test settles it, as a process runner
 * settles only once its child has exited. `cancelOnAbort` settles an aborted run itself. */
function controlledRunner(cancelOnAbort = false) {
  const runs: Run[] = [];
  const runner: DependencyDiagramRunner = {
    run(input, control?: RunControl) {
      return new Promise(resolve => {
        const signal = control!.signal!;
        runs.push({ input, signal, settle: resolve });
        if (cancelOnAbort) signal.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true });
      });
    },
  };
  return { runner, runs };
}

function facts(inputId: string, padding = 0): DependencyDiagramFacts {
  return { inputId, modules: ['fixture', ...Array.from({ length: padding }, (_, index) => `padding-${String(index).padStart(6, '0')}`)],
    headline: { behavioralDependencies: 1, nonBehavioralDependencies: 2 }, boundaries: [],
    coverage: { state: 'complete', unknownDependencies: 0, limitIds: [] } };
}
/** The analyzer's test references ride beside the diagram; no answer below carries them. */
const ready = (diagram: DependencyDiagramFacts): DependencyAnalyzerOutcome =>
  ({ status: 'ready', diagram, testReferences: { inputId: diagram.inputId, files: [{ file: 'src/tests/a.test.ts',
    exercises: [{ kind: 'code', owner: 'fixture', file: 'a.ts', binding: 'a' }], unclassified: 1 }] },
  behaviorRuns: 1, timings: { acquireMs: 1, classifyMs: 1, projectMs: 1, totalMs: 3 } });
const bytes = (diagram: DependencyDiagramFacts) => Buffer.byteLength(JSON.stringify(diagram), 'utf8');

function environment(budgets: Partial<ContextBudgets> = {}, cancelOnAbort = false) {
  const controlled = controlledRunner(cancelOnAbort);
  const e = sessionEnvironment({ warmIdleMs: 100, coldRetainMs: 200, sweepIntervalMs: 60_000, ...budgets }, undefined, controlled.runner);
  let sequence = 0;
  const diagram = (token: ContextToken, revision: string, control?: RunControl, lease = 'lease') =>
    e.manager.dependencyDiagram({ token, requestId: `diagram-${++sequence}`, revision }, lease, control);
  async function published(root = '/fixture') {
    const opened = await e.open(root); await flush();
    const revision = e.status(opened.token).published!;
    return { token: opened.token, revision };
  }
  return { ...e, runs: controlled.runs, diagram, published };
}

describe('ContextManager.dependencyDiagram', () => {
  it('BD19: answers superseded, invalid-current, ready from retained, join, busy and start in order; busy starts no work', async () => {
    const e = environment();
    try {
      const { token, revision } = await e.published();
      const calls = e.script.calls.length;
      expect(await e.diagram(token, revision.revision.replace(/:1$/, ':9'))).toEqual({ status: 'superseded', requestId: 'diagram-1', revision });
      expect(e.runs).toHaveLength(0);

      // Start: the runner receives the published report and its own resolved request.
      const first = e.diagram(token, revision.revision); await flush();
      expect(e.runs).toHaveLength(1);
      const report = await e.script.sessions[0]!.session.report(undefined, 1);
      expect(e.runs[0]!.input.report).toBe(report);
      expect(e.runs[0]!.input.project).toEqual(report!.request.project);
      // The job enters neither the context queue nor the retained session's analysis operations.
      expect(e.script.calls.length).toBe(calls);
      expect(e.status(token)).toMatchObject({ pending: { analysisRunning: false, requests: 1 } });

      // Join: an equal request waits for the same job.
      const joined = e.diagram(token, revision.revision); await flush();
      expect(e.runs).toHaveLength(1);

      // Busy: another context's request during the job starts nothing.
      const other = await e.published('/other');
      expect(await e.diagram(other.token, other.revision.revision)).toEqual({ status: 'busy', requestId: 'diagram-4',
        revision: other.revision, reason: 'analysis-running' });
      expect(e.runs).toHaveLength(1);

      const diagram = facts(revision.fingerprints.inputId);
      e.runs[0]!.settle(ready(diagram));
      const answers = await Promise.all([first, joined]);
      expect(answers).toEqual([{ status: 'ready', requestId: 'diagram-2', revision, diagram },
        { status: 'ready', requestId: 'diagram-3', revision, diagram }]);
      expect(Object.isFrozen(answers[0]!.status === 'ready' && answers[0].diagram)).toBe(true);

      // Ready from the retained result: ten more requests run nothing.
      for (let index = 0; index < 10; index++) {
        expect(await e.diagram(token, revision.revision)).toMatchObject({ status: 'ready', revision, diagram });
      }
      expect(e.runs).toHaveLength(1);

      // Superseded precedes the retained result, and invalid-current precedes starting a job.
      e.script.pending.push(() => capture(2, 'invalid'));
      await e.check(token, { mode: 'synchronized', expect: [] });
      const invalid = e.status(token).published!;
      expect(invalid.outcome.execution).toBe('invalid');
      expect(await e.diagram(token, revision.revision)).toMatchObject({ status: 'superseded', revision: invalid });
      expect(await e.diagram(token, invalid.revision)).toMatchObject({ status: 'unavailable', reason: 'invalid-current' });
      expect(e.runs).toHaveLength(1);
    } finally { await e.dispose(); }
  });

  it('BD19: an unknown context, an earlier generation and a manager without a runner start no work', async () => {
    const e = environment();
    const bare = sessionEnvironment();
    try {
      const { token, revision } = await e.published();
      expect(await e.diagram({ ...token, generation: `${token.generation.slice(0, -1)}0` }, revision.revision))
        .toMatchObject({ status: 'unavailable', reason: 'expired-generation' });
      expect(await e.diagram({ context: `ctx/1:${'0'.repeat(64)}`, generation: token.generation }, revision.revision))
        .toMatchObject({ status: 'unavailable', reason: 'unknown-context' });
      const cancelled = new AbortController(); cancelled.abort();
      expect(await e.diagram(token, revision.revision, { signal: cancelled.signal })).toEqual({ status: 'cancelled', requestId: 'diagram-3' });
      expect(e.runs).toHaveLength(0);
      const opened = await bare.open(); await flush();
      expect(await bare.manager.dependencyDiagram({ token: opened.token, requestId: 'bare',
        revision: bare.status(opened.token).published!.revision }, 'lease')).toMatchObject({ status: 'unavailable', reason: 'resource-unavailable' });
    } finally { await e.dispose(); await bare.dispose(); }
  });

  it('BD20: one caller cancellation leaves the job for the other; the last cancellation aborts it', async () => {
    const e = environment();
    try {
      const { token, revision } = await e.published();
      const one = new AbortController(), two = new AbortController();
      const first = e.diagram(token, revision.revision, { signal: one.signal });
      const second = e.diagram(token, revision.revision, { signal: two.signal }); await flush();
      expect(e.runs).toHaveLength(1);
      one.abort();
      expect(await first).toEqual({ status: 'cancelled', requestId: 'diagram-1' });
      expect(e.runs[0]!.signal.aborted).toBe(false);
      two.abort();
      expect(await second).toEqual({ status: 'cancelled', requestId: 'diagram-2' });
      expect(e.runs[0]!.signal.aborted).toBe(true);
      // The aborted job keeps the daemon's slot until its runner settles.
      expect(await e.diagram(token, revision.revision)).toMatchObject({ status: 'busy', reason: 'analysis-running' });
      e.runs[0]!.settle({ status: 'cancelled' }); await flush();
      expect(e.status(token).retainedBytes).toBe(100);
      // A new request starts a new job; nothing restarted on its own.
      expect(e.runs).toHaveLength(1);
      const third = e.diagram(token, revision.revision); await flush();
      expect(e.runs).toHaveLength(2);
      // Releasing the caller's lease detaches it like a cancellation.
      e.manager.release('lease');
      expect(await third).toEqual({ status: 'cancelled', requestId: 'diagram-4' });
      expect(e.runs[1]!.signal.aborted).toBe(true);
      e.runs[1]!.settle({ status: 'cancelled' }); await flush();
    } finally { await e.dispose(); }
  });

  it('BD21: a newer publication aborts the job and supersedes its callers; inputs-changed answers busy; nothing is retained or restarted', async () => {
    const e = environment();
    try {
      const { token, revision } = await e.published();
      const waiting = e.diagram(token, revision.revision); await flush();
      e.script.version = 2;
      await e.check(token, { mode: 'synchronized', expect: [] });
      const newer = e.status(token).published!;
      expect(newer.sequence).toBe(2);
      expect(await waiting).toEqual({ status: 'superseded', requestId: 'diagram-1', revision: newer });
      expect(e.runs[0]!.signal.aborted).toBe(true);
      // A late ready outcome from the aborted job is discarded.
      expect(await e.diagram(token, newer.revision)).toMatchObject({ status: 'busy', reason: 'analysis-running' });
      e.runs[0]!.settle(ready(facts(revision.fingerprints.inputId))); await flush();
      expect(e.status(token).retainedBytes).toBe(100);
      expect(e.runs).toHaveLength(1);

      const changed = e.diagram(token, newer.revision); await flush();
      expect(e.runs).toHaveLength(2);
      e.runs[1]!.settle({ status: 'inputs-changed', paths: ['src/index.ts'] });
      expect(await changed).toEqual({ status: 'busy', requestId: 'diagram-3', revision: newer, reason: 'inputs-changed' });
      await flush();
      expect(e.status(token).retainedBytes).toBe(100);
      expect(e.runs).toHaveLength(2);
      expect(e.status(token)).toMatchObject({ pending: { requests: 0 } });
    } finally { await e.dispose(); }
  });

  it('BD21: maps failed and cancelled runner outcomes without retention', async () => {
    const e = environment();
    try {
      const { token, revision } = await e.published();
      const outcomes: [DependencyAnalyzerOutcome, unknown][] = [
        [{ status: 'unavailable', reason: 'resource-limit', message: 'too large' }, { status: 'unavailable', reason: 'resource-limit', message: 'resource-limit: too large' }],
        [{ status: 'unavailable', reason: 'invalid-report', message: 'bad' }, { status: 'unavailable', reason: 'analysis-failed', message: 'invalid-report: bad' }],
        [{ status: 'unavailable', reason: 'analysis-failed', message: 'crashed' }, { status: 'unavailable', reason: 'analysis-failed', message: 'analysis-failed: crashed' }],
        [{ status: 'cancelled' }, { status: 'cancelled' }],
        [ready(facts('input/1:other')), { status: 'unavailable', reason: 'analysis-failed' }],
      ];
      for (const [index, [outcome, expected]] of outcomes.entries()) {
        const pending = e.diagram(token, revision.revision); await flush();
        e.runs[index]!.settle(outcome);
        expect(await pending).toMatchObject(expected as object);
        expect(e.status(token).retainedBytes).toBe(100);
      }
    } finally { await e.dispose(); }
  });

  it('BD22: the retained result counts in retainedBytes, survives demotion and cooling, and is released on publication and eviction', async () => {
    const e = environment();
    try {
      const { token, revision } = await e.published();
      const diagram = facts(revision.fingerprints.inputId, 20);
      const pending = e.diagram(token, revision.revision); await flush();
      e.runs[0]!.settle(ready(diagram)); await pending;
      expect(e.status(token)).toMatchObject({ level: 'hot', retainedBytes: 100 + bytes(diagram) });

      e.clock.advance(100); await flush();
      expect(e.status(token)).toMatchObject({ level: 'warm', retainedBytes: 100 + bytes(diagram) });
      expect(await e.diagram(token, revision.revision)).toMatchObject({ status: 'ready', diagram });
      e.clock.advance(200); await flush();
      expect(e.status(token)).toMatchObject({ level: 'cold', session: null, retainedBytes: bytes(diagram) });
      expect(await e.diagram(token, revision.revision)).toMatchObject({ status: 'ready', diagram });
      expect(e.runs).toHaveLength(1);
      e.clock.advance(200); await flush();
      expect(e.manager.list()).toHaveLength(0);
      expect(await e.diagram(token, revision.revision)).toMatchObject({ status: 'unavailable', reason: 'unknown-context' });

      const reopened = await e.published();
      const second = facts(reopened.revision.fingerprints.inputId, 20);
      const again = e.diagram(reopened.token, reopened.revision.revision); await flush();
      e.runs[1]!.settle(ready(second)); await again;
      expect(e.status(reopened.token).retainedBytes).toBe(100 + bytes(second));
      e.script.version = 3;
      await e.check(reopened.token, { mode: 'synchronized', expect: [] });
      expect(e.status(reopened.token)).toMatchObject({ published: { sequence: 2 }, retainedBytes: 100 });
    } finally { await e.dispose(); }
  });

  it('BD22: exceeding the per-context or global retained budget returns resource-limit without retention', async () => {
    const diagramPadding = 400;
    const perContext = environment({ maxRetainedBytesPerContext: 1000 });
    try {
      const { token, revision } = await perContext.published();
      const diagram = facts(revision.fingerprints.inputId, diagramPadding);
      const pending = perContext.diagram(token, revision.revision); await flush();
      perContext.runs[0]!.settle(ready(diagram));
      expect(await pending).toMatchObject({ status: 'unavailable', reason: 'resource-limit',
        message: `Retaining the dependency diagram needs ${100 + bytes(diagram)} bytes in its context; the maximum is 1000` });
      expect(perContext.status(token).retainedBytes).toBe(100);
    } finally { await perContext.dispose(); }

    const global = environment({ maxRetainedBytesGlobal: 8_000 });
    try {
      const { token, revision } = await global.published();
      const diagram = facts(revision.fingerprints.inputId, diagramPadding);
      const used = global.status(token).history.bytes + 100;
      expect(used + bytes(diagram)).toBeGreaterThan(8_000);
      expect(bytes(diagram) + 100).toBeLessThan(testBudgets.maxRetainedBytesPerContext);
      const pending = global.diagram(token, revision.revision); await flush();
      global.runs[0]!.settle(ready(diagram));
      expect(await pending).toMatchObject({ status: 'unavailable', reason: 'resource-limit',
        message: `Retaining the dependency diagram needs ${used + bytes(diagram)} bytes in the daemon; the maximum is 8000` });
      expect(global.status(token).retainedBytes).toBe(100);
    } finally { await global.dispose(); }
  });

  it('BD22: close aborts the running job, answers its callers and releases the result', async () => {
    const e = environment({}, true);
    const { token, revision } = await e.published();
    const pending = e.diagram(token, revision.revision); await flush();
    await e.dispose();
    expect(await pending).toMatchObject({ status: 'unavailable', reason: 'disposed' });
    expect(e.runs[0]!.signal.aborted).toBe(true);
  });
});

