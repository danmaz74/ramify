import type { AffectedDocument } from 'ramify.ts/cli';
import { expect } from 'vitest';
import type { CandidateSource } from '../../../subs/evidence/src/git.js';
import type { ProvisionalSourceGit } from '../../../subs/evidence/src/provisional-git.js';
import { completionCheckDeadlineMs } from '../../hooks/post-write.js';
import { mockGit } from './mock-git.js';
import { scriptedCandidates } from './candidates.js';
import { mappedAudit } from './direct-check-execution.js';
import { FakeRamifyCli } from './fake-ramify.js';
import { recoveryInitialFiles } from './recovery-files.js';
import { testPolicy } from './runs.js';

const initial = 'a'.repeat(40), scenarios = 'b'.repeat(40);
const trees = { initial: '1'.repeat(40), a: '2'.repeat(40), b: '3'.repeat(40) };
type Stage = keyof typeof trees;
const changes = {
  initial: [],
  a: [{ path: 'subs/a/src/caller.ts', status: 'M' }],
  b: [{ path: 'subs/b/src/fact.ts', status: 'M' }],
};
const features = [
  { path: 'subs/a/src/tests/features/need/a-reads-b.feature', status: 'A' },
  { path: 'subs/b/src/tests/features/need/b-entry.feature', status: 'A' },
];
const modules = [
  { id: 'capability-coordination', parent: null, directory: '.' },
  ...['a', 'b', 'd'].map(name => ({ id: `capability-coordination/${name}`, parent: 'capability-coordination', directory: `subs/${name}` })),
];
const scratchDirectories = ['src/tmp', 'subs/a/src/tmp', 'subs/b/src/tmp', 'subs/d/src/tmp'];
const owners: Readonly<Record<string, string>> = {
  '.': 'capability-coordination', 'subs/a': 'capability-coordination/a', 'subs/b': 'capability-coordination/b', 'subs/d': 'capability-coordination/d',
  'subs/a/src/caller.ts': 'capability-coordination/a', 'subs/b/src/fact.ts': 'capability-coordination/b',
  'subs/a/src/tests/caller.test.ts': 'capability-coordination/a', 'subs/b/src/tests/fact.test.ts': 'capability-coordination/b',
  'subs/d/src/consumer.ts': 'capability-coordination/d', 'subs/d/src/tests/consumer.test.ts': 'capability-coordination/d',
  'subs/a/src/tests/features/need/a-reads-b.feature': 'capability-coordination/a',
  'subs/b/src/tests/features/need/b-entry.feature': 'capability-coordination/b',
};

/** Version, measure, materialization, ownership, hook and frozen candidate reads are explicitly repeatable.
 * Branch creation, scenario publication, trailer lookup and no-change completion answers are one-shot.
 * Literal external answers. Only the scenario can advance an edit state; no Git answer is inferred from disk. */
export function recoveryBoundaries(root: string, entries: 'a' | 'a+b' = 'a+b', completion = false) {
  let stage: Stage = 'initial', head = initial, branch: string | undefined, auditRunId: string | undefined;
  const declaredFeatures = entries === 'a' ? features.slice(0, 1) : features;
  const failures: string[] = [], mutations: string[] = [], sourceReads: string[] = [], gateCalls: string[] = [], auditChecks: string[] = [];
  function retain<T extends object>(port: T): T {
    return new Proxy(port, { get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        try { return await value.apply(target, args); }
        catch (error) { failures.push(`${String(key)}: ${String(error)}`); throw error; }
      };
    } });
  }
  function pending(base: string) { expect(base).toBe(head); return head === initial ? declaredFeatures : changes[stage]; }
  const git = mockGit({
    async trackedPaths(project, paths) { expect(project).toBe(root); expect(paths.every(path => scratchDirectories.includes(path))).toBe(true); return []; },
    async ignoreStatus(project, paths) { expect(project).toBe(root); expect(paths.every(path => scratchDirectories.some(directory => path.startsWith(`${directory}/`)))).toBe(true); return paths.map(path => ({ path, ignored: true, rule: { source: '.gitignore', line: 3, pattern: '**/src/tmp/' } })); },
    async currentHead(project) { expect(project).toBe(root); return head; },
    async isCleanRepository(project) { expect(project).toBe(root); expect(head).toBe(initial); expect(stage).toBe('initial'); return true; },
    async createRunBranch(project, runId) { expect(project).toBe(root); expect(branch, 'run branch is created once').toBeUndefined(); if (auditRunId !== undefined) expect(runId).toBe(auditRunId); branch = `ramify-agent-run/${runId}`; mutations.push('branch'); return { branch, created: true }; },
    async commitAccepted(project, message) { expect(project).toBe(root); if (!message.includes('Ramify-Scenarios: materialized')) { expect(completion).toBe(true); expect(head).toBe(scenarios); expect(stage).toBe('initial'); expect(gateCalls, 'the no-change completion answer is consumed once, after its lookup').toEqual(['trailer']); expect(message).toContain('Ramify-Gate: ga-0002'); expect(message).toContain(`Ramify-Run: ${branch?.slice('ramify-agent-run/'.length)}`); gateCalls.push('commit'); return null; } expect(head).toBe(initial); expect(message).toContain('Ramify-Scenarios: materialized'); expect(message).toContain(`Ramify-Run: ${branch?.slice('ramify-agent-run/'.length)}`); head = scenarios; mutations.push('scenarios'); return head; },
    async findCommitByTrailers(project, trailers) { expect(project).toBe(root); expect(completion).toBe(true); expect(gateCalls, 'the trailer lookup answer is consumed once').toEqual([]); expect(trailers, JSON.stringify(trailers)).toEqual([{ key: 'Ramify-Run', value: branch?.slice('ramify-agent-run/'.length) }, { key: 'Ramify-Gate', value: 'ga-0002' }]); gateCalls.push('trailer'); return null; },
    async previewCandidateTree(project) { expect(project).toBe(root); return { repositoryRoot: root, head, tree: trees[stage] }; },
    async changedPaths(project, base = 'HEAD') { expect(project).toBe(root); return pending(base).map(change => change.path); },
    async changedEntries(project, base = 'HEAD') { expect(project).toBe(root); return pending(base); },
    async worktreeLineChanges(project, base = 'HEAD') { expect(project).toBe(root); pending(base); throw new Error('Recovery fixture explicitly declares line measurements unavailable'); },
    async worktreePatch(project, base = 'HEAD') { expect(project).toBe(root); pending(base); throw new Error('Recovery fixture explicitly declares patch measurements unavailable'); },
    async diffNameStatus(project, from, to) { expect(project).toBe(root); if (from === scenarios) { expect(completion).toBe(true); expect([trees.initial, scenarios], JSON.stringify({ from, to })).toContain(to); return []; } expect(from).toBe(trees.initial); if (to === from) return []; expect([trees.a, trees.b]).toContain(to); return to === trees.a ? changes.a : changes.b; },
  });
  const candidates = retain<CandidateSource>(scriptedCandidates(root, {
    [initial]: { tree: trees.initial, files: recoveryInitialFiles, base: initial, changes: [] },
    [scenarios]: { tree: trees.initial, files: recoveryInitialFiles, base: initial, changes: declaredFeatures },
    [trees.initial]: { tree: trees.initial, files: recoveryInitialFiles, base: scenarios, changes: [] },
  }));
  const provisionalSourceGit = retain<ProvisionalSourceGit>({
    async stagedPaths(project) { expect(project).toBe(root); sourceReads.push('stagedPaths'); return []; },
    async readBlob(project, revision, path) {
      expect(project).toBe(root); expect([scenarios, '']).toContain(revision);
      expect(stage === 'a' ? changes.a.map(change => change.path) : stage === 'b' ? changes.b.map(change => change.path) : []).toContain(path);
      sourceReads.push(`${revision}:${path}`); return Buffer.from(recoveryInitialFiles[path]!);
    },
  });
  const audits = mappedAudit(({ check, context }) => {
    expect(context.projectRoot).toBe(root); expect([initial, ...(completion ? [scenarios, trees.initial] : [])]).toContain(context.sourceCommit);
    expect(context.checkpoint).toBe('iteration'); expect(['tests', 'type-check', 'ramify-check']).toContain(check.kind);
    auditChecks.push(check.kind); return { stdout: 'Synthetic harness-policy evidence: capability recovery fixture' };
  }, { scenarios: false });
  const configuredAudit = retain({ ...audits,
    async read(project: string, commit: string) { expect(project).toBe(root); expect([initial, ...(completion ? [scenarios, trees.initial] : [])]).toContain(commit); return audits.read(project, commit); },
    async run(input: Parameters<typeof audits.run>[0]) { expect(input.projectRoot).toBe(root); if (input.attemptId === 'ga-0001') { expect(input.mode).toBe('full'); expect(input.nested).toBe(true); expect(input.sourceCommit).toBe(initial); expect(auditRunId).toBeUndefined(); auditRunId = input.runId; } else { expect(completion).toBe(true); expect(input.runId).toBe(branch?.slice('ramify-agent-run/'.length)); expect(input.attemptId).toBe('ga-0002'); expect(input.mode).toBe('project-default'); expect(input.nested ?? false).toBe(false); } return audits.run(input); },
  });
  class RecoveryRamify extends FakeRamifyCli {
    override async run(args: readonly string[], cwd: string, signal?: AbortSignal) {
      expect(cwd).toBe(root); expect(['--version', 'measure', 'check']).toContain(args[0]);
      if (args[0] === '--version') expect(args).toEqual(['--version']);
      if (args[0] === 'measure') expect(args).toEqual(['measure', '--root', root, '--format', 'json']);
      if (args[0] === 'check') {
        expect(args.slice(0, 2)).toEqual(['check', '--changed']); const format = args.indexOf('--format'); expect(format).toBeGreaterThan(2);
        for (const path of args.slice(2, format)) expect(Object.hasOwn(owners, path), `unstated hook path ${path}`).toBe(true);
        expect(args.slice(format, -1)).toEqual(['--format', 'json', '--deadline']);
        expect([String(testPolicy(root).commands.hookTimeoutMs), String(completionCheckDeadlineMs)]).toContain(args.at(-1));
      }
      return super.run(args, cwd, signal);
    }
    override async materialize(project: string, from?: string, signal?: AbortSignal) { expect(project).toBe(root); expect(['.', 'subs/a', 'subs/b', 'subs/d']).toContain(from || '.'); return super.materialize(project, from, signal); }
    override async queryOwnership(project: string, paths: readonly string[] = ['.']): Promise<AffectedDocument> {
      expect(project).toBe(root);
      const seeds = paths.map(path => { expect(Object.hasOwn(owners, path), `unstated ownership path ${path}`).toBe(true); return { path, status: 'owned', module: owners[path], basis: 'containment', exclusion: null, kind: 'inert', selects: [] }; });
      return { schemaVersion: 'ramify.affected-cli/4', root, mode: 'batch', ramifyVersion: 'scripted-recovery-only', revision: { sequence: null, inputId: 'scripted-recovery' }, selection: { schemaVersion: 'ramify.affected/4', inputId: 'scripted-recovery', paths: seeds, scope: { root, selection: 'given', configuration: 'tsconfig.json', invokedFrom: root, walkedAreas: [], ownership: { modules, exclusions: [] } }, changedModules: [], affectedModules: [], testModules: [], selection: 'dependency-closure', widening: [], coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed' } } as AffectedDocument;
    }
    override async stopDaemon(): Promise<void> { throw new Error('Recovery fixture declares no daemon to stop'); }
  }
  const ramify = retain(new RecoveryRamify());
  return {
    options: { git, candidates, provisionalSourceGit, configuredAudit, ramify, scratchGit: 'provided' as const },
    stage(next: Stage) { expect(stage).toBe('initial'); stage = next; },
    assertAnswered() { expect(git.unexpected, `caught Git failures ${JSON.stringify(git.unexpected)}`).toEqual([]); expect(failures, `caught candidate/source/audit/Ramify failures ${JSON.stringify(failures)}`).toEqual([]); },
    assertComplete() {
      expect(git.unexpected, `caught Git failures ${JSON.stringify(git.unexpected)}`).toEqual([]); expect(failures, `caught candidate/source/audit/Ramify failures ${JSON.stringify(failures)}`).toEqual([]);
      expect(mutations).toEqual(['branch', 'scenarios']);
      for (const operation of ['--version', 'measure']) expect(ramify.calls.some(call => call.operation === 'run' && call.argv[0] === operation), `required ${operation} answer consumed`).toBe(true);
      expect(ramify.calls.some(call => call.operation === 'materialize'), 'required unavailable materialization read').toBe(true); expect(auditChecks).toEqual(completion ? ['tests', 'type-check', 'ramify-check'] : []); expect(audits.requests).toHaveLength(completion ? 2 : 1); audits.assertComplete();
      expect(sourceReads.filter(read => read === 'stagedPaths')).toHaveLength(1); expect(gateCalls).toEqual(completion ? ['trailer', 'commit'] : []);
      expect(sourceReads.filter(read => read !== 'stagedPaths')).toEqual(stage === 'a' ? [`${scenarios}:subs/a/src/caller.ts`, ':subs/a/src/caller.ts', `${scenarios}:subs/a/src/caller.ts`] : stage === 'b' ? [] : []);
    },
  };
}
