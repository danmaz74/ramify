import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { analyzeProject } from '../../subs/analysis/src/analyze-project.js';
import { planApiViewRequests, projectApiView } from '../../subs/analysis/src/api-view.js';
import type { ApiViewProjectOutcome } from '../../subs/analysis/src/api-view.js';
import type { AnalysisReport } from '../../subs/analysis/src/interfaces/analysis.js';
import type { ApiViewQuery, ApiViewSelection, RetainedSession, SessionInputs, SessionRevision } from '../../subs/analysis/src/interfaces/session.js';
import { emptyIndexes } from '../../subs/analysis/src/session-facts.js';
import type { SessionFacts } from '../../subs/analysis/src/session-facts.js';
import { openRetainedSession } from '../../subs/analysis/src/retained-session.js';
import { originalKey } from '../../subs/analysis/subs/model/src/index.js';
import type { SymbolDetail, SymbolDetailRequest } from '../../subs/analysis/subs/typescript/src/interfaces/source.js';
import { recordObservation } from './observations.js';
import { sessionInputs } from './session-expectations.js';
import type { Assertions, InstanceHandler } from './runner.js';

/**
 * A small, independently transcribed real project tree for retained-session
 * `apiView` evidence: `root` exposes `rootValue`/`RootType` to descendants,
 * `branch` exposes `value` to its parent and descendants, `leaf` (a
 * descendant of `branch`) imports it, and `sibling` (external to `branch`)
 * imports `rootValue`. Not imported from `subs/analysis/src/tests/session-
 * test-fixture.ts`: independently authored evidence is stronger than one
 * shared fixture consumed twice, matching this project's own testing
 * convention (see `plan2a-projection-cases.ts`'s `ancestryFiles`).
 */
const fixtureFiles: Record<string, string> = {
  'module.ramify': 'ramify 1\nmodule fixture\nexpose-src rootValue, RootType from "interfaces/api.ts" to descendants\n',
  'README.md': '# Fixture\n\nA root and two independently accessed subtrees.\n',
  'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
    types: [], skipLibCheck: true }, include: ['src', 'subs'] }),
  'src/interfaces/api.ts': 'export const rootValue = 1;\nexport const privateValue = 2;\nexport interface RootType { readonly n: number }\n',
  'src/main.ts': "import { value } from '../subs/branch/src/provider.js';\nvoid value;\n",
  'subs/branch/module.ramify': 'ramify 1\nmodule branch\nexpose-src value from "provider.ts" to parent\nexpose-src value from "provider.ts" to descendants\n',
  'subs/branch/README.md': '# Branch\n\nThe branch provides a value to its parent and descendants.\n',
  'subs/branch/src/provider.ts': 'export const value = 1;\nexport function compute(): number {\n  return 2;\n}\n',
  'subs/branch/subs/leaf/module.ramify': 'ramify 1\nmodule leaf\n',
  'subs/branch/subs/leaf/README.md': '# Leaf\n\nThe leaf consumes the branch value.\n',
  'subs/branch/subs/leaf/src/probe.ts': "import { value } from '../../../src/provider.js';\nvoid value;\n",
  'subs/sibling/module.ramify': 'ramify 1\nmodule sibling\n',
  'subs/sibling/README.md': '# Sibling\n\nThe sibling consumes only a root original.\n',
  'subs/sibling/src/probe.ts': "import { rootValue } from '../../../src/interfaces/api.js';\nvoid rootValue;\n",
};
const providerPath = 'subs/branch/src/provider.ts';
const leafPath = 'subs/branch/subs/leaf/src/probe.ts';
const sessionLimits = { updateDeadlineMs: 5_000, sweepIntervalMs: 30_000, workerHeapMiB: 512, maxRetainedFactBytes: 96 * 1024 ** 2 };
const detailLimits = { maxSignatureBytes: 2048, maxDocumentationBytes: 512, maxOverloads: 8, maxResultBytes: 32 * 1024 ** 2 };
const generousBounds = { maxAreaBytes: 32 * 1024 ** 2, maxInvocationBytes: 256 * 1024 ** 2 };
const allModules: ApiViewSelection = { scope: 'all' };

function inputs(root: string): SessionInputs { return { ...sessionInputs(root), session: sessionLimits }; }
const query = (sequence: number, selection: ApiViewSelection = allModules, bounds = generousBounds): ApiViewQuery =>
  ({ sequence, selection, details: detailLimits, ...bounds });

async function put(root: string, path: string, contents: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents);
}
async function replace(root: string, path: string, before: string, after: string): Promise<void> {
  const text = await readFile(join(root, path), 'utf8');
  if (text.split(before).length !== 2) throw new Error(`Expected exactly one anchor in ${path}: ${before}`);
  await writeFile(join(root, path), text.replace(before, () => after));
}
async function withFixture<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-plan2a-session-'));
  try {
    for (const [path, contents] of Object.entries(fixtureFiles)) await put(root, path, contents);
    return await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

interface Opened { readonly session: RetainedSession; readonly revision: SessionRevision }
async function open(root: string): Promise<Opened> {
  const opened = await openRetainedSession(inputs(root));
  if (opened.status !== 'opened') throw new Error(`The session did not open: ${JSON.stringify(opened)}`);
  return opened;
}

/**
 * Independent oracle: a fresh disposable batch analysis of the same disk
 * state, joined through the same `planApiViewRequests`/`projectApiView` pair
 * `RetainedSession.apiView` chains -- a different acquisition and compiler
 * lifetime from the retained session under test, per iteration 5's own
 * `factsFrom` pattern (`plan2a-projection-cases.ts`), independently
 * transcribed here since that file's helper is not exported.
 */
function factsFrom(report: AnalysisReport): SessionFacts {
  const snapshot = report.snapshot;
  if (!snapshot?.model || !snapshot.catalog) throw new Error('Reference report has no valid model/catalog snapshot');
  return { registry: report.registry!, invalid: null, inventory: snapshot.inventory, areas: snapshot.areas, areaIssues: [],
    files: {}, catalog: snapshot.catalog, linked: snapshot.linked, linkIssues: [], model: snapshot.model, decisions: {},
    companions: { diagnostics: [], coverage: [] }, indexes: emptyIndexes };
}
function stubDetail(request: SymbolDetailRequest): SymbolDetail {
  return { state: 'described', original: request.original, exportName: request.exportName, signature: `const ${request.exportName}: unknown` };
}
async function oracle(root: string, selection: ApiViewSelection): Promise<ApiViewProjectOutcome> {
  const run = await analyzeProject(sessionInputs(root));
  if (run.status !== 'reported') throw new Error('Oracle batch analysis was cancelled');
  const facts = factsFrom(run.report);
  const planned = planApiViewRequests(facts, selection);
  if (planned.status !== 'planned') return planned;
  const byKey = new Map(planned.requests.map(request => [`${originalKey(request.original)} ${request.exportName}`, request]));
  const detailsOf = (request: SymbolDetailRequest): SymbolDetail => {
    const key = `${originalKey(request.original)} ${request.exportName}`;
    if (!byKey.has(key)) throw new Error(`Unplanned detail request: ${key}`);
    return stubDetail(request);
  };
  return projectApiView(facts, 1, 'oracle', selection, detailsOf, generousBounds);
}
/** Compare two projections ignoring `SymbolDetail`, since the oracle stubs
 * signatures rather than resolving the real compiler a second time; shape,
 * grouping, ordering and availability must still agree exactly. */
function shapeOf(outcome: ApiViewProjectOutcome): unknown {
  if (outcome.status !== 'projected') return outcome;
  return {
    status: outcome.status,
    modules: outcome.projection.modules.map(module => ({
      module: module.module, directory: module.directory,
      ordinary: module.ordinary && { area: module.ordinary.area, root: module.ordinary.root,
        files: module.ordinary.files.map(file => ({ category: file.category, definingFile: file.definingFile,
          entries: file.entries.map(entry => ({ name: entry.name, form: entry.form })) })) },
      tests: module.tests && { area: module.tests.area, root: module.tests.root,
        files: module.tests.files.map(file => ({ category: file.category, definingFile: file.definingFile,
          entries: file.entries.map(entry => ({ name: entry.name, form: entry.form })) })) },
    })),
  };
}

export const plan2aSessionHandlers: ReadonlyMap<string, InstanceHandler> = new Map([
  ['I2A-08:current-valid-query', { kind: 'memory', run: async ({ assertions }) => withFixture(async root => {
    const { session, revision } = await open(root);
    try {
      const outcome = await session.apiView(query(revision.sequence));
      assertions.equal('a current valid query projects the requested selection', outcome.status, 'projected');
      if (outcome.status !== 'projected') throw new Error(JSON.stringify(outcome));
      assertions.equal('the projection stamps the session\'s own sequence and input ID', [outcome.projection.sequence, outcome.projection.inputId], [revision.sequence, revision.inputId]);
      const expected = await oracle(root, allModules);
      assertions.equal('the shape matches an independent disposable-batch oracle joined through the same pure functions', shapeOf(outcome), shapeOf(expected));
    } finally { await session.dispose(); }
  }) }],

  ['I2A-08:invalid-or-historical', { kind: 'memory', run: async ({ assertions }) => withFixture(async root => {
    const { session, revision } = await open(root);
    try {
      await replace(root, providerPath, 'export const value = 1;', 'export const value = 2;');
      const updated = await session.update([{ path: providerPath, kind: 'changed' }]);
      if (updated.status !== 'revised') throw new Error(JSON.stringify(updated));
      const stale = await session.apiView(query(revision.sequence));
      assertions.equal('an old sequence is explicit unavailable, never the last-valid projection', stale, { status: 'unavailable', reason: 'invalid-revision', message: stale.status === 'unavailable' && 'message' in stale ? stale.message : '' });
      const unknown = await session.apiView(query(updated.revision.sequence + 1000));
      assertions.equal('an unknown sequence is the same explicit unavailable reason', unknown.status === 'unavailable' && unknown.reason, 'invalid-revision');
      const invalidLocation = await session.apiView(query(updated.revision.sequence, { scope: 'module', from: '../escape' }));
      assertions.equal('a non-canonical location is invalid-location, not a silently substituted view', invalidLocation.status === 'unavailable' && invalidLocation.reason, 'invalid-location');
    } finally { await session.dispose(); }
  }) }],

  ['I2A-08:hot-details', { kind: 'memory', run: async ({ assertions }) => withFixture(async root => {
    const { session, revision } = await open(root);
    try {
      assertions.equal('the session opens hot', session.status().level, 'hot');
      const outcome = await session.apiView(query(revision.sequence));
      assertions.equal('a hot session answers directly, with a described (non-truncated) real signature', outcome.status === 'projected'
        && outcome.projection.modules.some(module => module.ordinary?.files.some(file => file.entries.some(entry => entry.detail.state === 'described'))), true);
    } finally { await session.dispose(); }
  }) }],

  ['I2A-08:warm-rehydration', { kind: 'memory', run: async ({ assertions }) => withFixture(async root => {
    const { session, revision } = await open(root);
    try {
      const hot = await session.apiView(query(revision.sequence));
      await session.releaseCompiler();
      assertions.equal('releasing the compiler demotes the session to warm', session.status().level, 'warm');
      const before = session.current;
      const warm = await session.apiView(query(revision.sequence));
      assertions.equal('the warm rehydration answers identically to the earlier hot projection', warm, hot);
      assertions.equal('the compiler is hot again after rehydration', session.status().level, 'hot');
      assertions.equal('no revision was published for the query itself', session.current === before && session.current?.sequence === revision.sequence, true);
    } finally { await session.dispose(); }
  }) }],

  ['I2A-08:new-observation-supersedes', { kind: 'memory', run: async ({ assertions }) => withFixture(async root => {
    const { session, revision } = await open(root);
    try {
      await session.releaseCompiler();
      // Changed directly on disk, outside the session's own observer/update path.
      await replace(root, providerPath, 'export const value = 1;', 'export const value = 99;');
      const outcome = await session.apiView(query(revision.sequence));
      assertions.equal('rehydration observing new content reports superseded, not stale data', outcome.status, 'superseded');
      const recovered = await session.update([{ path: providerPath, kind: 'changed' }]);
      assertions.equal('the session recovers cleanly through its normal reconciliation path afterward', recovered.status, 'revised');
    } finally { await session.dispose(); }
  }) }],

  ['I2A-08:no-report-or-rescan', { kind: 'memory', run: async ({ assertions }) => withFixture(async root => {
    const { session, revision } = await open(root);
    try {
      let reportCalls = 0;
      const original = session.report.bind(session);
      session.report = (control, sequence) => { reportCalls++; return original(control, sequence); };
      const before = session.status();
      const outcome = await session.apiView(query(revision.sequence));
      assertions.equal('the query itself never calls report()', reportCalls, 0);
      assertions.equal('the query publishes no new revision and observes no new input',
        [session.current?.sequence, session.status().observedInputs], [revision.sequence, before.observedInputs]);
      assertions.equal('the query still projects successfully', outcome.status, 'projected');
    } finally { await session.dispose(); }
  }) }],

  ['I2A-08:query-serialization', { kind: 'memory', run: async ({ assertions }) => withFixture(async root => {
    const { session, revision } = await open(root);
    try {
      const before = revision.sequence;
      await replace(root, providerPath, 'export const value = 1;', 'export const value = 2;');
      const updatePromise = session.update([{ path: providerPath, kind: 'changed' }]);
      const includedPromise = session.apiView(query(before + 1));
      const [updateResult, included] = await Promise.all([updatePromise, includedPromise]);
      if (updateResult.status !== 'revised') throw new Error(JSON.stringify(updateResult));
      assertions.equal('a query queued behind an in-flight update is included and answers from the sequence it published',
        [updateResult.revision.sequence, included.status, included.status === 'projected' ? included.projection.sequence : null],
        [before + 1, 'projected', before + 1]);

      await replace(root, leafPath, 'void value;', 'void value; export const marker = 1;');
      const secondUpdate = session.update([{ path: leafPath, kind: 'changed' }]);
      const stalePromise = session.apiView(query(before + 1));
      const [secondResult, stale] = await Promise.all([secondUpdate, stalePromise]);
      assertions.equal('a second update publishes again', secondResult.status, 'revised');
      assertions.equal('a query behind it cannot be answered with the sequence that predates that second update',
        stale.status === 'unavailable' && stale.reason, 'invalid-revision');
    } finally { await session.dispose(); }
  }) }],

  ['I2A-08:query-limits', { kind: 'memory', run: async ({ assertions }) => withFixture(async root => {
    const { session, revision } = await open(root);
    try {
      const tiny = await session.apiView(query(revision.sequence, allModules, { maxAreaBytes: 1, maxInvocationBytes: 1 }));
      assertions.equal('a byte bound crossed by the real projection refuses it wholesale, not a partial catalog',
        tiny.status === 'unavailable' && tiny.reason, 'resource-limit');
      recordObservation('plan2a-session-query-limits', {
        note: 'S1000 is not re-run for this leaf: Plan 5\'s retained session already refuses S1000 at the 96 MiB '
          + 'maxRetainedFactBytes limit (a predecessor limitation this plan preserves, not a new pass); this fixture\'s '
          + 'exact, deterministic area/invocation byte-bound crossing is the evidence for apiView\'s own resource-limit path.',
      });
    } finally { await session.dispose(); }
  }) }],

  ['I2A-08:query-disposal', { kind: 'memory', run: async ({ assertions }) => withFixture(async root => {
    const { session, revision } = await open(root);
    const controller = new AbortController();
    controller.abort();
    const cancelled = await session.apiView(query(revision.sequence), { signal: controller.signal });
    assertions.equal('an already-cancelled query returns cancelled with no projection', cancelled, { status: 'cancelled' });

    const beforeBytes = session.status().factBytes;
    const first = await session.apiView(query(revision.sequence));
    const second = await session.apiView(query(revision.sequence));
    assertions.equal('repeated queries both succeed and retain no additional projection bytes',
      [first.status, second.status, session.status().factBytes], ['projected', 'projected', beforeBytes]);

    await session.dispose();
    const afterDisposal = await session.apiView(query(revision.sequence));
    assertions.equal('a query after disposal is explicit unavailable, never a stale answer', afterDisposal.status === 'unavailable' && afterDisposal.reason, 'invalid-revision');
  }) }],
]);
