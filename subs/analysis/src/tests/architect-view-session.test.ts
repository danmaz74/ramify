import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { openRetainedSession } from '../retained-session.js';
import { planArchitectView, projectArchitectView } from '../architect-view.js';
import type { ArchitectViewQuery, ArchitectViewQueryOutcome } from '../interfaces/architect-view.js';
import type { RetainedSession, SessionInputs } from '../interfaces/session.js';
import type { SessionState } from '../session-revision.js';
import { architectLimits, architectPaths as paths, architectProject } from './architect-fixture.js';
import { instrumentCompiler, opened, revisionsEntered, timeout } from './session-test-fixture.js';
import { frozenPlain, workerSuite } from './session-worker-fixture.js';

/**
 * The compiler operations' run counters in this process. The retained adapter
 * of an in-process session runs `describeExportShapes` and `describeTestTitles`
 * here, as the session worker runs them in the resident.
 */
const counters = vi.hoisted(() => ({ shapeRuns: undefined as (() => number) | undefined,
  testTitleRuns: undefined as (() => number) | undefined }));
vi.mock('../../subs/typescript/src/export-shapes.js', async importOriginal => {
  const actual = await importOriginal<{ shapeRuns(): number }>();
  counters.shapeRuns = actual.shapeRuns;
  return actual;
});
vi.mock('../../subs/typescript/src/test-titles.js', async importOriginal => {
  const actual = await importOriginal<{ testTitleRuns(): number }>();
  counters.testTitleRuns = actual.testTitleRuns;
  return actual;
});
const runs = (): { shapes: number; titles: number } => ({ shapes: counters.shapeRuns!(), titles: counters.testTitleRuns!() });

const query = (sequence: number, limits: Partial<Omit<ArchitectViewQuery, 'sequence'>> = {}): ArchitectViewQuery =>
  ({ sequence, ...architectLimits, ...limits });
const featureText = (root: string): Promise<string> => readFile(join(root, paths.feature), 'utf8');

/** Independent oracle: the plan, the compiler operations and the projection run directly over the same retained state. */
async function oracle(state: SessionState, root: string, sequence: number, inputId: string): Promise<ArchitectViewQueryOutcome> {
  const facts = state.facts!;
  const plan = planArchitectView(facts);
  if (plan.status !== 'planned') return plan;
  return projectArchitectView(facts, sequence, inputId, {
    details: await state.adapter!.details(plan.requests, architectLimits.details),
    shapes: await state.adapter!.shapes(plan.requests),
    tests: await state.adapter!.testTitles(plan.testFiles, architectLimits.tests),
    features: await Promise.all(plan.features.map(async file => ({ file, text: await readFile(join(root, file), 'utf8') }))),
  }, architectLimits);
}
function projected(outcome: ArchitectViewQueryOutcome): Extract<ArchitectViewQueryOutcome, { status: 'projected' }> {
  if (outcome.status !== 'projected') throw new Error(JSON.stringify(outcome));
  return outcome;
}

// First in this file, so the process's counters start at zero.
describe('RetainedSession.architectView: counters (AV11)', () => {
  it('checks, watch updates and changed-file checks never classify shapes or read titles; one query does each once', () =>
    architectProject(async (root, inputs) => {
      const { handle, revision, state } = await opened(inputs);
      try {
        expect(counters.shapeRuns).toBeDefined();
        expect(counters.testTitleRuns).toBeDefined();
        const invocation = { project: inputs.project, capabilities: inputs.capabilities };
        // A watch update, and a changed-file check naming the same kind of change.
        await writeFile(join(root, paths.core), (await readFile(join(root, paths.core), 'utf8')).replace('level: 1', 'level: 2'));
        expect((await handle.update([{ path: paths.core, kind: 'changed' }])).status).toBe('revised');
        await writeFile(join(root, paths.gamma), (await readFile(join(root, paths.gamma), 'utf8')).replace('loose + 1', 'loose + 2'));
        expect((await handle.update([{ path: paths.gamma, kind: 'changed' }], {}, invocation)).status).toBe('revised');
        // A check with nothing changed, a changed test file, a sweep, an audit, a report and the API view.
        expect(await handle.update([], {}, invocation)).toMatchObject({ status: 'revised', identical: true });
        await writeFile(join(root, paths.checks), `${await readFile(join(root, paths.checks), 'utf8')}test('added', () => {});\n`);
        expect((await handle.update([{ path: paths.checks, kind: 'changed' }], {}, invocation)).status).toBe('revised');
        await handle.sweep();
        expect(await handle.verify()).toMatchObject({ status: 'equal' });
        expect(await handle.report()).not.toBeNull();
        expect((await handle.apiView({ sequence: handle.current!.sequence, selection: { scope: 'all' }, details: architectLimits.details,
          maxAreaBytes: 32 * 1024 ** 2, maxInvocationBytes: 256 * 1024 ** 2 })).status).toBe('projected');
        // A released compiler rebuilt by the next update.
        await handle.releaseCompiler();
        expect((await handle.update([])).status).toBe('revised');
        expect(handle.current!.sequence).toBeGreaterThan(revision.sequence);
        expect(runs()).toEqual({ shapes: 0, titles: 0 });

        projected(await handle.architectView(query(handle.current!.sequence)));
        expect(runs()).toEqual({ shapes: 1, titles: 1 });
        expect(state.adapter?.hot).toBe(true);
      } finally { await handle.dispose(); }
    }), timeout);
});

describe('RetainedSession.architectView: current revision (AV11)', () => {
  it('projects the current sequence identically to the independent oracle, without a report or a revision', () =>
    architectProject(async (root, inputs) => {
      const { handle, revision, state } = await opened(inputs);
      try {
        const reportSpy = vi.spyOn(handle, 'report');
        const before = revisionsEntered();
        const outcome = projected(await handle.architectView(query(revision.sequence)));
        expect(outcome).toEqual(await oracle(state, root, revision.sequence, revision.inputId));
        expect(outcome).toMatchObject({ sequence: revision.sequence, inputId: revision.inputId,
          projection: { sequence: revision.sequence, inputId: revision.inputId, root: 'fixture' } });
        expect(outcome.projection.symbols).toHaveLength(18);
        expect(reportSpy).not.toHaveBeenCalled();
        expect(revisionsEntered()).toBe(before);
        expect(handle.current).toBe(revision);
      } finally { await handle.dispose(); }
    }), timeout);

  it('answers invalid-revision for an older, an unknown and a disposed sequence', () => architectProject(async (root, inputs) => {
    const { handle, revision } = await opened(inputs);
    await writeFile(join(root, paths.gamma), (await readFile(join(root, paths.gamma), 'utf8')).replace('loose + 1', 'loose + 2'));
    const updated = await handle.update([{ path: paths.gamma, kind: 'changed' }]);
    if (updated.status !== 'revised') throw new Error(JSON.stringify(updated));
    const invalid = { status: 'unavailable', reason: 'invalid-revision', message: expect.any(String) };
    expect(await handle.architectView(query(revision.sequence))).toEqual(invalid);
    expect(await handle.architectView(query(updated.revision.sequence + 1000))).toEqual(invalid);
    projected(await handle.architectView(query(updated.revision.sequence)));
    await handle.dispose();
    expect(await handle.architectView(query(updated.revision.sequence))).toEqual(invalid);
  }), timeout);

  it('includes an update queued before the query and never answers for a sequence an earlier update replaced', () =>
    architectProject(async (root, inputs) => {
      const { handle, revision } = await opened(inputs);
      try {
        await writeFile(join(root, paths.gamma), (await readFile(join(root, paths.gamma), 'utf8')).replace('loose + 1', 'loose + 2'));
        const [update, included] = await Promise.all([handle.update([{ path: paths.gamma, kind: 'changed' }]),
          handle.architectView(query(revision.sequence + 1))]);
        expect(update.status).toBe('revised');
        expect(projected(included).sequence).toBe(revision.sequence + 1);
        await writeFile(join(root, paths.gamma), (await readFile(join(root, paths.gamma), 'utf8')).replace('loose + 2', 'loose + 3'));
        const [, replaced] = await Promise.all([handle.update([{ path: paths.gamma, kind: 'changed' }]),
          handle.architectView(query(revision.sequence + 1))]);
        expect(replaced).toMatchObject({ status: 'unavailable', reason: 'invalid-revision' });
      } finally { await handle.dispose(); }
    }), timeout);

  it('answers resource-limit above maxProjectionBytes and for invalid limits', () => architectProject(async (_root, inputs) => {
    const { handle, revision } = await opened(inputs);
    try {
      const full = projected(await handle.architectView(query(revision.sequence)));
      expect(await handle.architectView(query(revision.sequence, { maxProjectionBytes: full.projection.bytes - 1 })))
        .toEqual({ status: 'unavailable', reason: 'resource-limit', message: expect.stringContaining('bytes') });
      expect(await handle.architectView(query(revision.sequence, { maxProjectionBytes: full.projection.bytes }))).toEqual(full);
      expect(await handle.architectView(query(revision.sequence, { tests: { ...architectLimits.tests, maxTitleBytes: 0 } })))
        .toMatchObject({ status: 'unavailable', reason: 'resource-limit' });
      // A compiler result above its own bound is a resource limit too.
      expect(await handle.architectView(query(revision.sequence, { details: { ...architectLimits.details, maxResultBytes: 64 } })))
        .toMatchObject({ status: 'unavailable', reason: 'resource-limit' });
      expect(await handle.architectView(query(revision.sequence))).toEqual(full);
    } finally { await handle.dispose(); }
  }), timeout);

  it('answers cancelled when aborted before or during the query, and projects again afterwards', () => architectProject(async (_root, inputs) => {
    const { handle, revision, state } = await opened(inputs);
    try {
      const aborted = new AbortController();
      aborted.abort();
      expect(await handle.architectView(query(revision.sequence), { signal: aborted.signal })).toEqual({ status: 'cancelled' });
      const { adapter } = instrumentCompiler(state);
      const shapes = adapter.shapes;
      const during = new AbortController();
      adapter.shapes = (requests, signal) => { during.abort(); return shapes(requests, signal); };
      expect(await handle.architectView(query(revision.sequence), { signal: during.signal })).toEqual({ status: 'cancelled' });
      adapter.shapes = shapes;
      projected(await handle.architectView(query(revision.sequence)));
    } finally { await handle.dispose(); }
  }), timeout);

  it('recreates a released compiler without publishing a revision and projects what the hot compiler projected', () =>
    architectProject(async (_root, inputs) => {
      const { handle, revision, state } = await opened(inputs);
      try {
        const hot = projected(await handle.architectView(query(revision.sequence)));
        await handle.releaseCompiler();
        expect(state.adapter?.hot).toBe(false);
        const before = revisionsEntered();
        expect(await handle.architectView(query(revision.sequence))).toEqual(hot);
        expect(state.adapter?.hot).toBe(true);
        expect(revisionsEntered()).toBe(before);
        expect(handle.current).toBe(revision);
      } finally { await handle.dispose(); }
    }), timeout);
});

describe('RetainedSession.architectView: captured feature files (AV10)', () => {
  it('answers superseded when a testing-area feature changed after the revision, and projects once it is published', () =>
    architectProject(async (root, inputs) => {
      const { handle, revision } = await opened(inputs);
      try {
        const original = await featureText(root);
        const first = projected(await handle.architectView(query(revision.sequence)));
        const superseded = { status: 'superseded', sequence: revision.sequence, observedInputId: null };
        // Changed bytes, then the same bytes again, then a removed file.
        await writeFile(join(root, paths.feature), `${original}  Scenario: Added later\n`);
        expect(await handle.architectView(query(revision.sequence))).toEqual(superseded);
        await writeFile(join(root, paths.feature), original);
        expect(await handle.architectView(query(revision.sequence))).toEqual(first);
        await rm(join(root, paths.feature));
        expect(await handle.architectView(query(revision.sequence))).toEqual(superseded);
        // A feature in an ordinary area is no test source: changing it supersedes nothing.
        await writeFile(join(root, paths.feature), `${original}  Scenario: Added later\n`);
        await writeFile(join(root, paths.alphaFeature), 'Feature: Changed\n');
        const updated = await handle.update([{ path: paths.feature, kind: 'changed' }]);
        if (updated.status !== 'revised') throw new Error(JSON.stringify(updated));
        const next = projected(await handle.architectView(query(updated.revision.sequence)));
        expect(next.projection.tests.find(record => record.kind === 'feature')).toMatchObject({
          scenarios: ['A reviewer starts the engine', 'A reviewer runs <count> times', 'Added later'] });
      } finally { await handle.dispose(); }
    }), timeout);
});

async function workerOpen(inputs: SessionInputs): Promise<RetainedSession> {
  const result = await openRetainedSession(inputs);
  if (result.status !== 'opened') throw new Error(JSON.stringify(result));
  return result.session;
}

workerSuite('RetainedSession.architectView through the session worker (AV11)', import.meta.url, () => {
  it('carries queries and outcomes through the worker protocol', () => architectProject(async (root, inputs) => {
    const session = await workerOpen(inputs);
    const { handle, state } = await opened(inputs);
    try {
      const sequence = session.current!.sequence;
      const outcome = projected(await session.architectView(query(sequence)));
      frozenPlain(outcome);
      expect(outcome.projection).toMatchObject({ sequence, inputId: session.current!.inputId });
      expect(outcome).toEqual(await oracle(state, root, sequence, handle.current!.inputId));

      expect(await session.architectView(query(sequence + 1))).toMatchObject({ status: 'unavailable', reason: 'invalid-revision' });
      expect(await session.architectView(query(sequence, { maxProjectionBytes: 1 })))
        .toMatchObject({ status: 'unavailable', reason: 'resource-limit' });
      const aborted = new AbortController();
      aborted.abort();
      expect(await session.architectView(query(sequence), { signal: aborted.signal })).toEqual({ status: 'cancelled' });
      // Aborted after the request was posted: the worker's feature read observes the cancellation.
      const during = new AbortController();
      const pending = session.architectView(query(sequence), { signal: during.signal });
      during.abort();
      expect(await pending).toEqual({ status: 'cancelled' });

      await writeFile(join(root, paths.feature), `${await featureText(root)}  Scenario: Added later\n`);
      expect(await session.architectView(query(sequence))).toEqual({ status: 'superseded', sequence, observedInputId: null });
    } finally { await handle.dispose(); await session.dispose(); }
    expect(await session.architectView(query(1))).toMatchObject({ status: 'unavailable', reason: 'invalid-revision' });
  }), timeout);
});
