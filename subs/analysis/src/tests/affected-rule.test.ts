import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AffectedPathSeed, AffectedQuery, AffectedSelection } from '../interfaces/affected.js';
import type { RetainedSession, SessionInputs, SessionRevision } from '../interfaces/session.js';
import type { SessionState } from '../session-revision.js';
import type { CapturedInput, ProjectExclusion } from '../../subs/project/src/interfaces/project.js';
import { classifyProjectPath } from '../../subs/project/src/ownership.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';
import { opened } from './session-test-fixture.js';

/*
 * AR-00 (affected-rule selection, iteration 0): the affected answers of the
 * 0.2.0 rule on the extended topology, fixed as the baseline that iteration 1
 * changes in place. The topology is the Phase 1 written topology plus a base
 * configuration that `tsconfig.json` extends, `subs/b/src/prompt.md` (named at
 * run time, never imported), `.devcontainer/devcontainer.json` and
 * `scripts/run.sh`. The data variant is a second revision in which b's consumer
 * imports `data/limits.json` under `resolveJsonModule`.
 *
 * Expected answers are written from the 0.2.0 rule in cli-invocation.spec.md,
 * not from a recorded run: every owned path seed, including one in an
 * owned-ignored tree or a scratch directory, selects its owner and the owner's
 * transitive importers; an excluded seed selects nothing; only a seed outside
 * the project widens, by unowned-path. The only reverse edges are a -> app and
 * a -> b, so an `a` seed changes a and affects app and b.
 *
 * The recorded-facts blocks fix the captured inputs and contributors the
 * 0.3.0 rule's expectations are reasoned from (iteration 0, step 3).
 */

const timeout = 300_000;
const baseConfiguration = JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [],
  strict: true, skipLibCheck: true, resolveJsonModule: true, outDir: 'dist' } });
const configuration = JSON.stringify({ extends: './tsconfig.base.json',
  include: ['src', 'scripts', 'tools', 'subs/*/src', 'subs/*/scripts', 'subs/*/subs/*/src'],
  exclude: ['src/tmp', 'subs/*/src/tmp', 'subs/*/subs/*/src/tmp'] });
const consumer = "import { api } from '../../a/src/api.js';\nexport const consumed: number = api();\n"
  + "/** The prompt is read at run time from this URL; it is never imported. */\n"
  + "export const prompt: URL = new URL('./prompt.md', import.meta.url);\n";
const dataConsumer = `import limits from '../../../data/limits.json';\n${consumer}export const limit: number = limits.max;\n`;

/** The extended topology. The two ignored projects hold their own marked roots and source. */
const topology: Readonly<Record<string, string>> = {
  'package.json': '{"name":"app","type":"module"}',
  'tsconfig.json': configuration,
  'tsconfig.base.json': baseConfiguration,
  'module.ramify': 'ramify 1\nroot module app tagged [dispatch]\nowned-ignored "fixture-project"\nexternal "external-project"\n'
    + 'expose-sub api from a to descendants\n',
  'README.md': '# App\n\nThe extended provider topology.\n',
  'notes/design.md': 'Inert root-owned prose.\n',
  '.devcontainer/devcontainer.json': '{ "name": "app" }\n',
  'scripts/run.sh': '#!/bin/sh\nexec node dist/src/main.js\n',
  'scripts/check.ts': "import { api } from '../subs/a/src/api.js';\nexport const checked: number = api();\n",
  'src/main.ts': "import { api } from '../subs/a/src/api.js';\nexport const main: number = api();\n",
  'src/tmp/throwaway.test.ts': 'export const scratch = 1;\n',
  'tools/tmp/helper.ts': 'export const helper: number = 7;\n',
  'data/limits.json': '{ "max": 3 }\n',
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
  'subs/b/module.ramify': 'ramify 1\nmodule b\n',
  'subs/b/README.md': '# B\n\nConsumes api.\n',
  'subs/b/src/consumer.ts': consumer,
  'subs/b/src/prompt.md': 'You are a careful consumer of api.\n',
};
const dataVariant: Readonly<Record<string, string>> = { ...topology, 'subs/b/src/consumer.ts': dataConsumer };

interface Opened { readonly root: string; readonly handle: RetainedSession; readonly revision: SessionRevision; readonly state: SessionState }
async function session(files: Readonly<Record<string, string>>, check: (opened: Opened) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-affected-rule-')));
  try {
    for (const [path, text] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
    // The installed link into a's ignored sample.
    await mkdir(join(root, 'node_modules'));
    await symlink('../subs/a/fixtures/sample', join(root, 'node_modules/sample'), 'dir');
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
    const value = await opened(inputs);
    try { await check({ root, ...value }); } finally { await value.handle.dispose(); }
  } finally { await rm(root, { recursive: true, force: true }); }
}

/** One query through the session's affected operation, with the production limits. */
async function answer(handle: RetainedSession, value: Omit<AffectedQuery, 'sequence'>): Promise<AffectedSelection> {
  const outcome = await handle.affected!({ sequence: handle.current!.sequence, ...value });
  if (outcome.status !== 'answered') throw new Error(JSON.stringify(outcome));
  return outcome.result;
}
const ids = (list: readonly { readonly id: string }[]): string[] => list.map(module => module.id);
const byteOrder = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
const union = (...lists: readonly (readonly string[])[]): string[] => [...new Set(lists.flat())].sort(byteOrder);

const all = ['app', 'app/a', 'app/a-extra', 'app/a/grand', 'app/b'];
const scratch = (directory: string, owner: string): ProjectExclusion => ({ kind: 'scratch', directory, owner });
const ignored = (directory: string, owner: string): ProjectExclusion => ({ kind: 'owned-ignored', directory, owner });
const owned = (path: string, module: string, basis: 'inventory' | 'declaration' | 'area' | 'containment',
  exclusion: ProjectExclusion | null = null): AffectedPathSeed => ({ path, status: 'owned', module, basis, exclusion });
const excluded = (path: string, exclusion: ProjectExclusion): AffectedPathSeed =>
  ({ path, status: 'excluded', module: null, basis: 'excluded', exclusion });
const outside = (path: string): AffectedPathSeed => ({ path, status: 'outside-project', module: null, basis: 'none', exclusion: null });

/** One row of the contracts' examples table: the seed, and its changed and affected modules under the 0.2.0 rule. */
interface Row { readonly seed: AffectedPathSeed; readonly changed: readonly string[]; readonly affected: readonly string[] }
/** 0.2.0: an owned seed changes its owner and affects the owner's transitive importers. */
const ofApp = { changed: ['app'], affected: [] };
const ofA = { changed: ['app/a'], affected: ['app', 'app/b'] };
const nothing = { changed: [], affected: [] };
const rows: readonly Row[] = [
  { seed: owned('subs/a/src/api.ts', 'app/a', 'inventory'), ...ofA },
  { seed: owned('subs/a/src/new.ts', 'app/a', 'area'), ...ofA },
  { seed: owned('subs/a/src/tests/tmp/real.test.ts', 'app/a', 'inventory'), ...ofA },
  { seed: owned('scripts/check.ts', 'app', 'inventory'), ...ofApp },
  { seed: owned('tools/tmp/helper.ts', 'app', 'inventory'), ...ofApp },
  { seed: owned('subs/a/scripts/report.ts', 'app/a', 'inventory'), ...ofA },
  { seed: owned('subs/a/scripts/removed.ts', 'app/a', 'containment'), ...ofA },
  { seed: owned('subs/old/src/gone.ts', 'app', 'containment'), ...ofApp },
  { seed: owned('module.ramify', 'app', 'declaration'), ...ofApp },
  { seed: owned('subs/a/module.ramify', 'app/a', 'declaration'), ...ofA },
  { seed: owned('subs/c/module.ramify', 'app', 'containment'), ...ofApp },
  { seed: owned('README.md', 'app', 'declaration'), ...ofApp },
  { seed: owned('subs/a/README.md', 'app/a', 'declaration'), ...ofA },
  { seed: owned('subs/b/src/prompt.md', 'app/b', 'inventory'), changed: ['app/b'], affected: [] },
  { seed: owned('subs/a/src/notes.md', 'app/a', 'area'), ...ofA },
  { seed: owned('notes/design.md', 'app', 'containment'), ...ofApp },
  { seed: owned('notes/new.md', 'app', 'containment'), ...ofApp },
  { seed: owned('tsconfig.json', 'app', 'containment'), ...ofApp },
  { seed: owned('tsconfig.base.json', 'app', 'containment'), ...ofApp },
  { seed: owned('package.json', 'app', 'containment'), ...ofApp },
  { seed: owned('subs/a/subs/grand/new.txt', 'app/a/grand', 'containment'), changed: ['app/a/grand'], affected: [] },
  { seed: owned('scripts/run.sh', 'app', 'containment'), ...ofApp },
  { seed: owned('.devcontainer/devcontainer.json', 'app', 'containment'), ...ofApp },
  { seed: owned('.', 'app', 'containment'), ...ofApp },
  { seed: owned('subs/a/fixtures/sample/src/world.ts', 'app/a', 'containment', ignored('subs/a/fixtures/sample', 'app/a')), ...ofA },
  { seed: owned('fixture-project/src/index.ts', 'app', 'containment', ignored('fixture-project', 'app')), ...ofApp },
  { seed: owned('subs/a/src/tmp/new.ts', 'app/a', 'containment', scratch('subs/a/src/tmp', 'app/a')), ...ofA },
  { seed: owned('src/tmp/throwaway.test.ts', 'app', 'containment', scratch('src/tmp', 'app')), ...ofApp },
  { seed: excluded('external-project/file.ts', { kind: 'external', directory: 'external-project', owner: null }), ...nothing },
  { seed: excluded('node_modules/sample/index.ts', { kind: 'packages', directory: 'node_modules', owner: null }), ...nothing },
];
/**
 * The data-variant row: under 0.2.0 the data file changes its owner, the root.
 * The variant's import adds a resource-target coverage note (a recorded fact),
 * so its answer widens by partial-coverage to every module.
 */
const dataRow: Row = { seed: owned('data/limits.json', 'app', 'containment'), ...ofApp };

/** Assert one answer: the seeds, the module lists, and the selection; without widening it is the dependency closure. */
function expectAnswer(result: AffectedSelection, seeds: readonly AffectedPathSeed[], changed: readonly string[],
  affected: readonly string[], label: string, widening: readonly string[] = []): void {
  expect(result.schemaVersion, label).toBe('ramify.affected/2');
  expect(result.paths, label).toEqual(seeds);
  expect([ids(result.changedModules), ids(result.affectedModules), ids(result.testModules)], label)
    .toEqual([[...changed], [...affected], widening.length ? all : union(changed, affected)]);
  expect([result.selection, result.widening], label).toEqual([widening.length ? 'all-modules' : 'dependency-closure', [...widening]]);
}

/** The captured inputs at one path, reduced to the members the rule reads. */
const captured = (inputs: readonly CapturedInput[], path: string): Omit<CapturedInput, 'path'>[] =>
  inputs.filter(input => input.path === path).map(({ role, bytes, sha256 }) => ({ role, bytes, sha256 }));
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const emptySha256 = sha256('');
/** An input whose content the revision read: the written bytes and their hash. */
const read = (role: CapturedInput['role'], text: string) => [{ role, bytes: Buffer.byteLength(text), sha256: sha256(text) }];
/** An existence probe: no bytes, and a signature hash that is not the hash of empty content. */
const probe = [{ role: 'dependency', bytes: 0, sha256: expect.not.stringMatching(emptySha256) }];

/**
 * Recorded facts (iteration 0, step 3) of one revision: the captured inputs at
 * the named paths, the contributors of `data/limits.json`, and the contributor
 * keys that are owned, outside every `src/`, not compiler source and not under
 * an exclusion, which the 0.3.0 rule selects through their contributors.
 */
function expectFacts(revision: SessionRevision, state: SessionState, files: Readonly<Record<string, string>>, data: 'probe' | 'read',
  contributors: readonly string[] | undefined, readers: readonly string[]): void {
  const inputs = revision.inputs;
  expect({
    'tsconfig.json': captured(inputs, 'tsconfig.json'), 'tsconfig.base.json': captured(inputs, 'tsconfig.base.json'),
    'package.json': captured(inputs, 'package.json'), 'data/limits.json': captured(inputs, 'data/limits.json'),
    '.devcontainer/devcontainer.json': captured(inputs, '.devcontainer/devcontainer.json'),
    'README.md': captured(inputs, 'README.md'), 'subs/a/README.md': captured(inputs, 'subs/a/README.md'),
    'module.ramify': captured(inputs, 'module.ramify'), 'scripts/run.sh': captured(inputs, 'scripts/run.sh'),
    'notes/design.md': captured(inputs, 'notes/design.md'),
  }).toEqual({
    'tsconfig.json': read('configuration', files['tsconfig.json']!), 'tsconfig.base.json': read('configuration', files['tsconfig.base.json']!),
    'package.json': read('dependency', files['package.json']!),
    'data/limits.json': data === 'read' ? read('dependency', files['data/limits.json']!) : probe,
    '.devcontainer/devcontainer.json': probe,
    'README.md': read('readme', files['README.md']!), 'subs/a/README.md': read('readme', files['subs/a/README.md']!),
    'module.ramify': read('description', files['module.ramify']!), 'scripts/run.sh': probe, 'notes/design.md': probe,
  });
  const facts = state.facts!;
  expect(facts.indexes.contributors['data/limits.json']).toEqual(contributors);
  const scope = facts.inventory!.scope;
  const compiled = new Set(facts.inventory!.files.map(file => file.path));
  const directories = new Map(scope.ownership.modules.map(module => [module.id, module.directory]));
  const outsideSource = Object.keys(facts.indexes.contributors).filter(path => {
    const ownership = classifyProjectPath(scope, path);
    if (ownership.status !== 'owned' || ownership.exclusion !== null || compiled.has(path)) return false;
    const directory = directories.get(ownership.module)!;
    const source = directory === '.' ? 'src' : `${directory}/src`;
    return path !== source && !path.startsWith(`${source}/`);
  });
  expect(outsideSource).toEqual(readers);
}

describe('AR-00 affected-rule baseline: path seed selection on the extended topology', () => {
  it('base revision: every examples-table seed and the combined queries answer by the 0.2.0 rule', () => session(topology,
    async ({ handle, revision, state }) => {
      // Precondition: the extended topology is a passing project with complete coverage.
      expect(revision.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' });
      expect([revision.diagnostics, revision.coverage]).toEqual([[], []]);
      for (const row of rows) {
        expectAnswer(await answer(handle, { paths: [row.seed.path] }), [row.seed], row.changed, row.affected, row.seed.path);
      }
      // Outside the project: no module, and the unowned-path widening to every module.
      expectAnswer(await answer(handle, { paths: ['../outside.ts'] }), [outside('../outside.ts')], [], [], '../outside.ts', ['unowned-path']);

      // Combined queries: under 0.2.0 every owned seed adds its owner.
      const seed = (path: string): AffectedPathSeed => rows.find(row => row.seed.path === path)!.seed;
      expectAnswer(await answer(handle, { paths: ['notes/design.md', 'subs/a/src/api.ts'] }),
        [seed('notes/design.md'), seed('subs/a/src/api.ts')], ['app', 'app/a'], ['app/b'], 'design and api');
      expectAnswer(await answer(handle, { paths: ['README.md', 'subs/a/src/tmp/new.ts'] }),
        [seed('README.md'), seed('subs/a/src/tmp/new.ts')], ['app', 'app/a'], ['app/b'], 'README and scratch');
      expectAnswer(await answer(handle, { modules: ['app/b'], paths: ['.devcontainer/devcontainer.json'] }),
        [seed('.devcontainer/devcontainer.json')], ['app', 'app/b'], [], 'b and devcontainer');

      // Recorded facts: the data file is only an existence probe here, and no contributor lies outside source.
      expectFacts(revision, state, topology, 'probe', undefined, []);
    }), timeout);

  it('data variant: the imported data file answers by the 0.2.0 rule, widened by its coverage note', () => session(dataVariant,
    async ({ handle, revision, state }) => {
      // Recorded facts: the JSON import is one resource-target note, which widens every answer of this revision.
      expect(revision.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'partial' });
      expect(revision.diagnostics).toEqual([]);
      expect(revision.coverage.map(note => [note.code, note.location.file, note.location.line, note.location.column]))
        .toEqual([['resource-target', 'subs/b/src/consumer.ts', 1, 20]]);
      expectAnswer(await answer(handle, { paths: [dataRow.seed.path] }), [dataRow.seed], dataRow.changed, dataRow.affected,
        dataRow.seed.path, ['partial-coverage']);
      // Recorded facts: b's consumer reads the data file, the only contributor key outside source.
      expectFacts(revision, state, dataVariant, 'read', ['subs/b/src/consumer.ts'], ['data/limits.json']);
    }), timeout);
});
