import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, vi } from 'vitest';
import { analyzeProject } from '../index.js';
import { openSessionEngine as openRetainedSession } from '../session-engine.js';
import type { AnalysisReport, RetainedSession, SessionInputs, SessionRevision } from '../index.js';
import type { SessionState } from '../session-revision.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';

const activeCapture = vi.hoisted(() => ({ capture: undefined as ((state: SessionState) => void) | undefined, revisions: 0 }));
vi.mock('../session-revision.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../session-revision.js')>();
  return { ...actual, recomputeAll: (...args: Parameters<typeof actual.recomputeAll>) => {
    activeCapture.capture?.(args[0]);
    return actual.recomputeAll(...args);
  }, revise: (...args: Parameters<typeof actual.revise>) => {
    activeCapture.revisions++;
    return actual.revise(...args);
  } };
});

/** Revision steps the session engine has entered in this test file. */
export const revisionsEntered = (): number => activeCapture.revisions;

export const paths = {
  rootApi: 'src/interfaces/api.ts', rootMain: 'src/main.ts',
  description: 'subs/branch/module.ramify', readme: 'subs/branch/README.md',
  provider: 'subs/branch/src/provider.ts', local: 'subs/branch/src/local.ts',
  leaf: 'subs/branch/subs/leaf/src/probe.ts', sibling: 'subs/sibling/src/probe.ts',
  extra: 'subs/branch/src/extra.ts',
} as const;
export const parentExposure = 'expose-src value from "provider.ts" to parent\n';
export const fixtureFiles: Record<string, string> = {
  'module.ramify': 'ramify 1\nroot module fixture\nexpose-src rootValue, RootType from "interfaces/api.ts" to descendants\n',
  'README.md': '# Fixture\n\nA root and two independently accessed subtrees.\n',
  'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
    types: [], skipLibCheck: true }, include: ['src', 'subs'] }),
  [paths.rootApi]: 'export const rootValue: number = 1;\nexport const privateValue = 2;\nexport interface RootType { readonly n: number }\n',
  [paths.rootMain]: "import { value } from '../subs/branch/src/provider.js';\nvoid value;\n",
  [paths.description]: `ramify 1\nmodule branch\n${parentExposure}expose-src value from "provider.ts" to descendants\n`,
  [paths.readme]: '# Branch\n\nThe branch provides a value to its parent and descendants.\n',
  [paths.provider]: 'export const value: number = 1;\nexport function compute(): number {\n  return 2;\n}\n',
  [paths.local]: "import { rootValue } from '../../../src/interfaces/api.js';\nvoid rootValue;\n",
  'subs/branch/subs/leaf/module.ramify': 'ramify 1\nmodule leaf\n',
  'subs/branch/subs/leaf/README.md': '# Leaf\n\nThe leaf consumes the branch value.\n',
  [paths.leaf]: "import { value } from '../../../src/provider.js';\nvoid value;\n",
  'subs/sibling/module.ramify': 'ramify 1\nmodule sibling\n',
  'subs/sibling/README.md': '# Sibling\n\nThe sibling consumes only a root original.\n',
  [paths.sibling]: "import { rootValue } from '../../../src/interfaces/api.js';\nvoid rootValue;\n",
};
export const ownedFiles = [paths.rootApi, paths.rootMain, paths.provider, paths.local, paths.leaf, paths.sibling].sort();
export const timeout = 120_000;

export async function put(root: string, path: string, contents: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents);
}
export async function replace(root: string, path: string, before: string, after: string): Promise<void> {
  const contents = await readFile(join(root, path), 'utf8');
  expect(contents.split(before), `unique mutation anchor in ${path}`).toHaveLength(2);
  await writeFile(join(root, path), contents.replace(before, () => after));
}
export async function fixture(check: (root: string, inputs: SessionInputs) => Promise<void>,
  overrides: Record<string, string> = {}): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-session-revision-')));
  try {
    for (const [path, contents] of Object.entries({ ...fixtureFiles, ...overrides })) await put(root, path, contents);
    await check(root, {
      project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      registry: createDefaultTagRegistry(), capabilities: ['static-access', 'coverage'],
      limits: {
        acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
          maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
        source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
        maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
      },
      session: { updateDeadlineMs: 2_000, sweepIntervalMs: 30_000, workerHeapMiB: 512, maxRetainedFactBytes: 96 * 1024 ** 2 },
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}

/** Capture the private state at the real cold operation; every compiler call
 * and later audit still runs through the production implementation. */
export async function opened(inputs: SessionInputs): Promise<{ handle: RetainedSession; revision: SessionRevision; state: SessionState }> {
  const captured: { state?: SessionState } = {};
  const previousCapture = activeCapture.capture;
  activeCapture.capture = state => { captured.state = state; };
  try {
    const result = await openRetainedSession(inputs);
    expect(result.status).toBe('opened');
    if (result.status !== 'opened') throw new Error(`Expected an open session: ${JSON.stringify(result)}`);
    if (!captured.state) { await result.session.dispose(); throw new Error('Cold open did not recompute the session'); }
    return { handle: result.session, revision: result.revision, state: captured.state };
  } finally { activeCapture.capture = previousCapture; }
}

/** Count real adapter operations without altering the compiler implementation. */
export function instrumentCompiler(state: SessionState) {
  const adapter = state.adapter!;
  const interpreter = adapter.interpreter();
  const update = vi.fn(adapter.update.bind(adapter));
  const describe = vi.fn(adapter.describe.bind(adapter));
  const interpret = vi.fn(interpreter.interpret.bind(interpreter));
  const dispose = vi.fn(adapter.dispose.bind(adapter));
  state.adapter = {
    get hot() { return adapter.hot; }, update, describe, dispose,
    catalog: adapter.catalog.bind(adapter), releaseCompiler: adapter.releaseCompiler.bind(adapter),
    details: adapter.details.bind(adapter), shapes: adapter.shapes.bind(adapter), testTitles: adapter.testTitles.bind(adapter),
    interpreter: () => ({ interpret, replaceDescriptions: interpreter.replaceDescriptions.bind(interpreter),
      dispose: interpreter.dispose.bind(interpreter) }),
  };
  return { update, describe, interpret, dispose, adapter: state.adapter };
}

export function instrumentObserver(state: SessionState) {
  const observer = state.observer!;
  const apply = vi.fn(observer.apply.bind(observer));
  const reobserve = vi.fn(observer.reobserve.bind(observer));
  const retire = vi.fn(observer.retire.bind(observer));
  state.observer = {
    get inventory() { return observer.inventory; }, get resolution() { return observer.resolution; }, get inputs() { return observer.inputs; },
    get inputId() { return observer.inputId; }, sink: observer.sink, apply, reobserve, retire,
    auxiliarySource: observer.auxiliarySource.bind(observer), readDescription: observer.readDescription.bind(observer),
    readReadme: observer.readReadme.bind(observer), dispose: observer.dispose.bind(observer),
  };
  return { observer, apply, reobserve, retire };
}

export const comparable = (report: AnalysisReport | null): unknown => JSON.parse(JSON.stringify({ ...report, runId: 'compared' }));
export async function equalToBatch(handle: RetainedSession, inputs: SessionInputs): Promise<AnalysisReport> {
  const { session: _session, ...request } = inputs;
  const fresh = await analyzeProject(request);
  if (fresh.status !== 'reported') throw new Error('Batch comparison was cancelled');
  const report = await handle.report();
  expect(comparable(report)).toEqual(comparable(fresh.report));
  return report!;
}
export async function revised(handle: RetainedSession, names: readonly string[],
  kind: 'changed' | 'created' | 'deleted' | 'unknown' = 'changed'): Promise<SessionRevision> {
  const result = await handle.update(names.map(path => ({ path, kind })));
  expect(result.status).toBe('revised');
  if (result.status !== 'revised') throw new Error(`Expected a revision: ${JSON.stringify(result)}`);
  expect(result.identical).toBe(false);
  return result.revision;
}
export async function audited(handle: RetainedSession): Promise<void> {
  const current = handle.current;
  expect(await handle.verify()).toMatchObject({ status: 'equal', sequence: current!.sequence });
  expect(handle.current).toBe(current);
}
