import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { analyzeProject, openRetainedSession } from '../index.js';
import type { AnalysisInputs, AnalysisReport, RetainedSession, SessionInputs, SessionRevision } from '../index.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';
import { workerSuite } from './session-worker-fixture.js';

const api = 'src/interfaces/api.ts';
const probe = 'subs/consumer/src/probe.ts';
const other = 'subs/consumer/src/other.ts';
const extra = 'subs/consumer/src/extra.ts';
const fixtureFiles = {
  'module.ramify': 'ramify 1\nmodule fixture\nexpose-src publicValue, PublicType from "interfaces/api.ts" to descendants\n',
  'README.md': '# Fixture\n\nThis fixture exercises the retained session.\n',
  'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
    types: [], skipLibCheck: true }, include: ['src', 'subs'] }),
  [api]: 'export const publicValue = 1;\nexport const privateValue = 2;\nexport interface PublicType { readonly v: number }\nexport function helper(): number {\n  return 1;\n}\n',
  'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
  'subs/consumer/README.md': '# Consumer\n\nThe consumer imports the fixture vocabulary.\n',
  [probe]: "import { publicValue } from '../../../src/interfaces/api.js';\nvoid publicValue;\n",
  [other]: 'export function compute(): number {\n  return 2;\n}\n',
};
const timeout = 120_000;
const session = { updateDeadlineMs: 2_000, sweepIntervalMs: 30_000, workerHeapMiB: 512, maxRetainedFactBytes: 96 * 1024 ** 2 };

async function put(root: string, path: string, text: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}
async function replace(root: string, path: string, before: string, after: string): Promise<void> {
  const text = await readFile(join(root, path), 'utf8');
  expect(text.split(before)).toHaveLength(2);
  await writeFile(join(root, path), text.replace(before, () => after));
}
function analysisInputs(root: string): AnalysisInputs {
  return {
    project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
    registry: createDefaultTagRegistry(), capabilities: ['static-access', 'coverage'],
    limits: {
      acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
        maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
      source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
      maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
    },
  };
}
async function fixture(check: (root: string, inputs: SessionInputs) => Promise<void>, files: Record<string, string> = fixtureFiles): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-retained-session-')));
  try {
    for (const [path, text] of Object.entries(files)) await put(root, path, text);
    await check(root, { ...analysisInputs(root), session });
  } finally { await rm(root, { recursive: true, force: true }); }
}
async function opened(inputs: SessionInputs): Promise<{ session: RetainedSession; revision: SessionRevision }> {
  const result = await openRetainedSession(inputs);
  expect(result.status).toBe('opened');
  if (result.status !== 'opened') throw new Error('Expected an opened session');
  return result;
}
async function batch(inputs: SessionInputs): Promise<AnalysisReport> {
  const { session: _session, ...request } = inputs;
  const run = await analyzeProject(request);
  if (run.status !== 'reported') throw new Error('Expected a batch report');
  return run.report;
}
const comparable = (report: AnalysisReport | null): unknown => JSON.parse(JSON.stringify({ ...report, runId: 'compared' }));
async function expectEqualToBatch(handle: RetainedSession, inputs: SessionInputs): Promise<AnalysisReport> {
  const report = await handle.report();
  expect(comparable(report)).toEqual(comparable(await batch(inputs)));
  return report!;
}
async function revised(handle: RetainedSession, paths: readonly string[], kind: 'changed' | 'created' | 'deleted' = 'changed'): Promise<SessionRevision> {
  const update = await handle.update(paths.map(path => ({ path, kind })));
  expect(update.status).toBe('revised');
  if (update.status !== 'revised') throw new Error('Expected a revised update');
  expect(update.identical).toBe(false);
  return update.revision;
}
async function audited(handle: RetainedSession): Promise<void> {
  expect((await handle.verify()).status).toBe('equal');
}
function frozen(value: unknown, path = '$'): void {
  if (!value || typeof value !== 'object') return;
  expect(Object.isFrozen(value), `${path} is frozen`).toBe(true);
  for (const [key, child] of Object.entries(value)) frozen(child, `${path}.${key}`);
}

workerSuite('retained analysis session', import.meta.url, () => {
  it('opens cold with frozen plain revisions equal to batch and answers identical updates without a new sequence', () => fixture(async (root, inputs) => {
    const { session: handle, revision } = await opened(inputs);
    try {
      expect(revision.sequence).toBe(1);
      expect(revision.checked).toEqual({ path: 'cold', files: [api, other, probe], accesses: 1, modelRebuilt: true });
      expect(revision.inputId.startsWith('input/1:')).toBe(true);
      expect(revision.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' });
      expect(revision.delta).toEqual({ added: [], removed: [], positionOnly: [] });
      expect(revision.timings.total).toBeGreaterThanOrEqual(revision.timings.decide);
      frozen(revision);
      expect(handle.current).toBe(revision);
      const report = await expectEqualToBatch(handle, inputs);
      expect(report.inputId).toBe(revision.inputId);
      expect(report.request).not.toHaveProperty('session');
      const status = handle.status();
      expect([status.level, status.sequence, status.factBytes > 0, status.observedInputs > 3]).toEqual(['hot', 1, true, true]);
      const same = await handle.update([{ path: probe, kind: 'changed' }]);
      const workerTimings = { invocationCheck: 0, workerStatus: expect.any(Number), workerRoundTrip: expect.any(Number) };
      expect(same).toEqual({ status: 'revised', revision, identical: true, timings: workerTimings });
      expect(await handle.update([])).toEqual({ status: 'revised', revision, identical: true, timings: workerTimings });
      expect(handle.current?.sequence).toBe(1);
      await audited(handle);
    } finally { await handle.dispose(); }
  }), timeout);

  it('takes the unchanged-surface path for a body edit: one file checked, nothing decided, model kept', () => fixture(async (root, inputs) => {
    const { session: handle } = await opened(inputs);
    try {
      await replace(root, other, '  return 2;', '  void 0;\n  return 2;');
      const revision = await revised(handle, [other]);
      expect(revision.sequence).toBe(2);
      expect(revision.checked).toEqual({ path: 'unchanged-surface', files: [other], accesses: 0, modelRebuilt: false });
      expect(revision.changed).toEqual([other]);
      expect(revision.delta).toEqual({ added: [], removed: [], positionOnly: [] });
      expect(revision.timings.compiler).toBeGreaterThan(0);
      await audited(handle);
      await expectEqualToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('takes the source path for imports and exports, bounds the checked set and reports finding deltas', () => fixture(async (root, inputs) => {
    const { session: handle } = await opened(inputs);
    try {
      await replace(root, other, 'export function compute', "import { privateValue } from '../../../src/interfaces/api.js';\nvoid privateValue;\nexport function compute");
      const denied = await revised(handle, [other]);
      expect(denied.checked).toEqual({ path: 'source', files: [other], accesses: 1, modelRebuilt: false });
      expect(denied.delta.added.map(item => [item.code, item.location?.file])).toEqual([['not-visible', other]]);
      expect(denied.delta.removed).toEqual([]);
      expect(denied.outcome.check).toBe('failed');
      await audited(handle);
      await expectEqualToBatch(handle, inputs);

      await replace(root, api, 'export const privateValue = 2;', 'const privateValue = 2;');
      const missing = await revised(handle, [api]);
      expect(missing.checked.path).toBe('source');
      expect(missing.checked.files).toEqual([api, other, probe]);
      expect(missing.checked.modelRebuilt).toBe(true);
      expect(missing.delta.removed).toEqual([denied.delta.added[0]!.id]);
      expect(missing.delta.added.map(item => [item.code, item.location?.file])).toEqual([['missing-export', other]]);
      await audited(handle);
      await expectEqualToBatch(handle, inputs);

      await replace(root, api, 'const privateValue = 2;', 'export const privateValue = 2;');
      const restored = await revised(handle, [api]);
      expect(restored.delta.removed).toEqual([missing.delta.added[0]!.id]);
      expect(restored.delta.added.map(item => item.id)).toEqual([denied.delta.added[0]!.id]);
      expect(restored.summary.errors).toBe(1);
      await audited(handle);
      await expectEqualToBatch(handle, inputs);

      await replace(root, other, "import { privateValue } from '../../../src/interfaces/api.js';\nvoid privateValue;\n", '');
      const clean = await revised(handle, [other]);
      expect(clean.checked).toEqual({ path: 'source', files: [other], accesses: 0, modelRebuilt: false });
      expect(clean.delta).toEqual({ added: [], removed: [denied.delta.added[0]!.id], positionOnly: [] });
      expect([clean.summary.errors, clean.outcome.check]).toEqual([0, 'passed']);
      await audited(handle);
      await expectEqualToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('refreshes decisions and diagnostic identities when declarations only move', () => fixture(async (root, inputs) => {
    const { session: handle } = await opened(inputs);
    try {
      await replace(root, other, 'export function compute', "import { privateValue } from '../../../src/interfaces/api.js';\nvoid privateValue;\nexport function compute");
      const denied = await revised(handle, [other]);
      const before = denied.delta.added[0]!;
      await replace(root, api, 'export const publicValue = 1;', '// Every declaration below moves.\nexport const publicValue = 1;');
      const moved = await revised(handle, [api]);
      expect(moved.checked).toEqual({ path: 'unchanged-surface', files: [api], accesses: 0, modelRebuilt: false });
      expect(moved.delta.added).toEqual([]);
      expect(moved.delta.removed).toEqual([]);
      expect(moved.delta.positionOnly).toHaveLength(1);
      expect(moved.delta.positionOnly[0]).not.toBe(before.id);
      const after = moved.diagnostics.find(item => item.id === moved.delta.positionOnly[0]);
      expect([after?.code, after?.original?.binding, after?.related.length]).toEqual(['not-visible', 'privateValue', before.related.length]);
      expect(JSON.stringify(after?.related)).not.toBe(JSON.stringify(before.related));
      await audited(handle);
      const report = await expectEqualToBatch(handle, inputs);
      const declarations = report.snapshot!.results.flatMap(result => result.decisions.map(decision => decision.original?.declarations[0]?.start));
      expect(declarations.every(start => start !== undefined && start > 0)).toBe(true);
    } finally { await handle.dispose(); }
  }), timeout);

  it('takes the metadata path for a README edit and the broad path for created, deleted and reopened compiler states', () => fixture(async (root, inputs) => {
    const { session: handle } = await opened(inputs);
    try {
      await replace(root, 'subs/consumer/README.md', 'The consumer imports', 'The consumer reads');
      const metadata = await revised(handle, ['subs/consumer/README.md']);
      expect(metadata.checked).toEqual({ path: 'metadata', files: [], accesses: 0, modelRebuilt: false });
      expect([metadata.timings.compiler, metadata.timings.link, metadata.timings.decide]).toEqual([0, 0, 0]);
      await expectEqualToBatch(handle, inputs);

      await put(root, extra, "import { PublicType } from '../../../src/interfaces/api.js';\nexport type Seen = PublicType;\n");
      const created = await revised(handle, [extra], 'created');
      expect(created.checked).toEqual({ path: 'broad', files: [api, extra, other, probe], accesses: 2, modelRebuilt: true });
      await audited(handle);
      await expectEqualToBatch(handle, inputs);

      await rm(join(root, extra));
      const deleted = await revised(handle, [extra], 'deleted');
      expect(deleted.checked).toEqual({ path: 'broad', files: [api, other, probe], accesses: 1, modelRebuilt: true });
      await audited(handle);
      await expectEqualToBatch(handle, inputs);

      await handle.releaseCompiler();
      expect(handle.status().level).toBe('warm');
      await replace(root, other, '  return 2;', '  void 0;\n  return 2;');
      const reopened = await revised(handle, [other]);
      expect(reopened.checked.path).toBe('broad');
      expect(handle.status().level).toBe('hot');
      await audited(handle);
      await expectEqualToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }), timeout);

  it('retains historical versions for report projection until released and rejects releasing the current one', () => fixture(async (root, inputs) => {
    const { session: handle, revision: first } = await opened(inputs);
    try {
      const before = await handle.report(undefined, 1);
      await replace(root, other, '  return 2;', '  void 0;\n  return 2;');
      const second = await revised(handle, [other]);
      const historical = await handle.report(undefined, 1);
      expect(historical?.inputId).toBe(first.inputId);
      expect(comparable(historical)).toEqual(comparable(before));
      expect((await handle.report(undefined, 2))?.inputId).toBe(second.inputId);
      expect(await handle.report(undefined, 3)).toBeNull();
      await expect(handle.releaseRevision(2)).rejects.toThrow('current revision');
      const retained = handle.status().factBytes;
      await handle.releaseRevision(1);
      expect(await handle.report(undefined, 1)).toBeNull();
      expect(handle.status().factBytes).toBeLessThan(retained);
    } finally { await handle.dispose(); }
  }), timeout);

  it('opens over a coherent invalid capture with an invalid revision and recovers on the next update', () => fixture(async (root, inputs) => {
    const { session: handle, revision } = await opened(inputs);
    try {
      expect(revision.outcome.execution).toBe('invalid');
      expect(revision.checked.path).toBe('cold');
      expect(revision.diagnostics.map(item => item.category)).toContain('description');
      expect(handle.status().level).toBe('warm');
      await expectEqualToBatch(handle, inputs);
      await put(root, 'subs/consumer/module.ramify', 'ramify 1\nmodule consumer\n');
      const recovered = await revised(handle, ['subs/consumer/module.ramify']);
      expect(recovered.outcome.execution).toBe('completed');
      expect(recovered.checked.path).toBe('broad');
      expect(handle.status().level).toBe('hot');
      await audited(handle);
      await expectEqualToBatch(handle, inputs);
    } finally { await handle.dispose(); }
  }, { ...fixtureFiles, 'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\nexpose-src nothing from\n' }), timeout);

  it('reports an unavailable cold result without opening a session', async () => {
    const root = join(tmpdir(), 'ramify-retained-session-missing-root');
    const result = await openRetainedSession({ ...analysisInputs(root), session });
    expect(result.status).toBe('reported');
    if (result.status !== 'reported') throw new Error('Expected a report');
    expect(result.report.outcome.execution).toBe('unavailable');
    expect(comparable(result.report)).toEqual(comparable(await batch({ ...analysisInputs(root), session })));
  }, timeout);

  it('rejects invalid session limits and unsupported capabilities before observing', async () => {
    const root = join(tmpdir(), 'ramify-retained-session-limits');
    const limits = await openRetainedSession({ ...analysisInputs(root), session: { ...session, workerHeapMiB: 0 } });
    expect(limits.status === 'reported' && limits.report.diagnostics[0]?.code).toBe('invalid-invocation');
    const capability = await openRetainedSession({ ...analysisInputs(root), capabilities: ['browser-verification'], session });
    expect(capability.status === 'reported' && capability.report.diagnostics[0]?.code).toBe('unavailable-capability');
  }, timeout);

  it('refuses work after disposal and releases the compiler and observer', () => fixture(async (root, inputs) => {
    const { session: handle } = await opened(inputs);
    await handle.dispose();
    await handle.dispose();
    const update = await handle.update([{ path: other, kind: 'changed' }]);
    expect(update.status === 'reported' && update.report.diagnostics[0]?.code).toBe('session-disposed');
    expect(await handle.report()).toBeNull();
    expect(handle.status().level).toBe('warm');
  }), timeout);
});
