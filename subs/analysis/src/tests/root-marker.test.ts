import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeProject, resolveProject } from '../index.js';
import type { AnalysisInputs, AnalysisReport, AnalysisRun } from '../index.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';

// PB1-42 and PB1-43 through the analysis operations, which supply the
// Descriptions owner's marker reader and parser to project acquisition.
// Expected codes, categories and locations follow the root-marker contract (R7).

const files: Record<string, string> = {
  'module.ramify': 'ramify 1\nroot module fixture\nexpose-src publicValue from "interfaces/api.ts" to descendants\n',
  'README.md': '# Fixture\n\nThe marked root of one checked project.\n',
  'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
    types: [], skipLibCheck: true }, include: ['src', 'subs'] }),
  'src/interfaces/api.ts': 'export const publicValue: number = 1;\n',
  'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
  'subs/consumer/src/probe.ts': "import { publicValue } from '../../../src/interfaces/api.js';\nvoid publicValue;\n",
};
async function put(root: string, path: string, text: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}
async function fixture(check: (root: string, inputs: (cwd: string, given?: string) => AnalysisInputs) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-root-marker-')));
  try {
    for (const [path, text] of Object.entries(files)) await put(root, path, text);
    await check(root, (cwd, given) => ({
      project: { cwd, ...(given === undefined ? {} : { root: given }), scope: 'whole-project', configuration: 'discover' },
      registry: createDefaultTagRegistry(), capabilities: ['static-access'],
      limits: {
        acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
          maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
        source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
        maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
      },
    }));
  } finally { await rm(root, { recursive: true, force: true }); }
}
function reported(run: AnalysisRun): AnalysisReport {
  if (run.status !== 'reported') throw new Error('Expected an analysis report');
  return run.report;
}
const codes = (report: AnalysisReport): string[] => report.diagnostics.map(item => item.code);

describe('root selection and validity through analysis', () => {
  it('checks the marked root with an unmarked child, given or found from the child, with its exposure unchanged', () => fixture(async (root, inputs) => {
    const given = reported(await analyzeProject(inputs(root, root)));
    expect(given).toMatchObject({ scope: { root, selection: 'given' }, outcome: { execution: 'completed', check: 'passed' },
      diagnostics: [], summary: { owners: 2, accesses: 1, allowed: 1, denied: 0 } });
    const document = given.snapshot!.inventory.modules[0]!.description;
    if (document.status !== 'valid') throw new Error('Expected the valid root description');
    // The marker spans `root`; the exposure statement keeps its own line and selection.
    expect(document.document.module.root).toEqual({ start: 9, end: 13, line: 2, column: 1 });
    expect(document.document.statements).toMatchObject([{ kind: 'expose-src', span: { start: 29, line: 3, column: 1 },
      selection: { kind: 'named', names: [{ name: 'publicValue', alias: 'publicValue' }] }, destinations: ['descendants'] }]);
    const found = reported(await analyzeProject(inputs(join(root, 'subs/consumer/src'))));
    expect(found).toMatchObject({ scope: { root, selection: 'found', invokedFrom: join(root, 'subs/consumer/src') },
      outcome: { execution: 'completed', check: 'passed' }, summary: { allowed: 1, denied: 0 } });
    expect(found.snapshot!.results).toEqual(given.snapshot!.results);
  }), 60_000);

  it('stops at a marked root with a later syntax error and reports the parser diagnostic', () => fixture(async (root, inputs) => {
    await put(root, 'module.ramify', `${files['module.ramify']}not a statement\n`);
    const report = reported(await analyzeProject(inputs(join(root, 'subs/consumer/src'))));
    expect(report.outcome.execution).toBe('invalid');
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'unknown-statement', category: 'description',
      location: { file: 'module.ramify', start: 92, end: 95, line: 4, column: 1 } }));
    expect(codes(report)).not.toContain('root-not-found');
    expect(await resolveProject(inputs(join(root, 'subs/consumer/src')).project)).toMatchObject({ status: 'resolved', root, selection: 'found' });
  }), 60_000);

  it('reports an unmarked --root as a layout error and no marked description as root-not-found with the nearest description', () => fixture(async (root, inputs) => {
    const unmarked = reported(await analyzeProject(inputs(root, 'subs/consumer')));
    expect(unmarked.outcome.execution).toBe('invalid');
    expect(unmarked.diagnostics).toEqual([expect.objectContaining({ code: 'unmarked-root-description', category: 'layout',
      message: `${join(root, 'subs/consumer/module.ramify')} does not carry the root marker: add root before module on its module line to declare the project root` })]);
    await put(root, 'module.ramify', 'ramify 1\nmodule fixture\n');
    const cwd = join(root, 'subs/consumer/src');
    const missing = reported(await analyzeProject(inputs(cwd)));
    expect(missing.outcome.execution).toBe('unavailable');
    expect(missing.diagnostics).toEqual([expect.objectContaining({ code: 'root-not-found', category: 'acquisition',
      message: `No marked project root at or above ${cwd}; the nearest description is ${join(root, 'subs/consumer/module.ramify')}: add root before module on its module line if it is the project root` })]);
  }), 60_000);

  it('locates a marked child at its marker as an undeclared project boundary', () => fixture(async (root, inputs) => {
    await put(root, 'subs/consumer/module.ramify', '// another project\nramify 1\nroot module consumer\n');
    const report = reported(await analyzeProject(inputs(root, root)));
    expect(report.outcome.execution).toBe('invalid');
    expect(report.diagnostics).toEqual([expect.objectContaining({ code: 'undeclared-project-boundary', category: 'layout',
      location: { file: 'subs/consumer/module.ramify', start: 28, end: 32, line: 3, column: 1 } })]);
  }), 60_000);
});
