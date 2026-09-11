import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { analyzeProject, analyzeIncrement, resolveProject } from '../index.js';
import type { AnalysisInputs, IncrementRun } from '../index.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';
const files = {
  'module.ramify': 'ramify 1\nmodule fixture\nexpose-src value from "interfaces/api.ts" to descendants\n',
  'README.md': '# Fixture\n\nA fixture.\n', 'package.json': '{"type":"module"}',
  'tsconfig.json': '{"compilerOptions":{"target":"ES2022","types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src","subs"]}',
  'src/interfaces/api.ts': 'export const value = 1;\n',
  'subs/child/module.ramify': 'ramify 1\nmodule child\n',
  'subs/child/src/use.ts': 'import { value } from "../../../src/interfaces/api.js"; void value;\n',
};
async function fixture(check: (root: string, inputs: AnalysisInputs) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-increment-'));
  try {
    for (const [path, text] of Object.entries(files)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text); }
    await check(root, { project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      registry: createDefaultTagRegistry(), capabilities: ['static-access'], limits: {
        acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
          maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
        source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
        maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
      } });
  } finally { await rm(root, { recursive: true, force: true }); }
}
function reported(run: IncrementRun): Extract<IncrementRun, { status: 'reported' }> {
  expect(run.status).toBe('reported'); if (run.status !== 'reported') throw new Error('Cancelled'); return run;
}
async function equalBatch(inputs: AnalysisInputs, run: ReturnType<typeof reported>): Promise<void> {
  const batch = await analyzeProject(inputs); expect(batch.status).toBe('reported');
  if (batch.status === 'reported') expect({ ...run.report, runId: '' }).toEqual({ ...batch.report, runId: '' });
}
describe('retained analysis', () => {
  it('reuses unchanged products and preserves batch reports through README, exposure and source edits', () => fixture(async (root, inputs) => {
    let run = reported(await analyzeIncrement({ inputs, previous: null, changes: null }));
    expect(run.report.outcome.execution).toBe('completed'); expect(run.retained).not.toBeNull();
    await equalBatch(inputs, run);
    const initial = run.retained!;
    run = reported(await analyzeIncrement({ inputs, previous: initial, changes: [] }));
    expect([...run.reused].sort()).toEqual(['access','catalog','configuration','decide','link','metadata','parse']);
    expect(run.changed).toEqual([]); await equalBatch(inputs, run);
    expect(Object.isFrozen(run.retained)).toBe(true); expect(run.retained!.bytes).toBe(Buffer.byteLength(JSON.stringify(run.retained)));
    await writeFile(join(root, 'README.md'), '# Fixture\n\nChanged purpose.\n');
    run = reported(await analyzeIncrement({ inputs, previous: run.retained, changes: [{ path: 'README.md', kind: 'changed' }] }));
    expect([...run.reused].sort()).toEqual(['access','catalog','configuration','decide','link','parse']); await equalBatch(inputs, run);
    await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule fixture\n');
    run = reported(await analyzeIncrement({ inputs, previous: run.retained, changes: [] }));
    expect([...run.reused].sort()).toEqual(['access','catalog','configuration','metadata']);
    expect(run.report.diagnostics.map(d => d.code)).toEqual(['not-visible']); await equalBatch(inputs, run);
    await writeFile(join(root, 'src/interfaces/api.ts'), 'export const value = 2;\n');
    run = reported(await analyzeIncrement({ inputs, previous: run.retained, changes: [] }));
    expect([...run.reused].sort()).toEqual(['configuration','metadata','parse']); await equalBatch(inputs, run);
  }), 120_000);
  it('permits only parse and metadata reuse for unknown changes; discards foreign engines', () => fixture(async (_root, inputs) => {
    const first = reported(await analyzeIncrement({ inputs, previous: null, changes: null }));
    const unknown = reported(await analyzeIncrement({ inputs, previous: first.retained, changes: null }));
    expect([...unknown.reused].sort()).toEqual(['metadata','parse']); await equalBatch(inputs, unknown);
    const foreign = reported(await analyzeIncrement({ inputs, previous: { ...first.retained!, engine: 'other' }, changes: [] }));
    expect(foreign.reused).toEqual([]); expect(foreign.changed).toBeNull();
  }), 120_000);
  it('retains coherent invalid descriptions but never incomplete captures', () => fixture(async (root, inputs) => {
    await writeFile(join(root, 'module.ramify'), 'broken description\n');
    const invalid = reported(await analyzeIncrement({ inputs, previous: null, changes: [] }));
    expect(invalid.report.outcome.execution).toBe('invalid'); expect(invalid.retained?.inputs.length).toBeGreaterThan(0);
    await equalBatch(inputs, invalid);
    const limited = { ...inputs, limits: { ...inputs.limits, acquisition: { ...inputs.limits.acquisition, maxFiles: 1 } } };
    const incomplete = reported(await analyzeIncrement({ inputs: limited, previous: invalid.retained, changes: [] }));
    expect(incomplete.retained).toBeNull(); await equalBatch(limited, incomplete);
  }), 120_000);
  it('drops obsolete resolver observations when an import disappears', () => fixture(async (root, inputs) => {
    await mkdir(join(root, 'node_modules/pkg'), { recursive: true });
    await writeFile(join(root, 'node_modules/pkg/package.json'), '{"name":"pkg","types":"index.d.ts"}');
    await writeFile(join(root, 'node_modules/pkg/index.d.ts'), 'export declare const external: number;');
    await writeFile(join(root, 'subs/child/src/use.ts'), "import { external } from 'pkg'; void external;\n");
    const first = reported(await analyzeIncrement({ inputs, previous: null, changes: [] }));
    expect(first.retained!.inputs.some(input => input.path.endsWith('pkg/index.d.ts'))).toBe(true);
    await writeFile(join(root, 'subs/child/src/use.ts'), 'export const local = 1;\n');
    const next = reported(await analyzeIncrement({ inputs, previous: first.retained, changes: [] }));
    expect(next.retained!.inputs.some(input => input.path.endsWith('pkg/index.d.ts'))).toBe(false);
    expect(next.changed).toContain('node_modules/pkg/index.d.ts');
    await equalBatch(inputs, next);
  }), 120_000);
  it('resolves explicit and discovered roots without parsing descriptions', () => fixture(async (root, inputs) => {
    const resolved = await resolveProject(inputs.project);
    expect(resolved).toMatchObject({ status: 'resolved', root, selection: 'given', configuration: join(root, 'tsconfig.json') });
    expect(await resolveProject({ ...inputs.project, root: undefined, cwd: join(root, 'subs/child/src') })).toMatchObject({ status: 'resolved', root, selection: 'found' });
    await writeFile(join(root, 'module.ramify'), 'malformed');
    expect(await resolveProject(inputs.project)).toEqual(resolved);
  }), 120_000);
});
