import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQuickEnvironment } from './quick-environment.js';
import type { QuickEnvironment } from './quick-environment.js';
import { runCli } from '../../subs/cli/src/run-cli.js';
import { analyzeDependencyDiagram } from '../../subs/analysis/src/index.js';
import type { DependencyDiagramRunner } from '../../subs/analysis/src/index.js';
import type { ContextRevision } from '../../subs/daemon/subs/contexts/src/interfaces/contexts.js';
import { createProjectExplorerModel } from '../../subs/service-api/src/project-view.js';
import type { MeasureDocument } from '../interfaces/service.js';
import { limits, runBatch } from '../batch.js';
import { capabilities } from '../../subs/cli/src/command-support.js';
import { dependencyAnalyzerCapacity } from '../dependency-analyzer-process.js';

/*
 * PB1-27, PB1-28 and PB1-29 through the real daemon service, publisher and
 * explorer projection, over the written provider topology (project-boundary
 * fixtures.md): `ramify materialize --view api --view architect --all` and
 * `ramify measure` with the quick environment (real service, analysis and
 * filesystem publisher; only time, watching and transport controlled), and
 * the explorer model over a batch report of the same files. Expected values
 * are reasoned from the contracts ("Transport, observation and projections";
 * deliverable 4 of iteration 18, decided by the user on 2026-10-03) and the
 * architect, API-view and measurement specifications:
 *
 * - both views come from one revision and are published in one transaction:
 *   a refused architect target publishes no API view either;
 * - module records list the declared trees and nothing beneath them; no view
 *   is generated in or names a file of an inert, scratch or excluded path;
 * - an existing view whose `_meta.json` names `ramify.architect-view/<number>`
 *   is replaced, whatever the number; one without `_meta.json` is refused;
 * - the measure document and the explorer model hold exactly the analyzed
 *   population, auxiliary source included, bound to their revision.
 */

const timeout = 180_000;

const topology: Readonly<Record<string, string>> = {
  'package.json': '{"name":"app","type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [],
    strict: true, skipLibCheck: true }, include: ['src', 'subs/*/src', 'subs/*/subs/*/src'], exclude: ['src/tmp', 'subs/*/src/tmp'] }),
  'module.ramify': 'ramify 1\nroot module app tagged [dispatch]\nowned-nested-project "fixture-project"\nexternal "external-project"\n'
    + 'expose-sub api from a to descendants\n',
  'README.md': '# App\n\nThe written provider topology, published.\n',
  'notes/design.md': 'Inert root-owned prose naming inertNotesMarker.\n',
  'scripts/check.ts': "import { api } from '../subs/a/src/api.js';\nexport function check(): number { return api(); }\n",
  'tools/tmp/helper.ts': 'export function helper(): number { return 7; }\n',
  'src/main.ts': 'export const main: number = 1;\n',
  'src/tmp/throwaway.test.ts': "export const scratchRootMarker = 1;\ndescribe('scratch root suite', () => { it('scratch root title', () => {}); });\n",
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
const excludedMarkers = ['inertNotesMarker', 'scratchRootMarker', 'scratch root', 'ignoredRootTreeMarker', 'ignored root', 'externalTreeMarker',
  'scratchModuleMarker', 'ignoredSampleMarker', 'ignored sample', 'fixture-project/', 'external-project/', 'subs/a/fixtures/sample/',
  'src/tmp/', 'notes/', 'throwaway', 'broken'];
/** The analyzed population as `[path, owner, area, kind]`: module source, auxiliary source and module-root documentation. */
const population: readonly (readonly [string, string, string, string])[] = [
  ['README.md', 'app', 'documentation', 'documentation'], ['module.ramify', 'app', 'documentation', 'documentation'],
  ['scripts/check.ts', 'app', 'ordinary', 'source'], ['src/main.ts', 'app', 'ordinary', 'source'],
  ['subs/a/README.md', 'app/a', 'documentation', 'documentation'], ['subs/a/module.ramify', 'app/a', 'documentation', 'documentation'],
  ['subs/a/scripts/report.test.ts', 'app/a', 'ordinary', 'source'], ['subs/a/scripts/report.ts', 'app/a', 'ordinary', 'source'],
  ['subs/a/src/api.ts', 'app/a', 'ordinary', 'source'], ['subs/a/src/tests/api.test.ts', 'app/a', 'tests', 'source'],
  ['subs/a/src/tests/tmp/real.test.ts', 'app/a', 'tests', 'source'],
  ['subs/a/subs/grand/README.md', 'app/a/grand', 'documentation', 'documentation'],
  ['subs/a/subs/grand/module.ramify', 'app/a/grand', 'documentation', 'documentation'],
  ['subs/a/subs/grand/src/grand.ts', 'app/a/grand', 'ordinary', 'source'],
  ['subs/b/README.md', 'app/b', 'documentation', 'documentation'], ['subs/b/module.ramify', 'app/b', 'documentation', 'documentation'],
  ['subs/b/src/consumer.ts', 'app/b', 'ordinary', 'source'],
  ['tools/tmp/helper.ts', 'app', 'ordinary', 'source'],
];
const apiTargets = ['src/.ramify', 'subs/a/src/.ramify', 'subs/a/src/tests/.ramify', 'subs/a/subs/grand/src/.ramify', 'subs/b/src/.ramify'];

async function withProject(check: (root: string, quick: QuickEnvironment) => Promise<void>,
  extra: Readonly<Record<string, string>> = {}): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-boundary-publication-')));
  // The dependency analyzer in process, over the report the process runner would receive.
  const dependencyDiagrams: DependencyDiagramRunner = { run: (input, control) => analyzeDependencyDiagram({ ...input, limits: {
    source: limits.source, maxResultBytes: dependencyAnalyzerCapacity.maxResultBytes, deadlineMs: dependencyAnalyzerCapacity.analysisDeadlineMs } },
  control) };
  const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 }, { dependencyDiagrams });
  try {
    for (const [path, text] of Object.entries({ ...topology, ...extra })) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
    await check(root, quick);
  } finally {
    try { await quick.dispose(); } finally { await rm(root, { recursive: true, force: true }); }
  }
}

async function cli(quick: QuickEnvironment, root: string, argv: readonly string[]) {
  const stdout: string[] = [], stderr: string[] = [];
  const exitCode = await runCli(argv, { cwd: root, version: '0.0.0', connect: quick.connect,
    stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); },
    batch: async () => { throw new Error('Resident command unexpectedly invoked batch'); } });
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
}

/** Every file beneath `root`, project-relative, with its text, in byte order. */
async function files(root: string, directory: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  async function walk(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isDirectory()) await walk(target);
      else found.set(relative(root, target), await readFile(target, 'utf8'));
    }
  }
  await walk(join(root, directory));
  return new Map([...found].sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
}
/** Every generated view directory beneath `root`, wherever it lies. */
async function generatedDirectories(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.ramify' || entry.name === '.ramify-architect') found.push(relative(root, join(path, entry.name)));
      else await walk(join(path, entry.name));
    }
  }
  await walk(root);
  return found.sort();
}

describe('published views over the written topology (PB1-27, PB1-28)', () => {
  it('publishes both views from one revision with the declared trees and nothing beneath them, and writes nothing on a repeat', () => withProject(async (root, quick) => {
    const first = await cli(quick, root, ['materialize', '--view', 'api', '--view', 'architect', '--all']);
    expect([first.exitCode, first.stderr]).toEqual([0, '']);
    const lines = first.stdout.split('\n');
    expect(lines[1]).toMatch(/^Materialized: revision 1; 6 target\(s\), \d+ entries, \d+ bytes written, 0 unchanged$/);
    expect(lines[2]).toMatch(/^Architect view: \.ramify-architect, 4 modules, \d+ records, dependencies measured$/);
    // No view is generated inside a declared tree, a scratch directory or anywhere but the modules' present source areas.
    expect(await generatedDirectories(root)).toEqual(['.ramify-architect', ...apiTargets].sort());

    const architect = await files(root, '.ramify-architect');
    const meta = JSON.parse(architect.get('.ramify-architect/_meta.json')!) as Record<string, unknown>;
    expect(meta).toMatchObject({ schema: 'ramify.architect-view/3', modules: 4, dependencies: 'measured', metrics: 'measured' });
    for (const target of apiTargets) {
      expect(JSON.parse(await readFile(join(root, target, '_meta.json'), 'utf8')), target)
        .toMatchObject({ schema: 'ramify.api-view/1', revision: meta.revision });
    }
    const root_ = JSON.parse(architect.get('.ramify-architect/module.json')!) as Record<string, unknown>;
    const a = JSON.parse(architect.get('.ramify-architect/a/module.json')!) as Record<string, unknown>;
    expect([root_.schema, root_.revision, root_.boundaries, root_.files]).toEqual(['ramify.architect-module/3', meta.revision, [
      { kind: 'external', dir: 'external-project', description: 'module.ramify', line: 4, column: 1 },
      { kind: 'owned-nested-project', dir: 'fixture-project', description: 'module.ramify', line: 3, column: 1 }], { own: 3, subtree: 10 }]);
    expect([a.boundaries, a.files]).toEqual([[{ kind: 'owned-nested-project', dir: 'subs/a/fixtures/sample', description: 'subs/a/module.ramify',
      line: 3, column: 1 }], { own: 5, subtree: 6 }]);
    for (const path of ['.ramify-architect/a/grand/module.json', '.ramify-architect/b/module.json']) {
      expect((JSON.parse(architect.get(path)!) as Record<string, unknown>).boundaries, path).toEqual([]);
    }
    expect(architect.get('.ramify-architect/behavior.jsonl')).toContain('"name":"check","role":"internal"');
    expect(architect.get('.ramify-architect/a/behavior.jsonl')).toContain('"name":"report","role":"internal"');

    // API views list only a's exposed api: under children for the root, under external for its relay's receivers.
    const api = new Map<string, string>();
    for (const target of apiTargets) for (const [path, text] of await files(root, target)) api.set(path, text);
    expect([...api.keys()].filter(path => !path.endsWith('_meta.json')).sort()).toEqual([
      'src/.ramify/children/subs/a/src/api.ts.md', 'subs/a/subs/grand/src/.ramify/external/subs/a/src/api.ts.md',
      'subs/b/src/.ramify/external/subs/a/src/api.ts.md'].sort());
    for (const [path, text] of [...architect, ...api]) {
      for (const marker of excludedMarkers) expect(text, `${path} ${marker}`).not.toContain(marker);
    }
    for (const [path, text] of api) for (const name of ['check', 'helper', 'report', 'reportShape']) expect(text, `${path} ${name}`).not.toContain(`${name}(`);

    const repeat = await cli(quick, root, ['materialize', '--view', 'api', '--view', 'architect', '--all']);
    expect([repeat.exitCode, repeat.stderr]).toEqual([0, '']);
    expect(repeat.stdout.split('\n')[1]).toMatch(/^Materialized: revision 1; 6 target\(s\), \d+ entries, 0 bytes written, 6 unchanged$/);
    expect(await files(root, '.ramify-architect')).toEqual(architect);
  }), timeout);

  it('selects the owner of auxiliary source and refuses a path in a declared tree or scratch directory as an invalid location', () => withProject(async (root, quick) => {
    for (const [from, targets] of [['subs/a/scripts/report.ts', 2], ['scripts/check.ts', 1], ['tools/tmp/helper.ts', 1]] as const) {
      const result = await cli(quick, root, ['materialize', '--from', from]);
      expect([result.exitCode, result.stderr], from).toEqual([0, '']);
      expect(result.stdout.split('\n')[1], from).toMatch(new RegExp(`^Materialized: revision \\d+; ${targets} target\\(s\\), `));
    }
    for (const [from, kind, directory] of [['fixture-project/src/thing.ts', 'owned-nested-project', 'fixture-project'],
      ['external-project/lib.ts', 'external', 'external-project'], ['subs/a/fixtures/sample/src/index.ts', 'owned-nested-project', 'subs/a/fixtures/sample'],
      ['src/tmp/throwaway.test.ts', 'scratch', 'src/tmp']] as const) {
      const result = await cli(quick, root, ['materialize', '--from', from]);
      expect([result.exitCode, result.stderr, result.stdout], from).toEqual([2, '', `Root: ${root}\n`
        + `Not materialized (invalid-location): "${from}" lies in the ${kind} directory "${directory}", which Ramify does not analyze\n`
        + 'No complete refresh was claimed.\n']);
    }
  }), timeout);

  it('replaces an architect view whose _meta.json names an earlier or later version', () => withProject(async (root, quick) => {
    for (const schema of ['ramify.architect-view/1', 'ramify.architect-view/3']) {
      await rm(join(root, '.ramify-architect'), { recursive: true, force: true });
      await mkdir(join(root, '.ramify-architect/gone'), { recursive: true });
      await writeFile(join(root, '.ramify-architect/_meta.json'), `${JSON.stringify({ schema, revision: 'rev/9:old' })}\n`);
      await writeFile(join(root, '.ramify-architect/gone/module.json'), '{}\n');
      const result = await cli(quick, root, ['materialize', '--view', 'architect']);
      expect([result.exitCode, result.stderr], schema).toEqual([0, '']);
      const published = await files(root, '.ramify-architect');
      expect(published.has('.ramify-architect/gone/module.json'), schema).toBe(false);
      expect(JSON.parse(published.get('.ramify-architect/_meta.json')!), schema).toMatchObject({ schema: 'ramify.architect-view/3', modules: 4 });
    }
  }), timeout);

  it('refuses a .ramify-architect without _meta.json or naming another schema, and then publishes no API view either', () => withProject(async (root, quick) => {
    for (const [label, contents] of [['no _meta.json', { 'notes.md': 'mine\n' }],
      ['another schema', { '_meta.json': '{"schema":"ramify.api-view/1"}\n', 'notes.md': 'mine\n' }]] as const) {
      await rm(join(root, '.ramify-architect'), { recursive: true, force: true });
      for (const [name, text] of Object.entries(contents)) {
        await mkdir(join(root, '.ramify-architect'), { recursive: true });
        await writeFile(join(root, '.ramify-architect', name), text);
      }
      const result = await cli(quick, root, ['materialize', '--view', 'api', '--view', 'architect', '--all']);
      expect(result.exitCode, label).toBe(2);
      // The service folds the publisher's `invalid-path` refusal onto `invalid-location`.
      expect(result.stdout, label).toContain('Not materialized (invalid-location): ".ramify-architect" ');
      expect(result.stdout, label).toContain('so it is not a generated architect view; it was left untouched');
      expect(await files(root, '.ramify-architect'), label).toEqual(new Map(Object.entries(contents)
        .map(([name, text]) => [`.ramify-architect/${name}`, text])));
      expect(await generatedDirectories(root), label).toEqual(['.ramify-architect']);
    }
  }), timeout);
});

describe('measurements and the explorer model (PB1-29)', () => {
  it('measures and projects exactly the analyzed population, auxiliary source included, each bound to its revision', () => withProject(async (root, quick) => {
    const measured = await cli(quick, root, ['measure', '--format', 'json']);
    expect([measured.exitCode, measured.stderr]).toEqual([0, '']);
    const document = JSON.parse(measured.stdout) as MeasureDocument;
    expect(document.schema).toBe('ramify.measure/2');
    expect(document.files.map(file => [file.path, file.owner, file.area, file.kind, file.bytes])).toEqual(population
      .map(([path, owner, area, kind]) => [path, owner, area, kind, Buffer.byteLength(topology[path]!, 'utf8')]));
    const rootModule = document.modules.find(module => module.id === 'app')!;
    const source = population.filter(entry => entry[3] === 'source');
    const bytesOf = (entries: typeof population) => entries.reduce((total, [path]) => total + Buffer.byteLength(topology[path]!, 'utf8'), 0);
    expect(rootModule.subtree.production).toEqual({ sourceFiles: 8, sourceBytes: bytesOf(source.filter(entry => entry[2] === 'ordinary')),
      resourceFiles: 0, resourceBytes: 0 });
    expect(rootModule.subtree.tests).toEqual({ sourceFiles: 2, sourceBytes: bytesOf(source.filter(entry => entry[2] === 'tests')),
      resourceFiles: 0, resourceBytes: 0 });
    expect(rootModule.exact.production).toEqual({ sourceFiles: 3,
      sourceBytes: bytesOf(source.filter(entry => entry[1] === 'app')), resourceFiles: 0, resourceBytes: 0 });
    for (const marker of excludedMarkers) expect(measured.stdout, marker).not.toContain(marker);

    const run = await runBatch({ cwd: root, root, capabilities });
    if (run.status !== 'reported' || !run.report.inputId) throw new Error('Expected a completed report');
    const revision = { revision: 'rev/1:00000000-0000-0000-0000-000000000018:1', fingerprints: { inputId: run.report.inputId } } as ContextRevision;
    const projected = createProjectExplorerModel({ revision, report: run.report });
    if (projected.status !== 'ready') throw new Error(projected.reason);
    expect(projected.view.revision).toBe(revision.revision);
    expect(projected.view.modules.map(module => [module.id, module.files.map(file => [file.path, file.area, file.kind]),
      module.metrics.ownedFiles, module.metrics.subtreeFiles])).toEqual([
      ['app', [['scripts/check.ts', 'ordinary', 'source'], ['src/main.ts', 'ordinary', 'source'], ['tools/tmp/helper.ts', 'ordinary', 'source']], 3, 10],
      ['app/a', [['subs/a/scripts/report.test.ts', 'ordinary', 'source'], ['subs/a/scripts/report.ts', 'ordinary', 'source'],
        ['subs/a/src/api.ts', 'ordinary', 'source'], ['subs/a/src/tests/api.test.ts', 'tests', 'source'],
        ['subs/a/src/tests/tmp/real.test.ts', 'tests', 'source']], 5, 6],
      ['app/a/grand', [['subs/a/subs/grand/src/grand.ts', 'ordinary', 'source']], 1, 1],
      ['app/b', [['subs/b/src/consumer.ts', 'ordinary', 'source']], 1, 1],
    ]);
    expect(projected.view.summary.ownedFiles).toBe(10);
    // The cross-owner edges: the root's auxiliary script and b each use a's api; a's own script is same-owner use.
    expect(projected.view.edges.map(edge => [edge.consumer, edge.provider, edge.consumerFiles, edge.status])).toEqual([
      ['app', 'app/a', ['scripts/check.ts'], 'allowed'], ['app/b', 'app/a', ['subs/b/src/consumer.ts'], 'allowed']]);
    const encoded = JSON.stringify(projected.view);
    for (const marker of excludedMarkers) expect(encoded, marker).not.toContain(marker);
    // A model is bound to one revision: a report of another input is refused.
    expect(createProjectExplorerModel({ revision: { ...revision, fingerprints: { ...revision.fingerprints, inputId: 'input/1:other' } },
      report: run.report })).toEqual({ status: 'unavailable', reason: 'The report does not match the requested revision' });
  }), timeout);
});
