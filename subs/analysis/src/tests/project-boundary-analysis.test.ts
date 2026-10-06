import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../index.js';
import type { AnalysisInputs, AnalysisReport } from '../index.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';

/*
 * PB1-12, PB1-14, PB1-15 and PB1-16 through the public batch analysis, over
 * the written provider topology (project-boundary fixtures.md). Every
 * expectation follows the contracts ("Source and exposure provenance") and the
 * importability and TypeScript source interpretation specifications, not a
 * recorded run:
 *
 * - an import from analyzed source into a declared owned nested or external
 *   tree without package resolution is a definite `project-boundary-import`
 *   finding, decided before symbol selection and the same-owner exemption,
 *   for every form: value, type-only, symbol-free, namespace and lazy member
 *   selections, type queries and re-exports; the access result is `denied`
 *   with no symbol decision, counted in the summary's denials;
 * - an installed package whose real location lies in such a tree is external;
 * - targets outside the root, always-excluded targets and unresolved targets
 *   keep distinct nonblocking limits and never fail the check;
 * - auxiliary source is decided with its owner's ordinary profile.
 */

const nodeNext = JSON.stringify({
  compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', types: [], strict: true, skipLibCheck: true,
    outDir: 'dist', paths: { 'sample-alias': ['./subs/a/fixtures/sample/index.d.ts'], '@tree/*': ['./fixture-project/src/*'], '@a/*': ['./subs/a/src/*'] } },
  include: ['src', 'subs/*/src'],
});

/** The topology: root `app` [dispatch] with owned-nested-project `fixture-project` and external `external-project`; child `a` with owned-nested-project `fixtures/sample`. */
const topology: Readonly<Record<string, string>> = {
  'package.json': '{"name":"app","type":"module"}',
  'tsconfig.json': nodeNext,
  'module.ramify': 'ramify 1\nroot module app tagged [dispatch]\nowned-nested-project "fixture-project"\nexternal "external-project"\nexpose-sub api from a to descendants\n',
  'README.md': '# App\n\nThe written provider topology, boundary part.\n',
  // Positive control: the root receives a's api, exposed to its parent.
  'src/main.ts': "import { api } from '../subs/a/src/api.js';\nexport const main: number = api();\n",
  // Every form into the root's own owned nested tree by a relative route: same-owner, still denied.
  'src/forms.ts': [
    "import { thing } from '../fixture-project/src/thing.js';",
    "import type { Shape } from '../fixture-project/src/thing.js';",
    "import { type Shape as Inline } from '../fixture-project/src/thing.js';",
    "import '../fixture-project/src/thing.js';",
    "import {} from '../fixture-project/src/thing.js';",
    "import * as tree from '../fixture-project/src/thing.js';",
    "export async function load(): Promise<number> { const { thing: lazy } = await import('../fixture-project/src/thing.js'); return lazy; }",
    "export type Queried = typeof import('../fixture-project/src/thing.js').thing;",
    'export const used: [number, number, Shape | Inline | null] = [thing, tree.thing, null];',
    '',
  ].join('\n'),
  // Alias, exact bare alias, a link and a relative path into either tree, beside the true package and an application alias.
  'src/routes.ts': [
    "import { thing as aliased } from '@tree/thing.js';",
    "import { sample as exact } from 'sample-alias';",
    "import { lib as linked } from '../links/external/lib.js';",
    "import { lib as direct } from '../external-project/lib.js';",
    "import { sample } from 'sample';",
    "import { api } from '@a/api.js';",
    'export const routes: number[] = [aliased, exact, linked, direct, sample, api()];',
    '',
  ].join('\n'),
  // Re-exports into either tree, and of the package.
  'src/forward.ts': [
    "export { thing } from '../fixture-project/src/thing.js';",
    "export type { Shape } from '../fixture-project/src/thing.js';",
    "export * from '../external-project/lib.js';",
    "export * as ns from '../fixture-project/src/thing.js';",
    "export {} from '../fixture-project/src/thing.js';",
    "export { sample } from 'sample';",
    '',
  ].join('\n'),
  // Root auxiliary source: a received original, a same-owner auxiliary helper, the tree, and an unexposed foreign original.
  'scripts/check.ts': [
    "import { api } from '../subs/a/src/api.js';",
    "import { helper } from '../tools/tmp/helper.js';",
    "import { thing } from '../fixture-project/src/thing.js';",
    "import { hidden } from '../subs/b/src/hidden.js';",
    'export const checked: number[] = [api(), helper, thing, hidden];',
    '',
  ].join('\n'),
  'tools/tmp/helper.ts': 'export const helper: number = 1;\n',
  // The ignored project: its own marked root and configuration, data to the enclosing evaluation.
  'fixture-project/module.ramify': 'ramify 1\nroot module fixture-project\n',
  'fixture-project/tsconfig.json': '{ "include": ["src"] }',
  'fixture-project/src/thing.ts': 'export const thing: number = 1;\nexport interface Shape { readonly size: number }\n',
  'external-project/lib.ts': 'export const lib: number = 2;\n',
  'subs/a/module.ramify': 'ramify 1\nmodule a\nowned-nested-project "fixtures/sample"\nexpose-src api from "api.ts" to parent\n',
  'subs/a/README.md': '# A\n\nProvides api.\n',
  'subs/a/src/api.ts': 'export function api(): number { return 1; }\n',
  'subs/a/src/internal.ts': 'export const internal: number = 3;\n',
  // a's own tree from a's ordinary and testing source: same owner, still denied.
  'subs/a/src/own.ts': "import { sample } from '../fixtures/sample/index.js';\nexport const own: number = sample;\n",
  'subs/a/src/tests/api.test.ts': 'export const fromTest: number = 1;\n',
  'subs/a/src/tests/tree.test.ts': "import { sample } from '../../fixtures/sample/index.js';\nexport const inTest: number = sample;\n",
  // a's auxiliary source: same-owner internals allowed, its testing source denied, whatever the file name.
  'subs/a/scripts/report.ts': [
    "import { api } from '../src/api.js';",
    "import { internal } from '../src/internal.js';",
    "import { fromTest } from '../src/tests/api.test.js';",
    'export const reported: number[] = [api(), internal, fromTest];',
    '',
  ].join('\n'),
  'subs/a/scripts/report.test.ts': "import { fromTest } from '../src/tests/api.test.js';\nexport const shaped: number = fromTest;\n",
  // The miniature package in a's ignored tree, installed below through a link.
  'subs/a/fixtures/sample/package.json': JSON.stringify({ name: 'sample', type: 'module', exports: { '.': { types: './index.d.ts', default: './index.js' } } }),
  'subs/a/fixtures/sample/module.ramify': 'ramify 1\nroot module sample\n',
  'subs/a/fixtures/sample/index.js': 'export const sample = 1;\n',
  'subs/a/fixtures/sample/index.d.ts': 'export declare const sample: number;\n',
  'subs/b/module.ramify': 'ramify 1\nmodule b\n',
  'subs/b/src/consumer.ts': "import { api } from '../../a/src/api.js';\nexport const consumed: number = api();\n",
  'subs/b/src/hidden.ts': 'export const hidden: number = 4;\n',
};
/** The installed package link and a link into the external tree, both outside every configured source directory. */
const topologyLinks: Readonly<Record<string, string>> = { 'node_modules/sample': 'subs/a/fixtures/sample', 'links/external': 'external-project' };

/** Targets outside the root, always-excluded targets, unresolved targets and a true package, with no declared-tree import. */
const limitsProject: Readonly<Record<string, string>> = {
  'package.json': '{"name":"limits","type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', types: [],
    strict: true, skipLibCheck: true, outDir: 'dist' }, include: ['src'] }),
  'module.ramify': 'ramify 1\nroot module limits\n',
  'README.md': '# Limits\n\nTargets the analysis cannot decide.\n',
  'src/limits.ts': [
    "import { outside } from '../../outside.js';",
    "import { out } from '../dist/out.js';",
    "import { scratch } from './tmp/scratch.js';",
    "import { real as installed } from '../node_modules/realpkg/index.js';",
    "import { real } from 'realpkg';",
    "import { missing } from './missing.js';",
    "import { hidden } from 'realpkg/hidden';",
    'export const limits: unknown[] = [outside, out, scratch, installed, real, missing, hidden];',
    '',
  ].join('\n'),
  'src/tmp/scratch.ts': 'export const scratch = 1;\n',
  'dist/out.js': 'export const out = 1;\n',
  'dist/out.d.ts': 'export declare const out: number;\n',
  'node_modules/realpkg/package.json': JSON.stringify({ name: 'realpkg', type: 'module', exports: { '.': { types: './index.d.ts', default: './index.js' } } }),
  'node_modules/realpkg/index.js': 'export const real = 1;\n',
  'node_modules/realpkg/index.d.ts': 'export declare const real: number;\n',
  'node_modules/realpkg/hidden.d.ts': 'export declare const hidden: number;\n',
};

/** Analyze `files` at `<temporary>/project`, with `links` beside them and `outside` files beside the root. */
async function analyze(files: Readonly<Record<string, string>>, links: Readonly<Record<string, string>> = {},
  outside: Readonly<Record<string, string>> = {}): Promise<AnalysisReport> {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'ramify-boundary-')));
  const root = join(base, 'project');
  try {
    const write = async (path: string, text: string): Promise<void> => {
      await mkdir(dirname(path), { recursive: true }); await writeFile(path, text);
    };
    for (const [path, text] of Object.entries(files)) await write(join(root, path), text);
    for (const [path, text] of Object.entries(outside)) await write(join(base, path), text);
    for (const [path, target] of Object.entries(links)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await symlink(join(root, target), join(root, path), 'dir');
    }
    const inputs: AnalysisInputs = {
      project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      registry: createDefaultTagRegistry(), capabilities: ['static-access', 'tags-origin', 'namespace-access', 'lazy-access',
        'symbol-free-access', 'coverage'],
      limits: {
        acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
          maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
        source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
        maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
      },
    };
    const run = await analyzeProject(inputs);
    if (run.status !== 'reported') throw new Error('Expected an analysis report');
    return run.report;
  } finally { await rm(base, { recursive: true, force: true }); }
}

let shared: Promise<AnalysisReport> | undefined;
/** The topology's report, analyzed once for every test that reads it. */
const topologyReport = (): Promise<AnalysisReport> => shared ??= analyze(topology, topologyLinks);

/** Each access of `importer` as `[specifier, form, outcome, decisions as status/reason]`, in report order. */
function decided(report: AnalysisReport, importer: string): unknown[] {
  const snapshot = report.snapshot!;
  return snapshot.accesses.filter(access => access.importer.file === importer).map(access => {
    const result = snapshot.results.find(item => item.accessId === access.id)!;
    return [access.specifier, access.form, result.outcome, result.decisions.map(decision => [decision.status, decision.reason])];
  });
}
/** The boundary findings of `importer`, as `[line, message]`. */
function findings(report: AnalysisReport, importer: string): [number, string][] {
  return report.diagnostics.filter(item => item.code === 'project-boundary-import' && item.location?.file === importer)
    .map(item => [item.location!.line, item.message]);
}
const tree = (specifier: string, file: string, kind: 'owned-unwired' | 'owned-nested-project' | 'external', directory: string): string =>
  `'${specifier}' resolves to ${file} in the declared ${kind} tree ${directory}; an import into a declared tree must use package resolution`;
const denied = (specifier: string, form: string): unknown[] => [specifier, form, 'denied', []];

describe('PB1-14: non-package imports into declared trees are definite boundary findings', () => {
  it('denies every form into the root\'s own owned-unwired tree, before symbol selection and the same-owner exemption', async () => {
    const report = await topologyReport();
    const specifier = '../fixture-project/src/thing.js';
    expect(decided(report, 'src/forms.ts')).toEqual([
      denied(specifier, 'import'), denied(specifier, 'import-type'), denied(specifier, 'inline-type-import'),
      denied(specifier, 'side-effect-import'), denied(specifier, 'empty-import'), denied(specifier, 'namespace-import'),
      denied(specifier, 'dynamic-import'), denied(specifier, 'import-type-query'),
    ]);
    // One located finding per occurrence: at the selected name, or at the statement for a symbol-free load.
    const message = tree(specifier, 'fixture-project/src/thing.ts', 'owned-nested-project', 'fixture-project');
    expect(findings(report, 'src/forms.ts')).toEqual([1, 2, 3, 4, 5, 9, 7, 8].sort((a, b) => a - b).map(line => [line, message]));
    // No symbol decision is fabricated and no excluded export is interpreted; no limit stands in for the finding.
    const accesses = report.snapshot!.accesses.filter(access => access.importer.file === 'src/forms.ts');
    for (const access of accesses) {
      expect(access.target).toEqual({ kind: 'nested-tree', file: 'fixture-project/src/thing.ts',
        exclusion: { kind: 'owned-nested-project', directory: 'fixture-project', owner: 'app' } });
      expect([access.form, access.coverageIds, access.selections.every(selection => selection.original === null)]).toEqual([access.form, [], true]);
    }
    const first = report.diagnostics.find(item => item.code === 'project-boundary-import' && item.location?.file === 'src/forms.ts')!;
    expect(first).toMatchObject({ category: 'import', original: null, related: [],
      importer: { owner: 'app', kind: 'ordinary', root: 'src', profile: ['dispatch'] } });
    expect(report.snapshot!.results.find(result => result.accessId === first.accessId)!.diagnostics).toEqual([first.id]);
  }, 120_000);

  it('denies relative, alias, exact bare alias and linked routes into either tree, beside allowed application and package routes', async () => {
    const report = await topologyReport();
    expect(decided(report, 'src/routes.ts')).toEqual([
      denied('@tree/thing.js', 'import'),
      denied('sample-alias', 'import'),
      denied('../links/external/lib.js', 'import'),
      denied('../external-project/lib.js', 'import'),
      ['sample', 'import', 'external', []],
      ['@a/api.js', 'import', 'checked', [['allowed', 'exposed']]],
    ]);
    expect(findings(report, 'src/routes.ts')).toEqual([
      [1, tree('@tree/thing.js', 'fixture-project/src/thing.ts', 'owned-nested-project', 'fixture-project')],
      [2, tree('sample-alias', 'subs/a/fixtures/sample/index.d.ts', 'owned-nested-project', 'subs/a/fixtures/sample')],
      // The link is classified at its physical target.
      [3, tree('../links/external/lib.js', 'external-project/lib.ts', 'external', 'external-project')],
      [4, tree('../external-project/lib.js', 'external-project/lib.ts', 'external', 'external-project')],
    ]);
  }, 120_000);

  it('denies named, type, star, namespace and empty re-exports into either tree', async () => {
    const report = await topologyReport();
    expect(decided(report, 'src/forward.ts')).toEqual([
      denied('../fixture-project/src/thing.js', 'named-export'),
      denied('../fixture-project/src/thing.js', 'type-export'),
      denied('../external-project/lib.js', 'star-export'),
      denied('../fixture-project/src/thing.js', 'namespace-export'),
      denied('../fixture-project/src/thing.js', 'empty-export'),
      ['sample', 'named-export', 'external', []],
    ]);
    expect(findings(report, 'src/forward.ts').map(([line]) => line)).toEqual([1, 2, 3, 4, 5]);
    // The forwarding file describes no original from either tree: its exports are incomplete, never missing.
    const forward = report.snapshot!.catalog!.files.find(file => file.file === 'src/forward.ts')!;
    expect([forward.state, forward.exports.filter(entry => entry.original !== null)]).toEqual(['incomplete', []]);
    expect(report.coverage.filter(note => note.location.file === 'src/forward.ts').map(note => [note.code, note.location.line]))
      .toEqual([['unresolved-original', 1], ['unresolved-original', 2], ['incomplete-exports', 3], ['unresolved-original', 4], ['unresolved-original', 6]]);
  }, 120_000);

  it('denies a child\'s own tree from its ordinary and testing source, and the tree from root auxiliary source', async () => {
    const report = await topologyReport();
    const sample = '../fixtures/sample/index.js';
    expect(decided(report, 'subs/a/src/own.ts')).toEqual([denied(sample, 'import')]);
    expect(decided(report, 'subs/a/src/tests/tree.test.ts')).toEqual([denied('../../fixtures/sample/index.js', 'import')]);
    expect(findings(report, 'subs/a/src/own.ts')).toEqual([[1, tree(sample, 'subs/a/fixtures/sample/index.d.ts', 'owned-nested-project', 'subs/a/fixtures/sample')]]);
    expect(report.diagnostics.filter(item => item.code === 'project-boundary-import' && item.location?.file === 'subs/a/src/tests/tree.test.ts')
      .map(item => item.importer)).toEqual([{ owner: 'app/a', kind: 'tests', root: 'subs/a/src/tests', profile: ['testing'] }]);
    expect(decided(report, 'scripts/check.ts')[2]).toEqual(denied('../fixture-project/src/thing.js', 'import'));
  }, 120_000);

  it('fails the check with every boundary finding counted as a denial and an error, and the analysis complete', async () => {
    const report = await topologyReport();
    expect(report.outcome).toEqual({ execution: 'completed', check: 'failed', coverage: 'partial' });
    // Boundary: forms 8, routes 4, forward 5, own 1, tree.test 1, check 1. Symbol: hidden, and two testing origins.
    expect(report.diagnostics.filter(item => item.code === 'project-boundary-import')).toHaveLength(20);
    expect(report.diagnostics.map(item => item.code).filter(code => code !== 'project-boundary-import').sort())
      .toEqual(['not-visible', 'testing-origin', 'testing-origin']);
    expect(report.summary).toMatchObject({ complete: true, accesses: 32, allowed: 7, denied: 23, errors: 23, external: 2, warnings: 0 });
    expect(report.snapshot!.results.filter(result => result.outcome === 'denied')).toHaveLength(20);
    expect(report.stages.every(stage => stage.status === 'completed')).toBe(true);
    // The ignored trees' contents are never inventoried, catalogued or interpreted.
    const inTree = (file: string): boolean => ['fixture-project/', 'external-project/', 'subs/a/fixtures/', 'links/', 'node_modules/'].some(prefix => file.startsWith(prefix));
    expect([report.snapshot!.inventory.files.filter(file => inTree(file.path)), report.snapshot!.catalog!.files.filter(file => inTree(file.file)),
      report.snapshot!.accesses.filter(access => inTree(access.importer.file))]).toEqual([[], [], []]);
  }, 120_000);
});

describe('PB1-15: installed linked package provenance', () => {
  it('keeps the package import external at its ignored real target while a bare alias to the same file is denied', async () => {
    const report = await topologyReport();
    const accesses = report.snapshot!.accesses.filter(access => access.importer.file === 'src/routes.ts');
    const packaged = accesses.find(access => access.specifier === 'sample')!;
    expect(packaged.target).toEqual({ kind: 'external', resolution: 'package', name: 'sample', resolvedFile: 'subs/a/fixtures/sample/index.d.ts' });
    expect(packaged.coverageIds).toEqual([]);
    expect(report.diagnostics.filter(item => item.accessId === packaged.id)).toEqual([]);
    const aliased = accesses.find(access => access.specifier === 'sample-alias')!;
    expect(aliased.target).toMatchObject({ kind: 'nested-tree', file: 'subs/a/fixtures/sample/index.d.ts' });
    expect(report.diagnostics.filter(item => item.accessId === aliased.id).map(item => item.code)).toEqual(['project-boundary-import']);
  }, 120_000);
});

describe('PB1-12: auxiliary importer profile', () => {
  it('decides auxiliary importers by their owner\'s ordinary profile, whatever their file name', async () => {
    const report = await topologyReport();
    expect(decided(report, 'scripts/check.ts')).toEqual([
      ['../subs/a/src/api.js', 'import', 'checked', [['allowed', 'exposed']]],
      ['../tools/tmp/helper.js', 'import', 'checked', [['allowed', 'same-owner']]],
      denied('../fixture-project/src/thing.js', 'import'),
      ['../subs/b/src/hidden.js', 'import', 'checked', [['denied', 'not-visible']]],
    ]);
    expect(decided(report, 'subs/a/scripts/report.ts')).toEqual([
      ['../src/api.js', 'import', 'checked', [['allowed', 'same-owner']]],
      ['../src/internal.js', 'import', 'checked', [['allowed', 'same-owner']]],
      ['../src/tests/api.test.js', 'import', 'checked', [['denied', 'testing-origin']]],
    ]);
    expect(decided(report, 'subs/a/scripts/report.test.ts')).toEqual([['../src/tests/api.test.js', 'import', 'checked', [['denied', 'testing-origin']]]]);
    // Positive controls beneath src/.
    expect(decided(report, 'src/main.ts')).toEqual([['../subs/a/src/api.js', 'import', 'checked', [['allowed', 'exposed']]]]);
    expect(decided(report, 'subs/b/src/consumer.ts')).toEqual([['../../a/src/api.js', 'import', 'checked', [['allowed', 'exposed']]]]);
    const importers = new Map(report.snapshot!.accesses.map(access => [access.importer.file, access.importer]));
    expect(importers.get('scripts/check.ts')).toEqual({ file: 'scripts/check.ts', auxiliary: true,
      area: { owner: 'app', kind: 'ordinary', root: 'src', profile: ['dispatch'] } });
    expect(importers.get('subs/a/scripts/report.test.ts')).toEqual({ file: 'subs/a/scripts/report.test.ts', auxiliary: true,
      area: { owner: 'app/a', kind: 'ordinary', root: 'subs/a/src', profile: [] } });
  }, 120_000);
});

describe('PB1-16: outside, always-excluded and unresolved targets stay distinct nonblocking limits', () => {
  it('passes the check with partial coverage and a distinct limit for each target, none allowed or external', async () => {
    const report = await analyze(limitsProject, {}, { 'outside.ts': 'export const outside = 3;\n' });
    expect(report.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'partial' });
    expect([report.diagnostics, report.summary.allowed, report.summary.denied, report.summary.external]).toEqual([[], 0, 0, 1]);
    const snapshot = report.snapshot!;
    const notes = new Map(report.coverage.map(note => [note.id, note]));
    const rows = snapshot.accesses.map(access => [access.specifier, access.target.kind, snapshot.results.find(result => result.accessId === access.id)!.outcome,
      access.coverageIds.map(id => `${notes.get(id)!.code}: ${notes.get(id)!.message}`)]);
    expect(rows).toEqual([
      ['../../outside.js', 'outside-project', 'outside-scope', ['outside-module-target: Accessed file ../outside.ts is outside the project root without package resolution']],
      ['../dist/out.js', 'excluded', 'unverifiable', ['excluded-target: Accessed file dist/out.d.ts lies in the always-excluded output directory dist without package resolution']],
      ['./tmp/scratch.js', 'excluded', 'unverifiable', ['excluded-target: Accessed file src/tmp/scratch.ts lies in the always-excluded scratch directory src/tmp without package resolution']],
      ['../node_modules/realpkg/index.js', 'excluded', 'unverifiable',
        ['excluded-target: Accessed file node_modules/realpkg/index.d.ts lies in the always-excluded packages directory node_modules without package resolution']],
      ['realpkg', 'external', 'external', []],
      ['./missing.js', 'unresolved', 'unverifiable', ['unresolved-target: Cannot establish the accessed source or resource target']],
      ['realpkg/hidden', 'unresolved', 'unverifiable', ['unresolved-target: Cannot establish the accessed source or resource target']],
    ]);
    // No decision is fabricated for any of them, and excluded files are never interpreted.
    expect(snapshot.results.flatMap(result => result.decisions)).toEqual([]);
    expect(snapshot.catalog!.files.map(file => file.file)).toEqual(['src/limits.ts']);
  }, 120_000);
});


describe('NT-03: both owned kinds enforce the source boundary', () => {
  it.each(['owned-unwired', 'owned-nested-project'] as const)('denies same-owner imports into %s while allowing ordinary owned source', async kind => {
    const report = await analyze({
      'package.json': '{"type":"module"}',
      'module.ramify': `ramify 1\nroot module app\n${kind} "data"\n`,
      'tsconfig.json': '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","types":[]},"include":["src"]}',
      'data/hidden.ts': 'export const hidden = 1;',
      'src/helper.ts': 'export const helper = 1;',
      'src/main.ts': "import { hidden } from '../data/hidden.js';\nimport { helper } from './helper.js';\nexport const value = hidden + helper;",
    });
    expect(report.outcome.check).toBe('failed');
    expect(report.diagnostics.map(item => item.code)).toEqual(['project-boundary-import']);
    expect(report.snapshot!.accesses.map(access => access.target)).toContainEqual({ kind: 'nested-tree', file: 'data/hidden.ts',
      exclusion: { kind, directory: 'data', owner: 'app' } });
    expect(decided(report, 'src/main.ts').map(item => (item as unknown[])[2])).toEqual(['denied', 'checked']);
  });
});
