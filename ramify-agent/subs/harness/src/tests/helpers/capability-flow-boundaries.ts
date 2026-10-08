import type { AffectedDocument } from 'ramify.ts/cli';
import { expect } from 'vitest';
import type { Script } from '../../../subs/agent/src/scripted.js';
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
const trees = { initial: '1'.repeat(40), a: '2'.repeat(40), b: '3'.repeat(40), d: '4'.repeat(40), p: '5'.repeat(40), integrated: '6'.repeat(40), partial: '7'.repeat(40), root: '8'.repeat(40), unreadable: '9'.repeat(40) };
export type FlowMode = 'delegation' | 'assignment' | 'partial' | 'boundary' | 'consultation' | 'report' | 'existing' | 'unreadable' | 'policy' | 'scratch';
export const flowInitialHead = initial;
const commits = { b: 'c'.repeat(40), d: 'd'.repeat(40), p: 'e'.repeat(40), integrated: 'f'.repeat(40), root: '0'.repeat(40) };
const callerChanges = [{ path: 'subs/a/src/caller.ts', status: 'M' }, { path: 'subs/a/src/extra.ts', status: 'A' }, { path: 'subs/a/src/tests/caller.test.ts', status: 'M' }];
type Stage = keyof typeof trees;
const changes = {
  initial: [],
  a: callerChanges,
  b: [...callerChanges, { path: 'subs/b/src/fact.ts', status: 'M' }],
  d: [{ path: 'subs/d/module.ramify', status: 'M' }, { path: 'subs/d/src/consumer.ts', status: 'M' }],
  p: [{ path: 'module.ramify', status: 'M' }, { path: 'subs/b/src/companion.ts', status: 'A' }],
  integrated: [{ path: 'subs/a/src/caller.ts', status: 'M' }],
  partial: [...callerChanges],
  root: [{ path: 'src/tests/stale.test.ts', status: 'M' }],
  unreadable: [{ path: 'subs/a/src', status: 'M' }],
};
const features = [
  { path: 'subs/a/src/tests/features/need/richer-a-fact.feature', status: 'A' },
  { path: 'subs/b/src/tests/features/need/b-entry.feature', status: 'A' },
];
const modules = [
  { id: 'capability-coordination', parent: null, directory: '.' },
  ...['a', 'b', 'd'].map(name => ({ id: `capability-coordination/${name}`, parent: 'capability-coordination', directory: `subs/${name}` })),
];
const scratchDirectories = ['src/tmp', 'subs/a/src/tmp', 'subs/b/src/tmp', 'subs/d/src/tmp'];
const owners: Readonly<Record<string, string>> = {
  'src/assembly.ts': 'capability-coordination',
  '.': 'capability-coordination', 'subs/a': 'capability-coordination/a', 'subs/b': 'capability-coordination/b', 'subs/d': 'capability-coordination/d',
  'subs/a/src/.gitignore': 'capability-coordination/a', 'subs/a/src/tmp/draft.txt': 'capability-coordination/a', 'subs/a/src/extra.ts': 'capability-coordination/a', 'subs/b/src/companion.ts': 'capability-coordination/b', 'module.ramify': 'capability-coordination', 'src/tests/stale.test.ts': 'capability-coordination', 'subs/d/module.ramify': 'capability-coordination/d',
  'subs/a/src/caller.ts': 'capability-coordination/a', 'subs/b/src/fact.ts': 'capability-coordination/b',
  'subs/a/src/tests/caller.test.ts': 'capability-coordination/a', 'subs/b/src/tests/fact.test.ts': 'capability-coordination/b',
  'subs/d/src/consumer.ts': 'capability-coordination/d', 'subs/d/src/tests/consumer.test.ts': 'capability-coordination/d',
  'subs/a/src/tests/features/need/a-reads-b.feature': 'capability-coordination/a',
  'subs/a/src/tests/features/need/richer-a-fact.feature': 'capability-coordination/a',
  'subs/b/src/tests/features/need/b-entry.feature': 'capability-coordination/b',
};

/** Version, measure, materialization, ownership, hook and frozen candidate reads are explicitly repeatable.
 * Branch creation, scenario publication, gate lookup and gate commit answers are one-shot.
 * Each flow names its edited source states explicitly when its scripted engineer starts.
 * The scratch script names its unsafe and repaired states before those exact tool writes.
 * Literal external answers. Only the scenario can advance an edit state; no Git answer is inferred from disk. */
export function capabilityFlowBoundaries(root: string, mode: FlowMode, entries: 'a' | 'a+b' = 'a+b') {
  let stage: Stage = 'initial', head = initial, branch: string | undefined, auditRunId: string | undefined;
  const declaredFeatures = mode === 'existing' ? [{ path: 'subs/a/src/tests/features/need/a-reads-b.feature', status: 'A' }] : entries === 'a' ? features.slice(0, 1) : features;
  const completion = mode === 'assignment' || mode === 'partial';
  const expectedGates = mode === 'assignment' ? ['ga-0002', 'ga-0003', 'ga-0004', 'ga-0005'] : mode === 'partial' ? ['ga-0002'] : [];
  let scratchUnsafe = false;
  const scratchStates: boolean[] = [], preparationReads: string[] = [];
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
  function pending(base: string) { expect(base).toBe(head); return head === initial ? declaredFeatures : head === commits[stage as keyof typeof commits] ? [] : stage === 'a' && ['consultation', 'existing'].includes(mode) ? [] : mode === 'report' && stage === 'a' ? [{ path: 'subs/a/src/caller.ts', status: 'M' }] : mode === 'scratch' && stage === 'a' ? [...callerChanges, { path: 'subs/a/src/.gitignore', status: 'A' }] : changes[stage]; }
  const git = mockGit({
    async trackedPaths(project, paths) { preparationReads.push('trackedPaths'); expect(project).toBe(root); expect(paths.every(path => scratchDirectories.includes(path))).toBe(true); return []; },
    async ignoreStatus(project, paths) { preparationReads.push(`ignoreStatus:${scratchUnsafe ? 'unsafe' : 'safe'}`); expect(project).toBe(root); expect(paths.every(path => scratchDirectories.some(directory => path.startsWith(`${directory}/`)))).toBe(true); return paths.map(path => ({ path, ignored: !scratchUnsafe, rule: { source: scratchUnsafe ? 'subs/a/src/.gitignore' : '.gitignore', line: 3, pattern: scratchUnsafe ? '!tmp/' : '**/src/tmp/' } })); },
    async currentHead(project) { expect(project).toBe(root); return head; },
    async isCleanRepository(project) { expect(project).toBe(root); expect(head).toBe(initial); expect(stage).toBe('initial'); return true; },
    async createRunBranch(project, runId) { expect(project).toBe(root); expect(branch, 'run branch is created once').toBeUndefined(); if (auditRunId !== undefined) expect(runId).toBe(auditRunId); branch = `ramify-agent-run/${runId}`; mutations.push('branch'); return { branch, created: true }; },
    async commitAccepted(project, message) {
      expect(project).toBe(root); expect(message).toContain(`Ramify-Run: ${branch?.slice('ramify-agent-run/'.length)}`);
      if (message.includes('Ramify-Scenarios: materialized')) { expect(head).toBe(initial); head = scenarios; mutations.push('scenarios'); return head; }
      const gate = /Ramify-Gate: (ga-\d{4})/u.exec(message)?.[1]; expect(gate).toBe(expectedGates[gateCalls.filter(call => call.startsWith('commit:')).length]);
      expect(gateCalls.at(-1)).toBe(`trailer:${gate}`); expect(completion).toBe(true);
      const next = commits[stage as keyof typeof commits]; expect(next).toBeDefined(); expect(head).not.toBe(next); head = next!; gateCalls.push(`commit:${gate}`); return head;
    },
    async findCommitByTrailers(project, trailers) {
      expect(project).toBe(root); const gate = expectedGates[gateCalls.filter(call => call.startsWith('trailer:')).length]; expect(gate).toBeDefined();
      expect(trailers).toEqual([{ key: 'Ramify-Run', value: branch?.slice('ramify-agent-run/'.length) }, { key: 'Ramify-Gate', value: gate }]); gateCalls.push(`trailer:${gate}`); return null;
    },
    async previewCandidateTree(project) { expect(project).toBe(root); return { repositoryRoot: root, head, tree: trees[stage] }; },
    async changedPaths(project, base = 'HEAD') { expect(project).toBe(root); return pending(base).map(change => change.path); },
    async changedEntries(project, base = 'HEAD') { expect(project).toBe(root); return pending(base); },
    async worktreeLineChanges(project, base = 'HEAD') { expect(project).toBe(root); pending(base); throw new Error('Capability flow fixture explicitly declares line measurements unavailable'); },
    async worktreePatch(project, base = 'HEAD') { expect(project).toBe(root); pending(base); throw new Error('Capability flow fixture explicitly declares patch measurements unavailable'); },
    async diffNameStatus(project, from, to) {
      expect(project).toBe(root); const revisions = [initial, scenarios, ...Object.values(trees), ...Object.values(commits)]; expect(revisions).toContain(from); expect(revisions).toContain(to); if (from === to) return [];
      const declared: Record<string, readonly { path: string; status: string }[]> = {
        [`${trees.initial}..${trees.a}`]: changes.a,
        [`${trees.initial}..${trees.b}`]: changes.b,
        [`${trees.initial}..${trees.partial}`]: changes.partial,
        [`${scenarios}..${commits.b}`]: changes.b,
        [`${commits.b}..${commits.d}`]: changes.d,
        [`${commits.d}..${commits.p}`]: changes.p,
        [`${commits.p}..${commits.integrated}`]: changes.integrated,
        [`${trees.a}..${trees.b}`]: [{ path: 'subs/b/src/fact.ts', status: 'M' }],
        [`${trees.a}..${trees.d}`]: [{ path: 'subs/b/src/fact.ts', status: 'M' }, ...changes.d],
        [`${trees.a}..${trees.p}`]: [{ path: 'subs/b/src/fact.ts', status: 'M' }, ...changes.d, ...changes.p],
        [`${trees.a}..${trees.integrated}`]: [{ path: 'subs/b/src/fact.ts', status: 'M' }, ...changes.d, ...changes.p, ...changes.integrated],
        [`${trees.b}..${trees.d}`]: changes.d,
        [`${trees.d}..${trees.p}`]: changes.p,
        [`${trees.p}..${trees.integrated}`]: changes.integrated,
        [`${trees.partial}..${trees.root}`]: changes.root,
        [`${trees.a}..${trees.partial}`]: [{ path: 'subs/a/src/caller.ts', status: 'M' }],
        [`${scenarios}..${commits.root}`]: [...changes.partial, ...changes.root],
        [`${trees.a}..${trees.root}`]: [{ path: 'subs/a/src/caller.ts', status: 'M' }, ...changes.root],
        [`${trees.a}..${commits.root}`]: [{ path: 'subs/a/src/caller.ts', status: 'M' }, ...changes.root],
        [`${trees.a}..${commits.b}`]: [{ path: 'subs/b/src/fact.ts', status: 'M' }],
        [`${trees.partial}..${commits.root}`]: changes.root,
      };
      expect(declared[`${from}..${to}`], `unstated source diff ${from}..${to}`).toBeDefined(); return [...declared[`${from}..${to}`]!];
    },
  });
  const files = {
    initial: { ...recoveryInitialFiles, ...(mode === 'partial' ? { 'src/tests/stale.test.ts': "expect('old');\n" } : {}) },
    b: { ...recoveryInitialFiles,
      'subs/a/src/caller.ts': "export function renderA(value: string): string { return `Fresh fact: ${value}`; }\n",
      'subs/a/src/extra.ts': "export const sourceHint = 'B';\n",
      'subs/a/src/tests/caller.test.ts': "import { expect, test } from 'vitest';\nimport { renderA } from '../caller.js';\ntest('A renders a fact', () => expect(renderA('old')).toBe('this test still fails'));\n",
      'subs/b/src/fact.ts': "export const readFact = () => 'old from B';\n",
    },
  };
  const dFiles = { ...files.b, 'subs/d/src/consumer.ts': "export const useFact = () => 'old';\n", 'subs/d/module.ramify': 'ramify 1\nmodule d\nexpose-src legacyLabel from "consumer.ts" to parent\n' };
  const pFiles = { ...dFiles, 'module.ramify': 'ramify 1\nroot module capability-coordination\nexpose-sub readFact from b to descendants\nexpose-sub legacyLabel from d to descendants\n', 'subs/b/src/companion.ts': 'export const companion = true;\n' };
  const definitions = {
    [initial]: { tree: trees.initial, files: files.initial, base: initial, changes: [] },
    [scenarios]: { tree: trees.initial, files: files.initial, base: initial, changes: declaredFeatures },
    [commits.b]: { tree: trees.b, files: files.b, base: scenarios, changes: changes.b },
    [commits.d]: { tree: trees.d, files: dFiles, base: commits.b, changes: changes.d },
    [commits.p]: { tree: trees.p, files: pFiles, base: commits.d, changes: changes.p },
    [commits.integrated]: { tree: trees.integrated, files: { ...pFiles, 'subs/a/src/caller.ts': "export const renderA = () => 'old from B';\n" }, base: commits.p, changes: changes.integrated },
    [commits.root]: { tree: trees.root, files: { ...files.b, 'subs/b/src/fact.ts': recoveryInitialFiles['subs/b/src/fact.ts']!, 'subs/a/src/caller.ts': "export const renderA = () => 'readable denial';\n", 'src/tests/stale.test.ts': "expect('readable denial');\n" }, base: scenarios, changes: [...changes.partial, ...changes.root] },
  };
  const candidates = retain<CandidateSource>(scriptedCandidates(root, definitions));
  const provisionalSourceGit = retain<ProvisionalSourceGit>({
    async stagedPaths(project) { expect(project).toBe(root); sourceReads.push('stagedPaths'); return []; },
    async readBlob(project, revision, path) {
      expect(project).toBe(root); expect([scenarios, commits.b, commits.d, commits.p, '']).toContain(revision);
      expect(['subs/a/src/.gitignore', 'subs/b/src/fact.ts', 'src/tests/stale.test.ts', ...callerChanges.map(change => change.path), ...changes.d.map(change => change.path), ...changes.p.map(change => change.path)].filter(path => path !== 'subs/b/src/companion.ts')).toContain(path);
      sourceReads.push(`${revision}:${path}`); const source: Readonly<Record<string, string>> | undefined = revision === scenarios || revision === '' ? files.initial : definitions[revision]?.files; expect(source).toBeDefined(); return source![path] === undefined ? null : Buffer.from(source![path]!);
    },
  });
  const audits = mappedAudit(({ check, context }) => {
    expect(context.projectRoot).toBe(root); expect(Object.keys(definitions)).toContain(context.sourceCommit);
    expect(context.checkpoint).toBe('iteration'); expect(['tests', 'type-check', 'ramify-check']).toContain(check.kind);
    auditChecks.push(check.kind); return { stdout: 'Synthetic harness-policy evidence: capability flow fixture' };
  }, { scenarios: false });
  const configuredAudit = retain({ ...audits,
    async read(project: string, commit: string) { expect(project).toBe(root); expect(Object.keys(definitions)).toContain(commit); return audits.read(project, commit); },
    async run(input: Parameters<typeof audits.run>[0]) { expect(input.projectRoot).toBe(root); if (input.attemptId === 'ga-0001') { expect(input.mode).toBe('full'); expect(input.nested).toBe(true); expect(input.sourceCommit).toBe(initial); expect(auditRunId).toBeUndefined(); auditRunId = input.runId; } else { expect(completion).toBe(true); expect(input.runId).toBe(branch?.slice('ramify-agent-run/'.length)); expect(expectedGates).toContain(input.attemptId); expect(input.sourceCommit).toBe((mode === 'assignment' ? [commits.b, commits.d, commits.p, commits.integrated] : [commits.root])[expectedGates.indexOf(input.attemptId)]); expect(input.mode).toBe('project-default'); expect(input.nested ?? false).toBe(false); } return audits.run(input); },
  });
  class FlowRamify extends FakeRamifyCli {
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
      return { schemaVersion: 'ramify.affected-cli/4', root, mode: 'batch', ramifyVersion: 'scripted-capability-flow-only', revision: { sequence: null, inputId: 'scripted-capability-flow' }, selection: { schemaVersion: 'ramify.affected/4', inputId: 'scripted-capability-flow', paths: seeds, scope: { root, selection: 'given', configuration: 'tsconfig.json', invokedFrom: root, walkedAreas: [], ownership: { modules, exclusions: [] } }, changedModules: [], affectedModules: [], testModules: [], selection: 'dependency-closure', widening: [], coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed' } } as AffectedDocument;
    }
    override async stopDaemon(): Promise<void> { throw new Error('Capability flow fixture declares no daemon to stop'); }
  }
  const ramify = retain(new FlowRamify());
  return {
    script(original: Script): Script {
      let engineers = 0;
      return spec => {
        const steps = typeof original === 'function' ? original(spec) : original;
        if (spec.role === 'engineer' && spec.submission.name !== 'answer_capability_consultation') {
          engineers += 1;
          if (mode === 'assignment') stage = (['a', 'b', 'd', 'p', 'integrated'] as const)[engineers - 1] ?? stage;
          else if (mode === 'partial') stage = (['a', 'partial', 'root'] as const)[engineers - 1] ?? stage;
          else stage = mode === 'consultation' || mode === 'existing' ? 'initial' : 'a';
        }
        if (mode === 'scratch') return steps.flatMap(step => step.kind === 'tool' && (step.tool === 'write' || step.tool === 'edit') && (step.input as { path?: string }).path === '.gitignore'
          ? [{ kind: 'await' as const, until: async () => { scratchUnsafe = step.tool === 'write'; scratchStates.push(scratchUnsafe); } }, step] : [step]);
        return steps;
      };
    },
    options: { git, candidates, provisionalSourceGit, configuredAudit, ramify, scratchGit: 'provided' as const },
    stage(next: Stage) { stage = next; },
    currentHead: () => head,
    assertAnswered() { expect(git.unexpected, `caught Git failures ${JSON.stringify(git.unexpected)}`).toEqual([]); expect(failures, `caught candidate/source/audit/Ramify failures ${JSON.stringify(failures)}`).toEqual([]); },
    assertComplete() {
      expect(git.unexpected, `caught Git failures ${JSON.stringify(git.unexpected)}`).toEqual([]); expect(failures, `caught candidate/source/audit/Ramify failures ${JSON.stringify(failures)}`).toEqual([]);
      expect(mutations).toEqual(mode === 'policy' ? [] : ['branch', 'scenarios']);
      if (mode === 'policy') { expect(sourceReads).toEqual([]); expect(gateCalls).toEqual([]); expect(audits.requests).toEqual([]); expect(ramify.calls).toEqual([]); return; }
      expect(preparationReads).toContain('trackedPaths'); expect(preparationReads).toContain('ignoreStatus:safe');
      expect(scratchStates).toEqual(mode === 'scratch' ? [true, false] : []);
      if (mode === 'scratch') expect(preparationReads).toContain('ignoreStatus:unsafe');
      for (const operation of ['--version', 'measure']) expect(ramify.calls.some(call => call.operation === 'run' && call.argv[0] === operation), `required ${operation} answer consumed`).toBe(true);
      expect(ramify.calls.some(call => call.operation === 'materialize'), 'required unavailable materialization read').toBe(true);
      const sourcePaths = mode === 'consultation' || mode === 'existing' ? [] : mode === 'report' ? ['subs/a/src/caller.ts'] : mode === 'scratch' ? ['subs/a/src/.gitignore', ...callerChanges.map(change => change.path)] : callerChanges.map(change => change.path);
      expect(sourceReads).toEqual(Array.from({ length: 1 }, () => ['stagedPaths', ...sourcePaths.map(path => `${scenarios}:${path}`)]).flat());
      expect(gateCalls).toEqual(expectedGates.flatMap(gate => [`trailer:${gate}`, `commit:${gate}`]));
      expect(auditChecks).toEqual(expectedGates.flatMap(() => ['tests', 'type-check', 'ramify-check']));
      expect(audits.requests).toHaveLength(1 + expectedGates.length); audits.assertComplete();
    },
  };
}
