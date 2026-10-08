import { expect } from 'vitest';
import { mockGit, fixtureScratchGit } from './mock-git.js';
import { scriptedCandidates, type ScriptedCommit } from './candidates.js';
import { mappedAudit } from './direct-check-execution.js';
import { acceptanceInitialFiles } from './acceptance-files.js';
import { completionCheckDeadlineMs } from '../../hooks/post-write.js';
import { testPolicy } from './runs.js';
import { FakeRamifyCli } from './fake-ramify.js';
import { rootDescription } from './root-description.js';
import type { CandidateSource } from '../../../subs/evidence/src/git.js';
import type { ProvisionalSourceGit } from '../../../subs/evidence/src/provisional-git.js';

type Stage = 'initial' | 'suspended' | 'provider' | 'consumer' | 'exposed' | 'integrated' | 'corrected' | 'drift';
const trees: Record<Stage, string> = Object.fromEntries(
  ['initial', 'suspended', 'provider', 'consumer', 'exposed', 'integrated', 'corrected', 'drift'].map((name, index) => [name, String(index + 1).repeat(40)]),
) as Record<Stage, string>;
const initial = 'a'.repeat(40), scenarios = 'b'.repeat(40), integrated = 'c'.repeat(40), corrected = 'd'.repeat(40);
const change = (path: string, status = 'M') => ({ path, status });
const suspendedChanges = [change('subs/a/src/caller.ts'), change('subs/a/src/extra.ts', 'A'), change('subs/a/src/tests/caller.test.ts')];
const providerChanges = [change('subs/b/docs/prior.txt', 'A'), change('subs/b/src/fact.ts'), change('subs/b/src/tests/fact.test.ts')];
const consumerChanges = [change('subs/d/src/consumer.ts')];
const exposedChanges = [change('module.ramify'), change('src/assembly.ts')];
const integratedChanges = [change('subs/a/src/caller.ts'), change('subs/a/src/tests/caller.test.ts')];
const correctedChanges = [change('subs/a/src/tests/caller.test.ts')];
const allChanges = [...suspendedChanges, ...providerChanges, ...consumerChanges, ...exposedChanges].sort((a, b) => a.path.localeCompare(b.path));
const handbackChanges = [...providerChanges, ...consumerChanges, ...exposedChanges, ...integratedChanges].sort((a, b) => a.path.localeCompare(b.path));

/** Explicit external answers for this multi-owner workflow, never inferred from live source. */
export function acceptanceBoundaries(root: string, mode: string) {
  let state: Stage = 'initial';
  let head = initial;
  let branch: string | undefined;
  const usedStages = new Set<Stage>();
  const failures: string[] = [];
  const sourceCalls: string[] = [];
  const candidateCalls: string[] = [];
  const auditChecks: string[] = [];
  function retain<T extends object>(port: T, operations: readonly (keyof T)[]): T {
    return new Proxy(port, { get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (!operations.includes(key as keyof T) || typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        try { return await value.apply(target, args); }
        catch (error) { failures.push(`${String(key)}: ${String(error)}`); throw error; }
      };
    } });
  }
  const commits: string[] = [];
  const gateCommits = new Map<string, string>();
  const diffs = new Map<string, readonly { path: string; status: string }[]>([
    [`${trees.suspended}..${trees.provider}`, providerChanges],
    [`${trees.provider}..${trees.consumer}`, consumerChanges],
    [`${trees.consumer}..${trees.exposed}`, exposedChanges],
    [`${trees.exposed}..${trees.integrated}`, integratedChanges],
    [`${trees.integrated}..${trees.corrected}`, correctedChanges],
    [`${scenarios}..${integrated}`, allChanges],
    [`${integrated}..${corrected}`, correctedChanges],
    [`${trees.suspended}..${corrected}`, handbackChanges],
  ]);
  function pending(base: string) {
    if (head === initial) { expect(base).toBe(initial); return [change('subs/a/src/tests/features/need/richer-a-fact.feature', 'A'), change('subs/b/src/tests/features/need/b-entry.feature', 'A')]; }
    if (state === 'drift') { expect(base).toBe(corrected); return [change('subs/b/src/fact.ts')]; }
    if (state === 'corrected') { expect(base).toBe(head); return head === corrected ? [] : correctedChanges; }
    if (head === integrated) { expect(base).toBe(integrated); return []; }
    expect(base).toBe(scenarios);
    switch (state) {
      case 'initial': return [];
      case 'suspended': return suspendedChanges;
      case 'provider': return [...suspendedChanges, ...providerChanges];
      case 'consumer': return [...suspendedChanges, ...providerChanges, ...consumerChanges];
      case 'exposed': return [...suspendedChanges, ...providerChanges, ...consumerChanges, ...exposedChanges];
      case 'integrated': return allChanges;
    }
  }
  function statedDiff(from: string, to: string) {
    if (from === to) return [];
    const answer = diffs.get(`${from}..${to}`);
    if (answer === undefined) { const error = `No acceptance diff stated for ${from}..${to}`; failures.push(error); throw new Error(error); }
    return [...answer];
  }
  const git = fixtureScratchGit(mockGit({
    async currentHead(project) { expect(project).toBe(root); return head; },
    async isCleanRepository(project) { expect(project).toBe(root); return true; },
    async createRunBranch(project, runId) { expect(project).toBe(root); const next = `ramify-agent-run/${runId}`; const created = branch === undefined; expect(branch ?? next).toBe(next); branch = next; return { branch, created }; },
    async previewCandidateTree(project) { expect(project).toBe(root); usedStages.add(state); return { repositoryRoot: root, head, tree: trees[state] }; },
    async changedPaths(project, base = 'HEAD') { expect(project).toBe(root); return pending(base).map(entry => entry.path); },
    async changedEntries(project, base = 'HEAD') { expect(project).toBe(root); return pending(base); },
    async worktreeLineChanges(project, base = 'HEAD') { expect(project).toBe(root); pending(base); throw new Error('Acceptance fixture explicitly leaves line measurements unavailable'); },
    async worktreePatch(project, base = 'HEAD') { expect(project).toBe(root); pending(base); throw new Error('Acceptance fixture explicitly leaves worktree patch unavailable'); },
    async diffNameStatus(project, from, to) { expect(project).toBe(root); return statedDiff(from, to); },
    async findCommitByTrailers(project, trailers) {
      expect(project).toBe(root); expect(trailers[0]).toEqual({ key: 'Ramify-Run', value: branch?.slice('ramify-agent-run/'.length) });
      expect(trailers[1]?.key).toBe('Ramify-Gate'); expect(trailers[1]?.value).toMatch(/^ga-\d{4}$/u);
      return gateCommits.get(trailers[1]!.value) ?? null;
    },
    async commitAccepted(project, message) {
      expect(project).toBe(root); expect(message).toContain(`Ramify-Run: ${branch?.slice('ramify-agent-run/'.length)}`);
      if (message.includes('Ramify-Scenarios: materialized')) { expect(head).toBe(initial); head = scenarios; commits.push('scenarios'); return head; }
      const gate = /Ramify-Gate: (ga-\d{4})/u.exec(message)?.[1]; expect(gate).toBeDefined();
      if (message.startsWith('cap-001.i04:')) { expect(state).toBe('integrated'); expect(head).toBe(scenarios); head = integrated; commits.push('integrated'); gateCommits.set(gate!, head); return head; }
      if (message.startsWith('cap-001.i05:')) { expect(state).toBe('corrected'); expect(head).toBe(integrated); head = corrected; commits.push('corrected'); gateCommits.set(gate!, head); return head; }
      expect(message.startsWith('cap-001\n') || message.startsWith('wi-001')).toBe(true); expect(head).toBe(corrected); return null;
    },
  }));
  const suspendedFiles = { ...acceptanceInitialFiles,
    'subs/a/src/caller.ts': "export function renderA(value: string): string { return `Fresh fact: ${value}`; }\n",
    'subs/a/src/extra.ts': "export const sourceHint = 'B';\n",
    'subs/a/src/tests/caller.test.ts': acceptanceInitialFiles['subs/a/src/tests/caller.test.ts']!.replace("toBe('Fact: old')", "toBe('unfinished')"),
  };
  const integratedFiles = { ...suspendedFiles,
    'subs/b/docs/prior.txt': 'B-owned prior assignment documentation\n',
    'subs/b/src/fact.ts': "export interface FactResult { text: string; source: string }\nexport const readFact = (): FactResult => ({ text: 'old', source: 'B' });\n",
    'subs/b/src/tests/fact.test.ts': "import { expect, test } from 'vitest';\nimport { readFact } from '../fact.js';\ntest('B returns the independently specified fact', () => expect(readFact()).toEqual({ text: 'old', source: 'B' }));\n",
    'subs/d/src/consumer.ts': "import { readFact } from '../../b/src/fact.js';\nexport function legacyLabel(): string { return readFact().text.toUpperCase(); }\n",
    'module.ramify': rootDescription('capability-coordination', 'expose-sub readFact, FactResult from b to descendants\n'),
    'src/assembly.ts': "import { renderA } from '../subs/a/src/caller.js';\nexport const render = () => renderA();\n",
    'subs/a/src/caller.ts': "import { readFact } from '../../b/src/fact.js';\nexport function renderA(): string { const fact = readFact(); return `Fresh fact: ${fact.text} from ${fact.source}`; }\n",
    'subs/a/src/tests/caller.test.ts': "import { expect, test } from 'vitest';\nimport { renderA } from '../caller.js';\ntest('A renders the source', () => expect(renderA()).toBe(renderA()));\n",
  };
  const correctedFiles = { ...integratedFiles, 'subs/a/src/tests/caller.test.ts': "import { expect, test } from 'vitest';\nimport { renderA } from '../caller.js';\ntest('A renders the source', () => expect(renderA()).toBe('Fresh fact: old from B'));\n" };
  const definitions: Record<string, ScriptedCommit> = {
    [initial]: { tree: trees.initial, files: acceptanceInitialFiles, base: initial, changes: [] },
    [scenarios]: { tree: trees.initial, files: acceptanceInitialFiles, base: initial, changes: [] },
    [trees.suspended]: { tree: trees.suspended, files: suspendedFiles, base: scenarios, changes: suspendedChanges },
    [integrated]: { tree: trees.integrated, files: integratedFiles, base: scenarios, changes: allChanges },
    [corrected]: { tree: trees.corrected, files: correctedFiles, base: integrated, changes: correctedChanges },
  };
  const source = scriptedCandidates(root, definitions);
  const candidateAnswers: CandidateSource = {
    ...source,
    async diffNameStatus(project, from, to) { expect(project).toBe(root); return statedDiff(from, to); },
    async diffPatch(project, from, to, path) {
      const definition = definitions[to]; expect(definition).toBeDefined();
      return scriptedCandidates(root, { [to]: { ...definition!, base: from, changes: statedDiff(from, to) } }).diffPatch(project, from, to, path);
    },
  };
  const candidateOperations = ['commitTree', 'treeEntries', 'readBlob', 'grepTree', 'diffNameStatus', 'diffPatch'] as const;
  const candidates = retain(new Proxy(candidateAnswers, { get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver);
    if (typeof value !== 'function') return value;
    return (...args: unknown[]) => { candidateCalls.push(`${String(key)} ${args.slice(1).join(' ')}`); return value.apply(target, args); };
  } }), candidateOperations);
  const sourceGit = retain<ProvisionalSourceGit>({
    async stagedPaths(project) { sourceCalls.push('stagedPaths'); expect(project).toBe(root); return []; },
    async readBlob(project, revision, path) {
      sourceCalls.push(`readBlob ${revision} ${path}`);
      expect(project).toBe(root); expect([scenarios, corrected]).toContain(revision);
      const files: Readonly<Record<string, string>> = revision === scenarios ? acceptanceInitialFiles : correctedFiles;
      expect([...suspendedChanges.map(entry => entry.path)]).toContain(path);
      return files[path] === undefined ? null : Buffer.from(files[path]!);
    },
  }, ['stagedPaths', 'readBlob']);
  const auditAnswers = mappedAudit(({ check, context }) => {
    auditChecks.push(`${context.checkpoint}:${check.kind}`);
    expect(['tests', 'type-check', 'ramify-check']).toContain(check.kind);
    expect([initial, integrated, corrected]).toContain(context.sourceCommit);
    if (mode === 'repair-exhaustion' && context.checkpoint === 'work-item' && check.kind === 'tests') return { outcome: { kind: 'completed', exitCode: 1 }, stdout: 'Combined capability repair fixture failure' };
    return check.kind === 'tests' ? { stdout: 'Synthetic harness-policy evidence: subs/a/src/tests/caller.test.ts; subs/b/src/tests/fact.test.ts; subs/d/src/tests/consumer.test.ts' } : {};
  }, { scenarios: false });
  const audit = retain({ ...auditAnswers,
    async read(project: string, commit: string) {
      expect(project).toBe(root); expect([initial, integrated, corrected]).toContain(commit);
      return auditAnswers.read(project, commit);
    },
    async run(input: Parameters<typeof auditAnswers.run>[0]) {
      expect(input.projectRoot).toBe(root); expect([initial, integrated, corrected]).toContain(input.sourceCommit);
      return auditAnswers.run(input);
    },
  }, ['read', 'run']);
  const fixturePaths = new Set([...Object.keys(acceptanceInitialFiles), ...allChanges.map(entry => entry.path),
    'subs/a/src/tests/features/need/richer-a-fact.feature', 'subs/b/src/tests/features/need/b-entry.feature']);
  const moduleDirectories = new Set(['.', 'subs/a', 'subs/b', 'subs/d']);
  class AcceptanceRamify extends FakeRamifyCli {
    override async run(args: readonly string[], cwd: string, signal?: AbortSignal) {
      expect(cwd).toBe(root);
      if (args[0] === '--version') expect(args).toEqual(['--version']);
      else if (args[0] === 'measure') expect(args).toEqual(['measure', '--root', root, '--format', 'json']);
      else {
        expect(args.slice(0, 2)).toEqual(['check', '--changed']);
        const format = args.indexOf('--format'); expect(format).toBeGreaterThan(2);
        for (const path of args.slice(2, format)) expect(fixturePaths.has(path), `unstated hook path ${path}`).toBe(true);
        expect(args.slice(format, -1)).toEqual(['--format', 'json', '--deadline']);
        expect([String(testPolicy(root).commands.hookTimeoutMs), String(completionCheckDeadlineMs)]).toContain(args.at(-1));
      }
      return super.run(args, cwd, signal);
    }
    override async materialize(project: string, apiFrom?: string, signal?: AbortSignal) {
      expect(project).toBe(root); if (apiFrom !== undefined) expect(moduleDirectories.has(apiFrom || '.')).toBe(true);
      return super.materialize(project, apiFrom, signal);
    }
    override async queryOwnership(project: string, paths: readonly string[] = ['.']) {
      expect(project).toBe(root);
      for (const path of paths) expect(fixturePaths.has(path) || moduleDirectories.has(path), `unstated ownership path ${path}`).toBe(true);
      return super.queryOwnership(project, paths);
    }
  }
  const ramify = retain(new AcceptanceRamify(), ['run', 'materialize', 'queryOwnership', 'stopDaemon']);
  function assertAnswered() {
    expect(git.unexpected, 'unanswered Git operations or caught assertion failures').toEqual([]);
    expect(failures, 'caught external-answer failures').toEqual([]);
  }
  return { git, candidates, sourceGit, audit, ramify,
    stage(next: Stage) { state = next; },
    assertAnswered,
    assertComplete() {
      assertAnswered();
      expect(commits).toEqual(['scenarios', 'integrated', 'corrected']);
      expect([...usedStages]).toEqual(expect.arrayContaining(['suspended', 'provider', 'consumer', 'exposed', 'integrated', 'corrected']));
      expect(sourceCalls.filter(call => call === 'stagedPaths')).toHaveLength(mode === 'revision' ? 2 : 1);
      expect(sourceCalls.filter(call => call.startsWith('readBlob'))).toEqual(suspendedChanges.map(entry => `readBlob ${scenarios} ${entry.path}`).sort());
      for (const commit of [integrated, corrected]) {
        expect(candidateCalls).toContain(`commitTree ${commit}`);
        expect(candidateCalls).toContain(`treeEntries ${commit}`);
      }
      expect(candidateCalls.some(call => call.startsWith('diffPatch'))).toBe(true);
      const iterationAttempts = mode === 'deferred' ? 3 : 2;
      expect(auditChecks.filter(call => call.startsWith('iteration:'))).toEqual(Array.from({ length: iterationAttempts }, () => ['iteration:tests', 'iteration:type-check', 'iteration:ramify-check']).flat());
      // Readiness answers no commands; completion uses the explicitly stated
      // configured policy response for each bounded attempt.
      const completionAttempts = mode === 'repair-exhaustion' ? 4 : mode === 'deferred' ? 2 : 1;
      expect(auditChecks.filter(call => call.startsWith('work-item:'))).toEqual(Array.from({ length: completionAttempts }, () => ['work-item:tests', 'work-item:type-check', 'work-item:ramify-check']).flat());
      expect(audit.requests).toHaveLength(1 + iterationAttempts + completionAttempts);
      for (const call of ramify.calls.filter(call => call.operation === 'run')) {
        expect(['--version', 'measure', 'check']).toContain(call.argv[0]);
      }
      audit.assertComplete();
    },
  };
}
