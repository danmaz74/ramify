import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../index.js';
import type { AnalysisDiagnostic, AnalysisReport, RetainedSession, SessionInputs, SessionRevision } from '../index.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';
import { audited, equalToBatch, instrumentObserver, opened } from './session-test-fixture.js';

/*
 * PB1-21, PB1-22 and PB1-24 at the retained-session boundary, over the written
 * provider topology (project-boundary fixtures.md). Each mutation is applied to
 * a hot session and, separately, to a warm one whose compiler was released
 * before the update. Every published revision is compared with a fresh batch
 * run of the same disk state, and its findings with expectations reasoned from
 * the contracts and the specifications, not from a recorded run:
 *
 * - a declaration change, a missing owned-ignored root and a manifest are
 *   structural; source a declaration excludes leaves the inventory and an
 *   import into it is a definite `project-boundary-import`; source a removed
 *   declaration brings back is read afresh ("Transport, observation and
 *   projections");
 * - owned compiler source outside `src/` is auxiliary source of its owner's
 *   ordinary profile, and its edits, additions and deletions take ordinary
 *   source invalidation and dependency reach; linking rejects an auxiliary
 *   original selected through any forwarding chain ("Source and exposure
 *   provenance");
 * - an invalid boundary publishes an invalid revision and never a valid
 *   partial model; cancellation and byte bounds report explicit outcomes and
 *   leave no compiler process behind (PB1-24);
 * - a revision's inputs are those a batch capture of the same disk records, so
 *   a compiler observation of a removed or excluded file does not outlive the
 *   program that made it, and a sweep finds nothing after a valid revision
 *   ("Inert/excluded byte edits do not change input identity"; "Retire facts and
 *   compiler observations when source becomes excluded").
 */

const timeout = 300_000;
const tsconfig = JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [], strict: true,
  skipLibCheck: true }, include: ['src', 'subs/*/src'], exclude: ['src/tmp', 'subs/*/src/tmp'] });
const rootDescription = (trees: readonly string[] = ['owned-ignored "fixture-project"', 'external "external-project"']): string =>
  `ramify 1\nroot module app tagged [dispatch]\n${trees.map(tree => `${tree}\n`).join('')}expose-sub api from a to descendants\n`
  + 'expose-src * from "interfaces/contract.ts" to descendants\n';
const aDescription = (tree = 'fixtures/sample'): string => `ramify 1\nmodule a\nowned-ignored "${tree}"\nexpose-src api from "api.ts" to parent\n`;
const check = "import { api } from '../subs/a/src/api.js';\nexport const checked: number = api();\n";
const checkWithHidden = "import { api } from '../subs/a/src/api.js';\nimport { hidden } from '../subs/b/src/hidden.js';\nexport const checked: number = api() + hidden;\n";

/** The written topology: root `app` [dispatch], children `a` (with `grand`) and `b`. */
const topology: Readonly<Record<string, string>> = {
  'package.json': '{"name":"app","type":"module"}',
  'tsconfig.json': tsconfig,
  'module.ramify': rootDescription(),
  'README.md': '# App\n\nThe written provider topology, retained.\n',
  'notes/design.md': 'Inert root-owned prose.\n',
  // Root auxiliary source: a received original, and an unread sibling.
  'scripts/check.ts': check,
  'scripts/idle.ts': 'export const idle: number = 5;\n',
  'src/main.ts': "import { api } from '../subs/a/src/api.js';\nexport const main: number = api();\n",
  // A same-owner import of auxiliary source, and one whose target does not exist yet.
  'src/uses-check.ts': "import { checked } from '../scripts/check.js';\nexport const usesCheck: number = checked;\n",
  'src/later.ts': "import { later } from '../scripts/later.js';\nexport const usesLater: number = later;\n",
  // The forwarding chain the wildcard exposure reads: contract -> forward -> an auxiliary file.
  'src/forward.ts': "export * from '../tools/tmp/empty.js';\nexport { main } from './main.js';\n",
  'src/interfaces/contract.ts': "export * from '../forward.js';\n",
  // A named forwarder of an auxiliary original that no exposure selects yet.
  'src/relay.ts': "export { helper } from '../tools/tmp/helper.js';\n",
  'src/tmp/throwaway.test.ts': 'export const scratch = 1;\n',
  'tools/tmp/empty.ts': 'export {};\n',
  'tools/tmp/helper.ts': 'export const helper: number = 7;\n',
  'fixture-project/module.ramify': 'ramify 1\nroot module fixture-project\n',
  'fixture-project/tsconfig.json': '{ "include": ["src"] }',
  'fixture-project/src/thing.ts': 'export const thing: number = 1;\nexport interface Shape { readonly size: number }\n',
  'external-project/lib.ts': 'export const lib: number = 2;\n',
  'subs/a/module.ramify': aDescription(),
  'subs/a/README.md': '# A\n\nProvides api.\n',
  'subs/a/src/api.ts': 'export function api(): number { return 1; }\n',
  'subs/a/src/tests/api.test.ts': "import { api } from '../api.js';\nexport const tested: number = api();\n",
  'subs/a/src/tmp/throwaway.ts': 'export const throwaway = 1;\n',
  'subs/a/scripts/report.ts': "import { api } from '../src/api.js';\nimport { seed } from '../fixtures/seed.js';\nexport const reported: number = api() + seed;\n",
  'subs/a/fixtures/seed.ts': 'export const seed: number = 2;\n',
  'subs/a/fixtures/sample/module.ramify': 'ramify 1\nroot module sample\n',
  'subs/a/fixtures/sample/src/index.ts': 'export const sample: number = 1;\n',
  'subs/a/subs/grand/module.ramify': 'ramify 1\nmodule grand\n',
  'subs/a/subs/grand/README.md': '# Grand\n\nNo import edges.\n',
  'subs/a/subs/grand/src/grand.ts': 'export const grand: number = 3;\n',
  'subs/b/module.ramify': 'ramify 1\nmodule b\n',
  'subs/b/README.md': '# B\n\nConsumes api.\n',
  'subs/b/src/consumer.ts': "import { api } from '../../a/src/api.js';\nexport const consumed: number = api();\n",
  'subs/b/src/hidden.ts': 'export const hidden: number = 4;\n',
};

type Level = 'hot' | 'warm';
interface Project {
  readonly root: string;
  readonly inputs: SessionInputs;
  write(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
}

async function project(check: (project: Project) => Promise<void>, files: Readonly<Record<string, string>> = topology,
  maxApplicationBytes = 64 * 1024 ** 2): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-boundary-session-')));
  const write = async (path: string, text: string): Promise<void> => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  try {
    for (const [path, text] of Object.entries(files)) await write(path, text);
    await check({ root, write, remove: path => rm(join(root, path), { recursive: true }), inputs: {
      project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      registry: createDefaultTagRegistry(), capabilities: ['static-access', 'tags-origin', 'namespace-access', 'lazy-access',
        'symbol-free-access', 'coverage'],
      limits: {
        acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
          maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
        source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
        maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
      },
      session: { updateDeadlineMs: 2_000, sweepIntervalMs: 30_000, workerHeapMiB: 512, maxRetainedFactBytes: 96 * 1024 ** 2 },
    } });
  } finally { await rm(root, { recursive: true, force: true }); }
}

/** A finding as `[code, file, line]`, in report order. */
const located = (items: readonly AnalysisDiagnostic[]): unknown[] => items.map(item => [item.code, item.location?.file, item.location?.line]);
const boundary = (specifier: string, file: string, kind: 'owned-ignored' | 'external', directory: string): string =>
  `'${specifier}' resolves to ${file} in the declared ${kind} tree ${directory}; an import into a declared tree must use package resolution`;
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const auxiliaryFiles = (report: AnalysisReport): string[] =>
  report.snapshot!.inventory.files.filter(file => file.placement === 'auxiliary').map(file => file.path);
const coverage = (report: AnalysisReport): unknown[] => report.coverage.map(note => [note.code, note.location.file]);
const passed = { execution: 'completed', check: 'passed', coverage: 'partial' } as const;
const failed = { execution: 'completed', check: 'failed', coverage: 'partial' } as const;
const invalid = { execution: 'invalid', check: 'failed', coverage: 'not-run' } as const;
/** The initial auxiliary inventory: root scripts and tools, and a's scripts and fixtures outside its ignored sample. */
const initialAuxiliary = ['scripts/check.ts', 'scripts/idle.ts', 'subs/a/fixtures/seed.ts', 'subs/a/scripts/report.ts', 'tools/tmp/empty.ts',
  'tools/tmp/helper.ts'];

/**
 * One retained session at a level. Before each update a warm session releases
 * its compiler, so the update reopens one from the disk. Every revision is
 * checked against a fresh batch of the same inputs and audited.
 */
class Run {
  readonly handle: RetainedSession;
  readonly #inputs: SessionInputs;
  readonly #level: Level;
  constructor(handle: RetainedSession, inputs: SessionInputs, level: Level) {
    this.handle = handle; this.#inputs = inputs; this.#level = level;
  }

  get current(): SessionRevision { return this.handle.current!; }

  async #prepare(): Promise<void> {
    if (this.#level === 'warm') {
      await this.handle.releaseCompiler();
      expect(this.handle.status().level).toBe('warm');
    }
  }

  /** The update a resident check sends: the named paths with the opening invocation. */
  #update(paths: readonly string[], control: { signal?: AbortSignal } = {}) {
    return this.handle.update(paths.map(path => ({ path, kind: 'unknown' as const })), control,
      { project: this.#inputs.project, capabilities: this.#inputs.capabilities });
  }

  /**
   * Apply named changes. The revision is the next sequence and equals a fresh
   * batch of the same inputs; its path is the given hot path, or broad when the
   * update reopened a released compiler. A structural update reports that it
   * acquired the project again, and a sweep of that capture then finds nothing.
   */
  async step(paths: readonly string[], hotPath: SessionRevision['checked']['path'], reacquired = false):
  Promise<{ revision: SessionRevision; report: AnalysisReport }> {
    const before = this.current;
    await this.#prepare();
    const result = await this.#update(paths);
    if (result.status !== 'revised') throw new Error(`Expected a revision: ${JSON.stringify(result)}`);
    expect(result.identical).toBe(false);
    const revision = result.revision;
    expect(revision.sequence).toBe(before.sequence + 1);
    expect(revision.checked.path).toBe(this.#level === 'hot' ? hotPath : 'broad');
    // Invalid facts are published without promotion, so they never report a reacquisition.
    expect(result.reacquired).toBe(reacquired && revision.outcome.execution !== 'invalid');
    expect(this.handle.current).toBe(revision);
    const report = await equalToBatch(this.handle, this.#inputs);
    // The revision identifies its inputs as the batch report does; an invalid acquisition has no analysis identity.
    if (report.inputId === null) expect([revision.outcome.execution, revision.inputId.startsWith('invalid/1:')]).toEqual(['invalid', true]);
    else expect(report.inputId).toBe(revision.inputId);
    expect([report.outcome, report.diagnostics]).toEqual([revision.outcome, revision.diagnostics]);
    await audited(this.handle);
    // Nothing a valid revision observed differs from the disk: retired observations left nothing behind. An
    // invalid acquisition leaves the observer on its last valid capture; when that capture saw the change,
    // its sweep acquires again and answers the same invalid revision.
    const swept = await this.handle.sweep();
    if (report.inputId === null) expect(swept.status === 'unchanged' || (swept.status === 'revised' && swept.identical)).toBe(true);
    else expect(swept).toMatchObject({ status: 'unchanged' });
    expect(this.handle.current).toBe(revision);
    return { revision, report };
  }

  /**
   * An update naming only paths whose bytes no stage reads. A hot session keeps
   * the same revision object; a warm one rebuilds its compiler and takes the
   * broad path, publishing the same input identity and findings.
   */
  async inert(paths: readonly string[]): Promise<void> {
    const before = this.current;
    await this.#prepare();
    const result = await this.#update(paths);
    if (result.status !== 'revised') throw new Error(`Expected a revision: ${JSON.stringify(result)}`);
    if (this.#level === 'hot') {
      expect(result.identical).toBe(true);
      expect(this.handle.current).toBe(before);
    } else {
      expect([result.identical, result.revision.sequence, result.revision.checked.path]).toEqual([false, before.sequence + 1, 'broad']);
      expect([result.revision.inputId, result.revision.diagnostics]).toEqual([before.inputId, before.diagnostics]);
    }
    expect((await equalToBatch(this.handle, this.#inputs)).inputId).toBe(before.inputId);
  }
}

async function session(inputs: SessionInputs, level: Level, steps: (run: Run, first: SessionRevision) => Promise<void>): Promise<void> {
  const { handle, revision } = await opened(inputs);
  try {
    expect(revision.outcome).toEqual(passed);
    await equalToBatch(handle, inputs);
    await steps(new Run(handle, inputs, level), revision);
  } finally { await handle.dispose(); }
}

describe.each(['hot', 'warm'] as const)('project boundaries in a %s retained session', level => {
  it(`PB1-21: declarations added, edited beneath, removed, changed and a missing root equal fresh batch runs (${level})`, () => project(async ({ inputs, write, remove }) => {
    await session(inputs, level, async (run, first) => {
      expect(first.diagnostics).toEqual([]);
      // Byte edits of an inert file, owned-ignored contents, a scratch file and a's ignored sample change no input.
      await write('notes/design.md', 'Inert root-owned prose, edited.\n');
      await write('fixture-project/src/thing.ts', 'export const thing: number = 2;\nexport interface Shape { readonly size: number }\n');
      await write('subs/a/fixtures/sample/src/index.ts', 'export const sample: number = 2;\n');
      await write('src/tmp/throwaway.test.ts', 'export const scratch = 2;\n');
      await run.inert(['notes/design.md', 'fixture-project/src/thing.ts', 'subs/a/fixtures/sample/src/index.ts', 'src/tmp/throwaway.test.ts']);

      // A child boundary added and removed: its module and source enter and leave with the acquisition.
      await write('subs/a-extra/module.ramify', 'ramify 1\nmodule a-extra\n');
      await write('subs/a-extra/src/other.test.ts', 'export const other: number = 1;\n');
      const child = await run.step(['subs/a-extra'], 'broad', true);
      expect(child.report.snapshot!.inventory.modules.map(module => module.id)).toEqual(['app', 'app/a', 'app/a-extra', 'app/a/grand', 'app/b']);
      expect(child.report.snapshot!.inventory.files.filter(file => file.owner === 'app/a-extra').map(file => [file.path, file.area, file.placement]))
        .toEqual([['subs/a-extra/src/other.test.ts', 'ordinary', 'src']]);
      expect([child.revision.outcome, child.revision.diagnostics]).toEqual([passed, []]);
      await remove('subs/a-extra');
      const removed = await run.step(['subs/a-extra'], 'broad', true);
      expect(removed.report.snapshot!.inventory.modules.map(module => module.id)).toEqual(['app', 'app/a', 'app/a/grand', 'app/b']);

      // Declaring scripts owned-ignored removes its auxiliary source and makes the same-owner import a boundary import.
      await write('module.ramify', rootDescription(['owned-ignored "fixture-project"', 'owned-ignored "scripts"', 'external "external-project"']));
      const declared = await run.step(['module.ramify'], 'broad', true);
      expect(declared.revision.outcome).toEqual(failed);
      expect(located(declared.revision.diagnostics)).toEqual([['project-boundary-import', 'src/uses-check.ts', 1]]);
      expect(declared.revision.diagnostics[0]!.message).toBe(boundary('../scripts/check.js', 'scripts/check.ts', 'owned-ignored', 'scripts'));
      expect(auxiliaryFiles(declared.report)).toEqual(initialAuxiliary.filter(path => !path.startsWith('scripts/')));
      expect(declared.report.snapshot!.inventory.scope.ownership.exclusions.filter(item => item.kind === 'owned-ignored' || item.kind === 'external'))
        .toEqual([{ kind: 'external', directory: 'external-project', owner: null }, { kind: 'owned-ignored', directory: 'fixture-project', owner: 'app' },
          { kind: 'owned-ignored', directory: 'scripts', owner: 'app' }, { kind: 'owned-ignored', directory: 'subs/a/fixtures/sample', owner: 'app/a' }]);
      expect(declared.report.summary).toMatchObject({ denied: 1, errors: 1 });

      // An unread file beneath the tree is not an input; the file the compiler reads through the denied import is
      // one, and its excluded contents are never interpreted: the new foreign import there adds no finding.
      await write('scripts/idle.ts', 'export const idle: number = 6;\n');
      await run.inert(['scripts/idle.ts']);
      await write('scripts/check.ts', checkWithHidden);
      const beneath = await run.step(['scripts/check.ts'], 'broad');
      expect(located(beneath.revision.diagnostics)).toEqual(located(declared.revision.diagnostics));
      expect(beneath.report.snapshot!.accesses.some(access => access.importer.file.startsWith('scripts/'))).toBe(false);

      // Removing the declaration brings the source back read afresh: the edit made while excluded is analyzed.
      await write('module.ramify', rootDescription());
      const reincluded = await run.step(['module.ramify'], 'broad', true);
      expect(reincluded.revision.outcome).toEqual(failed);
      expect(located(reincluded.revision.diagnostics)).toEqual([['not-visible', 'scripts/check.ts', 2]]);
      expect(auxiliaryFiles(reincluded.report)).toEqual(initialAuxiliary);
      expect(reincluded.report.snapshot!.inventory.files.filter(file => file.path.startsWith('scripts/')).map(file => [file.path, file.sha256]))
        .toEqual([['scripts/check.ts', sha256(checkWithHidden)], ['scripts/idle.ts', sha256('export const idle: number = 6;\n')]]);
      expect(reincluded.report.summary).toMatchObject({ denied: 1, errors: 1 });

      // A missing owned-ignored root invalidates the project; restoring it recovers the same findings.
      await remove('fixture-project');
      const missing = await run.step(['fixture-project'], 'broad');
      expect(missing.revision.outcome).toEqual(invalid);
      expect(missing.revision.diagnostics.map(item => [item.code, item.category, item.location?.file]))
        .toEqual([['missing-owned-ignored', 'layout', 'module.ramify']]);
      for (const [path, text] of Object.entries(topology)) if (path.startsWith('fixture-project/')) await write(path, text);
      const restored = await run.step(['fixture-project'], 'broad', true);
      expect(restored.revision.outcome).toEqual(failed);
      expect(located(restored.revision.diagnostics)).toEqual(located(reincluded.revision.diagnostics));

      // An import into the owned-ignored tree, then the same tree declared external. The new importer brings a file
      // the inventory does not own into the program, a reach the membership path cannot bound: broad.
      await write('src/tree.ts', "import type { Shape } from '../fixture-project/src/thing.js';\nexport type Seen = Shape;\n");
      const importer = await run.step(['src/tree.ts'], 'broad');
      expect(located(importer.revision.diagnostics)).toEqual([['not-visible', 'scripts/check.ts', 2], ['project-boundary-import', 'src/tree.ts', 1]]);
      expect(importer.revision.diagnostics[1]!.message).toBe(boundary('../fixture-project/src/thing.js', 'fixture-project/src/thing.ts', 'owned-ignored', 'fixture-project'));
      await write('module.ramify', rootDescription(['external "fixture-project"', 'external "external-project"']));
      const external = await run.step(['module.ramify'], 'broad', true);
      expect(located(external.revision.diagnostics)).toEqual(located(importer.revision.diagnostics));
      expect(external.revision.diagnostics[1]!.message).toBe(boundary('../fixture-project/src/thing.js', 'fixture-project/src/thing.ts', 'external', 'fixture-project'));
      expect(external.report.snapshot!.inventory.scope.ownership.exclusions.filter(item => item.directory === 'fixture-project'))
        .toEqual([{ kind: 'external', directory: 'fixture-project', owner: null }]);

      // An absent external tree is valid and the import into it is unresolved. Writing a file no stage probed into
      // it creates the tree's directory again: an event naming only that file reacquires, since the tree's own
      // existence is observed. The import's target then appears, and the boundary finding returns.
      await remove('fixture-project');
      const absent = await run.step(['fixture-project'], 'broad', true);
      expect([absent.revision.outcome, located(absent.revision.diagnostics)]).toEqual([failed, [['not-visible', 'scripts/check.ts', 2]]]);
      expect(coverage(absent.report)).toEqual([['unresolved-target', 'src/later.ts'], ['unresolved-target', 'src/tree.ts']]);
      expect(absent.revision.inputs.find(input => input.path === 'fixture-project')?.role).toBe('absent');
      await write('fixture-project/notes/readme.txt', 'Data.\n');
      const recreated = await run.step(['fixture-project/notes/readme.txt'], 'broad', true);
      expect(recreated.revision.inputs.find(input => input.path === 'fixture-project')?.role).toBe('directory');
      expect(recreated.revision.inputs.some(input => input.path.startsWith('fixture-project/notes'))).toBe(false);
      expect(located(recreated.revision.diagnostics)).toEqual(located(absent.revision.diagnostics));
      await write('fixture-project/src/thing.ts', topology['fixture-project/src/thing.ts']!);
      const reappeared = await run.step(['fixture-project/src/thing.ts'], 'broad', true);
      expect(located(reappeared.revision.diagnostics)).toEqual(located(external.revision.diagnostics));
      expect(reappeared.revision.diagnostics[1]!.message).toBe(external.revision.diagnostics[1]!.message);
      // The tree's own description and configuration are never read: writing them changes no input.
      await write('fixture-project/module.ramify', topology['fixture-project/module.ramify']!);
      await write('fixture-project/tsconfig.json', topology['fixture-project/tsconfig.json']!);
      await run.inert(['fixture-project/module.ramify', 'fixture-project/tsconfig.json']);

      // A changed directory: a's tree now covers fixtures/, so seed.ts leaves the inventory and report.ts's import is denied.
      await write('subs/a/module.ramify', aDescription('fixtures'));
      const widened = await run.step(['subs/a/module.ramify'], 'broad', true);
      expect(located(widened.revision.diagnostics)).toEqual([['not-visible', 'scripts/check.ts', 2],
        ['project-boundary-import', 'src/tree.ts', 1], ['project-boundary-import', 'subs/a/scripts/report.ts', 2]]);
      expect(widened.revision.diagnostics[2]!.message).toBe(boundary('../fixtures/seed.js', 'subs/a/fixtures/seed.ts', 'owned-ignored', 'subs/a/fixtures'));
      expect(auxiliaryFiles(widened.report)).toEqual(initialAuxiliary.filter(path => path !== 'subs/a/fixtures/seed.ts'));

      // The compiler read the denied target, so its deletion is an input change; with no target the import is no
      // longer a known boundary import but an unresolved one, and nothing the compiler observed for the old
      // target stays an input of the revision. Restoring the file restores the finding.
      await remove('subs/a/fixtures/seed.ts');
      const targetGone = await run.step(['subs/a/fixtures/seed.ts'], 'broad');
      expect(located(targetGone.revision.diagnostics)).toEqual([['not-visible', 'scripts/check.ts', 2], ['project-boundary-import', 'src/tree.ts', 1]]);
      expect(coverage(targetGone.report)).toEqual([['unresolved-target', 'src/later.ts'], ['unresolved-target', 'subs/a/scripts/report.ts']]);
      expect(targetGone.revision.inputs.filter(input => input.path.startsWith('subs/a/fixtures/') && input.role !== 'absent')).toEqual([]);
      await write('subs/a/fixtures/seed.ts', topology['subs/a/fixtures/seed.ts']!);
      // The compiler last observed the path as an absence beneath the tree; its new kind moves the selection: structural.
      const targetBack = await run.step(['subs/a/fixtures/seed.ts'], 'broad', true);
      expect(located(targetBack.revision.diagnostics)).toEqual(located(widened.revision.diagnostics));

      // Every mutation reverted in one update: the initial findings, equal to batch.
      await write('module.ramify', rootDescription());
      await write('subs/a/module.ramify', aDescription());
      await write('scripts/check.ts', check);
      await remove('src/tree.ts');
      const reverted = await run.step(['module.ramify', 'subs/a/module.ramify', 'scripts/check.ts', 'src/tree.ts'], 'broad', true);
      expect([reverted.revision.outcome, reverted.revision.diagnostics]).toEqual([passed, []]);
      expect(auxiliaryFiles(reverted.report)).toEqual(initialAuxiliary);
    });
  }), timeout);

  it(`PB1-22: auxiliary edits, additions, deletions and forwarding equal fresh batch runs (${level})`, () => project(async ({ inputs, write, remove }) => {
    await session(inputs, level, async run => {
      // An auxiliary edit is ordinary source: a foreign original nobody exposes is not visible to the root's ordinary profile.
      await write('scripts/check.ts', checkWithHidden);
      const edited = await run.step(['scripts/check.ts'], 'source');
      expect(edited.revision.outcome).toEqual(failed);
      expect(located(edited.revision.diagnostics)).toEqual([['not-visible', 'scripts/check.ts', 2]]);
      expect(edited.revision.diagnostics[0]!.importer).toEqual({ owner: 'app', kind: 'ordinary', root: 'src', profile: ['dispatch'] });
      expect(coverage(edited.report)).toEqual([['unresolved-target', 'src/later.ts']]);

      // A new auxiliary file completes the import that could not resolve: its importer is checked again, same-owner.
      await write('scripts/later.ts', 'export const later: number = 1;\n');
      const created = await run.step(['scripts/later.ts'], 'membership');
      if (level === 'hot') expect(created.revision.checked.files).toEqual(['scripts/later.ts', 'src/later.ts']);
      expect(created.revision.outcome).toEqual({ ...failed, coverage: 'complete' });
      expect(coverage(created.report)).toEqual([]);
      const later = created.report.snapshot!.accesses.find(access => access.importer.file === 'src/later.ts')!;
      expect(created.report.snapshot!.results.find(result => result.accessId === later.id)!.decisions.map(decision => [decision.status, decision.reason]))
        .toEqual([['allowed', 'same-owner']]);
      expect(created.report.snapshot!.inventory.files.find(file => file.path === 'scripts/later.ts')).toEqual({ path: 'scripts/later.ts', owner: 'app',
        area: 'ordinary', kind: 'source', placement: 'auxiliary', sha256: sha256('export const later: number = 1;\n'), bytes: 32 });

      // A new auxiliary file of a cannot reach a's testing source; deleting it removes the finding.
      await write('subs/a/scripts/extra.ts', "import { tested } from '../src/tests/api.test.js';\nexport const extra: number = tested;\n");
      const testing = await run.step(['subs/a/scripts/extra.ts'], 'membership');
      expect(located(testing.revision.diagnostics)).toEqual([['not-visible', 'scripts/check.ts', 2], ['testing-origin', 'subs/a/scripts/extra.ts', 1]]);
      expect(testing.revision.diagnostics[1]!.importer).toEqual({ owner: 'app/a', kind: 'ordinary', root: 'subs/a/src', profile: [] });
      await remove('subs/a/scripts/extra.ts');
      const deleted = await run.step(['subs/a/scripts/extra.ts'], 'membership');
      expect(located(deleted.revision.diagnostics)).toEqual([['not-visible', 'scripts/check.ts', 2]]);
      expect(deleted.report.snapshot!.inventory.files.some(file => file.path === 'subs/a/scripts/extra.ts')).toBe(false);
      expect(deleted.revision.inputs.some(input => input.path === 'subs/a/scripts/extra.ts')).toBe(false);

      // Deleting the completed target leaves its importer unresolved again.
      await remove('scripts/later.ts');
      const unresolved = await run.step(['scripts/later.ts'], 'membership');
      expect(unresolved.revision.outcome).toEqual(failed);
      expect(coverage(unresolved.report)).toEqual([['unresolved-target', 'src/later.ts']]);

      // Compiler membership reach: a file whose import names a directory that does not exist. A later, unrelated
      // auxiliary addition cannot keep that resolution's probes current incrementally, so it takes the broad path;
      // the probes a fresh pass records stay inputs.
      await write('src/nowhere.ts', "import { x } from '../missing-dir/x.js';\nexport const nowhere: number = x;\n");
      const nowhere = await run.step(['src/nowhere.ts'], 'membership');
      expect(coverage(nowhere.report)).toEqual([['unresolved-target', 'src/later.ts'], ['unresolved-target', 'src/nowhere.ts']]);
      expect(nowhere.revision.inputs.filter(input => input.path.startsWith('missing-dir')).map(input => [input.path, input.role]))
        .toEqual(['missing-dir', 'missing-dir/x.d.ts', 'missing-dir/x.js', 'missing-dir/x.jsx', 'missing-dir/x.ts', 'missing-dir/x.tsx']
          .map(path => [path, 'absent']));
      await write('subs/a/scripts/more.ts', 'export const more: number = 1;\n');
      const more = await run.step(['subs/a/scripts/more.ts'], 'broad');
      expect(more.revision.inputs.filter(input => input.path.startsWith('missing-dir')).map(input => input.path))
        .toEqual(nowhere.revision.inputs.filter(input => input.path.startsWith('missing-dir')).map(input => input.path));
      await remove('src/nowhere.ts');
      await remove('subs/a/scripts/more.ts');
      const tidied = await run.step(['src/nowhere.ts', 'subs/a/scripts/more.ts'], 'broad');
      expect(tidied.revision.inputs.some(input => input.path.startsWith('missing-dir'))).toBe(false);

      // Forwarding: an export added to the auxiliary file reaches the wildcard exposure through two star
      // re-exports, and linking rejects the auxiliary original at the wildcard; no model and no decision is published.
      const leaked = 'export const leaked: number = 1;\n';
      await write('tools/tmp/empty.ts', leaked);
      const forwarded = await run.step(['tools/tmp/empty.ts'], 'source');
      expect(forwarded.revision.outcome).toEqual(invalid);
      const description = rootDescription();
      const star = description.indexOf('*');
      expect(forwarded.revision.diagnostics.map(item => [item.code, item.category, item.location, item.related.map(at => at.file)])).toEqual([
        ['auxiliary-original-exposure', 'description', { file: 'module.ramify', start: star, end: star + 1,
          line: description.slice(0, star).split('\n').length, column: star - description.lastIndexOf('\n', star - 1) }, ['tools/tmp/empty.ts']],
      ]);
      // The acquisition is valid, so the revision keeps the analysis identity of its inputs.
      expect([forwarded.report.inputId, forwarded.report.snapshot!.model, forwarded.report.snapshot!.results])
        .toEqual([forwarded.revision.inputId, null, []]);
      expect(forwarded.report.snapshot!.catalog!.originals.filter(original => original.origin.auxiliary && original.id.binding === 'leaked')
        .map(original => original.id)).toEqual([{ kind: 'code', owner: 'app', file: '../tools/tmp/empty.ts', binding: 'leaked' }]);

      // Positive control: the export removed again, the wildcard exposes only the ordinary original.
      await write('tools/tmp/empty.ts', 'export {};\n');
      const restored = await run.step(['tools/tmp/empty.ts'], 'source');
      expect(located(restored.revision.diagnostics)).toEqual([['not-visible', 'scripts/check.ts', 2]]);
      expect(restored.report.snapshot!.model!.exposures.filter(item => item.module === 'app').map(item => [item.original.file, item.original.binding]))
        .toEqual([['main.ts', 'main'], ['api.ts', 'api']]);

      // A description edit selecting an auxiliary original through a named forwarder is rejected on the description path.
      const relayed = rootDescription().replace('expose-src *', 'expose-src helper from "relay.ts" to descendants\nexpose-src *');
      await write('module.ramify', relayed);
      const named = await run.step(['module.ramify'], 'description');
      expect(named.revision.outcome).toEqual(invalid);
      const helper = relayed.indexOf('helper');
      expect(named.revision.diagnostics.map(item => [item.code, item.location, item.related.map(at => at.file)])).toEqual([
        ['auxiliary-original-exposure', { file: 'module.ramify', start: helper, end: helper + 'helper'.length,
          line: relayed.slice(0, helper).split('\n').length, column: helper - relayed.lastIndexOf('\n', helper - 1) }, ['tools/tmp/helper.ts']],
      ]);
      await write('module.ramify', rootDescription());
      const unnamed = await run.step(['module.ramify'], 'description');
      expect(located(unnamed.revision.diagnostics)).toEqual([['not-visible', 'scripts/check.ts', 2]]);

      // Deleting the auxiliary file the chain re-exports leaves the wildcard's contract undeterminable; restoring it recovers.
      await remove('tools/tmp/empty.ts');
      const gone = await run.step(['tools/tmp/empty.ts'], 'membership');
      expect(gone.revision.outcome).toEqual(invalid);
      // The error is located on the wildcard statement.
      expect(gone.revision.diagnostics.map(item => [item.code, item.category, item.location?.file, item.location?.line]))
        .toEqual([['incomplete-expansion', 'description', 'module.ramify', description.slice(0, star).split('\n').length]]);
      await write('tools/tmp/empty.ts', 'export {};\n');
      const back = await run.step(['tools/tmp/empty.ts'], 'membership');
      expect(located(back.revision.diagnostics)).toEqual([['not-visible', 'scripts/check.ts', 2]]);

      await write('scripts/check.ts', check);
      const clean = await run.step(['scripts/check.ts'], 'source');
      expect([clean.revision.outcome, clean.revision.diagnostics]).toEqual([passed, []]);
    });
  }), timeout);

  it(`PB1-21: a declared-tree target removed while the project is invalid leaves no observation of it after recovery (${level})`, () =>
    project(async ({ inputs, write, remove }) => {
      await session(inputs, level, async run => {
        await write('subs/a/module.ramify', aDescription('fixtures'));
        const widened = await run.step(['subs/a/module.ramify'], 'broad', true);
        expect(located(widened.revision.diagnostics)).toEqual([['project-boundary-import', 'subs/a/scripts/report.ts', 2]]);
        await write('notes/package.json', '{"name":"notes"}\n');
        const manifest = await run.step(['notes/package.json'], 'broad');
        expect(manifest.revision.outcome).toEqual(invalid);
        // The invalid acquisition never reads beneath the tree, so removing the target changes nothing it captured.
        await remove('subs/a/fixtures/seed.ts');
        expect(await run.handle.update([{ path: 'subs/a/fixtures/seed.ts', kind: 'deleted' }]))
          .toMatchObject({ status: 'revised', identical: true, revision: { sequence: manifest.revision.sequence } });
        await equalToBatch(run.handle, inputs);
        // On recovery the compiler, which last held the removed target, reads its program again: the import is unresolved.
        await remove('notes/package.json');
        const recovered = await run.step(['notes/package.json'], 'broad', true);
        expect([recovered.revision.outcome, recovered.revision.diagnostics]).toEqual([passed, []]);
        expect(coverage(recovered.report)).toEqual([['unresolved-target', 'src/later.ts'], ['unresolved-target', 'subs/a/scripts/report.ts']]);
      });
    }), timeout);

  it(`PB1-22: creating and deleting compiler-selected, compiler-read source in a declared tree recomputes its warning (${level})`, () =>
    project(async ({ inputs, write, remove }) => {
      await session(inputs, level, async run => {
        const warning = (report: AnalysisReport): unknown[] => report.warnings.map(item => [item.code, item.path, item.files, item.count]);
        await write('module.ramify', rootDescription(['owned-ignored "fixture-project"', 'owned-ignored "scripts"', 'external "external-project"']));
        const declared = await run.step(['module.ramify'], 'broad', true);
        expect(warning(declared.report)).toEqual([['compiler-selected-owned-ignored', 'scripts', ['scripts/check.ts', 'scripts/idle.ts'], 2]]);
        expect(located(declared.revision.diagnostics)).toEqual([['project-boundary-import', 'src/uses-check.ts', 1]]);
        // The new file is selected by the configuration and read through the import that could not resolve.
        await write('scripts/later.ts', 'export const later: number = 1;\n');
        const created = await run.step(['scripts/later.ts'], 'broad', true);
        expect(warning(created.report)).toEqual([['compiler-selected-owned-ignored', 'scripts', ['scripts/check.ts', 'scripts/idle.ts', 'scripts/later.ts'], 3]]);
        expect(located(created.revision.diagnostics)).toEqual([['project-boundary-import', 'src/later.ts', 1], ['project-boundary-import', 'src/uses-check.ts', 1]]);
        expect(coverage(created.report)).toEqual([]);
        // Its deletion leaves the configuration's listing, so the selection and the warning change with it.
        await remove('scripts/later.ts');
        const deleted = await run.step(['scripts/later.ts'], 'broad', true);
        expect(warning(deleted.report)).toEqual([['compiler-selected-owned-ignored', 'scripts', ['scripts/check.ts', 'scripts/idle.ts'], 2]]);
        expect(located(deleted.revision.diagnostics)).toEqual([['project-boundary-import', 'src/uses-check.ts', 1]]);
        expect(coverage(deleted.report)).toEqual([['unresolved-target', 'src/later.ts']]);
        // A byte edit of a read file there stays an input change, without a new acquisition.
        await write('scripts/check.ts', checkWithHidden);
        const edited = await run.step(['scripts/check.ts'], 'broad');
        expect(warning(edited.report)).toEqual(warning(deleted.report));
      });
    }, { ...topology, 'tsconfig.json': JSON.stringify({ ...JSON.parse(tsconfig), include: ['src', 'subs/*/src', 'scripts'] }) }), timeout);
});

describe('PB1-24: invalid boundaries, cancellation, byte bounds and cleanup', () => {
  it('publishes an overlapping declaration and a manifest as invalid revisions, never a passing one, and recovers', () => project(async ({ inputs, write, remove }) => {
    await session(inputs, 'hot', async run => {
      await write('module.ramify', rootDescription(['owned-ignored "fixture-project"', 'owned-ignored "fixture-project/src"', 'external "external-project"']));
      const overlap = await run.step(['module.ramify'], 'broad');
      expect(overlap.revision.outcome).toEqual(invalid);
      expect(overlap.revision.diagnostics.map(item => [item.code, item.category, item.location?.file]))
        .toEqual([['overlapping-nested-tree', 'layout', 'module.ramify'], ['overlapping-nested-tree', 'layout', 'module.ramify']]);
      expect(overlap.report.snapshot?.results ?? []).toEqual([]);
      // Nothing answers from the last valid model as if it described the invalid project.
      expect(await run.handle.affected({ sequence: overlap.revision.sequence, paths: ['src/main.ts'] }))
        .toMatchObject({ status: 'unavailable', reason: 'invalid-current' });
      expect(await run.handle.measurements(overlap.revision.sequence)).toMatchObject({ status: 'unavailable', reason: 'invalid-current' });
      // A source edit while invalid keeps the invalid outcome.
      await write('src/main.ts', "import { api } from '../subs/a/src/api.js';\nexport const main: number = api() + 1;\n");
      const still = await run.handle.update([{ path: 'src/main.ts', kind: 'changed' }]);
      expect(still.status).toBe('revised');
      expect(run.current.outcome).toEqual(invalid);
      await equalToBatch(run.handle, inputs);
      await write('module.ramify', rootDescription());
      const repaired = await run.step(['module.ramify'], 'broad', true);
      expect([repaired.revision.outcome, repaired.revision.diagnostics]).toEqual([passed, []]);

      await write('notes/package.json', '{"name":"notes"}\n');
      const manifest = await run.step(['notes/package.json'], 'broad');
      expect(manifest.revision.outcome).toEqual(invalid);
      expect(manifest.revision.diagnostics.map(item => [item.code, item.category, item.location?.file]))
        .toEqual([['undeclared-project-boundary', 'layout', 'notes/package.json']]);
      await remove('notes/package.json');
      const recovered = await run.step(['notes/package.json'], 'broad', true);
      expect([recovered.revision.outcome, recovered.revision.diagnostics]).toEqual([passed, []]);
    });
  }), timeout);

  it.each(['hot', 'warm'] as const)('reconciles from the disk on a sweep after a cancelled update or an invalid revision, never keeping a stale revision (%s)', level =>
    project(async ({ inputs, write, remove }) => {
      const { handle, state, revision: first } = await opened(inputs);
      const sweep = async () => {
        if (level === 'warm') await handle.releaseCompiler();
        return handle.sweep();
      };
      try {
        // The observer applies the declaration, then the update is cancelled: the published revision is behind it.
        const observer = instrumentObserver(state);
        const controller = new AbortController();
        observer.apply.mockImplementationOnce(async (changes, signal) => {
          const update = await observer.observer.apply(changes, signal);
          controller.abort();
          return update;
        });
        await write('module.ramify', rootDescription(['owned-ignored "fixture-project"', 'owned-ignored "scripts"', 'external "external-project"']));
        expect(await handle.update([{ path: 'module.ramify', kind: 'changed' }], { signal: controller.signal })).toEqual({ status: 'cancelled' });
        expect(handle.current).toBe(first);
        // A sweep finds nothing the observer has not seen, yet the passing revision no longer describes the disk.
        const swept = await sweep();
        if (swept.status !== 'revised') throw new Error(`Expected a revision: ${JSON.stringify(swept)}`);
        expect([swept.identical, swept.revision.sequence, swept.revision.outcome]).toEqual([false, first.sequence + 1, failed]);
        expect(located(swept.revision.diagnostics)).toEqual([['project-boundary-import', 'src/uses-check.ts', 1]]);
        await equalToBatch(handle, inputs);
        expect(await sweep()).toMatchObject({ status: 'unchanged' });

        // A manifest makes the project invalid; its silent removal is found by the next sweep.
        await write('notes/package.json', '{"name":"notes"}\n');
        const manifest = await handle.update([{ path: 'notes/package.json', kind: 'created' }]);
        expect(manifest).toMatchObject({ status: 'revised', identical: false, revision: { outcome: invalid } });
        await remove('notes/package.json');
        const repaired = await sweep();
        if (repaired.status !== 'revised') throw new Error(`Expected a revision: ${JSON.stringify(repaired)}`);
        expect([repaired.identical, repaired.revision.outcome]).toEqual([false, failed]);
        expect(located(repaired.revision.diagnostics)).toEqual([['project-boundary-import', 'src/uses-check.ts', 1]]);
        await equalToBatch(handle, inputs);

        // While invalid, a file the invalid acquisition inventoried disappears silently: the sweep publishes the
        // invalid revision of the current disk, and a further sweep finds nothing.
        await write('module.ramify', rootDescription(['owned-ignored "fixture-project"', 'owned-ignored "fixture-project/src"', 'owned-ignored "scripts"',
          'external "external-project"']));
        expect(await handle.update([{ path: 'module.ramify', kind: 'changed' }])).toMatchObject({ status: 'revised', revision: { outcome: invalid } });
        await write('subs/loose.ts', 'export const loose: number = 1;\n');
        expect(await handle.update([{ path: 'subs/loose.ts', kind: 'created' }])).toMatchObject({ status: 'revised', identical: false });
        expect((await handle.report())!.snapshot!.inventory.files.some(file => file.path === 'subs/loose.ts')).toBe(true);
        await remove('subs/loose.ts');
        const invalidSwept = await sweep();
        expect(invalidSwept).toMatchObject({ status: 'revised', identical: false, revision: { outcome: invalid } });
        expect((await equalToBatch(handle, inputs)).snapshot!.inventory.files.some(file => file.path === 'subs/loose.ts')).toBe(false);
        expect(await sweep()).toMatchObject({ status: 'unchanged' });
      } finally { await handle.dispose(); }
    }), timeout);

  it.each(['hot', 'warm'] as const)('cancels a structural update after observation without publishing, then publishes the batch result (%s)', level =>
    project(async ({ inputs, write }) => {
      const { handle, state, revision: first } = await opened(inputs);
      try {
        if (level === 'warm') await handle.releaseCompiler();
        const observer = instrumentObserver(state);
        const controller = new AbortController();
        observer.apply.mockImplementationOnce(async (changes, signal) => {
          const update = await observer.observer.apply(changes, signal);
          controller.abort();
          return update;
        });
        await write('module.ramify', rootDescription(['owned-ignored "fixture-project"', 'owned-ignored "scripts"', 'external "external-project"']));
        expect(await handle.update([{ path: 'module.ramify', kind: 'changed' }], { signal: controller.signal })).toEqual({ status: 'cancelled' });
        expect(handle.current).toBe(first);
        expect(observer.apply).toHaveBeenCalledTimes(1);
        // The observer already holds the new capture; the next update, naming nothing, recomputes it from the disk.
        const next = await handle.update([]);
        if (next.status !== 'revised') throw new Error(`Expected a revision: ${JSON.stringify(next)}`);
        expect([next.identical, next.revision.sequence, next.revision.checked.path]).toEqual([false, first.sequence + 1, 'broad']);
        expect(located(next.revision.diagnostics)).toEqual([['project-boundary-import', 'src/uses-check.ts', 1]]);
        await equalToBatch(handle, inputs);
        await audited(handle);
        // A request cancelled before it starts changes nothing.
        const aborted = new AbortController(); aborted.abort();
        await write('module.ramify', rootDescription());
        expect(await handle.update([{ path: 'module.ramify', kind: 'changed' }], { signal: aborted.signal })).toEqual({ status: 'cancelled' });
        expect(handle.current).toBe(next.revision);
        const reincluded = await handle.update([{ path: 'module.ramify', kind: 'changed' }]);
        expect(reincluded).toMatchObject({ status: 'revised', identical: false, revision: { sequence: first.sequence + 2, diagnostics: [] } });
        await equalToBatch(handle, inputs);
      } finally { await handle.dispose(); }
    }), timeout);

  it('reports a reinclusion past the application byte bound as incomplete, keeps the last revision unchanged and recovers', () => {
    // 64 KiB of auxiliary source inside an owned-ignored tree, under a 48 KiB application bound the rest of the topology stays well below.
    const big = `export const big: string = '${'x'.repeat(64 * 1024)}';\n`;
    const files = { ...topology, 'module.ramify': rootDescription(['owned-ignored "data"', 'owned-ignored "fixture-project"', 'external "external-project"']),
      'data/big.ts': big };
    return project(async ({ inputs, write }) => {
      const { handle, revision: first } = await opened(inputs);
      try {
        expect(first.outcome).toEqual(passed);
        await write('module.ramify', rootDescription());
        const bounded = await handle.update([{ path: 'module.ramify', kind: 'changed' }]);
        if (bounded.status !== 'reported') throw new Error(`Expected a reported outcome: ${JSON.stringify(bounded)}`);
        expect(bounded.report.outcome.execution).toBe('incomplete');
        expect(bounded.report.diagnostics.map(item => item.code)).toEqual(['resource-limit']);
        expect(handle.current).toBe(first);
        // A batch run of the same disk state is incomplete for the same reason.
        const { session: _session, ...request } = inputs;
        const fresh = await analyzeProject(request);
        if (fresh.status !== 'reported') throw new Error('Expected a batch report');
        expect([fresh.report.outcome.execution, fresh.report.diagnostics.map(item => item.code)]).toEqual(['incomplete', ['resource-limit']]);
        await write('module.ramify', files['module.ramify']);
        const recovered = await handle.update([{ path: 'module.ramify', kind: 'changed' }]);
        expect(recovered).toMatchObject({ status: 'revised', identical: false, revision: { sequence: first.sequence + 1, outcome: passed } });
        await equalToBatch(handle, inputs);
        await audited(handle);
      } finally { await handle.dispose(); }
    }, files, 48 * 1024);
  }, timeout);

  it('keeps one live compiler across structural and warm updates and leaves none after cancellation and disposal', () => project(async ({ inputs, write }) => {
    const spawned: ChildProcess[] = [];
    const record = (message: unknown): void => { spawned.push((message as { process: ChildProcess }).process); };
    const live = (): number => spawned.filter(child => child.exitCode === null && child.signalCode === null).length;
    const settled = async (count: number): Promise<void> => {
      const limit = Date.now() + 10_000;
      while (live() !== count && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 10));
      expect(live()).toBe(count);
    };
    subscribe('child_process', record);
    try {
      const { handle, state } = await opened(inputs);
      try {
        await settled(1);
        const firstServer = spawned.length;
        // A new child module changes the source areas: the compiler is recreated and the previous one stopped.
        await write('subs/c/module.ramify', 'ramify 1\nmodule c\n');
        await write('subs/c/src/c.ts', 'export const c: number = 1;\n');
        const added = await handle.update([{ path: 'subs/c', kind: 'created' }]);
        expect(added).toMatchObject({ status: 'revised', identical: false, reacquired: true });
        expect(spawned.length).toBeGreaterThan(firstServer);
        await settled(1);
        await handle.releaseCompiler();
        await settled(0);
        await write('module.ramify', rootDescription(['owned-ignored "fixture-project"', 'owned-ignored "scripts"', 'external "external-project"']));
        const warm = await handle.update([{ path: 'module.ramify', kind: 'changed' }]);
        expect(warm).toMatchObject({ status: 'revised', identical: false, revision: { checked: { path: 'broad' } } });
        await settled(1);
        const observer = instrumentObserver(state);
        const controller = new AbortController();
        observer.apply.mockImplementationOnce(async (changes, signal) => {
          const update = await observer.observer.apply(changes, signal);
          controller.abort();
          return update;
        });
        await write('module.ramify', rootDescription());
        expect(await handle.update([{ path: 'module.ramify', kind: 'changed' }], { signal: controller.signal })).toEqual({ status: 'cancelled' });
        await settled(1);
      } finally { await handle.dispose(); }
      await settled(0);
    } finally { unsubscribe('child_process', record); }
  }), timeout);
});
