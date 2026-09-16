import { describe, expect, it, vi } from 'vitest';
import { openRetainedSession } from '../index.js';
import { originalKey } from '../../subs/model/src/index.js';
import { planApiViewRequests, projectApiView } from '../api-view.js';
import type { ApiViewQuery, ApiViewQueryOutcome, ApiViewSelection } from '../interfaces/session.js';
import type { SymbolDetail, SymbolDetailRequest } from '../../subs/typescript/src/interfaces/source.js';
import type { SessionState } from '../session-revision.js';
import { fixture, opened, paths, put, revisionsEntered, timeout } from './session-test-fixture.js';

const detailLimits = { maxSignatureBytes: 2048, maxDocumentationBytes: 512, maxOverloads: 8, maxResultBytes: 32 * 1024 ** 2 };
const projectionBounds = { maxAreaBytes: 32 * 1024 ** 2, maxInvocationBytes: 256 * 1024 ** 2 };
const allModules: ApiViewSelection = { scope: 'all' };
const query = (sequence: number, selection: ApiViewSelection = allModules, bounds = projectionBounds): ApiViewQuery =>
  ({ sequence, selection, details: detailLimits, ...bounds });

/** Independent oracle: the exact chain iteration 5 and iteration 4 already
 * verified on their own, run directly over the same retained facts and
 * compiler, without going through `RetainedSession.apiView`. */
async function oracle(state: SessionState, selection: ApiViewSelection, sequence: number, inputId: string): Promise<ApiViewQueryOutcome> {
  const facts = state.facts!;
  const planned = planApiViewRequests(facts, selection);
  if (planned.status !== 'planned') return planned;
  const details = await state.adapter!.details(planned.requests, detailLimits);
  const lookup = new Map(details.map(detail => [`${originalKey(detail.original)} ${detail.exportName}`, detail]));
  const detailsOf = (request: SymbolDetailRequest): SymbolDetail => lookup.get(`${originalKey(request.original)} ${request.exportName}`)!;
  return projectApiView(facts, sequence, inputId, selection, detailsOf, projectionBounds);
}

describe('RetainedSession.apiView: hot and current', () => {
  it('current-valid-query: projects the current sequence identically to the independent oracle', async () => {
    await fixture(async (root, inputs) => {
      const { handle, revision, state } = await opened(inputs);
      try {
        expect(state.adapter?.hot).toBe(true);
        const outcome = await handle.apiView(query(revision.sequence));
        const expected = await oracle(state, allModules, revision.sequence, revision.inputId);
        expect(outcome).toEqual(expected);
        expect(outcome.status).toBe('projected');
        if (outcome.status === 'projected') {
          expect(outcome.projection.sequence).toBe(revision.sequence);
          expect(outcome.projection.inputId).toBe(revision.inputId);
          expect(outcome.projection.modules.length).toBeGreaterThan(0);
        }
      } finally { await handle.dispose(); }
    });
  }, timeout);

  it('hot-details: a module selection also matches the oracle and uses the live compiler', async () => {
    await fixture(async (root, inputs) => {
      const { handle, revision, state } = await opened(inputs);
      try {
        const selection: ApiViewSelection = { scope: 'module', from: 'subs/branch/subs/leaf' };
        const outcome = await handle.apiView(query(revision.sequence, selection));
        const expected = await oracle(state, selection, revision.sequence, revision.inputId);
        expect(outcome).toEqual(expected);
      } finally { await handle.dispose(); }
    });
  }, timeout);
});

describe('RetainedSession.apiView: invalid and historical sequences', () => {
  it('invalid-or-historical: an old sequence, an unknown sequence and an invalid location are all explicit unavailable, never lastValid', async () => {
    await fixture(async (root, inputs) => {
      const { handle, revision } = await opened(inputs);
      try {
        await put(root, paths.provider, 'export const value = 2;\nexport function compute(): number {\n  return 3;\n}\n');
        const updated = await handle.update([{ path: paths.provider, kind: 'changed' }]);
        expect(updated.status).toBe('revised');
        if (updated.status !== 'revised') throw new Error('Expected a revision');
        expect(updated.revision.sequence).toBeGreaterThan(revision.sequence);

        const stale = await handle.apiView(query(revision.sequence));
        expect(stale).toEqual({ status: 'unavailable', reason: 'invalid-revision', message: expect.any(String) });

        const unknown = await handle.apiView(query(updated.revision.sequence + 1000));
        expect(unknown).toEqual({ status: 'unavailable', reason: 'invalid-revision', message: expect.any(String) });

        const invalidLocation = await handle.apiView(query(updated.revision.sequence, { scope: 'module', from: '../escape' }));
        expect(invalidLocation).toEqual({ status: 'unavailable', reason: 'invalid-location', message: expect.any(String) });
      } finally { await handle.dispose(); }
    });
  }, timeout);
});

describe('RetainedSession.apiView: warm rehydration', () => {
  it('warm-rehydration: after releasing the compiler, the query recreates one, publishes no revision and matches the hot projection', async () => {
    await fixture(async (root, inputs) => {
      const { handle, revision, state } = await opened(inputs);
      try {
        const hot = await handle.apiView(query(revision.sequence));
        expect(hot.status).toBe('projected');
        await handle.releaseCompiler();
        expect(state.adapter?.hot).toBe(false);
        const before = handle.current;
        const warm = await handle.apiView(query(revision.sequence));
        expect(warm).toEqual(hot);
        expect(state.adapter?.hot).toBe(true);
        // No revision was published for the query itself.
        expect(handle.current).toBe(before);
        expect(handle.current!.sequence).toBe(revision.sequence);
      } finally { await handle.dispose(); }
    });
  }, timeout);

  it('new-observation-supersedes: a disk change observed only while rehydrating reports superseded, not stale data', async () => {
    await fixture(async (root, inputs) => {
      const { handle, revision, state } = await opened(inputs);
      try {
        await handle.releaseCompiler();
        expect(state.adapter?.hot).toBe(false);
        // Changed directly on disk, outside the session's own update/observer path.
        await put(root, paths.provider, "export const value = 2;\nexport function compute(): number {\n  return 3;\n}\n");
        const outcome = await handle.apiView(query(revision.sequence));
        expect(outcome.status).toBe('superseded');
        if (outcome.status === 'superseded') {
          expect(outcome.sequence).toBe(revision.sequence);
          expect(typeof outcome.observedInputId).toBe('string');
        }
        // The session itself is not corrupted: a real update still recovers cleanly.
        const recovered = await handle.update([{ path: paths.provider, kind: 'changed' }]);
        expect(recovered.status).toBe('revised');
      } finally { await handle.dispose(); }
    });
  }, timeout);
});

describe('RetainedSession.apiView: no report or rescan', () => {
  it('no-report-or-rescan: a query calls neither report() nor a new recompute/observation', async () => {
    await fixture(async (root, inputs) => {
      const { handle, revision } = await opened(inputs);
      try {
        const reportSpy = vi.spyOn(handle, 'report');
        const before = revisionsEntered();
        const outcome = await handle.apiView(query(revision.sequence));
        expect(outcome.status).toBe('projected');
        expect(reportSpy).not.toHaveBeenCalled();
        expect(revisionsEntered()).toBe(before);
      } finally { await handle.dispose(); }
    });
  }, timeout);
});

describe('RetainedSession.apiView: query serialization', () => {
  it('query-serialization: a queued update before the query is included; one after cannot replace its sequence', async () => {
    await fixture(async (root, inputs) => {
      const { handle, revision } = await opened(inputs);
      try {
        const before = revision.sequence;
        // Queued after an in-flight update: the update is included and the
        // query answers from the sequence it published.
        await put(root, paths.provider, 'export const value = 2;\nexport function compute(): number {\n  return 3;\n}\n');
        const updatePromise = handle.update([{ path: paths.provider, kind: 'changed' }]);
        const includedPromise = handle.apiView(query(before + 1));
        const [updateResult, included] = await Promise.all([updatePromise, includedPromise]);
        expect(updateResult.status).toBe('revised');
        if (updateResult.status !== 'revised') throw new Error('Expected a revision');
        expect(updateResult.revision.sequence).toBe(before + 1);
        expect(included.status).toBe('projected');
        if (included.status === 'projected') expect(included.projection.sequence).toBe(before + 1);

        // Queued after a second in-flight update: naming the sequence that was
        // current before that update cannot be answered from it.
        await put(root, paths.leaf, "import { value } from '../../../src/provider.js';\nvoid value;\nexport const marker = 1;\n");
        const secondUpdate = handle.update([{ path: paths.leaf, kind: 'changed' }]);
        const stalePromise = handle.apiView(query(before + 1));
        const [secondResult, stale] = await Promise.all([secondUpdate, stalePromise]);
        expect(secondResult.status).toBe('revised');
        expect(stale).toEqual({ status: 'unavailable', reason: 'invalid-revision', message: expect.any(String) });
      } finally { await handle.dispose(); }
    });
  }, timeout);
});

describe('RetainedSession.apiView: limits, cancellation and disposal', () => {
  it('query-limits: a byte bound crossed by the real projection returns resource-limit, not a partial projection', async () => {
    await fixture(async (root, inputs) => {
      const { handle, revision } = await opened(inputs);
      try {
        const tiny = await handle.apiView(query(revision.sequence, allModules, { maxAreaBytes: 1, maxInvocationBytes: 1 }));
        expect(tiny).toEqual({ status: 'unavailable', reason: 'resource-limit', message: expect.any(String) });
      } finally { await handle.dispose(); }
    });
  }, timeout);

  it('query-disposal: cancellation, repeated queries and disposal are all bounded and retain no projection', async () => {
    await fixture(async (root, inputs) => {
      const { handle, revision } = await opened(inputs);
      const controller = new AbortController();
      controller.abort();
      const cancelled = await handle.apiView(query(revision.sequence), { signal: controller.signal });
      expect(cancelled).toEqual({ status: 'cancelled' });

      const before = handle.status().factBytes;
      const first = await handle.apiView(query(revision.sequence));
      const second = await handle.apiView(query(revision.sequence));
      expect(first.status).toBe('projected');
      expect(second.status).toBe('projected');
      expect(handle.status().factBytes).toBe(before);

      await handle.dispose();
      const afterDispose = await handle.apiView(query(revision.sequence));
      expect(afterDispose).toEqual({ status: 'unavailable', reason: 'invalid-revision', message: expect.any(String) });
    });
  }, timeout);
});

describe('RetainedSession.apiView: real worker wiring', () => {
  it('carries an apiView request and result through the worker/host protocol unchanged', async () => {
    await fixture(async (root, inputs) => {
      const result = await openRetainedSession(inputs);
      expect(result.status).toBe('opened');
      if (result.status !== 'opened') throw new Error('Expected an opened session');
      try {
        const outcome = await result.session.apiView(query(result.revision.sequence));
        expect(outcome.status).toBe('projected');
        if (outcome.status === 'projected') {
          expect(outcome.projection.sequence).toBe(result.revision.sequence);
          expect(outcome.projection.inputId).toBe(result.revision.inputId);
        }
      } finally { await result.session.dispose(); }
    });
  }, timeout);
});
