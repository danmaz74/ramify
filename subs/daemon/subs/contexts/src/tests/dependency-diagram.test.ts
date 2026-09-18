import { describe, expect, it } from 'vitest';
import type { AnalysisReport, RunControl } from '../../../../../analysis/src/interfaces/analysis.js';
import type { DependencyAnalyzerOutcome, DependencyDiagramRunner } from '../../../../../analysis/src/interfaces/dependency-analyzer.js';
import type { DependencyDiagramFacts, TestReferenceFacts } from '../../../../../analysis/src/interfaces/dependency-diagram.js';
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
const references = (inputId: string, files = 1): TestReferenceFacts => ({ inputId, files: Array.from({ length: files }, (_, index) => ({
  file: `src/tests/${String(index).padStart(6, '0')}.test.ts`, exercises: [{ kind: 'code', owner: 'fixture', file: 'a.ts', binding: 'a' }], unclassified: 1 })) });
/** The analyzer's test references ride beside the diagram; no `dependencyDiagram` answer below carries them. */
const ready = (diagram: DependencyDiagramFacts, testReferences: TestReferenceFacts | null = references(diagram.inputId)): DependencyAnalyzerOutcome =>
  ({ status: 'ready', diagram, testReferences, behaviorRuns: 1, timings: { acquireMs: 1, classifyMs: 1, projectMs: 1, totalMs: 3 } });
const bytes = (value: DependencyDiagramFacts | TestReferenceFacts) => Buffer.byteLength(JSON.stringify(value), 'utf8');
/** The retained bytes of a diagram and its default references. */
const retained = (diagram: DependencyDiagramFacts) => bytes(diagram) + bytes(references(diagram.inputId));

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

  it('AV40: the runner acquires with the request the published inputs were captured with, not the invocation the report echoes', async () => {
    const e = environment();
    try {
      const given: ProjectRequest = { cwd: '/fixture', root: '/fixture', scope: 'whole-project', configuration: 'discover' };
      const found: ProjectRequest = { cwd: '/fixture/subs/workspace', scope: 'whole-project', configuration: 'discover' };
      const { token, revision: opening } = await e.published();
      // Another invocation form reaches the context: the session republishes the same inputs with cause request.
      expect(await e.manager.open(found, { registry: 'default', capabilities: [] }, 'found')).toMatchObject({ status: 'opened', token, created: false });
      await e.check(token, { mode: 'synchronized', expect: [] }, {}, 'found');
      const republished = e.status(token).published!;
      expect([republished.sequence, republished.cause, republished.fingerprints.inputId]).toEqual([2, 'request', opening.fingerprints.inputId]);
      const report = await e.script.sessions[0]!.session.report(undefined, 2);
      expect(report!.request.project).toEqual(found);

      // The analyzer receives the report and the opening request its inputs were captured with.
      const first = e.diagram(token, republished.revision); await flush();
      expect(e.runs[0]!.input.report).toBe(report);
      expect(e.runs[0]!.input.project).toEqual(given);
      // A real input change still answers busy, and nothing is retained.
      e.runs[0]!.settle({ status: 'inputs-changed', paths: ['src/index.ts'] });
      expect(await first).toMatchObject({ status: 'busy', reason: 'inputs-changed' });

      // Cold: the session is released, and the retained report keeps its captured request.
      e.clock.advance(100); await flush(); e.clock.advance(200); await flush();
      expect(e.status(token)).toMatchObject({ level: 'cold', session: null, published: { sequence: 2 } });
      const cold = e.diagram(token, republished.revision); await flush();
      expect(e.runs[1]!.input.project).toEqual(given);
      const diagram = facts(republished.fingerprints.inputId);
      e.runs[1]!.settle(ready(diagram));
      expect(await cold).toMatchObject({ status: 'ready', diagram });

      // A session opened by the other form captures with that form's request.
      await e.check(token, { mode: 'synchronized', expect: [] }, {}, 'found');
      expect(e.script.sessions).toHaveLength(2);
      expect(e.script.sessions[1]!.project).toEqual(found);
      const reopened = e.status(token).published!;
      expect([reopened.sequence, reopened.cause]).toEqual([3, 'open']);
      const again = e.diagram(token, reopened.revision); await flush();
      expect(e.runs[2]!.input.project).toEqual(found);
      e.runs[2]!.settle(ready(facts(reopened.fingerprints.inputId)));
      expect(await again).toMatchObject({ status: 'ready' });
    } finally { await e.dispose(); }
  });

  it('BD19: an unknown context, an earlier generation and a manager without a runner start no work', async () => {
    const e = environment();
    const bare = sessionEnvironment();
    try {
      const { token, revision } = await e.published();
      // Another generation: its last digit changed, never to the one it has.
      const earlier = `${token.generation.slice(0, -1)}${token.generation.endsWith('0') ? '1' : '0'}`;
      expect(await e.diagram({ ...token, generation: earlier }, revision.revision))
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
      expect(e.status(token)).toMatchObject({ level: 'hot', retainedBytes: 100 + retained(diagram) });

      e.clock.advance(100); await flush();
      expect(e.status(token)).toMatchObject({ level: 'warm', retainedBytes: 100 + retained(diagram) });
      expect(await e.diagram(token, revision.revision)).toMatchObject({ status: 'ready', diagram });
      e.clock.advance(200); await flush();
      expect(e.status(token)).toMatchObject({ level: 'cold', session: null, retainedBytes: retained(diagram) });
      expect(await e.diagram(token, revision.revision)).toMatchObject({ status: 'ready', diagram });
      expect(e.runs).toHaveLength(1);
      e.clock.advance(200); await flush();
      expect(e.manager.list()).toHaveLength(0);
      expect(await e.diagram(token, revision.revision)).toMatchObject({ status: 'unavailable', reason: 'unknown-context' });

      const reopened = await e.published();
      const second = facts(reopened.revision.fingerprints.inputId, 20);
      const again = e.diagram(reopened.token, reopened.revision.revision); await flush();
      e.runs[1]!.settle(ready(second)); await again;
      expect(e.status(reopened.token).retainedBytes).toBe(100 + retained(second));
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


describe('ContextManager.dependencyFacts (C9)', () => {
  it('answers the diagram with the test references of the same run, retains both and serves them without another run', async () => {
    const e = environment();
    try {
      const { token, revision } = await e.published();
      const facts_ = (requestId: string) => e.manager.dependencyFacts({ token, requestId, revision: revision.revision }, 'lease');
      const diagram = facts(revision.fingerprints.inputId);
      const testReferences = references(diagram.inputId);
      // A facts caller and a diagram caller join one job; each receives its own answer.
      const first = facts_('facts-1'), joined = e.diagram(token, revision.revision); await flush();
      expect(e.runs).toHaveLength(1);
      e.runs[0]!.settle(ready(diagram, testReferences));
      expect(await first).toEqual({ status: 'ready', requestId: 'facts-1', revision, diagram, testReferences });
      expect(await joined).toEqual({ status: 'ready', requestId: 'diagram-1', revision, diagram });
      const retainedAnswer = await facts_('facts-2');
      expect(retainedAnswer).toEqual({ status: 'ready', requestId: 'facts-2', revision, diagram, testReferences });
      expect(Object.isFrozen(retainedAnswer.status === 'ready' && retainedAnswer.testReferences)).toBe(true);
      expect(await e.diagram(token, revision.revision)).toEqual({ status: 'ready', requestId: 'diagram-2', revision, diagram });
      expect(e.runs).toHaveLength(1);
      expect(e.status(token).retainedBytes).toBe(100 + bytes(diagram) + bytes(testReferences));
      // Every other answer is the diagram's: a newer revision supersedes the facts caller too.
      e.script.version = 2;
      await e.check(token, { mode: 'synchronized', expect: [] });
      expect(await facts_('facts-3')).toMatchObject({ status: 'superseded', revision: { sequence: 2 } });
    } finally { await e.dispose(); }
  });

  it('keeps null references from the analyzer, and retains a diagram without references that alone exceed a budget', async () => {
    const e = environment();
    try {
      const { token, revision } = await e.published();
      const diagram = facts(revision.fingerprints.inputId);
      const pending = e.manager.dependencyFacts({ token, requestId: 'null', revision: revision.revision }, 'lease'); await flush();
      e.runs[0]!.settle(ready(diagram, null));
      expect(await pending).toMatchObject({ status: 'ready', diagram, testReferences: null });
      expect(e.status(token).retainedBytes).toBe(100 + bytes(diagram));
    } finally { await e.dispose(); }

    for (const budget of ['maxRetainedBytesPerContext', 'maxRetainedBytesGlobal'] as const) {
      const probe = environment();
      let limit: number;
      try {
        const { token, revision } = await probe.published();
        const diagram = facts(revision.fingerprints.inputId);
        // The budget admits the diagram alone and one byte less than the diagram with its references.
        limit = (budget === 'maxRetainedBytesPerContext' ? 100 : probe.status(token).history.bytes + 100) + bytes(diagram)
          + bytes(references(diagram.inputId, 20)) - 1;
      } finally { await probe.dispose(); }
      const bounded = environment({ [budget]: limit });
      try {
        const { token, revision } = await bounded.published();
        const diagram = facts(revision.fingerprints.inputId);
        const pending = bounded.manager.dependencyFacts({ token, requestId: budget, revision: revision.revision }, 'lease'); await flush();
        bounded.runs[0]!.settle(ready(diagram, references(diagram.inputId, 20)));
        expect(await pending, budget).toEqual({ status: 'ready', requestId: budget, revision, diagram, testReferences: null });
        expect(bounded.status(token).retainedBytes, budget).toBe(100 + bytes(diagram));
        expect(await bounded.diagram(token, revision.revision), budget).toMatchObject({ status: 'ready', diagram });
      } finally { await bounded.dispose(); }
    }
  });

  it('refuses references of another input as an invalid outcome and retains nothing', async () => {
    const e = environment();
    try {
      const { token, revision } = await e.published();
      const diagram = facts(revision.fingerprints.inputId);
      const pending = e.manager.dependencyFacts({ token, requestId: 'other', revision: revision.revision }, 'lease'); await flush();
      e.runs[0]!.settle(ready(diagram, references('input/1:other')));
      expect(await pending).toMatchObject({ status: 'unavailable', reason: 'analysis-failed',
        message: `The test references input input/1:other is not the diagram's ${diagram.inputId}` });
      expect(e.status(token).retainedBytes).toBe(100);
    } finally { await e.dispose(); }
  });
});
