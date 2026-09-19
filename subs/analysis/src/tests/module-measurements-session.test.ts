import { describe, expect, it, vi } from 'vitest';
import { openRetainedSession } from '../retained-session.js';
import { measureContextSize, resolveDeclaredMeasurementInputs } from '../module-measurements.js';
import { architectProject } from './architect-fixture.js';
import { opened, timeout } from './session-test-fixture.js';
import { frozenPlain, workerSuite } from './session-worker-fixture.js';

describe('RetainedSession.measurements: current revision (MM04, MM06)', () => {
  it('uses retained inventory, areas and captured inputs without reports or descendant leakage', () =>
    architectProject(async (_root, inputs) => {
      const { handle, revision, state } = await opened(inputs);
      try {
        const report = vi.spyOn(handle, 'report');
        const outcome = await handle.measurements(revision.sequence);
        expect(outcome.status).toBe('measured');
        if (outcome.status !== 'measured') return;
        const resolved = resolveDeclaredMeasurementInputs(state.facts!.inventory!, state.facts!.areas, revision.inputs);
        if (resolved.status !== 'resolved') throw new Error(resolved.message);
        const core = outcome.measurements.modules.find(module => module.id === 'fixture/core')!;
        expect(core.exact).toEqual(measureContextSize(resolved.files, resolved.documentation, new Set(['fixture/core'])));
        expect(core.subtree).toEqual(measureContextSize(resolved.files, resolved.documentation,
          new Set(['fixture/core', 'fixture/core/engine'])));
        expect(core.exact).not.toEqual(core.subtree);
        expect(outcome.measurements.modules.map(module => module.id)).toEqual([...outcome.measurements.modules]
          .map(module => module.id).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
        expect(outcome.measurements.files.map(file => file.path)).toEqual([...outcome.measurements.files]
          .map(file => file.path).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
        expect(outcome.measurements.files.filter(file => file.kind === 'documentation'))
          .toContainEqual({ path: 'subs/core/module.ramify', owner: 'fixture/core', area: 'documentation',
            kind: 'documentation', bytes: expect.any(Number) });
        expect(outcome.measurements.files.some(file => file.path === 'subs/core/subs/engine/README.md')).toBe(false);
        expect(report).not.toHaveBeenCalled();
        expect(handle.current).toBe(revision);
      } finally { await handle.dispose(); }
    }), timeout);

  it('refuses another sequence, observes cancellation and never substitutes zeros', () => architectProject(async (_root, inputs) => {
    const { handle, revision } = await opened(inputs);
    try {
      expect(await handle.measurements(revision.sequence + 1)).toMatchObject({ status: 'unavailable', reason: 'invalid-revision' });
      const controller = new AbortController(); controller.abort();
      expect(await handle.measurements(revision.sequence, { signal: controller.signal })).toEqual({ status: 'cancelled' });
    } finally { await handle.dispose(); }
    expect(await handle.measurements(revision.sequence)).toMatchObject({ status: 'unavailable', reason: 'invalid-revision' });
  }), timeout);
});

workerSuite('RetainedSession.measurements through the worker (MM04)', import.meta.url, () => {
  it('returns the same frozen plain snapshot through the worker protocol', () => architectProject(async (_root, inputs) => {
    const opened = await openRetainedSession(inputs);
    if (opened.status !== 'opened') throw new Error(JSON.stringify(opened));
    try {
      const outcome = await opened.session.measurements(opened.revision.sequence);
      expect(outcome.status).toBe('measured');
      frozenPlain(outcome);
      if (outcome.status === 'measured') {
        expect(outcome.measurements.inputId).toBe(opened.revision.inputId);
        expect(outcome.measurements.modules).toHaveLength(7);
      }
    } finally { await opened.session.dispose(); }
  }), timeout);
});
