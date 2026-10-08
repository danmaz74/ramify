import { expect } from 'vitest';
import { mockGit } from './mock-git.js';
import { scriptedCandidates, type ScriptedCommit } from './candidates.js';
import { mappedAudit } from './direct-check-execution.js';
import { FakeRamifyCli } from './fake-ramify.js';
import { completionCheckDeadlineMs } from '../../hooks/post-write.js';
import { testPolicy } from './runs.js';
import { dependencyInitialFiles } from './dependency-files.js';
import type { CandidateSource } from '../../../subs/evidence/src/git.js';
import type { ProvisionalSourceGit } from '../../../subs/evidence/src/provisional-git.js';

type Mode = 'decision' | 'scheduling' | 'gate';
type Stage = 'initial' | 'parent' | 'child' | 'integrated';
const initial = 'a'.repeat(40), scenarios = 'b'.repeat(40), childCommit = 'c'.repeat(40), integratedCommit = 'd'.repeat(40);
const trees = { initial: '1'.repeat(40), parent: '2'.repeat(40), child: '3'.repeat(40), integrated: '4'.repeat(40) };
const parentChanges = [{ path: 'subs/b/src/fact.ts', status: 'M' }];
const childChanges = [{ path: 'subs/c/src/source.ts', status: 'M' }, { path: 'subs/c/src/tests/source.test.ts', status: 'M' }];
const integratedChanges = [{ path: 'subs/b/src/fact.ts', status: 'M' }, { path: 'subs/b/src/tests/fact.test.ts', status: 'M' }];
const features = [{ path: 'subs/a/src/tests/features/need/a-reads-b.feature', status: 'A' }, { path: 'subs/b/src/tests/features/need/b-entry.feature', status: 'A' }];

/** Stated external answers for nested dispatch and child gates. Nothing derives Git answers from live files. */
export function dependencyBoundaries(root: string, mode: Mode) {
  let stage: Stage = 'initial', head = initial;
  let branch: string | undefined;
  const failures: string[] = [], commits: string[] = [], sourceCalls: string[] = [], previews: Stage[] = [], auditChecks: string[] = [];
  const gateCommits = new Map<string, string>();
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
  function pending(base: string) {
    expect(base).toBe(head);
    if (head === initial) return features;
    if (mode === 'decision' || stage === 'initial' || head === integratedCommit || mode === 'scheduling' && head === childCommit) return [];
    if (stage === 'parent') return parentChanges;
    if (stage === 'child' && head === childCommit) return [];
    if (stage === 'child') { expect(head).toBe(scenarios); return [...parentChanges, ...childChanges]; }
    expect(stage).toBe('integrated'); expect(head).toBe(childCommit); return integratedChanges;
  }
  const diffs = new Map<string, readonly { path: string; status: string }[]>([
    [`${trees.initial}..${trees.parent}`, parentChanges],
    [`${trees.parent}..${trees.child}`, childChanges],
    [`${trees.child}..${trees.integrated}`, integratedChanges],
    [`${scenarios}..${childCommit}`, mode === 'scheduling' ? parentChanges : [...parentChanges, ...childChanges]],
    [`${childCommit}..${integratedCommit}`, integratedChanges],
    [`${trees.parent}..${integratedCommit}`, [...childChanges, ...integratedChanges]],
  ]);
  function diff(from: string, to: string) {
    if (from === to) return [];
    const answer = diffs.get(`${from}..${to}`);
    if (!answer) { const error = `No nested dependency diff declared: ${from}..${to}`; failures.push(error); throw new Error(error); }
    return [...answer];
  }
  const git = mockGit({
    async trackedPaths(project, directories) { expect(project).toBe(root); expect(directories.every(path => /(?:^|\/)src\/tmp$/u.test(path))).toBe(true); return []; },
    async ignoreStatus(project, paths) { expect(project).toBe(root); expect(paths.every(path => /(?:^|\/)src\/tmp\//u.test(path))).toBe(true); return paths.map(path => ({ path, ignored: true, rule: { source: '.gitignore', line: 3, pattern: '**/src/tmp/' } })); },
    async currentHead(project) { expect(project).toBe(root); return head; },
    async isCleanRepository(project) { expect(project).toBe(root); return true; },
    async createRunBranch(project, runId) { expect(project).toBe(root); const next = `ramify-agent-run/${runId}`; expect(branch ?? next).toBe(next); const created = branch === undefined; branch = next; return { branch, created }; },
    async previewCandidateTree(project) { expect(project).toBe(root); previews.push(stage); return { repositoryRoot: root, head, tree: trees[stage] }; },
    async changedPaths(project, base = 'HEAD') { expect(project).toBe(root); return pending(base).map(change => change.path); },
    async changedEntries(project, base = 'HEAD') { expect(project).toBe(root); return pending(base); },
    async worktreeLineChanges(project, base = 'HEAD') { expect(project).toBe(root); pending(base); throw new Error('Nested fixture explicitly leaves line measurements unavailable'); },
    async worktreePatch(project, base = 'HEAD') { expect(project).toBe(root); pending(base); throw new Error('Nested fixture explicitly leaves worktree patch unavailable'); },
    async diffNameStatus(project, from, to) { expect(project).toBe(root); return diff(from, to); },
    async findCommitByTrailers(project, trailers) {
      expect(project).toBe(root); expect(trailers).toEqual([{ key: 'Ramify-Run', value: branch?.slice('ramify-agent-run/'.length) }, { key: 'Ramify-Gate', value: expect.stringMatching(/^ga-\d{4}$/u) }]);
      expect(mode === 'gate' ? ['ga-0002', 'ga-0003', 'ga-0004', 'ga-0005'] : mode === 'scheduling' ? ['ga-0002'] : [], 'declared trailer lookup gates').toContain(trailers[1]!.value);
      return gateCommits.get(trailers[1]!.value) ?? null;
    },
    async commitAccepted(project, message) {
      expect(project).toBe(root); expect(message).toContain(`Ramify-Run: ${branch?.slice('ramify-agent-run/'.length)}`);
      if (message.includes('Ramify-Scenarios: materialized')) { expect(head).toBe(initial); head = scenarios; commits.push('scenarios'); return head; }
      const gate = /Ramify-Gate: (ga-\d{4})/u.exec(message)?.[1]; expect(gate).toBeDefined();
      if (mode === 'scheduling') { expect(message.startsWith('cap-001.i01:')).toBe(true); expect(head).toBe(scenarios); head = childCommit; commits.push('parent'); gateCommits.set(gate!, head); return head; }
      expect(mode).toBe('gate');
      if (message.startsWith('cap-002.i01:')) { expect(stage).toBe('child'); expect(head).toBe(scenarios); head = childCommit; commits.push('child'); gateCommits.set(gate!, head); return head; }
      if (message.startsWith('cap-002.i02:')) { expect(stage).toBe('integrated'); expect(head).toBe(childCommit); head = integratedCommit; commits.push('integrated'); gateCommits.set(gate!, head); return head; }
      expect(message.startsWith('cap-002\n') || message.startsWith('cap-001.i01:')).toBe(true); expect(head).toBe(integratedCommit); return null;
    },
  });
  const initialFiles = mode === 'gate' ? { ...dependencyInitialFiles,
    'subs/c/src/tests/source.test.ts': "import { expect, test } from 'vitest';\nimport { normalizeSource } from '../source.js';\ntest('C normalizes source', () => expect(normalizeSource(' b ')).toBe('b'));\n",
  } : dependencyInitialFiles;
  const parentFiles = { ...initialFiles, 'subs/b/src/fact.ts': mode === 'scheduling'
    ? "export function readFact(): string { return 'old from C'; }\n"
    : "export function readFact(): string { return 'old'; /* until C normalizes it */ }\n" };
  const childFiles = { ...parentFiles,
    'subs/c/src/source.ts': 'export function normalizeSource(value: string): string { return value.trim().toUpperCase(); }\n',
    'subs/c/src/tests/source.test.ts': "import { expect, test } from 'vitest';\nimport { normalizeSource } from '../source.js';\ntest('C normalizes source', () => expect(normalizeSource(' b ')).toBe('B'));\n",
  };
  const integratedFiles = { ...childFiles,
    'subs/b/src/fact.ts': "import { normalizeSource } from '../../c/src/source.js';\nexport function readFact(): string { return normalizeSource(' b '); }\n",
    'subs/b/src/tests/fact.test.ts': "import { expect, test } from 'vitest';\nimport { readFact } from '../fact.js';\ntest('B uses C normalized source', () => expect(readFact()).toBe('B'));\n",
  };
  const definitions: Record<string, ScriptedCommit> = {
    [initial]: { tree: trees.initial, files: initialFiles, base: initial, changes: [] },
    [scenarios]: { tree: trees.initial, files: initialFiles, base: initial, changes: features },
    [childCommit]: { tree: mode === 'scheduling' ? trees.parent : trees.child, files: mode === 'scheduling' ? parentFiles : childFiles, base: scenarios, changes: mode === 'scheduling' ? parentChanges : [...parentChanges, ...childChanges] },
    [integratedCommit]: { tree: trees.integrated, files: integratedFiles, base: childCommit, changes: integratedChanges },
  };
  const answers = scriptedCandidates(root, definitions);
  const candidates = retain<CandidateSource>({ ...answers,
    async diffNameStatus(project, from, to) { expect(project).toBe(root); return diff(from, to); },
    async diffPatch(project, from, to, path) { expect(project).toBe(root); const definition = definitions[to]; expect(definition).toBeDefined(); if (path !== undefined) expect(diff(from, to).map(change => change.path)).toContain(path); return scriptedCandidates(root, { [to]: { ...definition!, base: from, changes: diff(from, to) } }).diffPatch(project, from, to, path); },
  });
  const sourceGit = retain<ProvisionalSourceGit>({
    async stagedPaths(project) { expect(project).toBe(root); sourceCalls.push('stagedPaths'); return []; },
    async readBlob(project, revision, path) { expect(project).toBe(root); sourceCalls.push(`readBlob ${revision} ${path}`); expect(mode === 'scheduling' ? [scenarios, ''] : [scenarios], JSON.stringify(sourceCalls)).toContain(revision); expect(path).toBe('subs/b/src/fact.ts'); return Buffer.from(initialFiles[path]!); },
  });
  const auditAnswers = mappedAudit(({ check, context }) => {
    expect(['tests', 'type-check', 'ramify-check']).toContain(check.kind);
    expect([initial, childCommit, integratedCommit]).toContain(context.sourceCommit);
    expect(['readiness', 'iteration', 'work-item']).toContain(context.checkpoint);
    auditChecks.push(`${context.checkpoint}:${check.kind}`);
    return { stdout: 'Synthetic harness-policy evidence: nested C gate and B integration fixture' };
  }, { scenarios: false });
  const configuredAudit = retain({ ...auditAnswers,
    async read(project: string, commit: string) { expect(project).toBe(root); expect([initial, childCommit, integratedCommit]).toContain(commit); return auditAnswers.read(project, commit); },
    async run(input: Parameters<typeof auditAnswers.run>[0]) { expect(input.projectRoot).toBe(root); return auditAnswers.run(input); },
  });
  const fixturePaths = new Set([...Object.keys(initialFiles), ...childChanges.map(change => change.path), ...features.map(change => change.path), 'subs/b/src/tmp/parent.txt', 'subs/c/src/tmp/child.txt']);
  const moduleDirectories = new Set(['.', 'subs/a', 'subs/b', 'subs/c', 'subs/d']);
  class DependencyRamify extends FakeRamifyCli {
    override async run(args: readonly string[], cwd: string, signal?: AbortSignal) {
      expect(cwd).toBe(root); expect(['--version', 'measure', 'check']).toContain(args[0]);
      if (args[0] === '--version') expect(args).toEqual(['--version']);
      if (args[0] === 'measure') expect(args).toEqual(['measure', '--root', root, '--format', 'json']);
      if (args[0] === 'check') {
        expect(args.slice(0, 2)).toEqual(['check', '--changed']);
        const format = args.indexOf('--format'); expect(format).toBeGreaterThan(2);
        for (const path of args.slice(2, format)) expect(fixturePaths.has(path), `undeclared hook path ${path}`).toBe(true);
        expect(args.slice(format, -1)).toEqual(['--format', 'json', '--deadline']);
        expect([String(testPolicy(root).commands.hookTimeoutMs), String(completionCheckDeadlineMs)]).toContain(args.at(-1));
      }
      return super.run(args, cwd, signal);
    }
    override async materialize(project: string, from?: string, signal?: AbortSignal) { expect(project).toBe(root); expect(moduleDirectories.has(from || '.')).toBe(true); return super.materialize(project, from, signal); }
    override async queryOwnership(project: string, paths: readonly string[] = ['.']) { expect(project).toBe(root); for (const path of paths) expect(fixturePaths.has(path) || moduleDirectories.has(path), `undeclared ownership path ${path}`).toBe(true); return super.queryOwnership(project, paths); }
  }
  const ramify = retain(new DependencyRamify());
  function assertAnswered() {
    expect(git.unexpected, 'caught Git assertions or unstated operations').toEqual([]);
    expect(failures, 'caught candidate/source/audit/Ramify failures').toEqual([]);
  }
  return { assertAnswered, options: { git, candidates, provisionalSourceGit: sourceGit, configuredAudit, ramify, scratchGit: 'provided' as const },
    stage(next: Stage) { stage = next; },
    assertComplete() {
      assertAnswered();
      expect(commits).toEqual(mode === 'decision' ? ['scenarios'] : mode === 'scheduling' ? ['scenarios', 'parent'] : ['scenarios', 'child', 'integrated']);
      expect(sourceCalls.filter(call => call === 'stagedPaths')).toHaveLength(2);
      expect(sourceCalls.filter(call => call.startsWith('readBlob'))).toEqual(mode === 'decision' ? [] : mode === 'scheduling' ? [`readBlob ${scenarios} subs/b/src/fact.ts`, 'readBlob  subs/b/src/fact.ts', `readBlob ${scenarios} subs/b/src/fact.ts`] : [`readBlob ${scenarios} subs/b/src/fact.ts`]);
      expect(previews).toContain(mode === 'decision' ? 'initial' : 'parent');
      if (mode === 'gate') { expect(previews).toContain('child'); expect(previews).toContain('integrated'); expect(answers.calls).toContain(`treeEntries ${childCommit}`); expect(answers.calls).toContain(`treeEntries ${integratedCommit}`); }
      expect(auditChecks.filter(call => call.startsWith('iteration:'))).toEqual(Array.from({ length: mode === 'decision' ? 0 : mode === 'scheduling' ? 1 : 3 }, () => ['iteration:tests', 'iteration:type-check', 'iteration:ramify-check']).flat());
      expect(auditChecks.filter(call => call.startsWith('work-item:'))).toEqual(mode === 'gate' ? ['work-item:tests', 'work-item:type-check', 'work-item:ramify-check'] : []);
      expect(auditAnswers.requests).toHaveLength(mode === 'decision' ? 1 : mode === 'scheduling' ? 2 : 5);
      expect(ramify.calls.some(call => call.operation === 'run' && call.argv[0] === '--version')).toBe(true);
      auditAnswers.assertComplete();
    },
  };
}
