import { deepStrictEqual, strictEqual } from 'node:assert';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';
import { analyzeProject } from '../index.js';
import { openSessionEngine } from '../session-engine.js';
import type { AnalysisInputs, RetainedSession } from '../index.js';

/** Direct witness also called by the owner regression: retained observation
 * retirement, current compiler roots, independent findings and full reports. */
export async function sessionInputWitness(): Promise<{ assertions: number; steps: readonly string[] }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-session-inputs-')));
  const provider = 'subs/provider/src/provider.ts';
  const source = "import { privateValue } from '../../../src/main.js';\nvoid privateValue;\n";
  const files: Record<string, string> = {
    'module.ramify': 'ramify 1\nroot module fixture\n',
    'README.md': '# Root\n\nRoot purpose.\n',
    'package.json': '{"type":"module"}',
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
      types: [], skipLibCheck: true }, include: ['src', 'subs'] }),
    'src/main.ts': 'export const privateValue = 1;\n',
    'subs/provider/module.ramify': 'ramify 1\nmodule provider\n',
    'subs/provider/README.md': '# Provider\n\nProvider purpose.\n',
    // Acquisition sees this path; the compiler also reads its contents.
    'subs/provider/package.json': '{"type":"module"}',
    [provider]: source,
  };
  const request: AnalysisInputs = {
    project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
    registry: createDefaultTagRegistry(), capabilities: ['static-access', 'coverage'],
    limits: {
      acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
        maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
      source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
      maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
    },
  };
  let handle: RetainedSession | undefined;
  let assertions = 0;
  const steps: string[] = [];
  const equal = (actual: unknown, expected: unknown, message: string): void => {
    assertions++; deepStrictEqual(actual, expected, message);
  };
  const put = async (path: string, contents: string): Promise<void> => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  };
  const check = async (name: string, findings: number, owners: number): Promise<void> => {
    const retained = await handle!.report();
    const batch = await analyzeProject(request);
    strictEqual(batch.status, 'reported');
    if (batch.status !== 'reported') throw new Error('Batch did not report');
    equal(JSON.parse(JSON.stringify({ ...retained, runId: 'compared' })),
      JSON.parse(JSON.stringify({ ...batch.report, runId: 'compared' })), `${name}: complete report, including observation roles and inputId`);
    equal(retained!.diagnostics.filter(item => item.code === 'not-visible').length, findings, `${name}: independently expected denials`);
    equal(retained!.summary.owners, owners, `${name}: independent owner count`);
    equal(retained!.outcome.execution, 'completed', `${name}: check executed`);
    const sequence = handle!.current!.sequence;
    const audit = await handle!.verify();
    equal(audit.status, 'equal', `${name}: whole session audit`);
    equal(handle!.current!.sequence, sequence, `${name}: audit does not repair a faulty publication`);
    steps.push(name);
  };
  const update = async (path: string, kind: 'deleted' | 'created', expected: 'membership' | 'broad'): Promise<void> => {
    const result = await handle!.update([{ path, kind }]);
    equal(result.status, 'revised', `${kind} ${path}: published`);
    if (result.status !== 'revised') throw new Error(JSON.stringify(result));
    equal(result.identical, false, `${kind} ${path}: new revision`);
    equal(result.revision.checked.path, expected, `${kind} ${path}: revision path`);
  };
  try {
    for (const [path, contents] of Object.entries(files)) await put(path, contents);
    const opened = await openSessionEngine({ ...request, session: { updateDeadlineMs: 2000, sweepIntervalMs: 30_000,
      workerHeapMiB: 512, maxRetainedFactBytes: 96 * 1024 ** 2 } });
    equal(opened.status, 'opened', 'real retained session opens');
    if (opened.status !== 'opened') throw new Error(JSON.stringify(opened));
    handle = opened.session;
    await check('baseline denial', 1, 2);
    const finding = handle.current!.diagnostics.find(item => item.code === 'not-visible')!.id;
    await rm(join(root, provider));
    // The last owned source in its directory takes the broad path.
    await update(provider, 'deleted', 'broad');
    equal(handle.current!.delta.removed, [finding], 'deleting the importer removes its finding');
    equal(handle.current!.inputs.some(input => input.path === provider), false, 'unreferenced deleted source is no longer observed');
    await check('last source removed', 0, 2);
    const deleted = handle.current!;
    const repeated = await handle.update([{ path: provider, kind: 'changed' }]);
    equal(repeated.status, 'revised', 'a repeated missing-path request completes');
    if (repeated.status !== 'revised') throw new Error(JSON.stringify(repeated));
    equal(repeated.identical, true, 'a missing path absent from the inventory does not trigger another deletion');
    equal(repeated.revision, deleted, 'a repeated missing-path request keeps the covering revision');
    await check('missing source requested again', 0, 2);
    await put(provider, source);
    await update(provider, 'created', 'membership');
    await check('source restored', 1, 2);
    equal(handle.current!.delta.added.map(item => item.code), ['not-visible'], 'restoration detects the denial again');
    await rm(join(root, 'subs/provider'), { recursive: true });
    await update('subs/provider', 'deleted', 'broad');
    equal(handle.current!.delta.removed, [finding], 'whole module removal removes its finding');
    await check('whole module removed', 0, 1);
  } finally {
    await handle?.dispose();
    if (handle) {
      equal(handle.status().factBytes, 0, 'dispose releases retained versions');
      equal(await handle.report(), null, 'disposed session holds no report');
    }
    await rm(root, { recursive: true, force: true });
  }
  return { assertions, steps };
}
