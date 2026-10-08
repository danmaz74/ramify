import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AUDIT_PROTOCOL_VERSION,
  createAuditService,
  createDefaultWorkspacePreparationPort,
  createInProcessRegisteredExecutorBridge,
  createNodeGitExecutor,
  createNodeRepositoryExecutionLease,
  getBranchAuditStatus,
  readCommitAuditNote,
  resolveRepositoryExecutionLeaseIdentity,
  type AuditCheckSummary,
  type AuditRequest,
  type CheckDefinition,
  type GitExecutorPort,
  type ProcessExecutionRequest,
  type RegisteredExecutorRequest,
  type RegisteredExecutorResult,
} from 'ramify-audit';

import {
  commitAccepted,
  createRunBranch,
  isCleanRepository,
} from '../../../evidence/src/git.js';

interface Repository {
  readonly root: string;
  readonly commit: string;
  readonly tree: string;
}

const repositories = new Set<string>();
const children = new Set<ChildProcessWithoutNullStreams>();
const originalGlobalConfig = process.env.GIT_CONFIG_GLOBAL;
const originalSystemConfig = process.env.GIT_CONFIG_SYSTEM;
const helperPath = fileURLToPath(new URL('./helpers/audit-process.ts', import.meta.url));

function git(root: string, args: readonly string[], input?: string): string {
  return execFileSync('git', [...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
    ...(input === undefined ? {} : { input }),
  }).trim();
}

function tryGit(root: string, args: readonly string[]): string | null {
  try {
    return git(root, args);
  } catch {
    return null;
  }
}

async function createRepository(files: Readonly<Record<string, string>> = { 'source.txt': 'source\n' }): Promise<Repository> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-agent-audit-'));
  repositories.add(root);
  git(root, ['init', '-b', 'main']);
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, relative)), { recursive: true });
    await writeFile(join(root, relative), content);
  }
  git(root, ['add', '--all']);
  git(root, [
    '-c', 'user.name=Ramify Agent Test',
    '-c', 'user.email=ramify-agent-test@example.invalid',
    'commit', '--no-gpg-sign', '-m', 'source',
  ]);
  return {
    root,
    commit: git(root, ['rev-parse', 'HEAD']),
    tree: git(root, ['rev-parse', 'HEAD^{tree}']),
  };
}

function registeredCheck(id: string, executorId = 'host.pass'): CheckDefinition {
  return {
    id,
    name: id,
    description: `Conformance check ${id}`,
    scope: 'both',
    category: 'registered',
    executor: { kind: 'registered', executorId },
    onFailure: 'record',
  };
}

function commandCheck(
  id: string,
  commands: Array<{ name: string; cmd: string; args: string[]; env?: Record<string, string> }>,
): CheckDefinition {
  return {
    id,
    name: id,
    description: `Conformance command check ${id}`,
    scope: 'both',
    category: 'deterministic',
    executor: { kind: 'command', commands, continueOnFailure: true },
    onFailure: 'record',
  };
}

function auditRequest(
  repository: Repository,
  checks: CheckDefinition[] = [registeredCheck('pass')],
): AuditRequest {
  return {
    protocolVersion: AUDIT_PROTOCOL_VERSION,
    requestId: `request-${Math.random().toString(16).slice(2)}`,
    repositoryPath: repository.root,
    source: { kind: 'existing-commit', revision: repository.commit },
    checks,
    universeId: 'commit-audit-conformance',
    coverageClaim: { fixture: 'commit-audit-conformance' },
    registeredExecutorIds: [...new Set(checks.flatMap(check =>
      check.executor.kind === 'registered' ? [check.executor.executorId] : []))],
    // As the adapter's requests do: every audit runs, never answered by an earlier one.
    force: true,
  };
}

function gitWithHarnessIdentity(): GitExecutorPort {
  const base = createNodeGitExecutor();
  return {
    execute: (request, signal) => base.execute({
      ...request,
      environment: {
        ...request.environment,
        GIT_AUTHOR_NAME: 'ramify-agent',
        GIT_AUTHOR_EMAIL: 'ramify-agent@localhost',
        GIT_COMMITTER_NAME: 'ramify-agent',
        GIT_COMMITTER_EMAIL: 'ramify-agent@localhost',
      },
    }, signal),
  };
}

function passingBridge() {
  return createInProcessRegisteredExecutorBridge({
    'host.pass': async () => ({
      status: 'completed',
      result: { passed: true, status: 'pass', summary: 'passed' },
    }),
  });
}

async function runPassing(repository: Repository, request = auditRequest(repository)) {
  return createAuditService({
    git: gitWithHarnessIdentity(),
    registeredExecutors: passingBridge(),
  }).run(request);
}

function publishedRefs(root: string): string[] {
  const output = git(root, [
    'for-each-ref', '--format=%(refname)', 'refs/audited/', 'refs/notes/audit',
  ]);
  return output === '' ? [] : output.split('\n').sort();
}

function spawnFixture(mode: 'lease' | 'audit', repository: Repository): ChildProcessWithoutNullStreams {
  const child = spawn(process.execPath, [
    '--import', 'tsx', helperPath, mode, repository.root, repository.commit,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function waitForMessage(
  child: ChildProcessWithoutNullStreams,
  predicate: (message: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  const stderr: string[] = [];
  child.stderr.on('data', chunk => stderr.push(String(chunk)));
  const lines = createInterface({ input: child.stdout });
  const timer = setTimeout(() => child.kill('SIGKILL'), 15_000);
  try {
    for await (const line of lines) {
      const message = JSON.parse(line) as Record<string, unknown>;
      if (predicate(message)) return message;
    }
    throw new Error(`fixture exited before its message: ${stderr.join('')}`);
  } finally {
    clearTimeout(timer);
    lines.close();
  }
}

async function kill(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
}

beforeAll(() => {
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_SYSTEM = '/dev/null';
});

afterAll(() => {
  if (originalGlobalConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL;
  else process.env.GIT_CONFIG_GLOBAL = originalGlobalConfig;
  if (originalSystemConfig === undefined) delete process.env.GIT_CONFIG_SYSTEM;
  else process.env.GIT_CONFIG_SYSTEM = originalSystemConfig;
});

afterEach(async () => {
  await Promise.all([...children].map(kill));
  for (const root of repositories) await rm(root, { recursive: true, force: true });
  repositories.clear();
});

describe('ramify-audit 0.7.2 conformance', () => {
  it('fact 1: command summaries preserve status and runner errors but never an exit code', async () => {
    const repository = await createRepository();
    const request = auditRequest(repository, [commandCheck('commands', [
      { name: 'exit-two', cmd: process.execPath, args: ['-e', 'process.exit(2)'] },
      { name: 'spawn-failure', cmd: '/definitely/not/a/command', args: [] },
    ])]);
    const result = await createAuditService({ git: gitWithHarnessIdentity() }).run(request);

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const summary = result.summary.checks.commands;
    expect(summary).toMatchObject({ passed: false, status: 'fail' });
    expect(summary.runnerError?.kind).toBeTruthy();
    expect(summary).not.toHaveProperty('exitCode');
    expect(summary.commands?.['exit-two']).toMatchObject({ passed: false, status: 'fail' });
    expect(summary.commands?.['exit-two']).not.toHaveProperty('exitCode');
    expect(summary.commands?.['spawn-failure']?.runnerError?.kind).toBeTruthy();
    expect(summary.commands?.['spawn-failure']).not.toHaveProperty('exitCode');
  });

  it('fact 2: command checks inherit the process environment except NODE_OPTIONS', async () => {
    const repository = await createRepository();
    const requests: ProcessExecutionRequest[] = [];
    const oldMarker = process.env.RAMIFY_AUDIT_CONFORMANCE_MARKER;
    const oldNodeOptions = process.env.NODE_OPTIONS;
    process.env.RAMIFY_AUDIT_CONFORMANCE_MARKER = 'visible';
    process.env.NODE_OPTIONS = '--trace-warnings';
    try {
      const result = await createAuditService({
        git: gitWithHarnessIdentity(),
        processExecutor: {
          async execute(request) {
            requests.push(request);
            return { exitCode: 0, signal: null, stdout: '', stderr: '', durationMs: 1 };
          },
        },
      }).run(auditRequest(repository, [commandCheck('environment', [
        { name: 'environment', cmd: 'ignored', args: [] },
      ])]));
      expect(result.status).toBe('completed');
      expect(requests).toHaveLength(1);
      expect(requests[0]?.environment?.RAMIFY_AUDIT_CONFORMANCE_MARKER).toBe('visible');
      expect(requests[0]?.environment).not.toHaveProperty('NODE_OPTIONS');
    } finally {
      if (oldMarker === undefined) delete process.env.RAMIFY_AUDIT_CONFORMANCE_MARKER;
      else process.env.RAMIFY_AUDIT_CONFORMANCE_MARKER = oldMarker;
      if (oldNodeOptions === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = oldNodeOptions;
    }
  });

  it('fact 3: registered executors receive the repository worktree and make failures explicit', async () => {
    const repository = await createRepository();
    let received: RegisteredExecutorRequest | undefined;
    let receivedRepositoryRoot: string | undefined;
    const bridge = createInProcessRegisteredExecutorBridge({
      'host.capture': async request => {
        received = request;
        receivedRepositoryRoot = git(request.workingDirectory, ['rev-parse', '--show-toplevel']);
        return { status: 'completed', result: { passed: true, summary: 'captured' } };
      },
    });
    const result = await createAuditService({
      git: gitWithHarnessIdentity(),
      registeredExecutors: bridge,
    }).run(auditRequest(repository, [registeredCheck('capture', 'host.capture')]));
    expect(result.status).toBe('completed');
    expect(received?.workingDirectory).toMatch(/ramify-audit-worktree-/u);
    expect(receivedRepositoryRoot).toBe(received?.workingDirectory);
    expect(existsSync(received!.workingDirectory)).toBe(false);

    const baseRequest = received!;
    const signal = new AbortController().signal;
    const failing = createInProcessRegisteredExecutorBridge({
      failure: async () => { throw new Error('handler exploded'); },
    });
    await expect(failing.execute({ ...baseRequest, executorId: 'failure' }, signal)).resolves.toMatchObject({
      status: 'failed', error: { code: 'handler-failed', message: 'handler exploded' },
    });
    const malformed = createInProcessRegisteredExecutorBridge({
      malformed: async () => ({ nope: true } as unknown as RegisteredExecutorResult),
    });
    await expect(malformed.execute({ ...baseRequest, executorId: 'malformed' }, signal)).resolves.toMatchObject({
      status: 'failed', error: { code: 'malformed-result' },
    });
    const cancelled = createInProcessRegisteredExecutorBridge({
      cancelled: async () => ({ status: 'cancelled', reason: 'stopped' }),
    });
    await expect(cancelled.execute({ ...baseRequest, executorId: 'cancelled' }, signal)).resolves.toEqual({
      status: 'cancelled', reason: 'stopped',
    });
  });

  it('fact 4: publication needs a Git identity and accepts an injected identity', async () => {
    const repository = await createRepository();
    const withoutIdentity = await createAuditService({ registeredExecutors: passingBridge() })
      .run(auditRequest(repository));
    expect(withoutIdentity).toMatchObject({ status: 'failed', error: { code: 'audit-failed' } });
    if (withoutIdentity.status === 'failed') {
      expect(withoutIdentity.error.message).toMatch(/identity|email|author/iu);
    }
    expect(publishedRefs(repository.root)).toEqual([]);

    const withIdentity = await runPassing(repository);
    expect(withIdentity).toMatchObject({ status: 'completed', summary: { overall: 'pass' } });
  });

  it('fact 5: nodejs preparation links only repository-root node_modules', async () => {
    const repository = await createRepository({
      'package.json': '{"name":"repository","scripts":{"build":"ignored"}}\n',
      'project/package.json': '{"name":"project"}\n',
      'project/packages/nested/package.json': '{"name":"nested"}\n',
    });
    await Promise.all([
      mkdir(join(repository.root, 'node_modules'), { recursive: true }),
      mkdir(join(repository.root, 'project/node_modules'), { recursive: true }),
      mkdir(join(repository.root, 'project/packages/nested/node_modules'), { recursive: true }),
    ]);
    let observed: Record<string, unknown> | undefined;
    const preparationRequests: ProcessExecutionRequest[] = [];
    const bridge = createInProcessRegisteredExecutorBridge({
      'host.inspect': async request => {
        const rootLink = join(request.workingDirectory, 'node_modules');
        observed = {
          workingDirectory: request.workingDirectory,
          rootIsLink: lstatSync(rootLink).isSymbolicLink(),
          rootTarget: readlinkSync(rootLink),
          projectLinked: existsSync(join(request.workingDirectory, 'project/node_modules')),
          nestedLinked: existsSync(join(request.workingDirectory, 'project/packages/nested/node_modules')),
        };
        return { status: 'completed', result: { passed: true, summary: 'inspected' } };
      },
    });
    const request = auditRequest(repository, [registeredCheck('inspect', 'host.inspect')]);
    request.workspacePreparation = {
      preparationId: 'nodejs',
      options: { linkNodeModules: true, build: true },
    };
    const result = await createAuditService({
      git: gitWithHarnessIdentity(),
      registeredExecutors: bridge,
      workspacePreparation: createDefaultWorkspacePreparationPort({
        async execute(preparation) {
          preparationRequests.push(preparation);
          return { exitCode: 0, signal: null, stdout: '', stderr: '', durationMs: 1 };
        },
      }),
    }).run(request);
    expect(result.status).toBe('completed');
    expect(observed).toMatchObject({
      rootIsLink: true,
      rootTarget: join(repository.root, 'node_modules'),
      projectLinked: false,
      nestedLinked: false,
    });
    expect(observed?.workingDirectory).toMatch(/ramify-audit-worktree-/u);
    expect(preparationRequests).toHaveLength(1);
    expect(preparationRequests[0]).toMatchObject({
      command: 'npm', args: ['run', 'build'], workingDirectory: observed?.workingDirectory,
    });
  });

  it('fact 6: every selected check runs after a check fails', async () => {
    const repository = await createRepository();
    const called: string[] = [];
    const bridge = createInProcessRegisteredExecutorBridge({
      'host.record': async request => {
        called.push(request.checkId);
        return {
          status: 'completed',
          result: { passed: request.checkId !== 'first', summary: request.checkId },
        };
      },
    });
    const result = await createAuditService({
      git: gitWithHarnessIdentity(),
      registeredExecutors: bridge,
    }).run(auditRequest(repository, [
      registeredCheck('first', 'host.record'),
      registeredCheck('second', 'host.record'),
      registeredCheck('third', 'host.record'),
    ]));
    expect(result).toMatchObject({ status: 'completed', summary: { overall: 'fail' } });
    expect(called).toEqual(['first', 'second', 'third']);

    const cancellationCalls: string[] = [];
    const cancelled = await createAuditService({
      git: gitWithHarnessIdentity(),
      registeredExecutors: createInProcessRegisteredExecutorBridge({
        'host.cancel': async request => {
          cancellationCalls.push(request.checkId);
          return request.checkId === 'cancel'
            ? { status: 'cancelled', reason: 'stop' }
            : { status: 'completed', result: { passed: true, summary: 'unexpected' } };
        },
      }),
    }).run(auditRequest(repository, [
      registeredCheck('cancel', 'host.cancel'),
      registeredCheck('must-not-run', 'host.cancel'),
    ]));
    expect(cancelled).toMatchObject({ status: 'cancelled', reason: 'stop' });
    expect(cancellationCalls).toEqual(['cancel']);
  });

  it('fact 7: an audit waiting on another process lease cancels on its signal', { timeout: 30_000 }, async () => {
    const repository = await createRepository();
    const holder = spawnFixture('lease', repository);
    await waitForMessage(holder, message => message.type === 'lease-acquired');

    const controller = new AbortController();
    const pending = createAuditService({
      git: gitWithHarnessIdentity(),
      registeredExecutors: passingBridge(),
    }).run(auditRequest(repository), controller.signal);
    setTimeout(() => controller.abort('gate timeout'), 75);
    await expect(pending).resolves.toMatchObject({ status: 'cancelled', reason: 'gate timeout' });
    expect(publishedRefs(repository.root)).toEqual([]);

    await kill(holder);
    const lease = createNodeRepositoryExecutionLease();
    const recovered = await lease.acquire({ repositoryPath: repository.root, operation: 'recover' });
    await recovered.release();

    const timeline: string[] = [];
    const orderedLease = createNodeRepositoryExecutionLease({
      onEvent: event => { timeline.push(`lease.${event.type}`); },
    });
    const completed = await createAuditService({
      git: gitWithHarnessIdentity(),
      executionLease: orderedLease,
      registeredExecutors: passingBridge(),
      eventSink: { emit: event => { timeline.push(event.type); } },
    }).run(auditRequest(repository));
    expect(completed.status).toBe('completed');
    expect(timeline.indexOf('lease.acquired')).toBeLessThan(timeline.indexOf('source.resolved'));
    expect(timeline.indexOf('artifacts.published')).toBeLessThan(timeline.indexOf('lease.released'));
  });

  it('fact 8: a killed audit leaves its worktree and registration until explicit recovery', { timeout: 30_000 }, async () => {
    const repository = await createRepository();
    const child = spawnFixture('audit', repository);
    const ready = await waitForMessage(child, message => message.type === 'workspace.ready');
    const abandoned = ready.workingDirectory;
    expect(typeof abandoned).toBe('string');
    await kill(child);

    const identity = await resolveRepositoryExecutionLeaseIdentity(repository.root);
    expect(lstatSync(join(identity.leaseDirectory, 'owner')).isSymbolicLink()).toBe(true);
    expect(existsSync(abandoned as string)).toBe(true);
    expect(git(repository.root, ['worktree', 'list', '--porcelain'])).toContain(`worktree ${abandoned as string}`);

    git(repository.root, ['worktree', 'prune']);
    expect(existsSync(abandoned as string)).toBe(true);
    expect(git(repository.root, ['worktree', 'list', '--porcelain'])).toContain(`worktree ${abandoned as string}`);

    const retry = await runPassing(repository);
    expect(retry.status).toBe('completed');
    expect(existsSync(abandoned as string)).toBe(true);
    git(repository.root, ['worktree', 'remove', '--force', abandoned as string]);
    await rm(dirname(abandoned as string), { recursive: true, force: true });
  });

  it('fact 9: a full audit remains applicable to its branch', async () => {
    const repository = await createRepository();
    const result = await runPassing(repository);
    expect(result).toMatchObject({ status: 'completed', composition: { verdict: 'pass' } });
    const branch = await getBranchAuditStatus('main', repository.root);
    expect(branch.auditPassed).toBe(true);
    expect(branch.auditStillApplies).toBe(true);
  });

  it('fact 10: two audits in one second overwrite the run ref, tree ref and note', async () => {
    const repository = await createRepository();
    const now = () => new Date('2026-09-21T12:34:56.000Z');
    const failing = createInProcessRegisteredExecutorBridge({
      'host.result': async () => ({
        status: 'completed', result: { passed: false, summary: 'failed' },
      }),
    });
    const passing = createInProcessRegisteredExecutorBridge({
      'host.result': async () => ({
        status: 'completed', result: { passed: true, summary: 'passed' },
      }),
    });
    const request = auditRequest(repository, [registeredCheck('result', 'host.result')]);
    // The package's injected clock timestamps evidence, while ref naming in
    // 0.1.0 still reads the global Date. Freeze Date only (not timers) so the
    // conformance fact cannot cross a wall-clock second under suite load.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now());
    try {
      const first = await createAuditService({
        git: gitWithHarnessIdentity(), now, registeredExecutors: failing,
      }).run(request);
      const second = await createAuditService({
        git: gitWithHarnessIdentity(), now, registeredExecutors: passing,
      }).run({ ...request, requestId: 'same-second-retry' });
      expect(first).toMatchObject({ status: 'completed', summary: { overall: 'fail' } });
      expect(second).toMatchObject({ status: 'completed', summary: { overall: 'pass' } });
      if (first.status !== 'completed' || second.status !== 'completed') return;
      expect(second.refs.runRef).toBe(first.refs.runRef);
      expect(second.refs.treeRef).toBe(first.refs.treeRef);
      expect(second.refs.reportCommit).not.toBe(first.refs.reportCommit);
      expect(git(repository.root, ['rev-parse', second.refs.runRef])).toBe(second.refs.reportCommit);
      expect(git(repository.root, ['rev-parse', second.refs.treeRef])).toBe(second.refs.reportCommit);
      await expect(readCommitAuditNote(repository.commit, repository.root)).resolves.toMatchObject({
        overall: 'pass', reportCommit: second.refs.reportCommit,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fact 11: cancelled and failed audits publish nothing', async () => {
    const repository = await createRepository();
    const failed = await createAuditService({
      git: gitWithHarnessIdentity(),
      registeredExecutors: passingBridge(),
      workspacePreparation: { prepare: async () => { throw new Error('preparation failed'); } },
    }).run({
      ...auditRequest(repository),
      workspacePreparation: { preparationId: 'fail' },
    });
    expect(failed).toMatchObject({ status: 'failed', error: { message: 'preparation failed' } });
    expect(publishedRefs(repository.root)).toEqual([]);

    const controller = new AbortController();
    controller.abort('cancel before start');
    const cancelled = await createAuditService({
      git: gitWithHarnessIdentity(), registeredExecutors: passingBridge(),
    }).run(auditRequest(repository), controller.signal);
    expect(cancelled).toMatchObject({ status: 'cancelled', reason: 'cancel before start' });
    expect(publishedRefs(repository.root)).toEqual([]);
  });

  it('fact 12: protocol v2 accepts the default mode and rejects a selector', async () => {
    const repository = await createRepository();
    const base = auditRequest(repository);
    const accepted = await runPassing(repository, base);
    expect(accepted).toMatchObject({ status: 'completed', composition: { verdict: 'pass' } });

    const wrong = { ...base, requestId: 'selector-rejected', selector: { id: 'scoped', version: '1', config: {} } };
    const refused = await createAuditService({
      git: gitWithHarnessIdentity(), registeredExecutors: passingBridge(),
    }).run(wrong);
    expect(refused).toMatchObject({
      status: 'failed', error: { message: expect.stringContaining('selector is not part') },
    });
  });

  it('fact 13: an audit of already audited code is reused unless forced, and names the audited commit', async () => {
    const repository = await createRepository({ 'source.txt': 'source\n', 'docs/guide.md': 'guide\n' });
    const unforced = { ...auditRequest(repository), force: false, full: true, ignorePaths: ['docs/**'] };
    const first = await runPassing(repository, unforced);
    expect(first).toMatchObject({ status: 'completed', summary: { overall: 'pass', sourceCommit: repository.commit } });
    if (first.status !== 'completed') return;
    expect(first.reused).toBeUndefined();
    const refs = publishedRefs(repository.root);

    const again = await runPassing(repository, { ...unforced, requestId: 'same-code' });
    expect(again).toMatchObject({
      status: 'completed',
      summary: { sourceCommit: repository.commit },
      refs: { runRef: first.refs.runRef, reportCommit: first.refs.reportCommit },
      reused: { sourceCommit: repository.commit, auditedCommit: repository.commit, ignoredChangedPaths: [] },
    });
    expect(publishedRefs(repository.root)).toEqual(refs);

    // A later commit that changes only ignored paths is answered by the
    // earlier audit: its summary keeps the audited commit, not the requested one.
    await writeFile(join(repository.root, 'docs/guide.md'), 'guide, revised\n');
    git(repository.root, ['add', '--all']);
    git(repository.root, [
      '-c', 'user.name=Ramify Agent Test',
      '-c', 'user.email=ramify-agent-test@example.invalid',
      'commit', '--no-gpg-sign', '-m', 'docs',
    ]);
    const later = git(repository.root, ['rev-parse', 'HEAD']);
    const derived = await runPassing(repository, { ...unforced, requestId: 'docs-only', source: { kind: 'existing-commit', revision: later } });
    expect(derived).toMatchObject({
      status: 'completed',
      summary: { sourceCommit: repository.commit },
      reused: { sourceCommit: later, auditedCommit: repository.commit, ignoredChangedPaths: ['docs/guide.md'] },
    });

    const forced = await runPassing(repository, { ...unforced, requestId: 'forced', force: true });
    expect(forced).toMatchObject({ status: 'completed', summary: { overall: 'pass', sourceCommit: repository.commit } });
    if (forced.status !== 'completed') return;
    expect(forced.reused).toBeUndefined();
    expect(forced.refs.reportCommit).not.toBe(first.refs.reportCommit);
  });

  it('fact 14: evidence recorded under another ignore list is never reused, and the changed list starts a new record', async () => {
    const repository = await createRepository({ 'source.txt': 'source\n', 'docs/guide.md': 'guide\n', 'notes/n.md': 'note\n' });
    const docsOnly = { ...auditRequest(repository), force: false, full: true, ignorePaths: ['docs/**'] };
    const first = await runPassing(repository, docsOnly);
    expect(first.status).toBe('completed');
    if (first.status !== 'completed') return;

    await writeFile(join(repository.root, 'notes/n.md'), 'note, revised\n');
    git(repository.root, ['add', '--all']);
    git(repository.root, ['-c', 'user.name=Ramify Agent Test', '-c', 'user.email=ramify-agent-test@example.invalid', 'commit', '--no-gpg-sign', '-m', 'notes']);
    const later = git(repository.root, ['rev-parse', 'HEAD']);
    const widened = { ...docsOnly, ignorePaths: ['docs/**', 'notes/**'] };
    // The earlier record ignored only docs/**: under the new list it does not apply.
    const fresh = await runPassing(repository, { ...widened, requestId: 'new-list', source: { kind: 'existing-commit', revision: later } });
    expect(fresh).toMatchObject({ status: 'completed', summary: { sourceCommit: later } });
    if (fresh.status !== 'completed') return;
    expect(fresh.reused).toBeUndefined();
    expect(fresh.refs.reportCommit).not.toBe(first.refs.reportCommit);
    // A later ignored-only change under the new list reuses the new record.
    await writeFile(join(repository.root, 'notes/n.md'), 'note, revised again\n');
    git(repository.root, ['add', '--all']);
    git(repository.root, ['-c', 'user.name=Ramify Agent Test', '-c', 'user.email=ramify-agent-test@example.invalid', 'commit', '--no-gpg-sign', '-m', 'notes again']);
    const last = git(repository.root, ['rev-parse', 'HEAD']);
    const reused = await runPassing(repository, { ...widened, requestId: 'reuse-new-list', source: { kind: 'existing-commit', revision: last } });
    expect(reused).toMatchObject({ status: 'completed', reused: { sourceCommit: last, auditedCommit: later, ignoredChangedPaths: ['notes/n.md'] },
      refs: { reportCommit: fresh.refs.reportCommit } });
  });

  it('refuses duplicate check IDs, including two checks of kind tests', async () => {
    const repository = await createRepository();
    const testsOne = registeredCheck('tests');
    const testsTwo = registeredCheck('tests');
    testsOne.metadata = { kind: 'tests', selection: 'owner-a' };
    testsTwo.metadata = { kind: 'tests', selection: 'owner-b' };
    const result = await createAuditService({
      git: gitWithHarnessIdentity(), registeredExecutors: passingBridge(),
    }).run(auditRequest(repository, [testsOne, testsTwo]));
    expect(result).toMatchObject({
      status: 'failed', error: { message: 'Duplicate check id "tests".' },
    });
    expect(publishedRefs(repository.root)).toEqual([]);
  });

  it('audits a commitAccepted commit without changing branch, HEAD, index or worktree', async () => {
    const repository = await createRepository();
    await createRunBranch(repository.root, 'conformance');
    await writeFile(join(repository.root, 'accepted.txt'), 'accepted\n');
    const commit = await commitAccepted(
      repository.root,
      'conformance commit\n\nRamify-Gate: ga-conformance',
    );
    expect(commit).not.toBeNull();
    const accepted = { ...repository, commit: commit!, tree: git(repository.root, ['rev-parse', 'HEAD^{tree}']) };
    const before = {
      branch: git(repository.root, ['branch', '--show-current']),
      head: git(repository.root, ['rev-parse', 'HEAD']),
      index: git(repository.root, ['diff', '--cached', '--name-status']),
      status: git(repository.root, ['status', '--porcelain', '--untracked-files=all']),
      clean: await isCleanRepository(repository.root),
    };
    const result = await runPassing(accepted);
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    expect(await readCommitAuditNote(commit!, repository.root)).toMatchObject({ overall: 'pass' });
    expect(git(repository.root, ['rev-parse', result.refs.runRef])).toBe(result.refs.reportCommit);
    expect(git(repository.root, ['rev-parse', result.refs.treeRef])).toBe(result.refs.reportCommit);
    expect({
      branch: git(repository.root, ['branch', '--show-current']),
      head: git(repository.root, ['rev-parse', 'HEAD']),
      index: git(repository.root, ['diff', '--cached', '--name-status']),
      status: git(repository.root, ['status', '--porcelain', '--untracked-files=all']),
      clean: await isCleanRepository(repository.root),
    }).toEqual(before);
  });
});
