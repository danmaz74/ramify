import { readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkLimit } from '../report.js';
import type { RetainedSession, SessionRevision } from '../interfaces/session.js';
import { buildIndexes, emptyIndexes, type FileFacts, type SessionFacts } from '../session-facts.js';
import { membershipMatches, reachRefusal } from '../session-revision.js';
import { audited, comparable, equalToBatch, fixture, fixtureFiles, instrumentCompiler, instrumentObserver, opened, ownedFiles,
  parentExposure, paths, put, replace, revised, revisionsEntered, timeout } from './session-test-fixture.js';

describe('description, metadata and broad session revisions', () => {
  it('relinks without compiler work and decides only importers or originals in the changed subtree, then restores the exposure', () => fixture(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      const compiler = instrumentCompiler(state);
      const before = state.facts!;
      expect(Object.keys(before.decisions)).toHaveLength(4);
      const siblingId = before.files[paths.sibling]!.accesses[0]!.id;
      const selected = [paths.rootMain, paths.local, paths.leaf].map(path => before.files[path]!.accesses[0]!.id);

      await replace(root, paths.description, parentExposure, '');
      const denied = await revised(handle, [paths.description]);
      expect(denied.checked).toEqual({ path: 'description', files: [], accesses: 3, modelRebuilt: true });
      expect([compiler.update.mock.calls.length, compiler.describe.mock.calls.length, compiler.interpret.mock.calls.length]).toEqual([0, 0, 0]);
      expect([denied.timings.compiler, denied.timings.descriptions, denied.timings.accesses]).toEqual([0, 0, 0]);
      expect(denied.delta.added.map(item => [item.code, item.location?.file])).toEqual([['not-visible', paths.rootMain]]);
      expect(denied.delta.removed).toEqual([]);
      expect(state.facts!.files).toBe(before.files);
      expect(state.facts!.decisions[siblingId]).toBe(before.decisions[siblingId]);
      for (const id of selected) expect(state.facts!.decisions[id]).not.toBe(before.decisions[id]);
      await audited(handle);
      await equalToBatch(handle, inputs);

      await put(root, paths.description, fixtureFiles[paths.description]!);
      const restored = await revised(handle, [paths.description]);
      expect(restored.checked).toEqual({ path: 'description', files: [], accesses: 3, modelRebuilt: true });
      expect(restored.delta).toEqual({ added: [], removed: [denied.delta.added[0]!.id], positionOnly: [] });
      expect(restored.outcome.check).toBe('passed');
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('refreshes description statement positions without re-extraction or unrelated decisions', () => fixture(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      const compiler = instrumentCompiler(state);
      const before = state.facts!;
      const siblingId = before.files[paths.sibling]!.accesses[0]!.id;
      await replace(root, paths.description, parentExposure, `// Move the exposure statement.\n${parentExposure}`);
      const moved = await revised(handle, [paths.description]);
      expect(moved.checked.path).toBe('description');
      expect(moved.checked.files).toEqual([]);
      expect(moved.checked.modelRebuilt).toBe(true);
      expect([compiler.update.mock.calls.length, compiler.describe.mock.calls.length, compiler.interpret.mock.calls.length]).toEqual([0, 0, 0]);
      expect(state.facts!.decisions[siblingId]).toBe(before.decisions[siblingId]);
      expect(moved.delta).toEqual({ added: [], removed: [], positionOnly: [] });
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('shares one frozen model between the linked layer, the model and the decisions on every path', () => fixture(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      // A decision refers to the model it was decided against; a relink keeps
      // unaffected decisions, which refer to the previous model's originals.
      const shared = (facts: SessionFacts, previous?: SessionFacts): void => {
        expect(facts.linked?.status === 'valid' && facts.linked.modelInput).toBe(facts.model);
        const originals = new Set([...facts.model!.originals, ...previous?.model?.originals ?? []]);
        const selected = Object.values(facts.decisions).flatMap(decision => decision.result.decisions)
          .map(decision => decision.original).filter(original => original !== null);
        expect(selected.length).toBeGreaterThan(0);
        for (const original of selected) expect(originals.has(original!)).toBe(true);
      };
      shared(state.facts!);
      // Declarations of a selected original move: the position patch replaces the model once.
      const before = state.facts!;
      await replace(root, paths.provider, 'export const value', '// Moves the declaration.\nexport const value');
      const moved = await revised(handle, [paths.provider]);
      expect(moved.checked.path).toBe('unchanged-surface');
      expect(state.facts!.model).not.toBe(before.model);
      shared(state.facts!);
      await audited(handle);
      // A relink builds the model once.
      const patched = state.facts!;
      await replace(root, paths.description, parentExposure, `// Relink.\n${parentExposure}`);
      expect((await revised(handle, [paths.description])).checked.path).toBe('description');
      expect(state.facts!.model).not.toBe(patched.model);
      shared(state.facts!, patched);
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('refreshes README purposes without compiler, link or decision work', () => fixture(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      const compiler = instrumentCompiler(state);
      const before = state.facts!;
      const purpose = 'The edited purpose explains what this branch provides.';
      await put(root, paths.readme, `# Branch\n\n${purpose}\n`);
      const metadata = await revised(handle, [paths.readme]);
      expect(metadata.checked).toEqual({ path: 'metadata', files: [], accesses: 0, modelRebuilt: false });
      expect([metadata.timings.compiler, metadata.timings.descriptions, metadata.timings.accesses, metadata.timings.link, metadata.timings.decide]).toEqual([0, 0, 0, 0, 0]);
      expect([compiler.update.mock.calls.length, compiler.describe.mock.calls.length, compiler.interpret.mock.calls.length]).toEqual([0, 0, 0]);
      expect(state.facts!.model).toBe(before.model);
      expect(state.facts!.linked).toBe(before.linked);
      expect(state.facts!.decisions).toBe(before.decisions);
      const report = await equalToBatch(handle, inputs);
      expect(report.snapshot!.inventory.modules.find(module => module.name === 'branch')?.purpose).toEqual({ state: 'present', readme: paths.readme, paragraph: purpose });
      await audited(handle);
    } finally { await handle.dispose(); }
  }), timeout);

  it.each([
    ['a source edit', async (root: string) => { await replace(root, paths.provider, 'return 2;', 'return 3;'); return [paths.provider]; }],
    ['a description edit', async (root: string) => { await replace(root, paths.description, parentExposure, ''); return [paths.description]; }],
    ['a created file', async (root: string) => { await put(root, paths.extra, 'export const extra = 1;\n'); return [paths.extra]; }],
  ] as const)('keeps a README revert that arrives together with %s', (_label, other) => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      await replace(root, paths.readme, 'provides a value', 'supplies a value');
      await revised(handle, [paths.readme]);
      await replace(root, paths.readme, 'supplies a value', 'provides a value');
      const others = await other(root);
      await revised(handle, [paths.readme, ...others]);
      const report = await equalToBatch(handle, inputs);
      expect(report.snapshot!.inventory.modules.find(module => module.id === 'fixture/branch')!.purpose).toMatchObject({ paragraph: 'The branch provides a value to its parent and descendants.' });
      await audited(handle);
    } finally { await handle.dispose(); }
  }), timeout);

  it('combines source and description changes without skipping either decision dependency', () => fixture(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      const compiler = instrumentCompiler(state);
      await replace(root, paths.description, parentExposure, '');
      await replace(root, paths.sibling, 'import { rootValue }', 'import { privateValue as rootValue }');
      const revision = await revised(handle, [paths.description, paths.sibling]);
      expect(revision.checked).toEqual({ path: 'source', files: [paths.sibling], accesses: 4, modelRebuilt: true });
      expect(compiler.update).toHaveBeenCalledTimes(1);
      expect(compiler.interpret.mock.calls.map(call => call[0])).toEqual([[paths.sibling]]);
      expect(revision.delta.added.map(item => [item.code, item.location?.file])).toEqual([
        ['not-visible', paths.rootMain], ['not-visible', paths.sibling],
      ]);
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('membership-path-narrow: a created and a deleted file update the compiler once without a whole invalidation and check only the affected files', () => fixture(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      const compiler = instrumentCompiler(state);
      const { retire } = instrumentObserver(state);
      const pending = 'subs/branch/src/pending.ts', later = 'subs/branch/src/later.ts';
      const calls = () => ({ updates: compiler.update.mock.calls.map(call => ({ ...call[0], inventory: call[0].inventory ? 'current' : null })),
        described: compiler.describe.mock.calls.map(call => call[0]), interpreted: compiler.interpret.mock.calls.map(call => call[0]),
        retired: retire.mock.calls.map(call => call[0]) });
      const reset = (): void => { for (const spy of [compiler.update, compiler.describe, compiler.interpret, retire]) spy.mockClear(); };

      // A created unreferenced file: only the file itself is described and interpreted.
      await put(root, paths.extra, "import { privateValue } from '../../../src/interfaces/api.js';\nvoid privateValue;\n");
      const created = await revised(handle, [paths.extra], 'created');
      expect(created.checked).toEqual({ path: 'membership', files: [paths.extra], accesses: 1, modelRebuilt: true });
      expect(calls()).toEqual({ updates: [{ changed: [], created: [paths.extra], deleted: [], inventory: 'current', invalidateAll: false }],
        described: [[paths.extra]], interpreted: [[paths.extra]], retired: [{ kind: 'probes' }] });
      expect(created.delta.added.map(item => [item.code, item.location?.file])).toEqual([['not-visible', paths.extra]]);
      await equalToBatch(handle, inputs);
      await audited(handle);
      reset();

      // A created file that satisfies an importer's absent probe: the importer is described and interpreted too.
      await put(root, later, 'export const later = 1;\n');
      const satisfied = await revised(handle, [later], 'created');
      expect(satisfied.checked).toEqual({ path: 'membership', files: [later, pending], accesses: 1, modelRebuilt: true });
      expect(calls()).toEqual({ updates: [{ changed: [], created: [later], deleted: [], inventory: 'current', invalidateAll: false }],
        described: [[later, pending]], interpreted: [[later, pending]], retired: [{ kind: 'probes' }] });
      expect(satisfied.coverage.some(note => note.location.file === pending)).toBe(false);
      await equalToBatch(handle, inputs);
      await audited(handle);
      reset();

      // A referenced deletion re-interprets its importer; an unreferenced one checks nothing.
      await rm(join(root, later));
      const referenced = await revised(handle, [later], 'deleted');
      expect(referenced.checked).toEqual({ path: 'membership', files: [pending], accesses: 1, modelRebuilt: true });
      expect(calls()).toEqual({ updates: [{ changed: [], created: [], deleted: [later], inventory: 'current', invalidateAll: false }],
        described: [[later, pending]], interpreted: [[pending]], retired: [{ kind: 'probes' }] });
      expect(referenced.coverage.map(note => [note.code, note.location.file])).toContainEqual(['unresolved-target', pending]);
      await equalToBatch(handle, inputs);
      await audited(handle);
      reset();

      await rm(join(root, paths.extra));
      const deleted = await revised(handle, [paths.extra], 'deleted');
      expect(deleted.checked).toEqual({ path: 'membership', files: [], accesses: 0, modelRebuilt: true });
      expect(calls()).toEqual({ updates: [{ changed: [], created: [], deleted: [paths.extra], inventory: 'current', invalidateAll: false }],
        described: [[paths.extra]], interpreted: [[]], retired: [{ kind: 'probes' }] });
      expect(deleted.delta.removed).toEqual([created.delta.added[0]!.id]);
      const report = await equalToBatch(handle, inputs);
      expect(report.snapshot!.inventory.files.map(file => file.path)).not.toContain(paths.extra);
      expect(report.snapshot!.catalog!.files.map(file => file.file)).not.toContain(paths.extra);
      expect(report.coverage.some(note => note.location.file === paths.extra)).toBe(false);
      await audited(handle);
    } finally { await handle.dispose(); }
  }, { 'subs/branch/src/pending.ts': "import { later } from './later.js';\nexport const pending = later;\n" }), timeout);

  it('re-extracts all files on the same warm compiler for configuration and dependency changes', () => fixture(async (root, inputs) => {
    const { handle, state, revision: cold } = await opened(inputs);
    try {
      const compiler = instrumentCompiler(state);
      const configuration = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8'));
      configuration.compilerOptions.paths = { '@fixture/api': ['./src/interfaces/api.ts'] };
      await put(root, 'tsconfig.json', JSON.stringify(configuration));
      const changedConfiguration = await revised(handle, ['tsconfig.json']);
      expect(changedConfiguration.checked).toEqual({ path: 'broad', files: ownedFiles, accesses: 5, modelRebuilt: true });
      expect(compiler.describe.mock.calls.map(call => call[0])).toEqual([ownedFiles]);
      expect(compiler.interpret.mock.calls.map(call => call[0])).toEqual([ownedFiles]);
      expect(compiler.dispose).not.toHaveBeenCalled();
      expect(state.adapter).toBe(compiler.adapter);
      await audited(handle);
      await equalToBatch(handle, inputs);

      const dependency = 'node_modules/fixture-dependency/index.d.ts';
      const before = cold.inputs.find(input => input.path === dependency && input.role === 'dependency');
      expect(before).toBeDefined();
      await replace(root, dependency, 'readonly n: number', 'readonly n: string');
      const changedDependency = await revised(handle, [dependency]);
      expect(changedDependency.checked).toEqual({ path: 'broad', files: ownedFiles, accesses: 5, modelRebuilt: true });
      expect(changedDependency.inputs.find(input => input.path === dependency && input.role === 'dependency')?.sha256).not.toBe(before!.sha256);
      expect(compiler.dispose).not.toHaveBeenCalled();
      expect(state.adapter).toBe(compiler.adapter);
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }, {
    [paths.rootApi]: `import type { DependencyShape } from 'fixture-dependency';\nexport type DependencyAlias = DependencyShape;\n${fixtureFiles[paths.rootApi]}`,
    'node_modules/fixture-dependency/package.json': '{"name":"fixture-dependency","version":"1.0.0","types":"index.d.ts"}',
    'node_modules/fixture-dependency/index.d.ts': 'export interface DependencyShape { readonly n: number }\n',
  }), timeout);

  it('uses broad re-extraction when a module header changes the source areas', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      await replace(root, paths.description, 'module branch', 'module branch tagged [ui]');
      const tagged = await revised(handle, [paths.description]);
      expect(tagged.checked).toEqual({ path: 'broad', files: ownedFiles, accesses: 4, modelRebuilt: true });
      expect(tagged.diagnostics.some(item => item.location?.file === paths.rootMain)).toBe(true);
      await audited(handle);
      await equalToBatch(handle, inputs);
      await put(root, paths.description, fixtureFiles[paths.description]!);
      const restored = await revised(handle, [paths.description]);
      expect(restored.checked.path).toBe('broad');
      expect(restored.outcome.check).toBe('passed');
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('re-extracts every owned file when an owned declaration shim changes a resource export', () => fixture(async (root, inputs) => {
    const { handle, state, revision: cold } = await opened(inputs);
    try {
      const shim = 'src/styles.d.ts';
      const resource = 'src/style.css';
      expect(cold.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' });
      expect(state.facts!.files[resource]!.description.dependencies.shims).toContain(shim);
      const compiler = instrumentCompiler(state);
      await replace(root, shim, 'export default styles;', 'export default styles; export const accent: string;');
      const revision = await revised(handle, [shim]);
      const all = [...ownedFiles, shim, resource].sort();
      expect(revision.checked).toEqual({ path: 'broad', files: all, accesses: cold.summary.accesses, modelRebuilt: true });
      expect(compiler.describe.mock.calls.map(call => call[0])).toEqual([all]);
      expect(compiler.interpret.mock.calls.map(call => call[0])).toEqual([all]);
      expect(compiler.update.mock.calls.some(call => call[0].invalidateAll)).toBe(true);
      expect(compiler.dispose).not.toHaveBeenCalled();
      expect(state.facts!.catalog.files.find(file => file.file === resource)?.exports.map(entry => entry.name)).toEqual(['accent', 'default']);
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }, {
    'module.ramify': `${fixtureFiles['module.ramify']}expose-src default from "style.css" to descendants\n`,
    [paths.local]: `${fixtureFiles[paths.local]}import styles from '../../../src/style.css';\nvoid styles;\n`,
    'src/styles.d.ts': 'declare module "*.css" { const styles: Record<string, string>; export default styles; }\n',
    'src/style.css': '.root { color: red; }\n',
  }), timeout);

  it('publishes invalid current inputs without stale results, preserves the last valid projection and recovers', () => fixture(async (root, inputs) => {
    const { handle, revision: valid } = await opened(inputs);
    try {
      const previous = await handle.report();
      await replace(root, paths.description, parentExposure, 'expose-src value to parent\n');
      const invalid = await revised(handle, [paths.description]);
      expect(invalid.outcome.execution).toBe('invalid');
      expect(invalid.inputId).not.toBe(valid.inputId);
      expect(invalid.inputs.find(input => input.path === paths.description)?.sha256).not.toBe(valid.inputs.find(input => input.path === paths.description)?.sha256);
      expect(invalid.diagnostics.some(item => item.category === 'description' && item.location?.file === paths.description)).toBe(true);
      const report = await equalToBatch(handle, inputs);
      expect(report.inputId).toBeNull();
      expect(report.snapshot?.results ?? []).toEqual([]);
      expect(comparable(await handle.report(undefined, valid.sequence))).toEqual(comparable(previous));
      expect(handle.current).toBe(invalid);
      await audited(handle);

      await put(root, paths.description, fixtureFiles[paths.description]!);
      const recovered = await revised(handle, [paths.description]);
      expect(recovered.sequence).toBe(invalid.sequence + 1);
      expect(recovered.outcome.execution).toBe('completed');
      expect(recovered.outcome.check).toBe('passed');
      expect(recovered.diagnostics).toEqual(valid.diagnostics);
      expect(recovered.delta.added).toEqual([]);
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('invalid-exposure-target-equals-batch: deleting a source an exposure statement names publishes the batch validation report, and restoring it recovers', () => fixture(async (root, inputs) => {
    const { handle, revision: cold } = await opened(inputs);
    try {
      // The generated sequences of `membership-differential.test.ts` found this
      // divergence: the acquisition rejects a statement without its exact file,
      // so no session path may keep the project valid.
      await rm(join(root, paths.provider));
      const invalid = await revised(handle, [paths.provider], 'deleted');
      expect(invalid.checked.path).toBe('broad');
      expect(invalid.outcome).toEqual({ execution: 'invalid', check: 'failed', coverage: 'not-run' });
      expect(invalid.diagnostics.map(item => [item.category, item.code, item.location?.file]))
        .toEqual([['description', 'missing-file', paths.description], ['description', 'missing-file', paths.description]]);
      const report = await equalToBatch(handle, inputs);
      expect(report.inputId).toBeNull();
      // A validated layout that lost an exposure target fails the acquisition; the parse never runs.
      expect(report.stages.find(stage => stage.stage === 'parse')).toMatchObject({ status: 'blocked', blockedBy: ['acquisition'] });
      await audited(handle);

      await put(root, paths.provider, fixtureFiles[paths.provider]!);
      const recovered = await revised(handle, [paths.provider], 'created');
      expect(recovered.outcome).toEqual(cold.outcome);
      expect(recovered.diagnostics).toEqual(cold.diagnostics);
      await equalToBatch(handle, inputs);
      await audited(handle);
    } finally { await handle.dispose(); }
  }), timeout);

  it('stays invalid through source-only and README-only events until the invalid description is repaired', () => fixture(async (root, inputs) => {
    const { handle, revision: valid } = await opened(inputs);
    try {
      const validReport = await handle.report();
      await replace(root, paths.description, parentExposure, 'expose-src value to parent\n');
      const invalid = await revised(handle, [paths.description]);
      expect(invalid.outcome.execution).toBe('invalid');
      await audited(handle);
      await equalToBatch(handle, inputs);

      // The invalid branch description leaves its directory a layout-invalid
      // boundary whose files are neither inventoried nor read, so a byte edit of
      // its source or README changes no input (iteration 12: an unread
      // observation answers only its kind): the invalid revision stands, and a
      // batch evaluation of the edited tree reports the same.
      await put(root, paths.provider, `${fixtureFiles[paths.provider]}export const recoveredValue = 9;\n`);
      const sourceOnly = await handle.update([{ path: paths.provider, kind: 'changed' }]);
      expect(sourceOnly).toMatchObject({ status: 'revised', identical: true, revision: { sequence: invalid.sequence, outcome: { execution: 'invalid' } } });
      expect(handle.current!.diagnostics.some(item => item.category === 'description' && item.location?.file === paths.description)).toBe(true);
      await audited(handle);
      await equalToBatch(handle, inputs);

      const purpose = 'A purpose changed while the description remained invalid.';
      await put(root, paths.readme, `# Branch\n\n${purpose}\n`);
      const readmeOnly = await handle.update([{ path: paths.readme, kind: 'changed' }]);
      expect(readmeOnly).toMatchObject({ status: 'revised', identical: true, revision: { sequence: invalid.sequence, outcome: { execution: 'invalid' } } });
      expect(handle.current!.diagnostics.some(item => item.category === 'description' && item.location?.file === paths.description)).toBe(true);
      await audited(handle);
      await equalToBatch(handle, inputs);
      expect(comparable(await handle.report(undefined, valid.sequence))).toEqual(comparable(validReport));

      await put(root, paths.description, fixtureFiles[paths.description]!);
      const recovered = await revised(handle, [paths.description]);
      expect(recovered.sequence).toBe(invalid.sequence + 1);
      expect(recovered.outcome.execution).toBe('completed');
      expect(recovered.outcome.check).toBe('passed');
      expect(recovered.checked.path).toBe('broad');
      const report = await equalToBatch(handle, inputs);
      expect(report.snapshot!.catalog!.files.find(file => file.file === paths.provider)?.exports.map(entry => entry.name)).toContain('recoveredValue');
      expect(report.snapshot!.inventory.modules.find(module => module.name === 'branch')?.purpose).toEqual({ state: 'present', readme: paths.readme, paragraph: purpose });
      await audited(handle);
    } finally { await handle.dispose(); }
  }), timeout);

  // The root-marker contract: an unmarked selected root is `unmarked-root-description`,
  // status invalid like the other invalid descriptions, including a change between
  // selection and reading. An observed update publishes what a batch read reports.
  it('publishes an unmarked or missing root description as invalid, as a batch read reports it, and recovers when the marker returns', () => fixture(async (root, inputs) => {
    const { handle, revision: valid } = await opened(inputs);
    try {
      const validReport = await handle.report();
      const unmarkedMessage = `${join(root, 'module.ramify')} does not carry the root marker: add root before module on its module line to declare the project root`;
      await put(root, 'module.ramify', fixtureFiles['module.ramify']!.replace('root module fixture', 'module fixture'));
      const unmarked = await revised(handle, ['module.ramify']);
      expect(unmarked.sequence).toBe(valid.sequence + 1);
      expect(unmarked.outcome).toEqual({ execution: 'invalid', check: 'failed', coverage: 'not-run' });
      expect(unmarked.diagnostics.map(item => [item.code, item.category, item.message]))
        .toEqual([['unmarked-root-description', 'layout', unmarkedMessage]]);
      expect((await equalToBatch(handle, inputs)).snapshot?.results ?? []).toEqual([]);
      expect(comparable(await handle.report(undefined, valid.sequence))).toEqual(comparable(validReport));
      await audited(handle);

      // A module line that cannot be read does not carry the marker either. A resident
      // check passes its invocation, the opening request here, with every update.
      const invocation = { project: inputs.project, capabilities: inputs.capabilities };
      await put(root, 'module.ramify', 'invalid declaration\n');
      for (const changes of [[{ path: 'module.ramify', kind: 'changed' as const }], []]) {
        const unreadable = await handle.update(changes, {}, invocation);
        expect(unreadable.status).toBe('revised');
        expect(handle.current!.outcome).toEqual({ execution: 'invalid', check: 'failed', coverage: 'not-run' });
        expect(handle.current!.diagnostics.map(item => [item.code, item.category, item.message]))
          .toEqual([['unmarked-root-description', 'layout', unmarkedMessage]]);
      }
      await equalToBatch(handle, inputs);
      await audited(handle);

      await rm(join(root, 'module.ramify'));
      const missing = await handle.update([{ path: 'module.ramify', kind: 'deleted' }], {}, invocation);
      if (missing.status !== 'revised') throw new Error(`Expected a revision: ${JSON.stringify(missing)}`);
      expect(missing.revision.outcome).toEqual({ execution: 'invalid', check: 'failed', coverage: 'not-run' });
      expect(missing.revision.diagnostics.map(item => item.code)).toEqual(['missing-root-description']);
      await equalToBatch(handle, inputs);
      await audited(handle);

      await put(root, 'module.ramify', fixtureFiles['module.ramify']!);
      const restored = await handle.update([{ path: 'module.ramify', kind: 'created' }], {}, invocation);
      if (restored.status !== 'revised') throw new Error(`Expected a revision: ${JSON.stringify(restored)}`);
      const recovered = restored.revision;
      expect(recovered.outcome).toEqual(valid.outcome);
      expect(recovered.diagnostics).toEqual(valid.diagnostics);
      expect(recovered.checked.path).toBe('broad');
      await equalToBatch(handle, inputs);
      await audited(handle);
    } finally { await handle.dispose(); }
  }), timeout);

  it('publishes a child that gains the root marker as an undeclared project boundary and recovers when it loses it', () => fixture(async (root, inputs) => {
    const { handle, revision: valid } = await opened(inputs);
    try {
      await put(root, 'subs/sibling/module.ramify', 'ramify 1\nroot module sibling\n');
      const marked = await revised(handle, ['subs/sibling/module.ramify']);
      expect(marked.outcome).toEqual({ execution: 'invalid', check: 'failed', coverage: 'not-run' });
      expect(marked.diagnostics.map(item => [item.code, item.category, item.location?.file]))
        .toEqual([['undeclared-project-boundary', 'layout', 'subs/sibling/module.ramify']]);
      await equalToBatch(handle, inputs);
      await audited(handle);

      await put(root, 'subs/sibling/module.ramify', fixtureFiles['subs/sibling/module.ramify']!);
      const recovered = await revised(handle, ['subs/sibling/module.ramify']);
      expect(recovered.outcome).toEqual(valid.outcome);
      expect(recovered.diagnostics).toEqual(valid.diagnostics);
      await equalToBatch(handle, inputs);
      await audited(handle);
    } finally { await handle.dispose(); }
  }), timeout);

  it('keeps current and historical facts unpublished when extraction fails and recovers with a broad update', () => fixture(async (root, inputs) => {
    const { handle, state, revision: current } = await opened(inputs);
    try {
      const compiler = instrumentCompiler(state);
      const retained = state.facts;
      const report = await handle.report();
      compiler.describe.mockRejectedValueOnce(new WorkLimit('maxExports', 1, 2));
      await replace(root, paths.provider, '  return 2;', '  return 3;');
      const failed = await handle.update([{ path: paths.provider, kind: 'changed' }]);
      expect(failed.status).toBe('reported');
      if (failed.status !== 'reported') throw new Error('Expected the extraction failure');
      expect(failed.report.outcome.execution).toBe('incomplete');
      expect(failed.report.outcome.check).toBe('not-run');
      expect(failed.report.diagnostics.some(item => item.code === 'resource-limit')).toBe(true);
      expect(handle.current).toBe(current);
      expect(state.facts).toBe(retained);
      expect(comparable(await handle.report())).toEqual(comparable(report));
      expect(await handle.report(undefined, current.sequence + 1)).toBeNull();
      const recovered = await revised(handle, [paths.provider]);
      expect(recovered.sequence).toBe(current.sequence + 1);
      expect(recovered.checked.path).toBe('broad');
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('takes the observer-determined path for an unknown event that changes an owned input', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      // The unknown label claims nothing about the event. The observer re-observes
      // the path, finds a content edit, and the revision takes the path that edit earns.
      await replace(root, paths.provider, '  return 2;', '  return 9;');
      const revision = await revised(handle, [paths.provider], 'unknown');
      expect(revision.checked.path).toBe('unchanged-surface');
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('does not commit private facts or history when a revision exceeds the retained fact budget', () => fixture(async (root, inputs) => {
    const baseline = await opened(inputs);
    const bytes = baseline.handle.status().factBytes;
    await baseline.handle.dispose();
    // The candidate is counted jointly with the retained revision, so only the
    // objects it does not share with that revision add to the total. A budget
    // of exactly the cold facts admits the cold open and refuses any candidate
    // that adds an object.
    const { handle, state, revision } = await opened({ ...inputs, session: { ...inputs.session, maxRetainedFactBytes: bytes } });
    try {
      const before = state.facts;
      const report = await handle.report();
      await put(root, paths.readme, `# Branch\n\n${'A longer purpose. '.repeat(100)}\n`);
      const refused = await handle.update([{ path: paths.readme, kind: 'changed' }]);
      expect(refused.status).toBe('reported');
      if (refused.status !== 'reported') throw new Error('Expected a retained fact limit failure');
      expect(refused.report.outcome.execution).toBe('incomplete');
      expect(refused.report.diagnostics.some(item => item.code === 'resource-limit' && item.limit?.name === 'maxRetainedFactBytes')).toBe(true);
      expect(handle.current).toBe(revision);
      expect(state.facts).toBe(before);
      expect(handle.status().factBytes).toBe(bytes);
      expect(await handle.report(undefined, revision.sequence + 1)).toBeNull();
      expect(comparable(await handle.report())).toEqual(comparable(report));
    } finally { await handle.dispose(); }
  }), timeout);

  it('does not publish computed facts if promotion of compiler observations fails', () => fixture(async (root, inputs) => {
    const { handle, state, revision } = await opened(inputs);
    try {
      const { observer, apply } = instrumentObserver(state);
      const compiler = instrumentCompiler(state);
      const before = state.facts;
      const report = await handle.report();
      apply.mockImplementationOnce(observer.apply.bind(observer)).mockResolvedValueOnce({ kind: 'incomplete',
        issues: [{ code: 'read-failure', path: paths.provider, message: 'Injected failure while promoting compiler observations' }] });
      await replace(root, paths.provider, '  return 2;', '  return 8;');
      const refused = await handle.update([{ path: paths.provider, kind: 'changed' }]);
      expect(refused.status).toBe('reported');
      if (refused.status !== 'reported') throw new Error('Expected observation promotion to fail');
      expect(refused.report.outcome.execution).toBe('incomplete');
      expect(refused.report.diagnostics.some(item => item.code === 'read-failure')).toBe(true);
      expect(apply).toHaveBeenCalledTimes(2);
      expect(apply.mock.calls[1]![0]).toEqual([]);
      expect(compiler.describe).toHaveBeenCalledTimes(1);
      expect(handle.current).toBe(revision);
      expect(state.facts).toBe(before);
      expect(comparable(await handle.report())).toEqual(comparable(report));
      expect(await handle.report(undefined, revision.sequence + 1)).toBeNull();
      const recovered = await revised(handle, [paths.provider]);
      expect(recovered.sequence).toBe(revision.sequence + 1);
      expect(recovered.checked.path).toBe('broad');
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('rejects publication when a compiler observation advances past the extracted source snapshot', () => fixture(async (root, inputs) => {
    const { handle, state, revision } = await opened(inputs);
    try {
      const adapter = state.adapter!;
      const compiler = instrumentCompiler(state);
      const before = state.facts;
      const report = await handle.report();
      compiler.describe.mockImplementationOnce(async (...args) => {
        const extracted = await adapter.describe(...args);
        await replace(root, paths.provider, '  return 8;', '  return 9;');
        const bytes = await readFile(join(root, paths.provider));
        state.observer!.sink.file(paths.provider, createHash('sha256').update(bytes).digest('hex'), bytes.length, 'source');
        return extracted;
      });
      await replace(root, paths.provider, '  return 2;', '  return 8;');
      const refused = await handle.update([{ path: paths.provider, kind: 'changed' }]);
      expect(refused.status).toBe('reported');
      if (refused.status !== 'reported') throw new Error('Expected snapshot coherence admission to fail');
      expect(refused.report.outcome.execution).toBe('incomplete');
      expect(refused.report.diagnostics.some(item => item.code === 'changed-input')).toBe(true);
      expect(handle.current).toBe(revision);
      expect(state.facts).toBe(before);
      expect(state.stale).toBe(true);
      expect(comparable(await handle.report())).toEqual(comparable(report));
      expect(await handle.report(undefined, revision.sequence + 1)).toBeNull();
      const recovered = await revised(handle, [paths.provider]);
      expect(recovered.sequence).toBe(revision.sequence + 1);
      expect(recovered.checked.path).toBe('broad');
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('hook-passes-under-limit: publishes when only the full report exceeds maxReportBytes and keeps published facts when what a revision keeps exceeds it', () => fixture(async (root, inputs) => {
    const baseline = await opened(inputs);
    const bytes = Buffer.byteLength(JSON.stringify(await baseline.handle.report()));
    await baseline.handle.dispose();
    const maximum = bytes + 64 * 1024;
    const bounded = { ...inputs, limits: { ...inputs.limits, maxReportBytes: maximum } };
    const { handle, state } = await opened(bounded);
    try {
      // The oversized purpose is only in the snapshot: the revision publishes and a full report still fails.
      await put(root, paths.readme, `# Branch\n\n${'Very long purpose. '.repeat(Math.ceil(maximum / 9))}\n`);
      const passed = await revised(handle, [paths.readme]);
      expect(passed.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' });
      expect(passed.summary.complete).toBe(true);
      const full = await equalToBatch(handle, bounded);
      expect(full.outcome.execution).toBe('incomplete');
      expect(full.snapshot).toBeNull();
      expect(full.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource-limit',
        limit: expect.objectContaining({ name: 'maxReportBytes', maximum }) }));
      await audited(handle);

      // Findings are kept by the revision: exceeding the limit with them refuses publication.
      const before = state.facts;
      const report = await handle.report();
      const denied = Array.from({ length: Math.ceil(maximum / 200) }, (_, index) =>
        `import { privateValue as hidden${index} } from '../../../src/interfaces/api.js';\nvoid hidden${index};\n`).join('');
      await put(root, paths.sibling, `${fixtureFiles[paths.sibling]!}${denied}`);
      const refused = await handle.update([{ path: paths.sibling, kind: 'changed' }]);
      expect(refused.status).toBe('reported');
      if (refused.status !== 'reported') throw new Error('Expected report size admission to fail');
      expect(refused.report.outcome.execution).toBe('incomplete');
      expect(refused.report.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource-limit',
        limit: expect.objectContaining({ name: 'maxReportBytes', maximum }) }));
      expect(handle.current).toBe(passed);
      expect(state.facts).toBe(before);
      expect(comparable(await handle.report())).toEqual(comparable(report));
      expect(await handle.report(undefined, passed.sequence + 1)).toBeNull();
      await put(root, paths.sibling, fixtureFiles[paths.sibling]!);
      await put(root, paths.readme, fixtureFiles[paths.readme]!);
      const recovered = await revised(handle, [paths.sibling, paths.readme]);
      expect(recovered.sequence).toBe(passed.sequence + 1);
      expect(recovered.outcome.execution).toBe('completed');
      await audited(handle);
      await equalToBatch(handle, bounded);
    } finally { await handle.dispose(); }
  }), timeout);
});

describe('cancelled sweeps and revisions', () => {
  const findings = (revision: { readonly delta: { readonly added: readonly { code: string; location?: { file: string } | null }[] } }) =>
    revision.delta.added.map(item => [item.code, item.location?.file]);

  it('cancel-before-apply-keeps-description: a sweep cancelled after reobservation leaves the next description edit on the description path', () => fixture(async (root, inputs) => {
    const { handle, state, revision } = await opened(inputs);
    try {
      const { observer, apply, reobserve } = instrumentObserver(state);
      const cancellation = new AbortController();
      reobserve.mockImplementationOnce(async signal => {
        const changes = await observer.reobserve(signal);
        cancellation.abort();
        return changes;
      });
      await replace(root, paths.description, parentExposure, '');
      expect(await handle.sweep({ signal: cancellation.signal })).toEqual({ status: 'cancelled' });
      expect(reobserve).toHaveBeenCalledTimes(1);
      expect(apply).not.toHaveBeenCalled();
      expect(handle.current).toBe(revision);
      const denied = await revised(handle, [paths.description]);
      expect(denied.checked.path).toBe('description');
      expect(findings(denied)).toEqual([['not-visible', paths.rootMain]]);
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('cancel-after-apply-stays-exact: a sweep cancelled after the observer applied its edit recomputes that edit from the disk', () => fixture(async (root, inputs) => {
    const { handle, state, revision } = await opened(inputs);
    try {
      const { observer, apply } = instrumentObserver(state);
      const cancellation = new AbortController();
      apply.mockImplementationOnce(async (changes, signal) => {
        const update = await observer.apply(changes, signal);
        cancellation.abort();
        return update;
      });
      await replace(root, paths.description, parentExposure, '');
      expect(await handle.sweep({ signal: cancellation.signal })).toEqual({ status: 'cancelled' });
      // The revision step itself observed the cancellation; promotion never ran.
      expect(apply).toHaveBeenCalledTimes(1);
      expect(state.stale).toBe(true);
      expect(handle.current).toBe(revision);
      expect(await handle.report(undefined, revision.sequence + 1)).toBeNull();
      // The observer already holds the edit, so the same event would otherwise compare identical.
      const recomputed = await revised(handle, [paths.description]);
      expect(recomputed.checked.path).toBe('broad');
      expect(findings(recomputed)).toEqual([['not-visible', paths.rootMain]]);
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('cancel-check-before-revise: a signal aborted while reobservation compares inputs with the disk never enters the revision step', () => fixture(async (root, inputs) => {
    const { handle, state, revision } = await opened(inputs);
    try {
      const { observer, reobserve } = instrumentObserver(state);
      const cancellation = new AbortController();
      let armed = false;
      // Abort at the first read of the signal after reobservation starts. The
      // observer's start-up check uses a bound method, so that read is the
      // comparison loop's own cancellation check.
      const signal = new Proxy(cancellation.signal, { get(target, property) {
        if (property === 'aborted' && armed) cancellation.abort();
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      let reobservation: Promise<unknown> | undefined;
      reobserve.mockImplementationOnce(given => {
        armed = true;
        const pending = observer.reobserve(given);
        reobservation = pending;
        return pending;
      });
      await replace(root, paths.description, parentExposure, '');
      const entered = revisionsEntered();
      expect(await handle.sweep({ signal })).toEqual({ status: 'cancelled' });
      expect(cancellation.signal.aborted).toBe(true);
      await expect(reobservation).rejects.toThrow();
      expect(revisionsEntered()).toBe(entered);
      expect(state.stale).toBe(false);
      expect(handle.current).toBe(revision);
      const denied = await revised(handle, [paths.description]);
      expect(denied.checked.path).toBe('description');
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('recomputes from the disk when reobservation promoted a changed compiler read before the sweep was cancelled', () => fixture(async (root, inputs) => {
    const { handle, state, revision } = await opened(inputs);
    try {
      const { observer, reobserve } = instrumentObserver(state);
      const cancellation = new AbortController();
      reobserve.mockImplementationOnce(async signal => {
        const changes = await observer.reobserve(signal);
        cancellation.abort();
        return changes;
      });
      const deniedImport = "import { privateValue } from '../../../src/interfaces/api.js';\nvoid privateValue;\n";
      await replace(root, paths.local, 'void rootValue;', `void rootValue;\n${deniedImport}`);
      const bytes = await readFile(join(root, paths.local));
      state.observer!.sink.file(paths.local, createHash('sha256').update(bytes).digest('hex'), bytes.length, 'source');
      expect(await handle.sweep({ signal: cancellation.signal })).toEqual({ status: 'cancelled' });
      // Promotion refreshed the recorded read, so the observer moved past the published revision.
      expect(state.stale).toBe(true);
      expect(handle.current).toBe(revision);
      const recomputed = await revised(handle, [paths.local]);
      expect(recomputed.checked.path).toBe('broad');
      expect(findings(recomputed)).toEqual([['not-visible', paths.local]]);
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('recomputes from the disk when a completed revision is cancelled before promoting compiler reads', () => fixture(async (root, inputs) => {
    const { handle, state, revision } = await opened(inputs);
    try {
      const { observer, apply } = instrumentObserver(state);
      const cancellation = new AbortController();
      // The first call is the revision step's own application; the second is promotion.
      apply.mockImplementationOnce(observer.apply.bind(observer)).mockImplementationOnce(async (changes, signal) => {
        expect(changes).toEqual([]);
        expect(signal).toBe(cancellation.signal);
        cancellation.abort();
        throw Object.assign(new Error('Cancelled before promoting compiler observations'), { name: 'AbortError' });
      });
      await replace(root, paths.description, parentExposure, '');
      expect(await handle.sweep({ signal: cancellation.signal })).toEqual({ status: 'cancelled' });
      expect(apply).toHaveBeenCalledTimes(2);
      // The revision step already applied the edit to the observer, so the
      // session cannot stay as published even though promotion never began.
      expect(state.stale).toBe(true);
      expect(handle.current).toBe(revision);
      expect(await handle.report(undefined, revision.sequence + 1)).toBeNull();
      const recomputed = await revised(handle, [paths.description]);
      expect(recomputed.checked.path).toBe('broad');
      expect(findings(recomputed)).toEqual([['not-visible', paths.rootMain]]);
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  // An acquisition cancellation that the current operation did not request can
  // only come from state an earlier, aborted operation left behind.
  const staleCancellation = (): Error => Object.assign(new Error('Acquisition was cancelled'), { name: 'Cancelled' });

  it('reopens the project when reobservation meets a cancellation the sweep did not request', () => fixture(async (root, inputs) => {
    const { handle, state, revision } = await opened(inputs);
    try {
      const { observer, reobserve } = instrumentObserver(state);
      const compiler = instrumentCompiler(state);
      reobserve.mockRejectedValueOnce(staleCancellation());
      await replace(root, paths.description, parentExposure, '');
      const result = await handle.sweep({ signal: new AbortController().signal });
      expect(result.status).toBe('revised');
      if (result.status !== 'revised') throw new Error(`Expected a revision: ${JSON.stringify(result)}`);
      expect(result.revision.sequence).toBe(revision.sequence + 1);
      expect(result.revision.checked.path).toBe('broad');
      expect(findings(result.revision)).toEqual([['not-visible', paths.rootMain]]);
      // The released observer and the compiler reporting to its sink were disposed and replaced.
      expect(compiler.dispose).toHaveBeenCalledTimes(1);
      await expect(observer.reobserve()).rejects.toThrow('disposed');
      expect(state.observer).not.toBeNull();
      expect(await handle.sweep()).toEqual({ status: 'unchanged' });
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('reopens the project when an update meets a cancellation it did not request', () => fixture(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      const { observer, apply } = instrumentObserver(state);
      apply.mockRejectedValueOnce(staleCancellation());
      await replace(root, paths.description, parentExposure, '');
      const reopened = await revised(handle, [paths.description]);
      expect(reopened.checked.path).toBe('broad');
      expect(reopened.changed).toEqual([paths.description]);
      expect(findings(reopened)).toEqual([['not-visible', paths.rootMain]]);
      expect(apply).toHaveBeenCalledTimes(1);
      await expect(observer.apply([])).rejects.toThrow('disposed');
      await put(root, paths.description, fixtureFiles[paths.description]!);
      expect((await revised(handle, [paths.description])).checked.path).toBe('description');
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);
});

describe('timing fields outside the revision total', () => {
  it('timing-fields: an update reports its invocation check beside unchanged revision timings', () => fixture(async (root, inputs) => {
    const { handle, revision } = await opened(inputs);
    try {
      const stages = ['accesses', 'classify', 'companions', 'compiler', 'decide', 'descriptions', 'inventory', 'link', 'publish', 'total'];
      expect(Object.keys(revision.timings).sort()).toEqual(stages);
      const invocation = { project: inputs.project, capabilities: inputs.capabilities };
      // Without an invocation nothing is checked.
      expect(await handle.update([])).toEqual({ status: 'revised', revision, identical: true, reacquired: false, timings: { invocationCheck: 0, promotion: 0 } });
      // The identical update keeps the published revision and its timings; its own check sits beside them.
      const same = await handle.update([], {}, invocation);
      expect(same).toEqual({ status: 'revised', revision, identical: true, reacquired: false, timings: { invocationCheck: expect.any(Number), promotion: 0 } });
      expect(same.status === 'revised' && same.timings!.invocationCheck).toBeGreaterThan(0);
      // A refused invocation reports its check with the refusal.
      const refused = await handle.update([], {}, { ...invocation, capabilities: ['coverage'] });
      expect(refused).toMatchObject({ status: 'reported', timings: { invocationCheck: expect.any(Number), promotion: 0 } });
      expect(refused.status === 'reported' && refused.report.diagnostics[0]?.message).toContain('different capability set');
      await replace(root, paths.provider, '  return 2;', '  void 0;\n  return 2;');
      const edited = await handle.update([{ path: paths.provider, kind: 'changed' }], {}, invocation);
      if (edited.status !== 'revised') throw new Error(JSON.stringify(edited));
      expect([edited.identical, edited.revision.checked.path]).toEqual([false, 'unchanged-surface']);
      expect(Object.keys(edited.revision.timings).sort()).toEqual(stages);
      expect(Object.keys(edited.timings!)).toEqual(['invocationCheck', 'promotion']);
      expect(edited.timings!.invocationCheck).toBeGreaterThan(0);
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('promotion-timed: a revised update reports its promotion, which lies inside the total and outside the eight stages', () => fixture(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      const stages = ['classify', 'inventory', 'compiler', 'descriptions', 'accesses', 'link', 'decide', 'publish'] as const;
      const outside = (revision: SessionRevision): number => revision.timings.total - stages.reduce((sum, stage) => sum + revision.timings[stage], 0);
      // Promotion is the observer's empty apply after computation; the revision step's own apply names the changes.
      const { observer, apply } = instrumentObserver(state);
      const delayMs = 40;
      let promotions = 0;
      apply.mockImplementation(async (changes, signal) => {
        if (!changes.length) { promotions++; await new Promise(resolve => setTimeout(resolve, delayMs)); }
        return observer.apply(changes, signal);
      });
      await put(root, paths.extra, 'export const extra = 1;\n');
      const created = await handle.update([{ path: paths.extra, kind: 'created' }]);
      if (created.status !== 'revised') throw new Error(JSON.stringify(created));
      expect([created.identical, created.revision.checked.path, promotions]).toEqual([false, 'membership', 1]);
      expect(Object.keys(created.timings!)).toEqual(['invocationCheck', 'promotion']);
      // The companion pass is timed inside `decide`, so it is a field but not a disjoint stage.
      expect(Object.keys(created.revision.timings).sort()).toEqual([...stages, 'companions', 'total'].sort());
      const { promotion } = created.timings!;
      expect(promotion).toBeGreaterThanOrEqual(delayMs - 1);
      // The stages are disjoint, so the promotion fits in the time outside them.
      expect(promotion).toBeLessThanOrEqual(outside(created.revision) + 0.001);
      // A narrow edit promotes too; an identical update does not.
      await replace(root, paths.provider, '  return 2;', '  void 0;\n  return 2;');
      const edited = await handle.update([{ path: paths.provider, kind: 'changed' }]);
      if (edited.status !== 'revised') throw new Error(JSON.stringify(edited));
      expect([edited.revision.checked.path, promotions]).toEqual(['unchanged-surface', 2]);
      expect(edited.timings!.promotion).toBeGreaterThanOrEqual(delayMs - 1);
      expect(edited.timings!.promotion).toBeLessThanOrEqual(outside(edited.revision) + 0.001);
      expect(await handle.update([{ path: paths.provider, kind: 'changed' }])).toEqual({ status: 'revised', revision: edited.revision, identical: true, reacquired: false,
        timings: { invocationCheck: 0, promotion: 0 } });
      // An in-process sweep that finds nothing reports no timings; its hosting layers add them.
      expect(await handle.sweep()).toEqual({ status: 'unchanged' });
      apply.mockImplementation((changes, signal) => observer.apply(changes, signal));
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);
});

describe('membership path', () => {
  const branch = 'subs/branch/src';
  const membershipFiles: Record<string, string> = {
    [`${branch}/consumer.ts`]: "import { later } from './later.js';\nexport const sum = later;\n",
    [`${branch}/bare.ts`]: "export * from './soon';\n",
    [`${branch}/remove.ts`]: "import { value } from './provider.js';\nimport { ghost } from './ghost.js';\nexport const remove = value + ghost;\n",
    [`${branch}/user.ts`]: "import { remove } from './remove.js';\nexport const used = remove;\n",
    [`${branch}/lonely.ts`]: 'export const lonely = 1;\n',
  };
  /** The published revision's inputs and identity against a fresh batch run over the same disk. */
  const expectBatchInputs = async (revision: SessionRevision, inputs: Parameters<typeof equalToBatch>[1], handle: Parameters<typeof equalToBatch>[0]) => {
    const report = await equalToBatch(handle, inputs);
    expect(revision.inputs).toEqual(report.snapshot!.inputs);
    expect(revision.inputId).toBe(report.inputId);
    await audited(handle);
  };
  const labels = (revision: SessionRevision, prefix: string): string[] => revision.inputs.map(input => input.path).filter(path => path.startsWith(prefix));

  it('membership-identity-equals-batch: unreferenced and referenced deletions and created files that satisfy an absent or extensionless probe publish the batch inputs', () => fixture(async (root, inputs) => {
    const { handle, revision: cold } = await opened(inputs);
    try {
      const step = async (path: string, kind: 'created' | 'deleted', text?: string): Promise<SessionRevision> => {
        if (text === undefined) await rm(join(root, path)); else await put(root, path, text);
        const revision = await revised(handle, [path], kind);
        expect(revision.checked.path).toBe('membership');
        await expectBatchInputs(revision, inputs, handle);
        return revision;
      };
      // The compiler's extension probes of each failed import are recorded, attributed to no file.
      expect(labels(cold, `${branch}/ghost.js.`).length).toBeGreaterThan(0);
      expect(labels(cold, `${branch}/later.js.`).length).toBeGreaterThan(0);
      expect(labels(cold, `${branch}/soon.`).length).toBeGreaterThan(0);

      const unreferenced = await step(`${branch}/lonely.ts`, 'deleted');
      expect(labels(unreferenced, `${branch}/lonely`)).toEqual([]);
      const referenced = await step(`${branch}/remove.ts`, 'deleted');
      expect(referenced.checked.files).toEqual([`${branch}/user.ts`]);
      expect(labels(referenced, `${branch}/ghost`)).toEqual([]);
      const probed = await step(`${branch}/later.ts`, 'created', 'export const later = 2;\n');
      expect(probed.checked.files).toEqual([`${branch}/consumer.ts`, `${branch}/later.ts`]);
      expect(labels(probed, `${branch}/later.js.`)).toEqual([]);
      const extensionless = await step(`${branch}/soon.ts`, 'created', 'export const soon = 3;\n');
      expect(extensionless.checked.files).toEqual([`${branch}/bare.ts`, `${branch}/soon.ts`]);
      expect(labels(extensionless, `${branch}/soon.`)).toEqual([`${branch}/soon.ts`]);
      const fresh = await step(`${branch}/fresh.ts`, 'created', "import { value } from './provider.js';\nexport const fresh = value;\n");
      expect(fresh.checked).toEqual({ path: 'membership', files: [`${branch}/fresh.ts`], accesses: 1, modelRebuilt: true });
      // Restoring the referenced file resolves its importer again.
      const restored = await step(`${branch}/remove.ts`, 'created', membershipFiles[`${branch}/remove.ts`]!);
      expect(restored.checked.files).toEqual([`${branch}/remove.ts`, `${branch}/user.ts`]);
    } finally { await handle.dispose(); }
  }, membershipFiles), timeout);

  it('membership-path-narrow, broad-kept: matching completes recorded bases and stems, and the reach rule names each unbounded update', () => {
    const facts = { indexes: { ...emptyIndexes, contributors: {
      'src/later.js': ['src/consumer.ts'], 'src/soon': ['src/bare.ts'], 'src/dir': ['src/index-user.ts'], 'src/gone.ts': ['src/gone.ts', 'src/user.ts'],
      'src/other.ts': ['src/other.ts'], 'src/lateral': ['src/unrelated.ts'], '../outside/src/later.ts': ['src/outside.ts'],
    } } } as unknown as SessionFacts;
    expect(membershipMatches(facts, ['src/later.ts'], [])).toEqual(['src/consumer.ts']);
    expect(membershipMatches(facts, ['src/later.ios.ts'], [])).toEqual(['src/consumer.ts']);
    expect(membershipMatches(facts, ['src/soon/index.ts', 'src/dir.ts'], [])).toEqual(['src/bare.ts', 'src/index-user.ts']);
    expect(membershipMatches(facts, [], ['src/gone.ts'])).toEqual(['src/user.ts']);
    expect(membershipMatches(facts, ['src/unrelated.ts'], ['src/missing.ts'])).toEqual([]);
    const bounded = { added: [], removed: [], global: [], spelled: true };
    expect(reachRefusal(bounded, true)).toBeNull();
    expect(reachRefusal(undefined, false)).toBe('reach-unknown');
    expect(reachRefusal({ ...bounded, added: ['node_modules/pkg/index.d.ts'] }, true)).toBe('program');
    expect(reachRefusal({ ...bounded, removed: ['node_modules/pkg/index.d.ts'] }, false)).toBe('program');
    expect(reachRefusal({ ...bounded, global: ['src/script.ts'] }, false)).toBe('global');
    expect(reachRefusal({ ...bounded, spelled: false }, true)).toBe('unspelled');
    expect(reachRefusal({ ...bounded, spelled: false }, false)).toBeNull();
  });

  it('membership-identity-equals-batch: a created owned file labelled unknown takes the membership path', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      // The label makes no claim about the event; the observer re-observes the
      // path, finds the creation, and the membership path takes it.
      await put(root, `${branch}/fresh.ts`, "import { value } from './provider.js';\nexport const fresh = value;\n");
      const created = await revised(handle, [`${branch}/fresh.ts`], 'unknown');
      expect(created.checked).toEqual({ path: 'membership', files: [`${branch}/fresh.ts`], accesses: 1, modelRebuilt: true });
      await expectBatchInputs(created, inputs, handle);
    } finally { await handle.dispose(); }
  }, membershipFiles), timeout);

  it('membership-identity-equals-batch: a deleted owned file labelled unknown takes the membership path', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      await rm(join(root, `${branch}/remove.ts`));
      const deleted = await revised(handle, [`${branch}/remove.ts`], 'unknown');
      expect(deleted.checked).toEqual({ path: 'membership', files: [`${branch}/user.ts`], accesses: 1, modelRebuilt: true });
      await expectBatchInputs(deleted, inputs, handle);
    } finally { await handle.dispose(); }
  }, membershipFiles), timeout);

  /** Every broad revision below invalidates the whole program after the named files enter it. */
  const expectBroad = async (handle: RetainedSession, state: Parameters<typeof instrumentCompiler>[0], retire: ReturnType<typeof instrumentObserver>['retire'],
    inputs: Parameters<typeof equalToBatch>[1], names: readonly string[], kind: 'changed' | 'created' | 'deleted' | 'unknown',
    retirements: readonly string[]): Promise<SessionRevision> => {
    // A changed area derivation replaces the adapter, so each step instruments the current one.
    const compiler = instrumentCompiler(state);
    retire.mockClear();
    const revision = await revised(handle, names, kind);
    expect(revision.checked.path).toBe('broad');
    expect(compiler.update.mock.calls.map(call => call[0].invalidateAll).at(-1)).toBe(true);
    expect(retire.mock.calls.map(call => call[0].kind)).toEqual(retirements);
    await expectBatchInputs(revision, inputs, handle);
    return revision;
  };

  it('broad-kept: structural, configuration, non-owned, unexplained and area changes keep the whole invalidation', () => fixture(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      const { retire, observer } = instrumentObserver(state);
      const configuration = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8'));
      configuration.compilerOptions.strict = true;
      await put(root, 'tsconfig.json', JSON.stringify(configuration));
      // Every whole invalidation retires the compiler observations reported before it, once.
      await expectBroad(handle, state, retire, inputs, ['tsconfig.json'], 'changed', ['all']);
      await replace(root, 'node_modules/fixture-dependency/index.d.ts', 'readonly n: number', 'readonly n: string');
      await expectBroad(handle, state, retire, inputs, ['node_modules/fixture-dependency/index.d.ts'], 'changed', ['all']);
      // A compiler report still pending at the update is promoted by it: a change no created file explains.
      await put(root, `${branch}/explained.ts`, 'export const explained = 1;\n');
      observer.sink.absent(join(root, 'node_modules/unexplained.d.ts'));
      await expectBroad(handle, state, retire, inputs, [`${branch}/explained.ts`], 'created', ['all']);
      // The first owned test file makes `src/tests/` appear. The derived source areas follow the module header,
      // not the directory, so the compiler is kept.
      await put(root, `${branch}/tests/branch.test.ts`, 'export const spec = 1;\n');
      await expectBroad(handle, state, retire, inputs, [`${branch}/tests/branch.test.ts`], 'created', ['all']);
      // A new child module derives new areas: the compiler is replaced after the whole invalidation, so the
      // observations the old one reported are retired again before the new one reads.
      await put(root, 'subs/branch/subs/twig/module.ramify', 'ramify 1\nmodule twig\n');
      await put(root, 'subs/branch/subs/twig/README.md', '# Twig\n\nA new child.\n');
      await put(root, 'subs/branch/subs/twig/src/twig.ts', 'export const twig = 1;\n');
      await expectBroad(handle, state, retire, inputs, ['subs/branch/subs/twig/module.ramify'], 'created', ['all', 'all']);
    } finally { await handle.dispose(); }
  }, {
    ...membershipFiles,
    [paths.rootApi]: `import type { DependencyShape } from 'fixture-dependency';\nexport type DependencyAlias = DependencyShape;\n${fixtureFiles[paths.rootApi]}`,
    'node_modules/fixture-dependency/package.json': '{"name":"fixture-dependency","version":"1.0.0","types":"index.d.ts"}',
    'node_modules/fixture-dependency/index.d.ts': 'export interface DependencyShape { readonly n: number }\n',
  }), timeout);

  it('broad-kept: a membership change the facts or the compiler cannot bound falls back to the whole invalidation', () => fixture(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      const { retire } = instrumentObserver(state);
      const refused = (names: readonly string[], kind: 'created' | 'deleted', retirements: readonly string[]) =>
        expectBroad(handle, state, retire, inputs, names, kind, retirements);
      // Refused from the facts before any compiler work.
      await put(root, `${branch}/ambient.d.ts`, 'declare module "ambient-name" { export const ambient: number; }\n');
      await refused([`${branch}/ambient.d.ts`], 'created', ['all']);
      await put(root, `${branch}/view.tsx`, 'export const view = 1;\n');
      expect((await revised(handle, [`${branch}/view.tsx`], 'created')).checked.path).toBe('membership');
      await rm(join(root, `${branch}/view.tsx`));
      await refused([`${branch}/view.tsx`], 'deleted', ['all']);
      await put(root, `${branch}/solo/solo.ts`, 'export const solo = 1;\n');
      expect((await revised(handle, [`${branch}/solo/solo.ts`], 'created')).checked.path).toBe('membership');
      await rm(join(root, `${branch}/solo/solo.ts`));
      await refused([`${branch}/solo/solo.ts`], 'deleted', ['all']);
      // Refused from the compiler's reach after its incremental update.
      await put(root, `${branch}/script.ts`, 'declare module "script-name" { export const script: number; }\n');
      await refused([`${branch}/script.ts`], 'created', ['probes', 'all']);
      await put(root, `${branch}/package-user.ts`, "import type { DependencyShape } from 'fixture-dependency';\nexport type Used = DependencyShape;\n");
      await refused([`${branch}/package-user.ts`], 'created', ['probes', 'all']);
      await rm(join(root, `${branch}/package-user.ts`));
      await refused([`${branch}/package-user.ts`], 'deleted', ['probes', 'all']);
      await put(root, `${branch}/referencing.ts`, '/// <reference path="../../../node_modules/fixture-dependency/index.d.ts" />\nexport const referencing = 1;\n');
      await refused([`${branch}/referencing.ts`], 'created', ['probes', 'all']);
      // An unresolved package access names no candidate a created file could complete.
      await put(root, `${branch}/missing.ts`, "import { gone } from 'missing-package';\nexport const missing = gone;\n");
      await refused([`${branch}/missing.ts`], 'created', ['probes', 'all']);
      await put(root, `${branch}/after-missing.ts`, 'export const afterMissing = 1;\n');
      await refused([`${branch}/after-missing.ts`], 'created', ['all']);
      await rm(join(root, `${branch}/missing.ts`));
      await refused([`${branch}/missing.ts`], 'deleted', ['all']);
      // With `baseUrl`, a created file can satisfy a specifier no candidate spells.
      const configuration = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8'));
      configuration.compilerOptions.baseUrl = '.';
      await put(root, 'tsconfig.json', JSON.stringify(configuration));
      await expectBroad(handle, state, retire, inputs, ['tsconfig.json'], 'changed', ['all']);
      await put(root, `${branch}/based.ts`, 'export const based = 1;\n');
      await refused([`${branch}/based.ts`], 'created', ['probes', 'all']);
    } finally { await handle.dispose(); }
  }, {
    ...membershipFiles,
    'node_modules/fixture-dependency/package.json': '{"name":"fixture-dependency","version":"1.0.0","types":"index.d.ts"}',
    'node_modules/fixture-dependency/index.d.ts': 'export interface DependencyShape { readonly n: number }\n',
  }), timeout);

  it('membership-identity-equals-batch: promotes a membership revision far below a broad one on the same fixture', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      const promotion = async (path: string, kind: 'created' | 'deleted', text?: string): Promise<{ path: string; promotion: number }> => {
        if (text === undefined) await rm(join(root, path)); else await put(root, path, text);
        const result = await handle.update([{ path, kind }]);
        if (result.status !== 'revised') throw new Error(JSON.stringify(result));
        return { path: result.revision.checked.path, promotion: result.timings!.promotion };
      };
      const membership: number[] = [], broad: number[] = [];
      for (let cycle = 0; cycle < 5; cycle++) {
        const deleted = await promotion(`${branch}/lonely.ts`, 'deleted');
        const created = await promotion(`${branch}/lonely.ts`, 'created', `export const lonely = ${cycle};\n`);
        expect([deleted.path, created.path]).toEqual(['membership', 'membership']);
        membership.push(deleted.promotion, created.promotion);
        // Deleting the last source of a directory takes the broad path: every
        // compiler observation retires and the whole invalidation reports it again.
        const solo = `${branch}/solo/solo.ts`;
        expect((await promotion(solo, 'created', `export const solo = ${cycle};\n`)).path).toBe('membership');
        const last = await promotion(solo, 'deleted');
        expect(last.path).toBe('broad');
        broad.push(last.promotion);
      }
      const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
      expect(median(membership) * 4).toBeLessThan(median(broad));
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }, membershipFiles), timeout);
});

/** Each observation path to the files naming it, derived here without the index's own helper. */
function expectedContributors(root: string, facts: SessionFacts): Record<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const [file, entry] of Object.entries(facts.files)) {
    const { files, resources, shims, absent } = entry.description.dependencies;
    for (const path of [file, ...entry.candidates, ...files, ...resources, ...shims, ...absent]) {
      const key = path.startsWith('external:') ? relative(root, path.slice(9)) : path;
      map.set(key, (map.get(key) ?? new Set()).add(file));
    }
  }
  const order = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
  return Object.fromEntries([...map].sort(([a], [b]) => order(a, b)).map(([key, set]) => [key, [...set].sort(order)]));
}

describe('contribution index', () => {
  it('contribution-index: maps each file, candidate and description dependency to its sorted contributors, relative to the root', () => {
    const root = '/project';
    const file = (candidates: string[], dependencies: Partial<Record<'files' | 'resources' | 'shims' | 'absent', string[]>>): FileFacts =>
      ({ accesses: [], coverage: [], candidates, description: { dependencies: { files: [], resources: [], shims: [], absent: [], ...dependencies } } }) as unknown as FileFacts;
    const indexes = buildIndexes({
      'src/b.ts': file(['src/a.js', 'src/a.ts', 'src/gone.ts', '../outside/x.d.ts'], { files: ['src/a.ts'], absent: ['src/soon'] }),
      'src/a.ts': file([], { resources: ['src/style.css'], shims: ['src/style.d.ts'], absent: ['external:/outside/x.d.ts', 'src/gone.ts'] }),
      'src/style.css': file([], {}),
    }, root);
    expect(indexes.contributors).toEqual({
      '../outside/x.d.ts': ['src/a.ts', 'src/b.ts'],
      'src/a.js': ['src/b.ts'],
      'src/a.ts': ['src/a.ts', 'src/b.ts'],
      'src/b.ts': ['src/b.ts'],
      'src/gone.ts': ['src/a.ts', 'src/b.ts'],
      'src/soon': ['src/b.ts'],
      'src/style.css': ['src/a.ts', 'src/style.css'],
      'src/style.d.ts': ['src/a.ts'],
    });
    expect(Object.keys(indexes.contributors)).toEqual(Object.keys(indexes.contributors).sort());
    expect([Object.isFrozen(indexes.contributors), Object.isFrozen(indexes.contributors['src/a.ts'])]).toEqual([true, true]);
    expect(emptyIndexes.contributors).toEqual({});
    expect(buildIndexes({}, root)).toEqual(emptyIndexes);
  });

  it('contribution-index: equals a rebuild after every revision kind and holds no path of a removed file', () => fixture(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    const pending = 'subs/branch/src/pending.ts', later = 'subs/branch/src/later.ts';
    const verify = async (path: string | null): Promise<SessionFacts> => {
      const facts = state.facts!;
      if (path) expect(handle.current!.checked.path).toBe(path);
      expect(JSON.stringify(facts.indexes)).toBe(JSON.stringify(buildIndexes(facts.files, root)));
      expect(facts.indexes.contributors).toEqual(expectedContributors(root, facts));
      for (const file of Object.keys(facts.files)) expect(facts.indexes.contributors[file]).toContain(file);
      expect(Object.isFrozen(facts.indexes.contributors)).toBe(true);
      await audited(handle);
      return facts;
    };
    try {
      let facts = await verify('cold');
      // The pending importer probed the later file as absent before it exists.
      expect(facts.indexes.contributors[later]).toEqual([pending]);

      await replace(root, paths.provider, 'return 2;', 'return 3;');
      await revised(handle, [paths.provider]);
      await verify('unchanged-surface');
      await replace(root, paths.sibling, 'import { rootValue }', 'import { privateValue as rootValue }');
      await revised(handle, [paths.sibling]);
      facts = await verify('source');
      expect(facts.indexes.contributors[paths.rootApi]).toEqual([paths.rootApi, paths.local, paths.sibling]);
      // A source edit that changes an importer's candidates replaces its contributions.
      await replace(root, pending, "import { later } from './later.js';", "import { value as later } from './provider.js';");
      await revised(handle, [pending]);
      facts = await verify('source');
      expect(facts.indexes.contributors[later]).toBeUndefined();
      expect(facts.indexes.contributors[paths.provider]).toContain(pending);
      await put(root, pending, "import { later } from './later.js';\nexport const pending = later;\n");
      await revised(handle, [pending]);
      facts = await verify('source');
      expect(facts.indexes.contributors[later]).toEqual([pending]);
      await replace(root, paths.description, parentExposure, '');
      await revised(handle, [paths.description]);
      await verify('description');
      await put(root, paths.readme, '# Branch\n\nAn edited purpose.\n');
      await revised(handle, [paths.readme]);
      await verify('metadata');
      await replace(root, paths.description, 'module branch\n', 'module branch\nexpose-src value to parent\n');
      const invalid = await revised(handle, [paths.description]);
      expect(invalid.outcome.execution).toBe('invalid');
      facts = await verify(null);
      expect(facts.indexes).toEqual(emptyIndexes);
      await put(root, paths.description, fixtureFiles[paths.description]!);
      await revised(handle, [paths.description]);
      await verify('broad');

      await put(root, later, 'export const later = 1;\n');
      await revised(handle, [later], 'created');
      facts = await verify('membership');
      expect(facts.indexes.contributors[later]).toEqual([later, pending]);
      await rm(join(root, later));
      await revised(handle, [later], 'deleted');
      facts = await verify('membership');
      expect(Object.values(facts.indexes.contributors).some(files => files.includes(later))).toBe(false);
      expect(facts.indexes.contributors[later]).toEqual([pending]);
      await rm(join(root, pending));
      await revised(handle, [pending], 'deleted');
      facts = await verify('membership');
      expect(Object.values(facts.indexes.contributors).some(files => files.includes(pending))).toBe(false);
      expect(Object.keys(facts.indexes.contributors).some(path => path.startsWith('subs/branch/src/later'))).toBe(false);

      const configuration = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8'));
      configuration.compilerOptions.strict = true;
      await put(root, 'tsconfig.json', JSON.stringify(configuration));
      await revised(handle, ['tsconfig.json']);
      await verify('broad');
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }, { 'subs/branch/src/pending.ts': "import { later } from './later.js';\nexport const pending = later;\n" }), timeout);
});

describe('reacquisition report', () => {
  type Revised = Extract<Awaited<ReturnType<RetainedSession['update']>>, { status: 'revised' }>;
  const updated = async (handle: RetainedSession, names: readonly string[], kind: 'changed' | 'created' | 'deleted' | 'unknown' = 'changed'): Promise<Revised> => {
    const result = await handle.update(names.map(path => ({ path, kind })));
    if (result.status !== 'revised') throw new Error(`Expected a revision: ${JSON.stringify(result)}`);
    return result;
  };

  it('sweep-skipped-after-reacquire: a structural update reports reacquisition, and a sweep of the same capture finds nothing', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      // An options-only configuration edit rebuilds the inventory on a fresh capture.
      const configuration = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8'));
      configuration.compilerOptions.target = 'ES2023';
      await put(root, 'tsconfig.json', JSON.stringify(configuration));
      const reacquired = await updated(handle, ['tsconfig.json']);
      expect([reacquired.identical, reacquired.reacquired, reacquired.revision.checked.path]).toEqual([false, true, 'broad']);
      // The sweep the context now skips re-observes every recorded input and finds no change.
      expect(await handle.sweep()).toEqual({ status: 'unchanged' });
      expect(handle.current).toBe(reacquired.revision);
      await audited(handle);
      await equalToBatch(handle, inputs);

      // Updates that keep the capture report none.
      await replace(root, paths.provider, '  return 2;', '  void 0;\n  return 2;');
      expect(await updated(handle, [paths.provider])).toMatchObject({ identical: false, reacquired: false, revision: { checked: { path: 'unchanged-surface' } } });
      expect(await updated(handle, [paths.provider])).toMatchObject({ identical: true, reacquired: false });
      await put(root, paths.extra, 'export const extra = 1;\n');
      expect(await updated(handle, [paths.extra], 'created')).toMatchObject({ identical: false, reacquired: false, revision: { checked: { path: 'membership' } } });
      await replace(root, paths.local, 'void rootValue;', 'void rootValue;\nvoid 0;');
      // An unknown label leaves the event to the observer, which finds a content edit.
      expect(await updated(handle, [paths.local], 'unknown')).toMatchObject({ identical: false, reacquired: false, revision: { checked: { path: 'unchanged-surface' } } });
      await audited(handle);

      // A structural update whose acquisition is invalid promotes nothing and reports none.
      const twig = 'subs/sibling/subs/twig/module.ramify';
      await put(root, twig, 'ramify 1\nmodule twig\nexpose-src nothing from\n');
      const invalid = await updated(handle, [twig], 'created');
      expect([invalid.revision.outcome.execution, invalid.identical, invalid.reacquired]).toEqual(['invalid', false, false]);
      // Its repair reconciles through a structural rebuild and reports it.
      await rm(join(root, 'subs/sibling/subs'), { recursive: true });
      const repaired = await updated(handle, [twig], 'deleted');
      expect([repaired.revision.outcome.execution, repaired.identical, repaired.reacquired]).toEqual(['completed', false, true]);
      await audited(handle);
      await equalToBatch(handle, inputs);

      // A sweep that finds a configuration edit reports the reacquisition on its own revision.
      configuration.compilerOptions.target = 'ES2022';
      await put(root, 'tsconfig.json', JSON.stringify(configuration));
      expect(await handle.sweep()).toMatchObject({ status: 'revised', identical: false, reacquired: true, revision: { checked: { path: 'broad' } } });
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);
});
