import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';
import { renderArchitectView } from '../architect-render.js';
import { analyzeDependencyDiagram } from '../dependency-analyzer.js';
import type { ArchitectViewProjection, RenderedArchitectView } from '../interfaces/architect-view.js';
import type { DependencyDiagramFacts, TestReferenceFacts } from '../interfaces/dependency-diagram.js';
import type { SessionMeasurements } from '../interfaces/measurements.js';
import type { ApiViewProjection, ApiViewQuery, ApiViewSelection, RetainedSession, SessionInputs, SessionRevision } from '../interfaces/session.js';
import { architectLimits } from './architect-fixture.js';
import { opened } from './session-test-fixture.js';

/*
 * PB1-27, PB1-28 and PB1-29 at the analysis owner's projection boundary, over
 * the written provider topology (project-boundary fixtures.md), through one
 * real retained session: the architect projection rendered with the
 * dependency facts and measurements of the same revision, the API-view
 * projections and the session measurements. Every expected value is reasoned
 * from the contracts ("Transport, observation and projections") and the
 * architect and API-view specifications, never from a recorded run:
 *
 * - a module record lists its declared owned nested and external trees with
 *   the declaring statement, and nothing beneath them; its counts include its
 *   auxiliary source and exclude inert files, scratch and declared trees;
 * - auxiliary originals are internal records, never available foreign APIs;
 *   an API-view selection from auxiliary source selects its owner, one from a
 *   declared tree, a scratch directory or a reserved path is refused;
 * - every projection names the one revision, and the existing byte limits
 *   refuse a projection one byte over them.
 *
 * Publication, the measure document and the explorer model are verified
 * through the daemon service and the service-api projection in the root's
 * `src/tests/project-boundary-publication.test.ts`, since this owner receives
 * neither the publisher nor the explorer projection.
 */

const timeout = 300_000;
const revisionLabel = 'rev/1:views';

/** The written topology: root `app` [dispatch], children `a` (with `grand`) and `b`; marker strings name excluded content. */
const topology: Readonly<Record<string, string>> = {
  'package.json': '{"name":"app","type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [],
    strict: true, skipLibCheck: true }, include: ['src', 'subs/*/src', 'subs/*/subs/*/src'], exclude: ['src/tmp', 'subs/*/src/tmp'] }),
  'module.ramify': 'ramify 1\nroot module app tagged [dispatch]\nowned-nested-project "fixture-project"\nexternal "external-project"\n'
    + 'expose-sub api from a to descendants\n',
  'README.md': '# App\n\nThe written provider topology, viewed.\n',
  'notes/design.md': 'Inert root-owned prose naming inertNotesMarker.\n',
  // Root auxiliary source: the only root consumer of a's api, and a helper beneath tools/tmp, which is not scratch.
  'scripts/check.ts': "import { api } from '../subs/a/src/api.js';\nexport function check(): number { return api(); }\n",
  'tools/tmp/helper.ts': 'export function helper(): number { return 7; }\n',
  'src/main.ts': 'export const main: number = 1;\n',
  'src/tmp/throwaway.test.ts': "export const scratchRootMarker = 1;\ndescribe('scratch root suite', () => { it('scratch root title', () => {}); });\n",
  // The root's owned-unwired project, with a malformed description and test-shaped files Ramify must never read.
  'fixture-project/module.ramify': 'ramify 1\nroot module fixture-project\n',
  'fixture-project/tsconfig.json': '{ "include": ["src"] }',
  'fixture-project/src/thing.ts': 'export function ignoredRootTreeMarker(): number { return 1; }\n',
  'fixture-project/src/tests/thing.test.ts': "describe('ignored root suite', () => { it('ignored root title', () => {}); });\n",
  'fixture-project/subs/broken/module.ramify': 'this is not a description\n',
  'external-project/lib.ts': 'export function externalTreeMarker(): number { return 2; }\n',
  'subs/a/module.ramify': 'ramify 1\nmodule a\nowned-nested-project "fixtures/sample"\nexpose-src api from "api.ts" to parent\n',
  'subs/a/README.md': '# A\n\nProvides api.\n',
  'subs/a/src/api.ts': 'export function api(): number { return 1; }\n',
  'subs/a/src/tests/api.test.ts': "import { api } from '../api.js';\n\ndescribe('api', () => {\n  it('returns one', () => {\n    api();\n  });\n});\n",
  'subs/a/src/tests/tmp/real.test.ts': "describe('real', () => {\n  it('is analyzed', () => {});\n});\n",
  'subs/a/src/tmp/throwaway.ts': 'export const scratchModuleMarker = 1;\n',
  // a's auxiliary source: a same-owner import, and a test-named file that is ordinary source.
  'subs/a/scripts/report.ts': "import { api } from '../src/api.js';\nexport function report(): number { return api(); }\n",
  'subs/a/scripts/report.test.ts': 'export const reportShape = { size: 1 };\n',
  'subs/a/fixtures/sample/module.ramify': 'ramify 1\nroot module sample\n',
  'subs/a/fixtures/sample/src/index.ts': 'export function ignoredSampleMarker(): number { return 9; }\n',
  'subs/a/fixtures/sample/src/tests/sample.test.ts': "describe('ignored sample suite', () => { it('ignored sample title', () => {}); });\n",
  'subs/a/subs/grand/module.ramify': 'ramify 1\nmodule grand\n',
  'subs/a/subs/grand/README.md': '# Grand\n\nNo import edges.\n',
  'subs/a/subs/grand/src/grand.ts': 'export const grand: number = 3;\n',
  'subs/b/module.ramify': 'ramify 1\nmodule b\n',
  'subs/b/README.md': '# B\n\nConsumes api.\n',
  'subs/b/src/consumer.ts': "import { api } from '../../a/src/api.js';\nexport function consume(): number { return api(); }\n",
};
/** Strings that occur only in inert, scratch or excluded files: none may reach a view or a measurement. */
const excludedMarkers = ['inertNotesMarker', 'scratchRootMarker', 'scratch root', 'ignoredRootTreeMarker', 'ignored root', 'externalTreeMarker',
  'scratchModuleMarker', 'ignoredSampleMarker', 'ignored sample', 'fixture-project/', 'external-project/', 'subs/a/fixtures/sample/',
  'src/tmp/', 'notes/', 'throwaway', 'broken'];

const bytes = (path: string): number => Buffer.byteLength(topology[path]!, 'utf8');
const sum = (paths: readonly string[]): number => paths.reduce((total, path) => total + bytes(path), 0);

/** The analyzed population, by owner and bucket, as the contracts state it: module source, auxiliary source and module-root documentation. */
const population = {
  app: { production: ['scripts/check.ts', 'src/main.ts', 'tools/tmp/helper.ts'], tests: [] as string[], documentation: ['README.md', 'module.ramify'] },
  'app/a': { production: ['subs/a/scripts/report.test.ts', 'subs/a/scripts/report.ts', 'subs/a/src/api.ts'],
    tests: ['subs/a/src/tests/api.test.ts', 'subs/a/src/tests/tmp/real.test.ts'], documentation: ['subs/a/README.md', 'subs/a/module.ramify'] },
  'app/a/grand': { production: ['subs/a/subs/grand/src/grand.ts'], tests: [] as string[],
    documentation: ['subs/a/subs/grand/README.md', 'subs/a/subs/grand/module.ramify'] },
  'app/b': { production: ['subs/b/src/consumer.ts'], tests: [] as string[], documentation: ['subs/b/README.md', 'subs/b/module.ramify'] },
} as const;
type Owner = keyof typeof population;
const subtrees: Readonly<Record<Owner, readonly Owner[]>> = { app: ['app', 'app/a', 'app/a/grand', 'app/b'], 'app/a': ['app/a', 'app/a/grand'],
  'app/a/grand': ['app/a/grand'], 'app/b': ['app/b'] };
function buckets(owners: readonly Owner[]) {
  const pick = (bucket: 'production' | 'tests') => owners.flatMap(owner => population[owner][bucket]);
  const size = (paths: readonly string[]) => ({ sourceFiles: paths.length, sourceBytes: sum(paths), resourceFiles: 0, resourceBytes: 0 });
  const documentation = owners.flatMap(owner => population[owner].documentation);
  return { production: size(pick('production')), tests: size(pick('tests')), documentation: { files: documentation.length, bytes: sum(documentation) } };
}
const metrics = (owner: Owner): string => JSON.stringify({ state: 'measured', views: { state: 'unavailable', reason: 'not-requested' },
  contextSize: { exact: buckets([owner]), subtree: buckets(subtrees[owner]) } });

/** The two module records with boundaries, written out byte for byte from the architect specification's layout. */
const expectedRootModule = (): string => `{
  "schema": "ramify.architect-module/3",
  "module": "app",
  "dir": "",
  "parent": null,
  "children": ["app/a", "app/b"],
  "tags": ["dispatch"],
  "areas": ["src"],
  "boundaries": [
    { "kind": "external", "dir": "external-project", "description": "module.ramify", "line": 4, "column": 1 },
    { "kind": "owned-nested-project", "dir": "fixture-project", "description": "module.ramify", "line": 3, "column": 1 }
  ],
  "purpose": {
    "state": "present",
    "path": "README.md",
    "text": "The written provider topology, viewed."
  },
  "docs": [],
  "files": { "own": 3, "subtree": 10 },
  "symbols": { "exposed": 0, "internal": 2, "supporting": 1, "unknown": 0 },
  "tests": { "suites": 0, "titles": 0 },
  "uses": [
    { "module": "app/a", "behavioral": 1, "nonBehavioral": 0 }
  ],
  "usedBy": [],
  "metrics": ${metrics('app')},
  "revision": "${revisionLabel}"
}
`;
const expectedAModule = (): string => `{
  "schema": "ramify.architect-module/3",
  "module": "app/a",
  "dir": "subs/a",
  "parent": "app",
  "children": ["app/a/grand"],
  "tags": [],
  "areas": ["src", "src/tests"],
  "boundaries": [
    { "kind": "owned-nested-project", "dir": "subs/a/fixtures/sample", "description": "subs/a/module.ramify", "line": 3, "column": 1 }
  ],
  "purpose": {
    "state": "present",
    "path": "subs/a/README.md",
    "text": "Provides api."
  },
  "docs": [],
  "files": { "own": 5, "subtree": 6 },
  "symbols": { "exposed": 1, "internal": 1, "supporting": 1, "unknown": 0 },
  "tests": { "suites": 2, "titles": 2 },
  "uses": [],
  "usedBy": [
    { "module": "app", "behavioral": 1, "nonBehavioral": 0 },
    { "module": "app/b", "behavioral": 1, "nonBehavioral": 0 }
  ],
  "metrics": ${metrics('app/a')},
  "revision": "${revisionLabel}"
}
`;

interface Views {
  readonly root: string;
  readonly handle: RetainedSession;
  readonly revision: SessionRevision;
  readonly projection: ArchitectViewProjection;
  readonly facts: DependencyDiagramFacts;
  readonly references: TestReferenceFacts;
  readonly measurements: SessionMeasurements;
  readonly view: RenderedArchitectView;
}

async function withViews(check: (views: Views) => Promise<void>, kind: 'owned-unwired' | 'owned-nested-project' = 'owned-nested-project'): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-boundary-views-')));
  try {
    for (const [path, text] of Object.entries(topology)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), path.endsWith('module.ramify') ? text.replaceAll('owned-nested-project', kind) : text);
    }
    const inputs: SessionInputs = {
      project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      registry: createDefaultTagRegistry(), capabilities: ['static-access', 'tags-origin', 'namespace-access', 'lazy-access',
        'symbol-free-access', 'coverage'],
      limits: {
        acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
          maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
        source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
        maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
      },
      session: { updateDeadlineMs: 2_000, sweepIntervalMs: 30_000, workerHeapMiB: 512, maxRetainedFactBytes: 96 * 1024 ** 2 },
    };
    const { handle, revision } = await opened(inputs);
    try {
      const architect = await handle.architectView({ sequence: revision.sequence, ...architectLimits });
      if (architect.status !== 'projected') throw new Error(JSON.stringify(architect));
      const report = (await handle.report())!;
      const analyzed = await analyzeDependencyDiagram({ project: inputs.project, report,
        limits: { source: inputs.limits.source, maxResultBytes: 16 * 1024 ** 2, deadlineMs: 120_000 } });
      if (analyzed.status !== 'ready') throw new Error(JSON.stringify(analyzed));
      const measured = await handle.measurements(revision.sequence);
      if (measured.status !== 'measured') throw new Error(JSON.stringify(measured));
      const view = renderArchitectView({ revision: revisionLabel, projection: architect.projection,
        dependencies: { state: 'measured', facts: analyzed.diagram, testReferences: analyzed.testReferences },
        measurements: { state: 'measured', views: { state: 'unavailable', reason: 'not-requested' }, modules: measured.measurements.modules } });
      await check({ root, handle, revision, projection: architect.projection, facts: analyzed.diagram, references: analyzed.testReferences!,
        measurements: measured.measurements, view });
    } finally { await handle.dispose(); }
  } finally { await rm(root, { recursive: true, force: true }); }
}

const file = (view: RenderedArchitectView, path: string): string => {
  const found = view.files.find(item => item.path === path);
  if (!found) throw new Error(`No file ${path}`);
  return found.text;
};
const records = (view: RenderedArchitectView, path: string): Record<string, unknown>[] =>
  file(view, path).split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
const apiQuery = (sequence: number, selection: ApiViewSelection, bounds: Partial<Pick<ApiViewQuery, 'maxAreaBytes' | 'maxInvocationBytes'>> = {}): ApiViewQuery =>
  ({ sequence, selection, details: architectLimits.details, maxAreaBytes: 32 * 1024 ** 2, maxInvocationBytes: 256 * 1024 ** 2, ...bounds });
/** Each projected area as `[module, area, category, defining file, export names]`. */
const entries = (projection: ApiViewProjection): unknown[] => projection.modules.flatMap(module => [module.ordinary, module.tests]
  .filter(area => area !== null).flatMap(area => area!.files.map(group => [module.module, area!.area, group.category, group.definingFile,
    group.entries.map(entry => entry.name)])));

describe('architect view boundaries (PB1-27)', () => {
  it('lists both boundary kinds with their declarations, counts analyzed auxiliary source, and records nothing beneath a declared tree', () => withViews(async views => {
    const { view, projection } = views;
    expect(projection).toMatchObject({ schema: 'ramify.architect-projection/3', sequence: views.revision.sequence, inputId: views.revision.inputId });
    expect(projection.modules.map(module => [module.module, module.boundaries])).toEqual([
      ['app', [{ kind: 'external', dir: 'external-project', description: 'module.ramify', line: 4, column: 1 },
        { kind: 'owned-nested-project', dir: 'fixture-project', description: 'module.ramify', line: 3, column: 1 }]],
      ['app/a', [{ kind: 'owned-nested-project', dir: 'subs/a/fixtures/sample', description: 'subs/a/module.ramify', line: 3, column: 1 }]],
      ['app/a/grand', []], ['app/b', []],
    ]);
    // Byte-exact module records, metrics included, and the other two with no boundaries.
    expect(file(view, 'module.json')).toBe(expectedRootModule());
    expect(file(view, 'a/module.json')).toBe(expectedAModule());
    for (const path of ['a/grand/module.json', 'b/module.json']) {
      expect(file(view, path)).toContain('\n  "areas": ["src"],\n  "boundaries": [],\n  "purpose": {\n');
    }
    expect(JSON.parse(file(view, 'b/module.json'))).toMatchObject({ files: { own: 1, subtree: 1 },
      uses: [{ module: 'app/a', behavioral: 1, nonBehavioral: 0 }], usedBy: [] });
    expect(JSON.parse(file(view, '_meta.json'))).toMatchObject({ schema: 'ramify.architect-view/3', revision: revisionLabel,
      input: views.revision.inputId, modules: 4, dependencies: 'measured', testReferences: 'measured', metrics: 'measured' });
    expect(view.files.map(item => item.path)).toEqual(['README.md', '_meta.json', 'a/behavior.jsonl', 'a/grand/behavior.jsonl',
      'a/grand/module.json', 'a/grand/supporting.jsonl', 'a/grand/tests.jsonl', 'a/module.json', 'a/supporting.jsonl', 'a/tests.jsonl',
      'b/behavior.jsonl', 'b/module.json', 'b/supporting.jsonl', 'b/tests.jsonl', 'behavior.jsonl', 'module.json', 'supporting.jsonl',
      'tests.jsonl']);
  }), timeout);

  it('records analyzed auxiliary originals as internal evidence beside module source, with their consumers', () => withViews(async ({ view, projection }) => {
    const pick = (record: Record<string, unknown>) => [record.name, record.role, record.shape ?? record.kind, record.to ?? null,
      record.behavioral ?? null, record.nonBehavioral, record.file];
    expect(records(view, 'behavior.jsonl').map(pick)).toEqual([
      ['check', 'internal', 'callable', null, [], [], 'scripts/check.ts'],
      ['helper', 'internal', 'callable', null, [], [], 'tools/tmp/helper.ts'],
    ]);
    expect(records(view, 'supporting.jsonl').map(pick)).toEqual([['main', 'internal', 'value', null, null, [], 'src/main.ts']]);
    // a's api is consumed behaviorally by the root's auxiliary script and by b; its own auxiliary script is same-owner use.
    expect(records(view, 'a/behavior.jsonl').map(pick)).toEqual([
      ['api', 'exposed', 'callable', ['parent'], ['app', 'app/b'], [], 'subs/a/src/api.ts'],
      ['report', 'internal', 'callable', null, [], [], 'subs/a/scripts/report.ts'],
    ]);
    expect(records(view, 'a/behavior.jsonl')[0]).toMatchObject({ reexposed: [{ by: 'app', to: ['descendants'] }], sig: 'function api(): number;' });
    // A test-named auxiliary file is ordinary source: a supporting record without the testing tag, and no test record.
    expect(records(view, 'a/supporting.jsonl').map(pick)).toEqual([['reportShape', 'internal', 'value', null, null, [], 'subs/a/scripts/report.test.ts']]);
    expect(records(view, 'a/supporting.jsonl')[0]!.tags).toBeUndefined();
    expect(records(view, 'a/tests.jsonl')).toEqual([
      { module: 'app/a', file: 'subs/a/src/tests/api.test.ts', suite: ['api'], tests: ['returns one'], exercises: ['app/a#api'] },
      { module: 'app/a', file: 'subs/a/src/tests/tmp/real.test.ts', suite: ['real'], tests: ['is analyzed'], exercises: [] },
    ]);
    // Auxiliary originals keep their owner's src/-relative identity with one leading ../.
    expect(projection.symbols.filter(symbol => !symbol.file.includes('/src/') && !symbol.file.startsWith('src/'))
      .map(symbol => [symbol.module, symbol.original.file, symbol.role])).toEqual([
      ['app', '../scripts/check.ts', 'internal'], ['app', '../tools/tmp/helper.ts', 'internal'],
      ['app/a', '../scripts/report.ts', 'internal'], ['app/a', '../scripts/report.test.ts', 'internal'],
    ]);
  }), timeout);

  it('contains no file, symbol or test title from an inert, scratch or excluded path', () => withViews(async ({ view, projection, measurements }) => {
    for (const item of view.files) for (const marker of excludedMarkers) expect(item.text, `${item.path} ${marker}`).not.toContain(marker);
    const encoded = JSON.stringify({ projection, measurements });
    for (const marker of excludedMarkers) expect(encoded, marker).not.toContain(marker);
    expect(projection.tests.map(record => record.file)).toEqual(['subs/a/src/tests/api.test.ts', 'subs/a/src/tests/tmp/real.test.ts']);
  }), timeout);
});

describe('API views from legal exposures only (PB1-28)', () => {
  it('lists only exposed originals, never an auxiliary, internal or excluded one', () => withViews(async ({ handle, revision }) => {
    const all = await handle.apiView(apiQuery(revision.sequence, { scope: 'all' }));
    if (all.status !== 'projected') throw new Error(JSON.stringify(all));
    expect(all.projection).toMatchObject({ schema: 'ramify.api-view-projection/1', sequence: revision.sequence, inputId: revision.inputId });
    // Areas in module-directory byte order: the root receives a's api from its child; grand and b receive the root's relay.
    expect(all.projection.modules.map(module => [module.module, module.ordinary?.root ?? null, module.tests?.root ?? null])).toEqual([
      ['app', 'src', null], ['app/a', 'subs/a/src', 'subs/a/src/tests'], ['app/a/grand', 'subs/a/subs/grand/src', null], ['app/b', 'subs/b/src', null]]);
    expect(entries(all.projection)).toEqual([
      ['app', 'ordinary', 'children', 'subs/a/src/api.ts', ['api']],
      ['app/a/grand', 'ordinary', 'external', 'subs/a/src/api.ts', ['api']],
      ['app/b', 'ordinary', 'external', 'subs/a/src/api.ts', ['api']],
    ]);
    const encoded = JSON.stringify(all.projection);
    for (const name of ['check', 'helper', 'report', 'reportShape', 'main', 'grand', 'consume', ...excludedMarkers]) {
      expect(encoded, name).not.toContain(`"${name}"`);
    }
    for (const marker of excludedMarkers) expect(encoded, marker).not.toContain(marker);
  }), timeout);

  it('selects the owner of auxiliary source with its ordinary profile and refuses a declared tree, scratch or reserved path', () => withViews(async ({ handle, revision }) => {
    const module = async (from: string) => {
      const outcome = await handle.apiView(apiQuery(revision.sequence, { scope: 'module', from }));
      if (outcome.status !== 'projected') throw new Error(`${from}: ${JSON.stringify(outcome)}`);
      return outcome.projection.modules.map(item => [item.module, item.ordinary?.root ?? null, item.tests?.root ?? null]);
    };
    // Positive controls: module source, ordinary testing source beneath src/tests/tmp, and auxiliary source of both owners.
    expect(await module('subs/a/src/api.ts')).toEqual([['app/a', 'subs/a/src', 'subs/a/src/tests']]);
    expect(await module('subs/a/src/tests/tmp/real.test.ts')).toEqual([['app/a', 'subs/a/src', 'subs/a/src/tests']]);
    expect(await module('subs/a/scripts/report.ts')).toEqual([['app/a', 'subs/a/src', 'subs/a/src/tests']]);
    expect(await module('subs/a/scripts')).toEqual([['app/a', 'subs/a/src', 'subs/a/src/tests']]);
    expect(await module('scripts/check.ts')).toEqual([['app', 'src', null]]);
    expect(await module('tools/tmp/helper.ts')).toEqual([['app', 'src', null]]);
    expect(await module('notes/design.md')).toEqual([['app', 'src', null]]);
    for (const from of ['fixture-project', 'fixture-project/src/thing.ts', 'external-project', 'external-project/lib.ts',
      'subs/a/fixtures/sample', 'subs/a/fixtures/sample/src/index.ts', 'src/tmp', 'src/tmp/throwaway.test.ts', 'subs/a/src/tmp/throwaway.ts',
      'node_modules/sample/index.ts', 'subs/b/src/.ramify', '.ramify-architect/module.json', '.git/config']) {
      const outcome = await handle.apiView(apiQuery(revision.sequence, { scope: 'module', from }));
      expect(outcome, from).toEqual({ status: 'unavailable', reason: 'invalid-location', message: expect.stringContaining(`"${from}" lies in the `) });
    }
    const declared = await handle.apiView(apiQuery(revision.sequence, { scope: 'module', from: 'subs/a/fixtures/sample/src/index.ts' }));
    expect(declared).toMatchObject({ message: '"subs/a/fixtures/sample/src/index.ts" lies in the owned-nested-project directory "subs/a/fixtures/sample", which Ramify does not analyze' });
  }), timeout);
});

describe('measurements and one revision (PB1-29)', () => {
  it('measures exactly the analyzed source and module documentation, auxiliary source included, with exact bytes', () => withViews(async ({ measurements, revision }) => {
    expect([measurements.sequence, measurements.inputId]).toEqual([revision.sequence, revision.inputId]);
    const expectedFiles = (Object.keys(population) as Owner[]).flatMap(owner => [
      ...population[owner].production.map(path => ({ path, owner, area: 'ordinary', kind: 'source', bytes: bytes(path) })),
      ...population[owner].tests.map(path => ({ path, owner, area: 'tests', kind: 'source', bytes: bytes(path) })),
      ...population[owner].documentation.map(path => ({ path, owner, area: 'documentation', kind: 'documentation', bytes: bytes(path) })),
    ]).sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
    expect([...measurements.files].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)))).toEqual(expectedFiles);
    for (const module of measurements.modules) {
      const owner = module.id as Owner;
      expect(module.exact, owner).toEqual(buckets([owner]));
      expect(module.subtree, owner).toEqual(buckets(subtrees[owner]));
    }
  }), timeout);

  it('names one revision in every projection and refuses each projection one byte over its limit', () => withViews(async views => {
    const { handle, revision, projection, facts, references } = views;
    const all = await handle.apiView(apiQuery(revision.sequence, { scope: 'all' }));
    if (all.status !== 'projected') throw new Error(JSON.stringify(all));
    expect([projection.inputId, all.projection.inputId, facts.inputId, references.inputId, views.measurements.inputId])
      .toEqual(Array(5).fill(revision.inputId));
    expect([projection.sequence, all.projection.sequence, views.measurements.sequence]).toEqual(Array(3).fill(revision.sequence));
    // The architect projection's own encoded size is its limit's measure: at the size it projects, one byte less refuses it.
    expect(projection.bytes).toBe(Buffer.byteLength(JSON.stringify({ ...projection, bytes: 0 }), 'utf8'));
    const exact = await handle.architectView({ sequence: revision.sequence, ...architectLimits, maxProjectionBytes: projection.bytes });
    expect(exact).toMatchObject({ status: 'projected', projection: { bytes: projection.bytes } });
    expect(await handle.architectView({ sequence: revision.sequence, ...architectLimits, maxProjectionBytes: projection.bytes - 1 }))
      .toEqual({ status: 'unavailable', reason: 'resource-limit',
        message: `Architect projection is ${projection.bytes} bytes, over the ${projection.bytes - 1}-byte limit` });
    expect(await handle.apiView(apiQuery(revision.sequence, { scope: 'all' }, { maxInvocationBytes: all.projection.bytes })))
      .toMatchObject({ status: 'projected' });
    expect(await handle.apiView(apiQuery(revision.sequence, { scope: 'all' }, { maxInvocationBytes: all.projection.bytes - 1 })))
      .toMatchObject({ status: 'unavailable', reason: 'resource-limit' });
    expect(await handle.apiView(apiQuery(revision.sequence, { scope: 'module', from: 'scripts/check.ts' }, { maxAreaBytes: 1 })))
      .toMatchObject({ status: 'unavailable', reason: 'resource-limit' });
  }), timeout);
});


describe('NT-06: architect boundary kind serialization', () => {
  it.each(['owned-unwired', 'owned-nested-project'] as const)('preserves %s in the projection and rendered module record', kind => withViews(async ({ projection, view }) => {
    const expected = { kind, dir: 'fixture-project', description: 'module.ramify', line: 3, column: 1 };
    expect(projection.schema).toBe('ramify.architect-projection/3');
    expect(projection.modules[0]!.boundaries).toContainEqual(expected);
    expect(JSON.parse(file(view, 'module.json'))).toMatchObject({ schema: 'ramify.architect-module/3',
      boundaries: expect.arrayContaining([expected]) });
    expect(JSON.parse(file(view, '_meta.json')).schema).toBe('ramify.architect-view/3');
  }, kind), timeout);
});
