import { expect, it } from 'vitest';
import type { AffectedQuery, SessionAffectedOutcome } from '../interfaces/affected.js';
import type { RetainedSession } from '../interfaces/session.js';
import { formDependentsOfP, formFiles, formPaths } from './affected-fixtures.js';
import { fixture, opened as openedInProcess, put, revised, timeout } from './session-test-fixture.js';
import { frozenPlain, observedOpen, workerSuite } from './session-worker-fixture.js';

const query = (handle: RetainedSession, value: AffectedQuery, signal?: AbortSignal): Promise<SessionAffectedOutcome> =>
  handle.affected!(value, signal ? { signal } : {});
const ids = (outcome: SessionAffectedOutcome): string[] => {
  if (outcome.status !== 'answered') throw new Error(`Expected an answer: ${JSON.stringify(outcome)}`);
  return outcome.result.affectedModules.map(module => module.id);
};

async function workerSession(inputs: Parameters<typeof observedOpen>[0]) {
  const observation = await observedOpen(inputs);
  if (observation.opened.status !== 'opened') {
    observation.cleanup();
    throw new Error(JSON.stringify(observation.opened));
  }
  return { ...observation, handle: observation.opened.session, revision: observation.opened.revision };
}

workerSuite('RetainedSession.affected through the worker (A7-05)', import.meta.url, () => {
  it('A7-05:worker-round-trip: the worker answers exactly as the in-process engine, before and after an edit', () =>
    fixture(async (root, inputs) => {
      const worker = await workerSession(inputs);
      const engine = await openedInProcess(inputs);
      try {
        expect(worker.revision.inputId).toBe(engine.revision.inputId);
        const queries: Omit<AffectedQuery, 'sequence'>[] = [
          { modules: ['fixture/p'] },
          { paths: [formPaths.api, formPaths.theme, 'subs/p/src/removed.ts', 'subs/p/module.ramify'] },
          { modules: ['fixture/shims'], paths: ['package.json'] },
          { modules: ['fixture/p', 'fixture/nope'] },
          {},
        ];
        for (const value of queries) {
          const through = await query(worker.handle, { sequence: worker.handle.current!.sequence, ...value });
          frozenPlain(through);
          expect(through).toEqual(await query(engine.handle, { sequence: engine.handle.current!.sequence, ...value }));
        }
        expect(worker.requests).toContainEqual({ operation: 'affected', query: { sequence: worker.revision.sequence, modules: ['fixture/p'] },
          id: expect.any(Number) });
        expect(ids(await query(worker.handle, { sequence: worker.revision.sequence, modules: ['fixture/p'] }))).toEqual(formDependentsOfP);

        // A7-05:edit-changes-answer through the worker.
        await put(root, formPaths.alone, "import { pValue } from '../../p/src/interfaces/api.js';\nexport const alone: number = pValue;\n");
        const next = await worker.handle.update([{ path: formPaths.alone, kind: 'changed' }]);
        expect(next.status).toBe('revised');
        await revised(engine.handle, [formPaths.alone]);
        const after = await query(worker.handle, { sequence: worker.handle.current!.sequence, modules: ['fixture/p'] });
        expect(ids(after)).toEqual([...formDependentsOfP, 'fixture/lonely'].sort());
        expect(after).toEqual(await query(engine.handle, { sequence: engine.handle.current!.sequence, modules: ['fixture/p'] }));
        // A7-05:stale-sequence through the worker.
        expect(await query(worker.handle, { sequence: worker.revision.sequence, modules: ['fixture/p'] })).toEqual({
          status: 'unavailable', reason: 'invalid-revision', message: expect.any(String), unknownModules: [] });
      } finally {
        await engine.handle.dispose();
        await worker.handle.dispose(); worker.cleanup();
      }
      expect(await query(worker.handle, { sequence: 1 })).toEqual({
        status: 'unavailable', reason: 'invalid-revision', message: 'Retained session is disposed', unknownModules: [] });
    }, formFiles), timeout);

  it('A7-05:worker-cancel: a cancelled request answers cancelled and leaves the session usable', () => fixture(async (_root, inputs) => {
    const worker = await workerSession(inputs);
    try {
      const sequence = worker.revision.sequence;
      const sent = worker.requests.length;
      expect(await query(worker.handle, { sequence, modules: ['fixture/p'] }, AbortSignal.abort())).toEqual({ status: 'cancelled' });
      // An already aborted request never reaches the worker.
      expect(worker.requests).toHaveLength(sent);
      const controller = new AbortController();
      const inFlight = query(worker.handle, { sequence, modules: ['fixture/p'] }, controller.signal);
      controller.abort();
      expect(await inFlight).toEqual({ status: 'cancelled' });
      expect(worker.requests.some(request => (request as { operation?: string }).operation === 'cancel')).toBe(true);
      expect(worker.handle.current).toBe(worker.revision);
      expect(ids(await query(worker.handle, { sequence, modules: ['fixture/p'] }))).toEqual(formDependentsOfP);
    } finally { await worker.handle.dispose(); worker.cleanup(); }
  }, formFiles), timeout);
});
