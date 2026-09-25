import { spawn } from 'node:child_process';
import { lstat, mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  AUDIT_PROTOCOL_VERSION,
  FULL_SELECTOR_ID,
  FULL_SELECTOR_VERSION,
  createAuditService,
  createInProcessRegisteredExecutorBridge,
  createNodeExecutionLeaseProcessLookup,
  createNodeRepositoryExecutionLease,
  resolveRepositoryExecutionLeaseIdentity,
  type AuditCheckSummary,
  type AuditRequest,
  type CheckDefinition,
  type GitExecutorPort,
  type RegisteredExecutorResult,
  type WorkspacePreparationPort,
} from 'ramify-audit';

import { childEnvironment, outputTailBytes, runCommand } from '../../evidence/src/run-command.js';
import type { CommandRun } from '../../evidence/src/run-command.js';
import { checkOutputPath, commandStart } from '../../../src/checks/execution.js';
import type { CheckExecutionPort, CheckExecutionRequest } from '../../../src/checks/execution.js';
import { checkCommandEnvironment } from '../../../src/checks/records.js';
import type { GateCommandRecord } from '../../../src/checks/records.js';
import { runScenarioCheck } from '../../../src/checks/scenario-check.js';
import type { PlannedCheck } from '../../../src/checks/verify.js';

const executorId = 'ramify-agent.gate-check';
const preparationId = 'ramify-agent.dependencies';
const harnessCheckId = 'harness-rules';
const gitTimeoutMs = 60_000;

/**
 * The ownership inputs the harness must persist before `git worktree add`
 * runs. Returning from this callback means the record is durable; iteration
 * 4 owns its concrete record, storage and recovery lifecycle.
 */
export interface IntendedAuditWorkspace {
  readonly repositoryRoot: string;
  readonly gitCommonDirectory: string;
  readonly repositoryId: string;
  readonly temporaryDirectory: string;
  readonly worktreePath: string;
  readonly sourceCommit: string;
  readonly runId: string;
  readonly attemptId: string;
  readonly process: { readonly id: number; readonly startMarker: string };
}

/** Harness-owned durable-state port called before the audit creates a worktree. */
export interface AuditWorkspaceOwnershipRecorder {
  recordIntendedWorkspace(workspace: IntendedAuditWorkspace): Promise<void>;
  /** Called under ramify-audit's repository lease before a new worktree is created. */
  recoverAbandonedWorkspaces(repository: {
    readonly repositoryRoot: string;
    readonly gitCommonDirectory: string;
    readonly repositoryId: string;
  }): Promise<void>;
  /** Called only after ramify-audit's own worktree cleanup has returned. */
  recordWorkspaceCleaned(workspace: IntendedAuditWorkspace): Promise<void>;
}

export interface AuditCheckExecutionOptions {
  readonly workspaceOwnership: AuditWorkspaceOwnershipRecorder;
}

/**
 * Runs a verified gate plan over an existing commit in ramify-audit's
 * isolated worktree. This module is the only importer of ramify-audit.
 */
export function createAuditCheckExecution(options: AuditCheckExecutionOptions): CheckExecutionPort {
  return {
    async run(checks, request) {
      const runId = request.context.runId;
      if (runId === undefined || runId.trim() === '') {
        return executionFailure(await infrastructureRecords(checks, request, {
          kind: 'audit-context',
          message: 'An audit gate requires the durable run ID that owns its workspace',
        }));
      }
      if (request.signal.aborted) return executionFailure(await interruptedRecords(checks, request, signalReason(request.signal)));

      const baseGit = gitWithHarnessEnvironment();
      let mapping: PathMapping;
      let repository: Awaited<ReturnType<typeof resolveRepositoryExecutionLeaseIdentity>>;
      let identity: Awaited<ReturnType<ReturnType<typeof createNodeExecutionLeaseProcessLookup>['lookup']>>;
      try {
        mapping = await resolvePathMapping(request.context.projectRoot, baseGit, request.signal);
        repository = await resolveRepositoryExecutionLeaseIdentity(mapping.repositoryRoot, { git: baseGit });
        identity = await createNodeExecutionLeaseProcessLookup().lookup(process.pid);
      } catch (error) {
        if (request.signal.aborted) return executionFailure(await interruptedRecords(checks, request, signalReason(request.signal)));
        return executionFailure(await infrastructureRecords(checks, request, { kind: 'audit-context', message: errorMessage(error) }));
      }
      if (identity.status !== 'alive') {
        return executionFailure(await infrastructureRecords(checks, request, {
          kind: 'audit-process-identity',
          message: 'The audit process identity could not be established before workspace creation',
        }));
      }

      const records = new Map<string, GateCommandRecord>();
      const definitions = checkDefinitions(checks);
      const bridge = createInProcessRegisteredExecutorBridge({
        [executorId]: async (registered, signal) => {
          if (registered.checkId === harnessCheckId) return harnessSummary(request);
          const planned = plannedCheck(definitions, checks, registered.checkId);
          if (planned === null) {
            return {
              status: 'failed',
              error: { code: 'unknown-check', message: `No planned harness check matches "${registered.checkId}"` },
            };
          }
          const [index, check] = planned;
          await request.started?.(commandStart(checks, index));
          const outputFile = checkOutputPath(request.directory, index, check);
          const auditedProjectRoot = mapping.projectRootIn(registered.workingDirectory);
          if (check.scenarios !== undefined) {
            // The profiles and streams go into the attempt's directory,
            // outside the worktree; the runs start in the worktree, and the
            // configured commands' paths are rebased into it.
            const outcome = await runScenarioCheck({
              command: check.command,
              plan: check.scenarios,
              projectRoot: auditedProjectRoot,
              attemptDirectory: request.directory,
              outputFile,
              rebase: argument => mapping.rebaseProjectArgument(argument, auditedProjectRoot),
              restore: text => mapping.restoreText(text, registered.workingDirectory),
              signal,
            });
            const record = request.classify(check, outcome.run, outputFile, outcome.summary);
            records.set(registered.checkId, record);
            if (outcome.run.outcome.kind === 'cancelled') {
              return { status: 'cancelled', reason: 'Gate execution was interrupted' };
            }
            return { status: 'completed', result: auditSummary(record, outcome.run) };
          }
          const command = {
            ...check.command,
            cwd: mapping.rebaseProjectPath(check.command.cwd, auditedProjectRoot),
            argv: check.command.argv.map(argument => mapping.rebaseProjectArgument(argument, auditedProjectRoot)),
          };
          const run = await runCommand({
            argv: command.argv,
            cwd: command.cwd,
            env: checkCommandEnvironment(check.command),
            timeoutMs: check.command.timeoutMs,
            signal,
          });
          const mapped = await writeMappedRun(run, outputFile, mapping, registered.workingDirectory);
          const record = request.classify(check, mapped, outputFile);
          records.set(registered.checkId, record);
          if (mapped.outcome.kind === 'cancelled') {
            return { status: 'cancelled', reason: 'Gate execution was interrupted' };
          }
          return { status: 'completed', result: auditSummary(record, mapped) };
        },
      });

      const preparation = workspacePreparation(mapping, request);
      const recordedWorkspace: { current: IntendedAuditWorkspace | null } = { current: null };
      const git = recordingGit({
        base: baseGit,
        mapping,
        repository,
        request,
        runId,
        processIdentity: identity.startMarker,
        recorder: options.workspaceOwnership,
        recorded: workspace => { recordedWorkspace.current = workspace; },
      });
      const baseLease = createNodeRepositoryExecutionLease({ git: baseGit });
      const executionLease = {
        async acquire(input: Parameters<typeof baseLease.acquire>[0]) {
          const ownership = await baseLease.acquire(input);
          try {
            await options.workspaceOwnership.recoverAbandonedWorkspaces({
              repositoryRoot: mapping.repositoryRoot,
              gitCommonDirectory: repository.gitCommonDirectory,
              repositoryId: repository.repositoryId,
            });
            return ownership;
          } catch (error) {
            await ownership.release();
            throw error;
          }
        },
        validateOwnership: baseLease.validateOwnership.bind(baseLease),
      };
      const service = createAuditService({ git, registeredExecutors: bridge, workspacePreparation: preparation, executionLease });
      const bound = AbortSignal.timeout(request.context.timeoutMs);
      const signal = AbortSignal.any([request.signal, bound]);
      const result = await service.run(auditRequest(definitions, request, mapping, runId), signal);
      if (recordedWorkspace.current !== null) await options.workspaceOwnership.recordWorkspaceCleaned(recordedWorkspace.current);

      if (result.status === 'cancelled') return executionFailure(await interruptedRecords(checks, request, result.reason));
      if (result.status === 'failed') {
        // After workspace intent is recorded, library failures may name the
        // isolated worktree even though its finally block has removed it.
        // Restore that exact prefix; before worktree selection there is no
        // temporary path to restore, so repositoryRoot is a safe no-op.
        const failurePath = recordedWorkspace.current?.worktreePath ?? mapping.repositoryRoot;
        return executionFailure(await infrastructureRecords(checks, request, {
          kind: result.error.code,
          message: mapping.restoreText(result.error.message, failurePath),
        }));
      }
      const missing = definitions
        .filter(definition => definition.id !== harnessCheckId && !records.has(definition.id))
        .map(definition => definition.id);
      if (missing.length > 0) {
        return executionFailure(await infrastructureRecords(checks, request, {
          kind: 'audit-result',
          message: `The completed audit returned no harness command record for ${missing.join(', ')}`,
        }));
      }
      const commands = definitions.flatMap(definition => {
        if (definition.id === harnessCheckId) return [];
        const record = records.get(definition.id);
        return record === undefined ? [] : [record];
      });
      return {
        commands,
        audited: result.summary.sourceCommit,
        evidence: { runRef: result.refs.runRef, reportCommit: result.refs.reportCommit, treeRef: result.refs.treeRef },
        auditOverall: result.summary.overall,
      };
    },
  };
}

function executionFailure(commands: readonly GateCommandRecord[]) {
  return { commands, audited: null, evidence: null };
}

interface PathMapping {
  readonly repositoryRoot: string;
  readonly projectPrefix: string;
  projectRootIn(worktreeRoot: string): string;
  rebaseProjectPath(value: string, auditedProjectRoot: string): string;
  rebaseProjectArgument(value: string, auditedProjectRoot: string): string;
  restoreText(value: string, worktreeRoot: string): string;
}

async function resolvePathMapping(projectRoot: string, git: GitExecutorPort, signal: AbortSignal): Promise<PathMapping> {
  const project = await realpath(projectRoot);
  const repositoryRoot = await gitText(git, project, ['rev-parse', '--show-toplevel'], signal);
  const repository = await realpath(repositoryRoot);
  const projectPrefix = relative(repository, project);
  if (isAbsolute(projectPrefix) || projectPrefix === '..' || projectPrefix.startsWith(`..${sep}`)) {
    throw new Error(`Project root ${project} is outside repository ${repository}`);
  }
  const projectRootIn = (worktreeRoot: string): string => projectPrefix === '' ? worktreeRoot : join(worktreeRoot, projectPrefix);
  return {
    repositoryRoot: repository,
    projectPrefix: projectPrefix.split(sep).join('/'),
    projectRootIn,
    rebaseProjectPath(value, auditedProjectRoot) {
      const suffix = containedSuffix(project, value);
      if (suffix === null) throw new Error(`Check working directory ${value} is outside project ${project}`);
      return suffix === '' ? auditedProjectRoot : join(auditedProjectRoot, suffix);
    },
    rebaseProjectArgument(value, auditedProjectRoot) {
      if (!isAbsolute(value)) return value;
      const suffix = containedSuffix(project, value);
      return suffix === null ? value : suffix === '' ? auditedProjectRoot : join(auditedProjectRoot, suffix);
    },
    restoreText(value, worktreeRoot) {
      return replacePath(value, worktreeRoot, repository);
    },
  };
}

function containedSuffix(root: string, candidate: string): string | null {
  const suffix = relative(root, resolve(candidate));
  return isAbsolute(suffix) || suffix === '..' || suffix.startsWith(`..${sep}`) ? null : suffix;
}

/** Replace only a complete path prefix, never the prefix of another segment. */
function replacePath(value: string, from: string, to: string): string {
  let cursor = 0;
  let answer = '';
  while (cursor < value.length) {
    const found = value.indexOf(from, cursor);
    if (found < 0) return answer + value.slice(cursor);
    const before = found === 0 ? '' : value[found - 1]!;
    const after = value[found + from.length] ?? '';
    const beforeBoundary = before === '' || !/[A-Za-z0-9._-]/u.test(before);
    const afterBoundary = after === '' || after === '/' || after === '\\' || !/[A-Za-z0-9._-]/u.test(after);
    if (beforeBoundary && afterBoundary) {
      answer += value.slice(cursor, found) + to;
      cursor = found + from.length;
    } else {
      answer += value.slice(cursor, found + from.length);
      cursor = found + from.length;
    }
  }
  return answer;
}

function checkDefinitions(checks: readonly PlannedCheck[]): CheckDefinition[] {
  const planned = checks.map((check, index): CheckDefinition => ({
    id: checkId(index, check),
    name: `${check.kind} ${index + 1}`,
    description: `Harness-planned ${check.kind} check at position ${index + 1}`,
    scope: 'both',
    category: 'registered',
    executor: { kind: 'registered', executorId },
    onFailure: 'record',
    metadata: { kind: check.kind, position: index + 1 },
  }));
  planned.push({
    id: harnessCheckId,
    name: 'Harness rules',
    description: 'Guarded-file authorization and harness-owned rules computed before the commit',
    scope: 'both',
    category: 'registered',
    executor: { kind: 'registered', executorId },
    onFailure: 'record',
  });
  return planned;
}

function checkId(index: number, check: PlannedCheck): string {
  return `check-${String(index + 1).padStart(2, '0')}-${check.kind}`;
}

function plannedCheck(
  definitions: readonly CheckDefinition[],
  checks: readonly PlannedCheck[],
  id: string,
): readonly [number, PlannedCheck] | null {
  const index = definitions.findIndex(definition => definition.id === id);
  const check = checks[index];
  return index < 0 || check === undefined ? null : [index, check];
}

function auditRequest(
  checks: CheckDefinition[],
  request: CheckExecutionRequest,
  mapping: PathMapping,
  runId: string,
): AuditRequest {
  const selection = request.context.selection;
  const owners = selection.policy === 'owned-by-scope'
    ? [...selection.exactOwners.map(owner => `exact:${owner}`), ...selection.subtrees.map(owner => `subtree:${owner}`)].sort()
    : [];
  const universeId = [
    'ramify-agent', request.context.checkpoint, selection.policy,
    ...(owners.length === 0 ? [] : [owners.join(',')]),
  ].join(':');
  return {
    protocolVersion: AUDIT_PROTOCOL_VERSION,
    requestId: request.context.attemptId,
    repositoryPath: mapping.repositoryRoot,
    source: { kind: 'existing-commit', revision: request.context.sourceCommit },
    checks,
    selector: { id: FULL_SELECTOR_ID, version: FULL_SELECTOR_VERSION, config: {} },
    universeId,
    coverageClaim: {
      checkpoint: request.context.checkpoint,
      selectionPolicy: selection.policy,
      ...(owners.length === 0 ? {} : { owners }),
    },
    workspaceMode: 'isolated-worktree',
    workspacePreparation: { preparationId, options: { projectPrefix: mapping.projectPrefix } },
    registeredExecutorIds: [executorId],
    metadata: { runId, attemptId: request.context.attemptId },
  };
}

function harnessSummary(request: CheckExecutionRequest): RegisteredExecutorResult {
  const unauthorized = request.context.harness.guardedChanges.filter(change => change.authorizedBy === null);
  const failedRules = request.context.harness.rules.filter(rule => rule.outcome === 'failed');
  const passed = unauthorized.length === 0 && failedRules.length === 0;
  return {
    status: 'completed',
    result: {
      passed,
      status: passed ? 'pass' : 'fail',
      summary: passed ? 'Harness rules passed' : 'Harness rules found guarded or rule violations',
      details: {
        guardedChanges: request.context.harness.guardedChanges.length,
        unauthorizedGuardedChanges: unauthorized.length,
        failedRules: failedRules.map(rule => rule.rule),
      },
    },
  };
}

function workspacePreparation(mapping: PathMapping, execution: CheckExecutionRequest): WorkspacePreparationPort {
  return {
    async prepare(request, signal) {
      try {
        if (signal.aborted) return { status: 'cancelled', reason: signalReason(signal) };
        if (request.preparationId !== preparationId) {
          return { status: 'failed', error: { code: 'unknown-preparation', message: `Unknown preparation ${request.preparationId}` } };
        }
        const auditedProjectRoot = mapping.projectRootIn(request.workingDirectory);
        const directories = ['', ...execution.context.dependencyDirectories];
        for (const directory of directories) {
          if (signal.aborted) return { status: 'cancelled', reason: signalReason(signal) };
          const normalized = validateRelativeDirectory(directory);
          const source = join(execution.context.projectRoot, normalized, 'node_modules');
          const target = join(auditedProjectRoot, normalized, 'node_modules');
          await requireDirectory(source);
          await refuseExisting(target);
          await mkdir(dirname(target), { recursive: true });
          await symlink(source, target, 'dir');
        }
        return { status: 'completed', payload: { projectPrefix: mapping.projectPrefix, links: directories.length } };
      } catch (error) {
        return { status: 'failed', error: { code: 'dependency-link-failed', message: errorMessage(error) } };
      }
    },
  };
}

function validateRelativeDirectory(directory: string): string {
  if (directory === '') return '';
  const normalized = directory.split('/').join(sep);
  if (isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${sep}`)) {
    throw new Error(`Nested package path must stay within the project: ${directory}`);
  }
  return normalized;
}

async function requireDirectory(path: string): Promise<void> {
  const entry = await lstat(path).catch(() => null);
  if (entry === null || (!entry.isDirectory() && !entry.isSymbolicLink())) {
    throw new Error(`Installed dependencies are unavailable at ${path}`);
  }
}

async function refuseExisting(path: string): Promise<void> {
  const entry = await lstat(path).catch(error => {
    if (isErrno(error, 'ENOENT')) return null;
    throw error;
  });
  if (entry !== null) throw new Error(`Audit dependency target already exists at ${path}`);
}

function gitWithHarnessEnvironment(): GitExecutorPort {
  return {
    execute(request, signal) {
      return executeGit({
        repositoryPath: request.repositoryPath,
        args: request.args,
        ...(request.stdin === undefined ? {} : { stdin: request.stdin }),
        environment: childEnvironment({
          ...request.environment,
          GIT_TERMINAL_PROMPT: '0',
          GIT_AUTHOR_NAME: 'ramify-agent',
          GIT_AUTHOR_EMAIL: 'ramify-agent@localhost',
          GIT_COMMITTER_NAME: 'ramify-agent',
          GIT_COMMITTER_EMAIL: 'ramify-agent@localhost',
        }),
      }, signal);
    },
  };
}

/** Git with a complete allowlisted environment; unlike the library default it never merges process.env. */
function executeGit(
  request: {
    readonly repositoryPath: string;
    readonly args: readonly string[];
    readonly environment: Readonly<Record<string, string>>;
    readonly stdin?: string | undefined;
  },
  signal?: AbortSignal,
): ReturnType<GitExecutorPort['execute']> {
  const started = Date.now();
  return new Promise(resolveResult => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const finish = (result: Omit<Awaited<ReturnType<GitExecutorPort['execute']>>, 'durationMs' | 'stdout' | 'stderr'>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolveResult({ ...result, stdout, stderr, durationMs: Date.now() - started });
    };
    const child = spawn('git', [...request.args], {
      cwd: request.repositoryPath,
      env: request.environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const abort = () => child.kill('SIGTERM');
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, gitTimeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.once('error', error => finish({
      exitCode: null,
      signal: null,
      error: { code: (error as NodeJS.ErrnoException).code, message: error.message },
    }));
    child.once('close', (code, closedSignal) => finish({
      exitCode: code,
      signal: closedSignal,
      ...(timedOut ? { timedOut: true } : {}),
    }));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    child.stdin.end(request.stdin);
  });
}

function recordingGit(input: {
  readonly base: GitExecutorPort;
  readonly mapping: PathMapping;
  readonly repository: Awaited<ReturnType<typeof resolveRepositoryExecutionLeaseIdentity>>;
  readonly request: CheckExecutionRequest;
  readonly runId: string;
  readonly processIdentity: string;
  readonly recorder: AuditWorkspaceOwnershipRecorder;
  readonly recorded: (workspace: IntendedAuditWorkspace) => void;
}): GitExecutorPort {
  let recorded = false;
  return {
    async execute(request, signal) {
      if (!recorded && request.args[0] === 'worktree' && request.args[1] === 'add') {
        const worktreePath = request.args.at(-2);
        const sourceCommit = request.args.at(-1);
        if (worktreePath === undefined || sourceCommit === undefined) {
          throw new Error('git worktree add did not name its intended directory and source commit');
        }
        if (sourceCommit !== input.request.context.sourceCommit) {
          throw new Error(`git worktree add selected ${sourceCommit}, expected ${input.request.context.sourceCommit}`);
        }
        const workspace: IntendedAuditWorkspace = {
          repositoryRoot: input.mapping.repositoryRoot,
          gitCommonDirectory: input.repository.gitCommonDirectory,
          repositoryId: input.repository.repositoryId,
          temporaryDirectory: dirname(worktreePath),
          worktreePath,
          sourceCommit,
          runId: input.runId,
          attemptId: input.request.context.attemptId,
          process: { id: process.pid, startMarker: input.processIdentity },
        };
        await input.recorder.recordIntendedWorkspace(workspace);
        input.recorded(workspace);
        recorded = true;
      }
      return input.base.execute(request, signal);
    },
  };
}

async function writeMappedRun(
  run: CommandRun,
  outputFile: string,
  mapping: PathMapping,
  worktreeRoot: string,
): Promise<CommandRun> {
  const stdout = mapping.restoreText(run.stdout, worktreeRoot);
  const stderr = mapping.restoreText(run.stderr, worktreeRoot);
  const complete = `${stdout}${stderr}`;
  const bytes = Buffer.from(complete, 'utf8');
  await writeFile(outputFile, bytes);
  const outcome = run.outcome.kind === 'runner-error'
    ? { ...run.outcome, error: { ...run.outcome.error, message: mapping.restoreText(run.outcome.error.message, worktreeRoot) } }
    : run.outcome;
  return {
    ...run,
    outcome,
    stdout,
    stderr,
    output: {
      path: outputFile,
      bytes: bytes.byteLength,
      truncated: run.output.truncated,
      tail: bytes.subarray(Math.max(0, bytes.byteLength - outputTailBytes)).toString('utf8'),
    },
  };
}

function auditSummary(record: GateCommandRecord, run: CommandRun): AuditCheckSummary {
  const status = record.outcome === 'passed' ? 'pass' : 'fail';
  const summary = record.outcome === 'not-verified'
    ? `${record.kind} was not verified (${record.notVerified ?? 'unknown'})`
    : `${record.kind} ${record.outcome}`;
  return {
    passed: record.outcome === 'passed',
    status,
    summary,
    output: `${run.stdout}${run.stderr}`,
    durationSeconds: Number((record.elapsedMs / 1000).toFixed(3)),
    details: {
      kind: record.kind,
      exitCode: record.exitCode,
      notVerified: record.notVerified ?? null,
      ...(record.scenarios === undefined ? {} : {
        scenarios: {
          mode: record.scenarios.mode,
          selection: record.scenarios.selection.kind,
          runs: record.scenarios.runs.length,
          scenarios: record.scenarios.scenarios.map(result => ({ id: result.id, status: result.status })),
          untracked: { ...record.scenarios.untracked },
          failures: [...record.scenarios.failures],
        },
      }),
    },
    outputBytes: record.output.bytes,
    outputTruncated: record.output.truncated,
    ...(record.runnerError === null ? {} : { runnerError: record.runnerError }),
  };
}

async function interruptedRecords(
  checks: readonly PlannedCheck[],
  request: CheckExecutionRequest,
  reason: string,
): Promise<GateCommandRecord[]> {
  return syntheticRecords(checks, request, reason, { kind: 'cancelled' });
}

async function infrastructureRecords(
  checks: readonly PlannedCheck[],
  request: CheckExecutionRequest,
  error: { readonly kind: string; readonly message: string },
): Promise<GateCommandRecord[]> {
  return syntheticRecords(checks, request, error.message, { kind: 'runner-error', error });
}

async function syntheticRecords(
  checks: readonly PlannedCheck[],
  request: CheckExecutionRequest,
  output: string,
  outcome: CommandRun['outcome'],
): Promise<GateCommandRecord[]> {
  const startedAt = new Date().toISOString();
  return Promise.all(checks.map(async (check, index) => {
    const outputFile = checkOutputPath(request.directory, index, check);
    const text = `${output}\n`;
    await writeFile(outputFile, text);
    const bytes = Buffer.byteLength(text);
    return request.classify(check, {
      outcome,
      startedAt,
      elapsedMs: 0,
      output: { path: outputFile, bytes, truncated: false, tail: text },
      stdout: '',
      stderr: text,
    }, outputFile);
  }));
}

async function gitText(git: GitExecutorPort, root: string, args: string[], signal: AbortSignal): Promise<string> {
  const result = await git.execute({ repositoryPath: root, args }, signal);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim() || `exit ${String(result.exitCode)}`}`);
  }
  return result.stdout.trim();
}

function signalReason(signal: AbortSignal): string {
  return typeof signal.reason === 'string' ? signal.reason : 'Gate execution was interrupted';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
