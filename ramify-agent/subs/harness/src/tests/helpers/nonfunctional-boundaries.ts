import { expect } from 'vitest';
import type { AffectedDocument } from 'ramify.ts/cli';
import type { ProvisionalSourceGit } from '../../../subs/evidence/src/provisional-git.js';
import type { RunInputs } from '../../run/inputs.js';
import { mockGit } from './mock-git.js';
import { scriptedCandidates } from './candidates.js';
import { mappedAudit } from './direct-check-execution.js';
import { FakeRamifyCli } from './fake-ramify.js';
import { shapeOnlyInputs, testPolicy } from './runs.js';
import { completionCheckDeadlineMs } from '../../hooks/post-write.js';

const initial = 'a'.repeat(40), committed = 'b'.repeat(40);
const trees = { initial: '1'.repeat(40), repaired: '2'.repeat(40), drift: '3'.repeat(40) };
const modules = [
  {
    "id": "collection-review",
    "parent": null,
    "directory": ".",
    "tags": [
      "dispatch"
    ]
  },
  {
    "id": "collection-review/integration-tests",
    "parent": "collection-review",
    "directory": "subs/integration-tests",
    "tags": [
      "testing",
      "dispatch"
    ]
  },
  {
    "id": "collection-review/workspace",
    "parent": "collection-review",
    "directory": "subs/workspace",
    "tags": [
      "ui",
      "browser",
      "dispatch"
    ]
  },
  {
    "id": "collection-review/workspace/catalog",
    "parent": "collection-review/workspace",
    "directory": "subs/workspace/subs/catalog",
    "tags": [
      "dispatch"
    ]
  },
  {
    "id": "collection-review/workspace/contracts",
    "parent": "collection-review/workspace",
    "directory": "subs/workspace/subs/contracts",
    "tags": []
  },
  {
    "id": "collection-review/workspace/reviews",
    "parent": "collection-review/workspace",
    "directory": "subs/workspace/subs/reviews",
    "tags": [
      "dispatch"
    ]
  },
  {
    "id": "collection-review/workspace/shared-ui",
    "parent": "collection-review/workspace",
    "directory": "subs/workspace/subs/shared-ui",
    "tags": [
      "ui",
      "browser"
    ]
  },
  {
    "id": "collection-review/workspace/catalog/core",
    "parent": "collection-review/workspace/catalog",
    "directory": "subs/workspace/subs/catalog/subs/core",
    "tags": []
  },
  {
    "id": "collection-review/workspace/catalog/ui",
    "parent": "collection-review/workspace/catalog",
    "directory": "subs/workspace/subs/catalog/subs/ui",
    "tags": [
      "ui",
      "browser"
    ]
  },
  {
    "id": "collection-review/workspace/reviews/core",
    "parent": "collection-review/workspace/reviews",
    "directory": "subs/workspace/subs/reviews/subs/core",
    "tags": []
  },
  {
    "id": "collection-review/workspace/reviews/ui",
    "parent": "collection-review/workspace/reviews",
    "directory": "subs/workspace/subs/reviews/subs/ui",
    "tags": [
      "ui",
      "browser",
      "dispatch"
    ]
  },
  {
    "id": "collection-review/workspace/reviews/validation",
    "parent": "collection-review/workspace/reviews",
    "directory": "subs/workspace/subs/reviews/subs/validation",
    "tags": []
  },
  {
    "id": "collection-review/workspace/reviews/core/controller",
    "parent": "collection-review/workspace/reviews/core",
    "directory": "subs/workspace/subs/reviews/subs/core/subs/controller",
    "tags": []
  },
  {
    "id": "collection-review/workspace/reviews/core/tasks",
    "parent": "collection-review/workspace/reviews/core",
    "directory": "subs/workspace/subs/reviews/subs/core/subs/tasks",
    "tags": []
  },
  {
    "id": "collection-review/workspace/reviews/ui/pure-ui",
    "parent": "collection-review/workspace/reviews/ui",
    "directory": "subs/workspace/subs/reviews/subs/ui/subs/pure-ui",
    "tags": [
      "ui",
      "browser"
    ]
  }
] as const;
const core = 'subs/workspace/subs/reviews/subs/core/src/';
const oneRepair = { [core + 'repair-recovery.ts']: 'export const auditRecord = true;\n' };
const twoRepair = { [core + 'nonfunctional-repair.ts']: 'export const auditRecord = true;\n',
  'subs/workspace/subs/catalog/src/nonfunctional-repair.ts': 'export const catalogAuditRecord = true;\n' };
const driftPaths = ['downtime-mutation.ts', 'late-source.ts', 'late-after-round-three.ts', 'changed-after-exhaustion.ts'];
const scratch = modules.map(module => (module.directory === '.' ? '' : module.directory + '/') + 'src/tmp');
const owners: Readonly<Record<string, string>> = {
  ...Object.fromEntries(modules.flatMap(module => [[module.directory, module.id]])),
  [core + 'repair-recovery.ts']: 'collection-review/workspace/reviews/core',
  [core + 'nonfunctional-repair.ts']: 'collection-review/workspace/reviews/core',
  'subs/workspace/subs/catalog/src/nonfunctional-repair.ts': 'collection-review/workspace/catalog',
};
export interface NfrScript {
  readonly repair?: 'one-module' | 'two-modules';
  readonly repaired?: boolean;
  readonly final?: boolean;
  readonly finalLookup?: boolean;
  readonly lookups?: 1 | 2;
  readonly commits?: 0 | 1 | 2;
  readonly finalGateFails?: boolean | undefined;
}

/** Literal external facts. Reads are repeatable, mutations are single-use; scenario edits advance explicit states.
 * No response reads the fixture filesystem, computes a Git tree, or infers a commit from changed bytes. */
export function nfrBoundaries(root: string, script: NfrScript = {}) {
  let stage: keyof typeof trees = 'initial', head = initial, runId: string | undefined;
  let driftPath: string | undefined;
  const failures: string[] = [], calls: string[] = [], consumed = new Map<string, number>();
  const repairedFiles = script.repair === 'two-modules' ? twoRepair : oneRepair;
  const edits = Object.keys(repairedFiles).map(path => ({ path, status: 'A' }));
  const worktreeEdits = Object.keys(repairedFiles).map(path => ({ path, status: '??' }));
  const final = script.final ?? true;
  const finalHead = script.repair ? committed : initial;
  function once(operation: string) { expect(consumed.get(operation) ?? 0, `exhausted ${operation} answer`).toBe(0); consumed.set(operation, 1); calls.push(operation); }
  function retain<T extends object>(port: T): T {
    return new Proxy(port, { get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => { try { return await value.apply(target, args); }
        catch (error) { failures.push(`${String(key)}: ${String(error)}`); throw error; } };
    } });
  }
  function pending(base: string) {
    expect(base).toBe(head);
    return stage === 'drift' ? [{ path: driftPath!, status: '??' }]
      : stage === 'repaired' && head === initial ? worktreeEdits : [];
  }
  const git = mockGit({
    async currentHead(project) { expect(project).toBe(root); calls.push('head'); return head; },
    async isCleanRepository(project) { expect(project).toBe(root); expect(stage).toBe('initial'); return true; },
    async createRunBranch(project, id) { expect(project).toBe(root); expect(id).toMatch(/^\d{8}T\d{6}Z-[0-9a-f]{6}$/u); expect(runId ?? id).toBe(id); runId = id; once('branch'); return { branch: `ramify-agent-run/${id}`, created: true }; },
    async trackedPaths(project, paths) { expect(project).toBe(root); expect(paths.every(path => scratch.includes(path))).toBe(true); return []; },
    async ignoreStatus(project, paths) { expect(project).toBe(root); expect(paths.every(path => scratch.some(directory => path.startsWith(directory + '/')))).toBe(true); return paths.map(path => ({ path, ignored: true, rule: { source: '.gitignore', line: 3, pattern: '**/src/tmp/' } })); },
    async previewCandidateTree(project) { expect(project).toBe(root); calls.push('preview'); return { repositoryRoot: root, head, tree: trees[stage] }; },
    async changedPaths(project, base = 'HEAD') { expect(project).toBe(root); return pending(base).map(change => change.path); },
    async changedEntries(project, base = 'HEAD') { expect(project).toBe(root); return pending(base); },
    async worktreeLineChanges(project, base = 'HEAD') { expect(project).toBe(root); pending(base); throw new Error('NFR fixture explicitly declares line measurements unavailable'); },
    async worktreePatch(project, base = 'HEAD') { expect(project).toBe(root); pending(base); throw new Error('NFR fixture explicitly declares patch measurements unavailable'); },
    async findCommitByTrailers(project, trailers) { expect(project).toBe(root); expect(trailers).toEqual([{ key: 'Ramify-Run', value: runId }, { key: 'Ramify-Gate', value: 'ga-0002' }]); const count = consumed.get('lookup') ?? 0; expect(count, 'exhausted lookup answer').toBeLessThan(script.lookups ?? 1); consumed.set('lookup', count + 1); calls.push('lookup'); return null; },
    async commitAccepted(project, message) { expect(project).toBe(root); expect(message).toContain(`Ramify-Run: ${runId}`); expect(message).toContain('Ramify-Gate: ga-0002'); expect(consumed.get('lookup')).toBeGreaterThan(0); const count = consumed.get('commit') ?? 0; expect(count, 'exhausted commit answer').toBeLessThan(script.commits ?? (final ? 1 : 0)); consumed.set('commit', count + 1); calls.push('commit'); head = finalHead; return script.repair ? committed : null; },
    async diffNameStatus(project, from, to) { expect(project).toBe(root); expect(from).toBe(initial); expect([initial, committed, trees.initial, trees.repaired]).toContain(to); return to === committed || to === trees.repaired ? edits : []; },
  });
  const candidates = retain(scriptedCandidates(root, {
    [initial]: { tree: trees.initial, files: {}, base: initial, changes: [] },
    [committed]: { tree: trees.repaired, files: repairedFiles, base: initial, changes: edits },
  }));
  // NFR lifecycle capture uses real guarded-file snapshots, not suspended-capability source capture.
  // Both provisional operations are deliberately undeclared, so future bypasses cannot silently pass.
  const provisionalSourceGit = retain<ProvisionalSourceGit>({
    async stagedPaths(): Promise<never> { throw new Error('NFR script declares no provisional index read'); },
    async readBlob(): Promise<never> { throw new Error('NFR script declares no provisional source-byte read'); },
  });
  const auditChecks: string[] = [];
  const auditAnswers = mappedAudit(({ check, context }) => {
    expect(context.projectRoot).toBe(root); expect(context.sourceCommit).toBe(finalHead); expect(context.checkpoint).toBe('final');
    expect(['tests', 'type-check', 'ramify-check']).toContain(check.kind); auditChecks.push(check.kind);
    return { stdout: 'Synthetic NFR harness-policy evidence; no provider publication claim',
      ...(script.finalGateFails && check.kind === 'tests' ? { outcome: { kind: 'completed' as const, exitCode: 1 } } : {}) };
  }, { scenarios: false });
  const audit = retain({ ...auditAnswers,
    async read(project: string, commit: string) { expect(project).toBe(root); expect([initial, finalHead]).toContain(commit); return auditAnswers.read(project, commit); },
    async run(input: Parameters<typeof auditAnswers.run>[0]) {
      expect(input.projectRoot).toBe(root); expect(input.mode).toBe('full'); expect(input.nested).toBe(true);
      // Validate the committed gate checkpoint itself rather than interpreting its numeric identity.
      if (input.attemptId === 'ga-0001') { expect(input.sourceCommit).toBe(initial); expect(runId ?? input.runId).toBe(input.runId); runId = input.runId; once('readiness-audit'); }
      else { expect(input.attemptId).toBe('ga-0002'); expect(input.runId).toBe(runId); expect(input.sourceCommit).toBe(finalHead); once('final-audit'); }
      const result = await auditAnswers.run(input);
      if (input.attemptId === 'ga-0002') await answer.afterFinalAudit?.();
      return result;
    },
  });
  class NfrRamify extends FakeRamifyCli {
    override async run(argv: readonly string[], cwd: string, signal?: AbortSignal) {
      expect(cwd).toBe(root); expect(['--version', 'measure', 'check']).toContain(argv[0]);
      if (argv[0] === '--version') expect(argv).toEqual(['--version']);
      if (argv[0] === 'measure') expect(argv).toEqual(['measure', '--root', root, '--format', 'json']);
      if (argv[0] === 'check') {
        expect(argv.slice(0, 2)).toEqual(['check', '--changed']); const format = argv.indexOf('--format'); expect(format).toBeGreaterThan(2);
        for (const path of argv.slice(2, format)) expect(Object.hasOwn(owners, path), `unstated hook path ${path}`).toBe(true);
        expect(argv.slice(format, -1)).toEqual(['--format', 'json', '--deadline']);
        expect([String(testPolicy(root).commands.hookTimeoutMs), String(completionCheckDeadlineMs)]).toContain(argv.at(-1));
      }
      return super.run(argv, cwd, signal);
    }
    override async materialize(): Promise<never> { throw new Error('NFR shape-only inputs declare no materialization request'); }
    override async queryOwnership(project: string, paths: readonly string[] = ['.']): Promise<AffectedDocument> {
      expect(project).toBe(root);
      const seeds = paths.map(path => { expect(Object.hasOwn(owners, path), `unstated ownership path ${path}`).toBe(true); return { path, status: 'owned', module: owners[path], basis: 'containment', exclusion: null, kind: 'inert', selects: [] }; });
      return { schemaVersion: 'ramify.affected-cli/4', root, mode: 'batch', ramifyVersion: 'scripted-NFR-only', revision: { sequence: null, inputId: 'scripted-NFR' }, selection: { schemaVersion: 'ramify.affected/4', inputId: 'scripted-NFR', paths: seeds, scope: { root, selection: 'given', configuration: 'tsconfig.json', invokedFrom: root, walkedAreas: [], ownership: { modules: modules.map(({ id, parent, directory }) => ({ id, parent, directory })), exclusions: [] } }, changedModules: [], affectedModules: [], testModules: [], selection: 'dependency-closure', widening: [], coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed' } } as unknown as AffectedDocument;
    }
    override async stopDaemon(): Promise<void> { throw new Error('NFR script declares no daemon'); }
  }
  const ramify = retain(new NfrRamify());
  const index = { revision: 'scripted-NFR/1', input: 'scripted-NFR/1', symbols: new Map(), modules: new Map(modules.map(module => [module.id, {
    module: module.id, dir: module.directory === '.' ? '' : module.directory, parent: module.parent,
    children: modules.filter(child => child.parent === module.id).map(child => child.id), tags: module.tags, areas: ['src', 'src/tests'],
  }])) };
  const inputs: RunInputs = retain({ ...shapeOnlyInputs,
    async capture(project, plan, packages) { expect(project).toBe(root); once('capture'); return shapeOnlyInputs.capture(project, plan, packages); },
    async index(project) { expect(project).toBe(root); calls.push('index'); return index; },
    async refresh(project) { expect(project).toBe(root); calls.push('refresh'); return index; },
  });
  const answer = {
    options: { git, candidates, provisionalSourceGit, ramify, inputs, configuredAudit: audit, scratchGit: 'provided' as const },
    afterFinalAudit: undefined as undefined | (() => Promise<void>), calls,
    repair() { expect(script.repair).toBeDefined(); expect(stage).toBe('initial'); stage = 'repaired'; once('repair'); },
    drift(path: string) { expect(driftPaths).toContain(path); expect(stage).not.toBe('drift'); driftPath = path; stage = 'drift'; once('drift'); },
    assertAnswered() { expect(git.unexpected, `caught Git failures: ${JSON.stringify(git.unexpected)}`).toEqual([]); expect(failures, `caught external failures: ${JSON.stringify(failures)}`).toEqual([]); },
    assertComplete() {
      this.assertAnswered();
      for (const operation of ['capture', 'branch', 'readiness-audit', ...(final ? ['final-audit'] : [])]) expect(consumed.get(operation), `required ${operation} answer consumed exactly once`).toBe(1);
      expect(consumed.get('lookup') ?? 0, 'required lookup answers consumed').toBe(final || script.finalLookup ? script.lookups ?? 1 : 0);
      expect(consumed.get('commit') ?? 0, 'required commit responses consumed').toBe(script.commits ?? (final ? 1 : 0));
      expect(consumed.get('final-audit') ?? 0).toBe(final ? 1 : 0);
      if (script.repair) expect(consumed.get('repair') ?? 0).toBe((script.repaired ?? true) ? 1 : 0);
      expect(auditChecks).toEqual(final ? ['tests', 'type-check', 'ramify-check'] : []);
      expect(auditAnswers.requests).toHaveLength(final ? 2 : 1); auditAnswers.assertComplete();
      for (const operation of ['--version', 'measure']) expect(ramify.calls.some(call => call.operation === 'run' && call.argv[0] === operation), `required ${operation}`).toBe(true);
      expect(calls).toContain('preview');
      expect(calls, 'required captured index read').toContain('index');
      expect(calls, 'required head read').toContain('head');
      if (final) expect(candidates.calls.some(call => call.startsWith('commitTree ')), 'required frozen committed tree read').toBe(true);
      if (script.repair) expect(calls, 'repair refreshes declared topology').toContain('refresh');
    },
  };
  return answer;
}
