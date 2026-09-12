import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareFacts } from '../session-audit.js';
import { deepFreeze } from '../session-facts.js';
import { sessionInputWitness } from './session-input-witness.js';
import { audited, comparable, equalToBatch, fixture, fixtureFiles, instrumentObserver, opened, ownedFiles, parentExposure, paths, put, replace,
  revised, timeout } from './session-test-fixture.js';

describe('retained session audit', () => {
  it('retires obsolete compiler observations after deleting the last source and a whole module', sessionInputWitness, timeout);

  it('equals batch and keeps the current sequence after each of twelve source, description, metadata and membership steps', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      let steps = 0;
      const check = async (): Promise<void> => {
        steps++;
        await audited(handle);
        await equalToBatch(handle, inputs);
        expect(handle.current!.sequence).toBe(steps + 1);
      };

      await replace(root, paths.provider, '  return 2;', '  void 0;\n  return 2;');
      expect((await revised(handle, [paths.provider])).checked.path).toBe('unchanged-surface');
      await check();

      await replace(root, paths.provider, 'export const value', '// Move every declaration.\nexport const value');
      expect((await revised(handle, [paths.provider])).checked.path).toBe('unchanged-surface');
      await check();

      await replace(root, paths.local, 'import { rootValue }', 'import { rootValue, type RootType }');
      expect((await revised(handle, [paths.local])).checked).toEqual({ path: 'source', files: [paths.local], accesses: 2, modelRebuilt: false });
      await check();

      const addedExport = 'export const newValue = 4;\n';
      await put(root, paths.rootApi, `${fixtureFiles[paths.rootApi]}${addedExport}`);
      expect((await revised(handle, [paths.rootApi])).outcome.check).toBe('passed');
      await check();

      await replace(root, paths.rootApi, addedExport, '');
      expect((await revised(handle, [paths.rootApi])).outcome.check).toBe('passed');
      await check();

      const deniedImport = "import { privateValue } from '../../../src/interfaces/api.js';\nvoid privateValue;\n";
      await replace(root, paths.local, 'void rootValue;', `void rootValue;\n${deniedImport}`);
      const denied = await revised(handle, [paths.local]);
      expect(denied.delta.added.map(item => [item.code, item.location?.file])).toEqual([['not-visible', paths.local]]);
      await check();

      await replace(root, paths.local, deniedImport, '');
      expect((await revised(handle, [paths.local])).delta.removed).toEqual([denied.delta.added[0]!.id]);
      await check();

      await replace(root, paths.description, parentExposure, '');
      const hidden = await revised(handle, [paths.description]);
      expect(hidden.checked.path).toBe('description');
      expect(hidden.delta.added.map(item => [item.code, item.location?.file])).toEqual([['not-visible', paths.rootMain]]);
      await check();

      await put(root, paths.description, fixtureFiles[paths.description]!);
      expect((await revised(handle, [paths.description])).delta.removed).toEqual([hidden.delta.added[0]!.id]);
      await check();

      await put(root, paths.readme, '# Branch\n\nA revised branch purpose.\n');
      expect((await revised(handle, [paths.readme])).checked).toEqual({ path: 'metadata', files: [], accesses: 0, modelRebuilt: false });
      await check();

      await put(root, paths.extra, "import { rootValue } from '../../../src/interfaces/api.js';\nvoid rootValue;\n");
      const created = await revised(handle, [paths.extra], 'created');
      expect(created.checked.files).toEqual([...ownedFiles, paths.extra].sort());
      expect(created.outcome.check).toBe('passed');
      await check();

      await rm(join(root, paths.extra));
      expect((await revised(handle, [paths.extra], 'deleted')).checked.files).toEqual(ownedFiles);
      await check();
      expect(steps).toBe(12);
    } finally { await handle.dispose(); }
  }), timeout);

  it('detects an injected access corruption, publishes the real recomputation, then audits equal', () => fixture(async (_root, inputs) => {
    const { handle, state, revision } = await opened(inputs);
    try {
      const retained = state.facts!;
      const file = retained.files[paths.rootMain]!;
      state.facts = deepFreeze({ ...retained, files: { ...retained.files, [paths.rootMain]: {
        ...file, accesses: file.accesses.map(access => ({ ...access, specifier: './injected-drift.js' })),
      } } });
      expect(compareFacts(retained, state.facts)).toEqual([`files[${paths.rootMain}].accesses`]);
      const audit = await handle.verify();
      expect(audit.status).toBe('mismatch');
      if (audit.status !== 'mismatch') throw new Error('The audit silently accepted an injected access corruption');
      expect(audit.sequence).toBe(revision.sequence);
      expect(audit.fields).toEqual([`files[${paths.rootMain}].accesses`]);
      expect(audit.revision.sequence).toBe(revision.sequence + 1);
      expect(handle.current).toBe(audit.revision);
      expect(audit.revision.checked).toEqual({ path: 'broad', files: ownedFiles, accesses: 4, modelRebuilt: true });
      expect(audit.revision.changed).toEqual([]);
      expect(audit.revision.inputId).toBe(revision.inputId);
      expect(state.facts!.files[paths.rootMain]!.accesses).toEqual(file.accesses);
      await equalToBatch(handle, inputs);
      await audited(handle);
    } finally { await handle.dispose(); }
  }), timeout);

  it('compares and repairs original declaration positions inside retained access decisions', () => fixture(async (_root, inputs) => {
    const { handle, state, revision } = await opened(inputs);
    try {
      const retained = state.facts!;
      const id = retained.files[paths.rootMain]!.accesses[0]!.id;
      const before = retained.decisions[id]!;
      expect(before.result.decisions[0]!.original!.declarations).not.toHaveLength(0);
      state.facts = deepFreeze({ ...retained, decisions: { ...retained.decisions, [id]: { ...before,
        result: { ...before.result, decisions: before.result.decisions.map(decision => ({ ...decision,
          original: decision.original ? { ...decision.original,
            declarations: decision.original.declarations.map(location => ({ ...location, start: location.start + 17, line: location.line + 2 })),
          } : decision.original,
        })) },
      } } });
      const fields = [`decisions[${id}]`, `decisions[${id}].result.decisions[0].original.declarations`];
      expect(compareFacts(retained, state.facts)).toEqual(fields);
      const audit = await handle.verify();
      expect(audit.status).toBe('mismatch');
      if (audit.status !== 'mismatch') throw new Error('The audit accepted stale original.declarations evidence');
      expect(audit.fields).toEqual(fields);
      expect(audit.revision.sequence).toBe(revision.sequence + 1);
      expect(state.facts!.decisions[id]!.result.decisions).toEqual(before.result.decisions);
      await equalToBatch(handle, inputs);
      await audited(handle);
    } finally { await handle.dispose(); }
  }), timeout);

  it('cancels before recomputation without replacing the published revision', () => fixture(async (_root, inputs) => {
    const { handle, state, revision } = await opened(inputs);
    try {
      const facts = state.facts;
      const cancellation = new AbortController();
      cancellation.abort();
      expect(await handle.verify({ signal: cancellation.signal })).toEqual({ status: 'cancelled' });
      expect(state.facts).toBe(facts);
      expect(handle.current).toBe(revision);
      await audited(handle);
    } finally { await handle.dispose(); }
  }), timeout);

  it('cancels during observation promotion after detecting drift without publishing the recomputed facts', () => fixture(async (_root, inputs) => {
    const { handle, state, revision } = await opened(inputs);
    try {
      const report = await handle.report();
      const facts = state.facts!;
      const file = facts.files[paths.rootMain]!;
      const corrupted = deepFreeze({ ...facts, files: { ...facts.files, [paths.rootMain]: {
        ...file, accesses: file.accesses.map(access => ({ ...access, specifier: './injected-drift.js' })),
      } } });
      state.facts = corrupted;
      const cancellation = new AbortController();
      const { apply } = instrumentObserver(state);
      apply.mockImplementationOnce(async (_changes, signal) => {
        expect(signal).toBe(cancellation.signal);
        cancellation.abort();
        throw Object.assign(new Error('Cancelled while promoting audited observations'), { name: 'AbortError' });
      });
      expect(await handle.verify({ signal: cancellation.signal })).toEqual({ status: 'cancelled' });
      expect(apply).toHaveBeenCalledTimes(1);
      expect(apply.mock.calls[0]![0]).toEqual([]);
      expect(state.stale).toBe(true);
      expect(state.facts).toBe(corrupted);
      expect(handle.current).toBe(revision);
      expect(comparable(await handle.report())).toEqual(comparable(report));
      expect(await handle.report(undefined, revision.sequence + 1)).toBeNull();
      const repaired = await handle.verify();
      expect(repaired.status).toBe('mismatch');
      expect(handle.current!.sequence).toBe(revision.sequence + 1);
      await equalToBatch(handle, inputs);
      await audited(handle);
    } finally { await handle.dispose(); }
  }), timeout);
});
