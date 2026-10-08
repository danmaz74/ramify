import { expect } from 'vitest';
import { isAbsolute, join } from 'node:path';
import type { AffectedDocument } from 'ramify.ts/cli';
import type { CommandRequest, CommandRunner } from '../../../subs/evidence/src/run-command.js';
import { childEnvironment } from '../../../subs/evidence/src/run-command.js';
import type { ConfiguredAuditPort, CommittedAuditConfiguration } from '../../../subs/audit/src/check-execution.js';
import { mockGit } from './mock-git.js';
import { scriptedCandidates } from './candidates.js';
import { commandResult } from './command-result.js';
import { FakeRamifyCli } from './fake-ramify.js';
import { shapeOnlyInputs } from './runs.js';
import type { DirectCheckStep } from './direct-check-execution.js';
export const readinessHead = 'a'.repeat(40);
const tree = '1'.repeat(40);
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

/** Literal fixture facts: no Git, ownership or source answers are inferred from disk. */
export function readinessBoundaries(root: string) {
  const failures: string[] = [], consumed = new Map<string, number>();
  let state: 'clean' | 'dirty' | 'unavailable' = 'clean', branch = 'main';
  let expectedBranches = 1, final = false, lifecycle = false, restartFailed = false;
  const scratch = modules.map(module => (module.directory === '.' ? '' : module.directory + '/') + 'src/tmp');
  function read(operation: string) { consumed.set(operation, (consumed.get(operation) ?? 0) + 1); }
  function once(operation: string) { expect(consumed.get(operation) ?? 0, `exhausted ${operation}`).toBe(0); consumed.set(operation, 1); }
  function retain<T extends object>(object: T): T { return new Proxy(object, { get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver);
    return typeof value !== 'function' ? value : async (...args: unknown[]) => { try { return await value.apply(target, args); }
      catch (error) { failures.push(`${String(key)}: ${String(error)}`); throw error; } };
  } }); }
  const git = mockGit({
    async currentHead(project) { expect(project).toBe(root); read('head'); return readinessHead; },
    async isCleanRepository(project) { expect(project).toBe(root); read('clean'); if (state === 'unavailable') throw new Error('declared repository unavailable'); return state === 'clean'; },
    async trackedPaths(project, paths) { expect(project).toBe(root); expect(paths.every(path => scratch.includes(path))).toBe(true); return []; },
    async ignoreStatus(project, paths) { expect(project).toBe(root); expect(paths.every(path => scratch.some(dir => path.startsWith(dir + '/')))).toBe(true); return paths.map(path => ({ path, ignored: true, rule: { source: '.gitignore', line: 3, pattern: '**/src/tmp/' } })); },
    async createRunBranch(project, id) { expect(project).toBe(root); expect(id).toMatch(/^(readiness-fixture|[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6})$/u);
      const count = consumed.get('branch') ?? 0; expect(count, 'exhausted branch').toBeLessThan(expectedBranches); consumed.set('branch', count + 1);
      const created = branch === 'main'; branch = `ramify-agent-run/${id}`; return { branch, created }; },
    async previewCandidateTree(project) { expect(project).toBe(root); return { repositoryRoot: root, head: readinessHead, tree }; },
    async changedPaths(project, base = 'HEAD') { expect(project).toBe(root); expect(base).toBe(readinessHead); return []; },
    async changedEntries(project, base = 'HEAD') { expect(project).toBe(root); expect(base).toBe(readinessHead); return []; },
    async findCommitByTrailers(project, trailers) { expect(project).toBe(root); expect(trailers).toEqual([{ key: 'Ramify-Run', value: branch.slice('ramify-agent-run/'.length) }, { key: 'Ramify-Gate', value: 'ga-0003' }]); once('lookup'); return null; },
    async commitAccepted(project, message) { expect(project).toBe(root); expect(message).toContain(`Ramify-Run: ${branch.slice('ramify-agent-run/'.length)}`); expect(message).toContain('Ramify-Gate: ga-0003'); once('commit'); return null; },
    async diffNameStatus(project, from, to) { expect(project).toBe(root); expect(from).toBe(readinessHead); expect([readinessHead, tree]).toContain(to); return []; },
  });
  class ReadinessRamify extends FakeRamifyCli {
    override async run(argv: readonly string[], cwd: string, signal?: AbortSignal) {
      expect(cwd).toBe(root); read(String(argv[0])); expect([['--version'], ['measure', '--root', root, '--format', 'json']]).toContainEqual([...argv]);
      if (restartFailed && argv[0] === '--version') { expect(argv).toEqual(['--version']); const count = consumed.get('failed-version') ?? 0; expect(count).toBeLessThan(2); consumed.set('failed-version', count + 1); return { code: 1, stdout: '', stderr: 'daemon unavailable' }; }
      return super.run(argv, cwd, signal);
    }
    override async queryOwnership(project: string, paths: readonly string[] = ['.']): Promise<AffectedDocument> {
      expect(project).toBe(root); expect(paths).toEqual(['.']);
      return { schemaVersion: 'ramify.affected-cli/4', root, mode: 'batch', ramifyVersion: 'scripted-readiness-only', revision: { sequence: null, inputId: 'readiness' }, selection: { schemaVersion: 'ramify.affected/4', inputId: 'readiness', paths: [{ path: '.', status: 'owned', module: 'collection-review', basis: 'containment', exclusion: null, kind: 'inert', selects: [] }], scope: { root, selection: 'given', configuration: 'tsconfig.json', invokedFrom: root, walkedAreas: [], ownership: { modules: modules.map(({ id, parent, directory }) => ({ id, parent, directory })), exclusions: [] } }, changedModules: [], affectedModules: [], testModules: [], selection: 'dependency-closure', widening: [], coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed' } } as unknown as AffectedDocument;
    }
    override async materialize(): Promise<never> { throw new Error('shape-only readiness declares no materialization'); }
    override async stopDaemon() { expect(restartFailed).toBe(true); once('restart'); }
  }
  const candidates = retain(scriptedCandidates(root, { [readinessHead]: { tree, files: {}, base: readinessHead, changes: [] } }));
  const inputs = retain({ ...shapeOnlyInputs, async capture(...args: Parameters<typeof shapeOnlyInputs.capture>) { expect(args[0]).toBe(root); once('capture'); return shapeOnlyInputs.capture(...args); } });
  let command: CommandRunner = async () => { throw new Error('No readiness command declared'); };
  const options = { git, candidates, ramify: retain(new ReadinessRamify()), inputs, scratchGit: 'provided' as const,
    provisionalSourceGit: retain({ async stagedPaths(): Promise<never> { throw new Error('No provisional index declared'); }, async readBlob(): Promise<never> { throw new Error('No provisional bytes declared'); } }),
    commandExecution: async (request: CommandRequest) => { try { return await command(request); } catch (error) { failures.push(`command: ${String(error)}`); throw error; } },
  };
  return { options,
    repository(value: typeof state) { state = value; },
    expectBranches(count: number) { expectedBranches = count; },
    lifecycle(completes: boolean) { lifecycle = true; final = completes; },
    failRestart() { restartFailed = true; },
    command(answer: CommandRunner) { command = answer; },
    branches() { return branch === 'main' ? [] : [branch]; }, branch() { return branch; },
    assertComplete() {
      expect(git.unexpected, JSON.stringify(git.unexpected)).toEqual([]); expect(failures, 'persistent caught external failures').toEqual([]);
      expect(consumed.get('branch') ?? 0, 'required branch answers').toBe(expectedBranches);
      for (const op of ['lookup', 'commit']) expect(consumed.get(op) ?? 0, `required ${op}`).toBe(final ? 1 : 0);
      expect(consumed.get('capture') ?? 0).toBe(lifecycle ? 1 : 0);
      expect(consumed.get('clean') ?? 0, 'required repository response').toBeGreaterThan(0);
      expect(consumed.get('--version') ?? 0, 'required version reply').toBeGreaterThan(0);
      if (lifecycle) { expect(consumed.get('head') ?? 0, 'required source head').toBeGreaterThan(0); expect(consumed.get('measure') ?? 0, 'required baseline measurement').toBeGreaterThan(0); }
      if (restartFailed) { expect(consumed.get('restart')).toBe(1); expect(consumed.get('failed-version')).toBe(2); }
    },
  };
}

/** Required executions exhaust; declared configuration reads are repeatable. */
export function strictReadinessAudit(port: ConfiguredAuditPort, root: string, config: CommittedAuditConfiguration, gates: readonly string[]) {
  const failures: string[] = []; let count = 0, reads = 0; let runId: string | undefined;
  function retain<T>(work: () => Promise<T>): Promise<T> { return work().catch(error => { failures.push(String(error)); throw error; }); }
  return { adapter: {
    read: (project: string, head: string, signal?: AbortSignal) => retain(async () => { expect(project).toBe(root); expect(head).toBe(readinessHead); reads++; return port.read(project, head, signal); }),
    run: (input: Parameters<ConfiguredAuditPort['run']>[0]) => retain(async () => {
      expect(input.projectRoot).toBe(root); expect(input.sourceCommit).toBe(readinessHead); expect(input.configuration).toEqual(config);
      expect(input.mode).toBe('full'); expect(input.nested).toBe(true); expect(count, 'exhausted audit response').toBeLessThan(gates.length); expect(input.attemptId).toBe(gates[count]);
      expect(input.runId).toMatch(/^(readiness-fixture|[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6})$/u); expect(input.runId).toBe(runId ?? input.runId); runId = input.runId;
      count++; return port.run(input);
    }),
  } satisfies ConfiguredAuditPort, assertComplete() { expect(failures, 'caught audit failures').toEqual([]); expect(count, 'required audit responses').toBe(gates.length); expect(reads, 'required captured configuration read').toBeGreaterThan(0); } };
}

/** Independently stated command and real fixture effect; never interprets shell/program text. */
export function strictReadinessCommand(root: string, expected: { argv: readonly string[]; cwd: string; env: Record<string, string>; timeoutMs: number }, count: number,
  effect: (() => Promise<void>) | undefined = undefined, answer: DirectCheckStep = {}) {
  let used = 0; const failures: string[] = [];
  const run: CommandRunner = async request => { try {
    expect(request.argv).toEqual(expected.argv); expect(request.cwd).toBe(isAbsolute(expected.cwd) ? expected.cwd : join(root, expected.cwd));
    expect(request.env).toEqual(childEnvironment(expected.env)); expect(request.timeoutMs).toBe(expected.timeoutMs); expect(request.outputFile).toEqual(expect.any(String));
    expect(used, 'exhausted command response').toBeLessThan(count); used++; await effect?.(); return commandResult(request, answer);
  } catch (error) { failures.push(String(error)); throw error; } };
  return { run, assertComplete() { expect(failures, 'caught command failures').toEqual([]); expect(used, 'required command responses').toBe(count); } };
}
