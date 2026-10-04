import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AffectedPathSeed, AffectedQuery, AffectedSelection, SessionAffectedOutcome } from '../interfaces/affected.js';
import type { RetainedSession, SessionInputs } from '../interfaces/session.js';
import type { ProjectExclusion } from '../../subs/project/src/interfaces/project.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';
import { opened, revised } from './session-test-fixture.js';

/*
 * PB1-08, PB1-17, PB1-18 and PB1-19 over the written provider topology
 * (project-boundary fixtures.md), through a real retained session. Expected
 * answers are written from that topology and the contracts ("Canonical path
 * ownership and inventory"; "Reports, affected queries and freshness"), not
 * from a recorded run:
 *
 * - a path seed resolves by containment under the current declarations,
 *   without an inventory entry or a read, so absent, new and deleted paths and
 *   both sides of a rename resolve;
 * - an owned seed, also in an owned-ignored tree or a scratch directory,
 *   selects its owner and the owner's transitive importers; ancestry selects
 *   nothing; an external or always-excluded seed selects nothing with the
 *   excluded basis; only a seed outside the project widens, by unowned-path;
 * - the answer carries the revision's whole ownership topology.
 *
 * The only import edges are a -> app (scripts/check.ts and src/main.ts) and
 * a -> b (b's consumer), so an `a` seed changes a and affects app and b.
 */

/** Disk reads while `counting`, through every file-system entry point a query could use. */
const seams = vi.hoisted(() => ({ counting: false, reads: [] as string[] }));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const counted = <K extends 'readFile' | 'open' | 'opendir' | 'readdir' | 'lstat' | 'stat' | 'realpath' | 'readlink' | 'access'>(name: K) =>
    ((...args: unknown[]) => { if (seams.counting) seams.reads.push(`${name} ${String(args[0])}`);
      return (actual[name] as (...values: unknown[]) => unknown)(...args); }) as (typeof actual)[K];
  return { ...actual, readFile: counted('readFile'), open: counted('open'), opendir: counted('opendir'), readdir: counted('readdir'),
    lstat: counted('lstat'), stat: counted('stat'), realpath: counted('realpath'), readlink: counted('readlink'), access: counted('access') };
});
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const counted = <K extends 'readFileSync' | 'readSync' | 'statSync' | 'lstatSync' | 'readdirSync' | 'realpathSync' | 'existsSync'>(name: K) =>
    Object.assign((...args: unknown[]) => { if (seams.counting) seams.reads.push(`${name} ${String(args[0])}`);
      return (actual[name] as (...values: unknown[]) => unknown)(...args); }, actual[name]) as (typeof actual)[K];
  return { ...actual, readFileSync: counted('readFileSync'), readSync: counted('readSync'), statSync: counted('statSync'),
    lstatSync: counted('lstatSync'), readdirSync: counted('readdirSync'), realpathSync: counted('realpathSync'),
    existsSync: counted('existsSync') };
});

const timeout = 300_000;
const tsconfig = JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [], strict: true,
  skipLibCheck: true, outDir: 'dist' }, include: ['src', 'scripts', 'tools', 'subs/*/src', 'subs/*/scripts', 'subs/*/subs/*/src'],
exclude: ['src/tmp', 'subs/*/src/tmp', 'subs/*/subs/*/src/tmp'] });
const bDescription = (statements = ''): string => `ramify 1\nmodule b\n${statements}`;

/** The written topology. The two ignored projects hold their own marked roots and source. */
const topology: Readonly<Record<string, string>> = {
  'package.json': '{"name":"app","type":"module"}',
  'tsconfig.json': tsconfig,
  'module.ramify': 'ramify 1\nroot module app tagged [dispatch]\nowned-ignored "fixture-project"\nexternal "external-project"\n'
    + 'expose-sub api from a to descendants\n',
  'README.md': '# App\n\nThe written provider topology.\n',
  'notes/design.md': 'Inert root-owned prose.\n',
  'scripts/check.ts': "import { api } from '../subs/a/src/api.js';\nexport const checked: number = api();\n",
  'src/main.ts': "import { api } from '../subs/a/src/api.js';\nexport const main: number = api();\n",
  'src/tmp/throwaway.test.ts': 'export const scratch = 1;\n',
  'tools/tmp/helper.ts': 'export const helper: number = 7;\n',
  'fixture-project/module.ramify': 'ramify 1\nroot module fixture-project\nexpose-src nothing from "absent.ts" to parent\n',
  'fixture-project/tsconfig.json': '{ "include": ["src"] }',
  'fixture-project/src/thing.ts': "import { missing } from './missing.js';\nexport const thing = missing;\n",
  'external-project/lib.ts': "import { gone } from './gone.js';\nexport const lib = gone;\n",
  'subs/a/module.ramify': 'ramify 1\nmodule a\nowned-ignored "fixtures/sample"\nexpose-src api from "api.ts" to parent\n',
  'subs/a/README.md': '# A\n\nProvides api.\n',
  'subs/a/src/api.ts': 'export function api(): number { return 1; }\n',
  'subs/a/src/tests/api.test.ts': "import { api } from '../api.js';\nexport const tested: number = api();\n",
  'subs/a/src/tests/tmp/real.test.ts': "import { api } from '../../api.js';\nexport const real: number = api();\n",
  'subs/a/src/tmp/throwaway.ts': 'export const throwaway = 1;\n',
  'subs/a/scripts/report.ts': "import { api } from '../src/api.js';\nexport const reported: number = api();\n",
  'subs/a/fixtures/sample/module.ramify': 'ramify 1\nroot module sample\n',
  'subs/a/fixtures/sample/package.json': '{"name":"sample","type":"module"}',
  'subs/a/fixtures/sample/src/index.ts': "import { nowhere } from './nowhere.js';\nexport const sample = nowhere;\n",
  'subs/a/subs/grand/module.ramify': 'ramify 1\nmodule grand\n',
  'subs/a/subs/grand/README.md': '# Grand\n\nNo import edges.\n',
  'subs/a/subs/grand/src/grand.ts': 'export const grand: number = 3;\n',
  'subs/a-extra/module.ramify': 'ramify 1\nmodule a-extra\n',
  'subs/a-extra/README.md': '# A extra\n\nAn independent sibling.\n',
  'subs/a-extra/src/other.test.ts': 'export const other: number = 4;\n',
  'subs/b/module.ramify': bDescription(),
  'subs/b/README.md': '# B\n\nConsumes api.\n',
  'subs/b/src/consumer.ts': "import { api } from '../../a/src/api.js';\nexport const consumed: number = api();\n",
};

interface Project { readonly root: string; readonly inputs: SessionInputs }
async function project(check: (project: Project) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-boundary-affected-')));
  try {
    for (const [path, text] of Object.entries(topology)) await put(root, path, text);
    // The installed link into a's ignored sample.
    await mkdir(join(root, 'node_modules'));
    await symlink('../subs/a/fixtures/sample', join(root, 'node_modules/sample'), 'dir');
    await check({ root, inputs: {
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
    } });
  } finally { await rm(root, { recursive: true, force: true }); }
}
async function put(root: string, path: string, text: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

const query = (handle: RetainedSession, value: Omit<AffectedQuery, 'sequence'>, sequence = handle.current!.sequence):
  Promise<SessionAffectedOutcome> => handle.affected!({ sequence, ...value });
async function answer(handle: RetainedSession, value: Omit<AffectedQuery, 'sequence'>): Promise<AffectedSelection> {
  const outcome = await query(handle, value);
  if (outcome.status !== 'answered') throw new Error(JSON.stringify(outcome));
  expect(outcome.sequence).toBe(handle.current!.sequence);
  return outcome.result;
}
/** Read nothing from the disk while answering. */
async function unread<T>(run: () => Promise<T>): Promise<T> {
  seams.reads.length = 0; seams.counting = true;
  try { return await run(); } finally { seams.counting = false; expect(seams.reads).toEqual([]); }
}
const ids = (list: readonly { readonly id: string }[]): string[] => list.map(module => module.id);

const all = ['app', 'app/a', 'app/a-extra', 'app/a/grand', 'app/b'];
const directories: Readonly<Record<string, string>> = { app: '.', 'app/a': 'subs/a', 'app/a-extra': 'subs/a-extra',
  'app/a/grand': 'subs/a/subs/grand', 'app/b': 'subs/b' };
const scratch = (directory: string, owner: string): ProjectExclusion => ({ kind: 'scratch', directory, owner });
const sample: ProjectExclusion = { kind: 'owned-ignored', directory: 'subs/a/fixtures/sample', owner: 'app/a' };
const external: ProjectExclusion = { kind: 'external', directory: 'external-project', owner: null };
/** The written topology's ownership, byte-ordered by directory; reserved segments are classifier rules, not rows. */
const ownership = {
  modules: [{ id: 'app', parent: null, directory: '.' }, { id: 'app/a', parent: 'app', directory: 'subs/a' },
    { id: 'app/a-extra', parent: 'app', directory: 'subs/a-extra' }, { id: 'app/a/grand', parent: 'app/a', directory: 'subs/a/subs/grand' },
    { id: 'app/b', parent: 'app', directory: 'subs/b' }],
  exclusions: [{ kind: 'output', directory: 'dist', owner: null }, external,
    { kind: 'owned-ignored', directory: 'fixture-project', owner: 'app' }, scratch('src/tmp', 'app'),
    scratch('subs/a-extra/src/tmp', 'app/a-extra'), sample, scratch('subs/a/src/tmp', 'app/a'),
    scratch('subs/a/subs/grand/src/tmp', 'app/a/grand'), scratch('subs/b/src/tmp', 'app/b')],
};

const owned = (path: string, module: string, basis: 'inventory' | 'declaration' | 'area' | 'containment',
  exclusion: ProjectExclusion | null = null): AffectedPathSeed => ({ path, status: 'owned', module, basis, exclusion });
const excluded = (path: string, exclusion: ProjectExclusion): AffectedPathSeed =>
  ({ path, status: 'excluded', module: null, basis: 'excluded', exclusion });
const outside = (path: string): AffectedPathSeed => ({ path, status: 'outside-project', module: null, basis: 'none', exclusion: null });

/** One written row: a path seed, its resolution, and its changed and test modules with complete coverage. */
interface Row { readonly seed: AffectedPathSeed; readonly changed: readonly string[]; readonly tests: readonly string[] }
const ofA = { changed: ['app/a'], tests: ['app', 'app/a', 'app/b'] };
const nothing = { changed: [], tests: [] };
const rows: readonly Row[] = [
  // Root-owned inert prose, existing, new and deleted: app alone, by containment.
  { seed: owned('notes/design.md', 'app', 'containment'), changed: ['app'], tests: ['app'] },
  { seed: owned('notes/new.md', 'app', 'containment'), changed: ['app'], tests: ['app'] },
  { seed: owned('notes/old.md', 'app', 'containment'), changed: ['app'], tests: ['app'] },
  { seed: owned('scripts/check.ts', 'app', 'inventory'), changed: ['app'], tests: ['app'] },
  { seed: owned('subs/a/scripts/report.ts', 'app/a', 'inventory'), ...ofA },
  { seed: owned('subs/a/fixtures/sample/src/world.ts', 'app/a', 'containment', sample), ...ofA },
  { seed: owned('subs/a/src/tmp/new.ts', 'app/a', 'containment', scratch('subs/a/src/tmp', 'app/a')), ...ofA },
  { seed: owned('subs/a/src/tests/tmp/real.test.ts', 'app/a', 'inventory'), ...ofA },
  { seed: owned('subs/a/subs/grand/new.txt', 'app/a/grand', 'containment'), changed: ['app/a/grand'], tests: ['app/a/grand'] },
  { seed: excluded('external-project/file.ts', external), ...nothing },
  { seed: excluded('external-project/lib.ts', external), ...nothing },
  { seed: excluded('node_modules/sample/index.ts', { kind: 'packages', directory: 'node_modules', owner: null }), ...nothing },
  { seed: excluded('dist/output.ts', { kind: 'output', directory: 'dist', owner: null }), ...nothing },
  { seed: excluded('subs/b/src/.ramify/index.json', { kind: 'generated', directory: 'subs/b/src/.ramify', owner: null }), ...nothing },
  { seed: excluded('.ramify-architect/README.md', { kind: 'generated', directory: '.ramify-architect', owner: null }), ...nothing },
];
const listed = (modules: readonly string[]) => modules.map(id => ({ id, directory: directories[id]! }));

describe('affected selection over project ownership (PB1-08, PB1-17, PB1-18, PB1-19)', () => {
  it('PB1-17/PB1-18: every written path seed resolves and selects as the topology states, without a read, hot and warm', () => project(async ({ inputs }) => {
    const { handle, revision } = await opened(inputs);
    try {
      // Precondition: the written topology is a passing project with complete coverage.
      expect(revision.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' });
      expect([revision.diagnostics, revision.coverage]).toEqual([[], []]);
      const answers: AffectedSelection[] = [];
      for (const row of rows) {
        const result = await unread(() => answer(handle, { paths: [row.seed.path] }));
        answers.push(result);
        expect(result.paths, row.seed.path).toEqual([row.seed]);
        expect(result, row.seed.path).toMatchObject({ schemaVersion: 'ramify.affected/2', inputId: revision.inputId,
          changedModules: listed(row.changed), testModules: listed(row.tests), selection: 'dependency-closure', widening: [],
          coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed' });
        expect(ids(result.affectedModules), row.seed.path).toEqual(row.tests.filter(id => !row.changed.includes(id)));
        // The whole ownership topology is carried with every answer.
        expect(result.scope.ownership, row.seed.path).toEqual(ownership);
      }
      // Outside the project: no module, the none basis, and the only unowned-path widening.
      const far = await unread(() => answer(handle, { paths: ['../outside.ts'] }));
      expect(far).toMatchObject({ paths: [outside('../outside.ts')], changedModules: [], affectedModules: [], testModules: listed(all),
        selection: 'all-modules', widening: ['unowned-path'], coverage: { status: 'complete', notes: [] } });
      // Every row at once answers the union, and the outside seed widens it without hiding the known closure.
      const union = await unread(() => answer(handle, { paths: [...rows.map(row => row.seed.path), '../outside.ts'] }));
      expect(union.paths).toEqual([outside('../outside.ts'), ...rows.map(row => row.seed)]
        .sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))));
      expect(union).toMatchObject({ changedModules: listed(['app', 'app/a', 'app/a/grand']), affectedModules: listed(['app/b']),
        testModules: listed(all), selection: 'all-modules', widening: ['unowned-path'] });

      // A warm session answers the same from its retained facts.
      await handle.releaseCompiler();
      expect(handle.status().level).toBe('warm');
      for (const [index, row] of rows.entries()) {
        expect(await unread(() => answer(handle, { paths: [row.seed.path] })), row.seed.path).toEqual(answers[index]);
      }
    } finally { await handle.dispose(); }
  }), timeout);

  it('PB1-17: module and description seeds select by reverse imports; ancestry selects nothing', () => project(async ({ inputs }) => {
    const { handle } = await opened(inputs);
    try {
      const select = async (value: Omit<AffectedQuery, 'sequence'>) => {
        const result = await unread(() => answer(handle, value));
        return [ids(result.changedModules), ids(result.affectedModules), ids(result.testModules), result.selection];
      };
      // The root imports a; it is no provider of its descendants, so a root seed selects the root alone.
      expect(await select({ modules: ['app'] })).toEqual([['app'], [], ['app'], 'dependency-closure']);
      expect(await select({ paths: ['.', 'package.json', 'tsconfig.json'] })).toEqual([['app'], [], ['app'], 'dependency-closure']);
      // a is imported by app and b; its own child grand is not selected.
      expect(await select({ modules: ['app/a'] })).toEqual([['app/a'], ['app', 'app/b'], ['app', 'app/a', 'app/b'], 'dependency-closure']);
      expect(await select({ modules: ['app/a-extra'] })).toEqual([['app/a-extra'], [], ['app/a-extra'], 'dependency-closure']);
      expect(await select({ modules: ['app/a/grand'] })).toEqual([['app/a/grand'], [], ['app/a/grand'], 'dependency-closure']);
      expect((await unread(() => answer(handle, { paths: ['subs/a/module.ramify', 'subs/a/README.md', 'README.md', 'subs/a/src/api.ts',
        'subs/a/src/new.ts'] }))).paths).toEqual([owned('README.md', 'app', 'declaration'), owned('subs/a/README.md', 'app/a', 'declaration'),
        owned('subs/a/module.ramify', 'app/a', 'declaration'), owned('subs/a/src/api.ts', 'app/a', 'inventory'),
        owned('subs/a/src/new.ts', 'app/a', 'area')]);
      // A sibling whose name extends a's selects neither a nor its closure.
      expect((await answer(handle, { paths: ['subs/a-extra/src/other.test.ts'] })).paths)
        .toEqual([owned('subs/a-extra/src/other.test.ts', 'app/a-extra', 'inventory')]);
      // Malformed seeds other than the outside form are invalid queries.
      for (const path of ['subs/a/../b/src/consumer.ts', '/etc/passwd', './notes/design.md', 'notes/', 'notes\\design.md', '../x/../y']) {
        expect(await query(handle, { paths: [path] }), path).toMatchObject({ status: 'unavailable', reason: 'invalid-query' });
      }
    } finally { await handle.dispose(); }
  }), timeout);

  it('PB1-08: inert and unanalyzed paths have owners without inventory entries or captured content', () => project(async ({ root, inputs }) => {
    const { handle, revision, state } = await opened(inputs);
    try {
      const inventoried = new Set(state.facts!.inventory!.files.map(file => file.path));
      /** Captured inputs that hold read bytes; existence probes and listings hold none. */
      const content = (path: string) => revision.inputs.filter(input => input.path === path && input.bytes > 0);
      // Positive controls: auxiliary and testing source are inventoried and captured with their bytes.
      for (const path of ['scripts/check.ts', 'subs/a/scripts/report.ts', 'subs/a/src/tests/tmp/real.test.ts', 'tools/tmp/helper.ts']) {
        expect(inventoried.has(path), path).toBe(true);
        expect(content(path).map(input => input.role), path).toEqual(['source']);
      }
      // Inert owned prose, scratch and ignored contents: an owner, but no inventory entry and no captured content.
      const unanalyzed = ['notes/design.md', 'src/tmp/throwaway.test.ts', 'subs/a/src/tmp/throwaway.ts', 'subs/a/fixtures/sample/src/index.ts',
        'fixture-project/src/thing.ts', 'external-project/lib.ts'];
      for (const path of unanalyzed) {
        expect(inventoried.has(path), path).toBe(false);
        expect(content(path), path).toEqual([]);
      }
      // Nothing beneath a declared tree or an installed-package directory is an input at all.
      for (const tree of ['fixture-project/', 'external-project/', 'subs/a/fixtures/sample/', 'node_modules/']) {
        expect(revision.inputs.filter(input => input.path.startsWith(tree)), tree).toEqual([]);
        expect([...inventoried].filter(path => path.startsWith(tree)), tree).toEqual([]);
      }
      const result = await unread(() => answer(handle, { paths: ['notes/design.md', 'notes/new.md', 'notes/old.md',
        'subs/a/fixtures/sample/src/index.ts', 'src/tmp/throwaway.test.ts'] }));
      expect(result.paths).toEqual([owned('notes/design.md', 'app', 'containment'), owned('notes/new.md', 'app', 'containment'),
        owned('notes/old.md', 'app', 'containment'), owned('src/tmp/throwaway.test.ts', 'app', 'containment', scratch('src/tmp', 'app')),
        owned('subs/a/fixtures/sample/src/index.ts', 'app/a', 'containment', sample)]);
      expect(ids(result.testModules)).toEqual(['app', 'app/a', 'app/b']);
      // Their bytes are no input: editing every one leaves the revision's inputs unchanged.
      for (const path of unanalyzed) await put(root, path, `// edited ${path}\n`);
      expect(await handle.sweep()).toMatchObject({ status: 'unchanged' });
      expect(handle.current!.inputId).toBe(revision.inputId);
    } finally { await handle.dispose(); }
  }), timeout);

  it('PB1-19: both sides of a rename resolve without reads, and declarations change containment at the new revision', () =>
    project(async ({ root, inputs }) => {
      const { handle } = await opened(inputs);
      try {
        // A source file moved from a to b, and prose moved from the root into a sibling: each side resolves, present or not.
        const moved = await unread(() => answer(handle, { paths: ['subs/a/src/api.ts', 'subs/b/src/moved.ts'] }));
        expect(moved.paths).toEqual([owned('subs/a/src/api.ts', 'app/a', 'inventory'), owned('subs/b/src/moved.ts', 'app/b', 'area')]);
        expect([ids(moved.changedModules), ids(moved.affectedModules), ids(moved.testModules)])
          .toEqual([['app/a', 'app/b'], ['app'], ['app', 'app/a', 'app/b']]);
        const prose = await unread(() => answer(handle, { paths: ['notes/design.md', 'subs/a-extra/notes/design.md'] }));
        expect(prose.paths).toEqual([owned('notes/design.md', 'app', 'containment'), owned('subs/a-extra/notes/design.md', 'app/a-extra', 'containment')]);
        expect([ids(prose.changedModules), ids(prose.affectedModules), ids(prose.testModules), prose.widening])
          .toEqual([['app', 'app/a-extra'], [], ['app', 'app/a-extra'], []]);

        const seeds = ['subs/b/data/x.json', 'subs/b/subs/c/notes.txt', 'subs/b/vendor/lib.ts'];
        const before = await answer(handle, { paths: seeds });
        expect(before.paths).toEqual([owned('subs/b/data/x.json', 'app/b', 'containment'), owned('subs/b/subs/c/notes.txt', 'app/b', 'containment'),
          owned('subs/b/vendor/lib.ts', 'app/b', 'containment')]);
        const stale = handle.current!.sequence;

        // b declares an owned-ignored tree (which must exist) and an absent external one.
        await put(root, 'subs/b/data/x.json', '{}\n');
        await put(root, 'subs/b/module.ramify', bDescription('owned-ignored "data"\nexternal "vendor"\n'));
        await revised(handle, ['subs/b/module.ramify']);
        const data: ProjectExclusion = { kind: 'owned-ignored', directory: 'subs/b/data', owner: 'app/b' };
        const vendor: ProjectExclusion = { kind: 'external', directory: 'subs/b/vendor', owner: null };
        const declared = await unread(() => answer(handle, { paths: seeds }));
        expect(declared.paths).toEqual([owned('subs/b/data/x.json', 'app/b', 'containment', data),
          owned('subs/b/subs/c/notes.txt', 'app/b', 'containment'), excluded('subs/b/vendor/lib.ts', vendor)]);
        expect(declared.scope.ownership.exclusions).toEqual(expect.arrayContaining([data, vendor]));
        expect([ids(declared.changedModules), declared.widening]).toEqual([['app/b'], []]);
        // The previous revision no longer answers.
        expect(await query(handle, { paths: seeds }, stale)).toMatchObject({ status: 'unavailable', reason: 'invalid-revision' });

        // A new child module takes over its directory.
        await put(root, 'subs/b/subs/c/module.ramify', 'ramify 1\nmodule c\n');
        await revised(handle, ['subs/b/subs/c/module.ramify'], 'created');
        const child = await unread(() => answer(handle, { paths: seeds }));
        expect(child.paths).toEqual([owned('subs/b/data/x.json', 'app/b', 'containment', data),
          owned('subs/b/subs/c/notes.txt', 'app/b/c', 'containment'), excluded('subs/b/vendor/lib.ts', vendor)]);
        expect([ids(child.changedModules), ids(child.testModules)]).toEqual([['app/b', 'app/b/c'], ['app/b', 'app/b/c']]);

        // Removing the declarations restores plain containment, and a fresh session answers exactly as the retained one.
        await put(root, 'subs/b/module.ramify', bDescription());
        await revised(handle, ['subs/b/module.ramify']);
        const removed = await unread(() => answer(handle, { paths: seeds }));
        expect(removed.paths).toEqual([owned('subs/b/data/x.json', 'app/b', 'containment'), owned('subs/b/subs/c/notes.txt', 'app/b/c', 'containment'),
          owned('subs/b/vendor/lib.ts', 'app/b', 'containment')]);
        const fresh = await opened(inputs);
        try {
          expect(fresh.revision.inputId).toBe(handle.current!.inputId);
          expect(await answer(fresh.handle, { paths: seeds })).toEqual(removed);
        } finally { await fresh.handle.dispose(); }
      } finally { await handle.dispose(); }
    }), timeout);
});
