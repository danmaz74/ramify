import { readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkLimit } from '../report.js';
import type { SessionRevision } from '../interfaces/session.js';
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

  it('checks every owned file on creation and deletion and removes the deleted file finding', () => fixture(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      const compiler = instrumentCompiler(state);
      await put(root, paths.extra, "import { privateValue } from '../../../src/interfaces/api.js';\nvoid privateValue;\n");
      const created = await revised(handle, [paths.extra], 'created');
      const all = [...ownedFiles, paths.extra].sort();
      expect(created.checked).toEqual({ path: 'broad', files: all, accesses: 5, modelRebuilt: true });
      expect(compiler.describe.mock.calls.map(call => call[0])).toEqual([all]);
      expect(compiler.interpret.mock.calls.map(call => call[0])).toEqual([all]);
      expect(created.delta.added.map(item => [item.code, item.location?.file])).toEqual([['not-visible', paths.extra]]);
      await audited(handle);
      await equalToBatch(handle, inputs);

      await rm(join(root, paths.extra));
      const deleted = await revised(handle, [paths.extra], 'deleted');
      expect(deleted.checked).toEqual({ path: 'broad', files: ownedFiles, accesses: 4, modelRebuilt: true });
      expect(deleted.delta.removed).toEqual([created.delta.added[0]!.id]);
      const report = await equalToBatch(handle, inputs);
      expect(report.snapshot!.inventory.files.map(file => file.path)).not.toContain(paths.extra);
      expect(report.snapshot!.catalog!.files.map(file => file.file)).not.toContain(paths.extra);
      expect(report.coverage.some(note => note.location.file === paths.extra)).toBe(false);
      await audited(handle);
    } finally { await handle.dispose(); }
  }), timeout);

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

  it('stays invalid through source-only and README-only events until the invalid description is repaired', () => fixture(async (root, inputs) => {
    const { handle, revision: valid } = await opened(inputs);
    try {
      const validReport = await handle.report();
      await replace(root, paths.description, parentExposure, 'expose-src value to parent\n');
      const invalid = await revised(handle, [paths.description]);
      expect(invalid.outcome.execution).toBe('invalid');
      await audited(handle);
      await equalToBatch(handle, inputs);

      await put(root, paths.provider, `${fixtureFiles[paths.provider]}export const recoveredValue = 9;\n`);
      const sourceOnly = await revised(handle, [paths.provider]);
      expect(sourceOnly.outcome.execution).toBe('invalid');
      expect(sourceOnly.sequence).toBe(invalid.sequence + 1);
      expect(sourceOnly.diagnostics.some(item => item.category === 'description' && item.location?.file === paths.description)).toBe(true);
      await audited(handle);
      await equalToBatch(handle, inputs);

      const purpose = 'A purpose changed while the description remained invalid.';
      await put(root, paths.readme, `# Branch\n\n${purpose}\n`);
      const readmeOnly = await revised(handle, [paths.readme]);
      expect(readmeOnly.outcome.execution).toBe('invalid');
      expect(readmeOnly.sequence).toBe(sourceOnly.sequence + 1);
      expect(readmeOnly.diagnostics.some(item => item.category === 'description' && item.location?.file === paths.description)).toBe(true);
      await audited(handle);
      await equalToBatch(handle, inputs);
      expect(comparable(await handle.report(undefined, valid.sequence))).toEqual(comparable(validReport));

      await put(root, paths.description, fixtureFiles[paths.description]!);
      const recovered = await revised(handle, [paths.description]);
      expect(recovered.sequence).toBe(readmeOnly.sequence + 1);
      expect(recovered.outcome.execution).toBe('completed');
      expect(recovered.outcome.check).toBe('passed');
      expect(recovered.checked.path).toBe('broad');
      const report = await equalToBatch(handle, inputs);
      expect(report.snapshot!.catalog!.files.find(file => file.file === paths.provider)?.exports.map(entry => entry.name)).toContain('recoveredValue');
      expect(report.snapshot!.inventory.modules.find(module => module.name === 'branch')?.purpose).toEqual({ state: 'present', readme: paths.readme, paragraph: purpose });
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

  it('uses the broad path for an unknown event that changes an owned input', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      await replace(root, paths.provider, '  return 2;', '  return 9;');
      const revision = await revised(handle, [paths.provider], 'unknown');
      expect(revision.checked).toEqual({ path: 'broad', files: ownedFiles, accesses: 4, modelRebuilt: true });
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('does not commit private facts or history when a revision exceeds the retained fact budget', () => fixture(async (root, inputs) => {
    const baseline = await opened(inputs);
    const bytes = baseline.handle.status().factBytes;
    await baseline.handle.dispose();
    const { handle, state, revision } = await opened({ ...inputs, session: { ...inputs.session, maxRetainedFactBytes: 2 * bytes - 1 } });
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
});

describe('timing fields outside the revision total', () => {
  it('timing-fields: an update reports its invocation check beside unchanged revision timings', () => fixture(async (root, inputs) => {
    const { handle, revision } = await opened(inputs);
    try {
      const stages = ['accesses', 'classify', 'compiler', 'decide', 'descriptions', 'inventory', 'link', 'publish', 'total'];
      expect(Object.keys(revision.timings).sort()).toEqual(stages);
      const invocation = { project: inputs.project, capabilities: inputs.capabilities };
      // Without an invocation nothing is checked.
      expect(await handle.update([])).toEqual({ status: 'revised', revision, identical: true, timings: { invocationCheck: 0, promotion: 0 } });
      // The identical update keeps the published revision and its timings; its own check sits beside them.
      const same = await handle.update([], {}, invocation);
      expect(same).toEqual({ status: 'revised', revision, identical: true, timings: { invocationCheck: expect.any(Number), promotion: 0 } });
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
      expect([created.identical, created.revision.checked.path, promotions]).toEqual([false, 'broad', 1]);
      expect(Object.keys(created.timings!)).toEqual(['invocationCheck', 'promotion']);
      expect(Object.keys(created.revision.timings).sort()).toEqual([...stages, 'total'].sort());
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
      expect(await handle.update([{ path: paths.provider, kind: 'changed' }])).toEqual({ status: 'revised', revision: edited.revision, identical: true,
        timings: { invocationCheck: 0, promotion: 0 } });
      // An in-process sweep that finds nothing reports no timings; its hosting layers add them.
      expect(await handle.sweep()).toEqual({ status: 'unchanged' });
      apply.mockImplementation((changes, signal) => observer.apply(changes, signal));
      await audited(handle);
      await equalToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);
});
