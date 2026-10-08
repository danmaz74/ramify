import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  createAuditService,
  createNodeExecutionLeaseProcessLookup,
  createNodeProcessExecutor,
  createNodeRepositoryExecutionLease,
  findCompletedAuditRequest,
  requestFromCommittedConfiguration,
  readRawCheckResults,
  resolveRepositoryExecutionLeaseIdentity,
  TEST_LOCK_HELD_ENVIRONMENT,
  type AuditCheckSummary,
  type AuditEvent,
  type AuditProjectOutcome,
  type AuditResult,
  type GitExecutorPort,
  type NestedDiscoveryOutcome,
  type ProcessExecutorPort,
  type ProjectAuditResult,
} from 'ramify-audit';

import { childEnvironment } from '../../evidence/src/run-command.js';
import type { GateCommandStart, GateCommandStarted } from '../../../src/checks/execution.js';
import type { TestLockOverride } from './test-lock.js';

/*
 * The project's committed audit, run through the installed provider's public
 * service. This module is the only importer of ramify-audit's audit service.
 *
 * Every audit the harness requests is of a committed source: readiness's
 * HEAD, and each committing gate's candidate commit. The request is the one
 * `requestFromCommittedConfiguration` builds from the project's committed
 * `ramify-audit.json` at that commit, so its checks, ignore list, preparation
 * and universe are the project's own. The harness plans no command, walks no
 * test file and adds no check: the provider owns discovery, selection,
 * completeness, reuse and the verdict, and the harness keeps its result.
 */

/**
 * ramify-audit's built-in preparation: it links each package directory's
 * installed dependencies into the worktree and then runs the project's
 * setup commands there, in order. The harness registers no preparation of
 * its own.
 */
const preparationId = 'nodejs';
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
  /**
   * Persist a completed nested invocation's identities as soon as the
   * provider answers it, before anything else reads the answer. Returning
   * means the receipt is durable.
   */
  recordAuditInvocation(receipt: AuditInvocationReceipt): Promise<void>;
  /** The receipt recorded for this run's attempt, or null when none was. */
  auditInvocation(runId: string, attemptId: string): Promise<AuditInvocationReceipt | null>;
}

/**
 * One project of a nested invocation as the provider answered it, by its
 * durable identities: the request and report that hold its evidence. A
 * project the provider did not run keeps the provider's own answer, since
 * nothing was published for it.
 */
export interface AuditInvocationProject {
  readonly projectRoot: string;
  readonly verdict: 'pass' | 'fail' | 'indeterminate';
  readonly execution: 'ran' | 'reused' | 'not-run';
  readonly failures: readonly string[];
  /** The request the provider answered this project under. */
  readonly requestId: string;
  readonly runId: string | null;
  /** The published record's own request and source commit: where its evidence is found again. */
  readonly record: {
    readonly requestId: string;
    readonly sourceCommit: string;
    readonly reportCommit: string;
    readonly runRef: string;
    readonly treeRef: string;
  } | null;
  /** The provider's account of a reused record, kept as it answered it. */
  readonly reused: {
    readonly sourceCommit: string;
    readonly auditedCommit: string;
    readonly ignoredChangedPaths: readonly string[];
    readonly requestedMode: 'full' | 'ramify-partial';
    readonly resolution: 'requested' | 'defaulted';
  } | null;
  /** A project that did not complete: the provider's answer, which nothing published. */
  readonly unpublished: unknown;
}

/**
 * The durable receipt of one completed nested invocation: the request, the
 * source it answered, every project's identities, and the invocation's own
 * discovery and verdict, which the provider publishes in no project's record.
 */
export interface AuditInvocationReceipt {
  readonly schema: 'ramify-agent.audit-invocation/1';
  readonly runId: string;
  readonly attemptId: string;
  readonly requestId: string;
  readonly projectRoot: string;
  readonly sourceCommit: string;
  readonly projects: readonly AuditInvocationProject[];
  readonly discovery: ConfiguredNestedDiscovery;
  readonly invocationVerdict: 'pass' | 'fail' | 'indeterminate';
}

export interface AuditCheckExecutionOptions {
  readonly workspaceOwnership: AuditWorkspaceOwnershipRecorder;
  /** Tests substitute a private lock so they never take the machine lock. */
  readonly testLock?: TestLockOverride;
}

/** The harness's durable view of a committed audit definition. Provider types stay in this child. */
export interface CommittedAuditConfiguration {
  readonly sourceCommit: string;
  readonly path: string;
  readonly blob: string;
  readonly projectRoot: string;
  readonly checks: readonly unknown[];
  readonly ignorePaths: readonly string[];
  readonly undetectedConfigFilesForcingFullAudit: readonly string[];
  readonly workspace: {
    readonly preparationId: string;
    readonly packageDirectoriesDeclared: boolean;
    readonly linkNodeModules: boolean;
    readonly packageDirectories: readonly string[];
    readonly setupCommands: readonly {
      readonly name?: string;
      readonly argv: readonly string[];
      readonly cwd: string;
      readonly env: Readonly<Record<string, string>>;
      readonly timeoutMs: number;
    }[];
  };
}

/**
 * What the harness asks of the committed audit. `project-default` leaves the
 * mode to the provider, which audits a Ramify project `ramify-partial` from
 * its baseline and any other project in full; `full` asks for a full audit.
 * Neither forces a fresh run: applicable evidence the provider returns is
 * reused.
 */
export type ConfiguredAuditMode = 'project-default' | 'full';

/** The provider's account of a reused record: what it audited and why it applies to the request. */
export interface ConfiguredAuditReuse {
  /** The commit the reused record audited. */
  readonly auditedCommit: string;
  /** Committed paths between that commit and the requested one, each ignored by the record's policy. */
  readonly ignoredChangedPaths: readonly string[];
  /** The mode this request resolved to; the record's own mode is `executedMode`. */
  readonly requestedMode: 'full' | 'ramify-partial';
  readonly resolution: 'requested' | 'defaulted';
}

/** A count of one kind, summed over a project's checks. */
export interface ConfiguredCountBucket {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

/**
 * One project of a nested invocation, the requested root first: the
 * provider's verdict, failures and execution for it, and the identities of
 * the record that answers it. Counts and duration are the record's own;
 * a reused record's are those of the run that produced it.
 */
export interface ConfiguredProjectResult {
  readonly projectRoot: string;
  readonly verdict: 'pass' | 'fail' | 'indeterminate';
  /** `ran` this invocation, `reused` an applicable earlier record, or `not-run`. */
  readonly execution: 'ran' | 'reused' | 'not-run';
  readonly failures: readonly string[];
  /** `refused` when its completed record does not answer the request. */
  readonly status: 'completed' | 'failed' | 'cancelled' | 'refused';
  readonly requestId: string;
  readonly auditedSourceCommit: string | null;
  readonly requestedMode: 'full' | 'ramify-partial' | null;
  readonly executedMode: 'full' | 'ramify-partial' | null;
  readonly fallbackReason: string | null;
  readonly reuse: ConfiguredAuditReuse | null;
  readonly reportCommit: string | null;
  readonly runRef: string | null;
  readonly treeRef: string | null;
  /** The provider's commands that retrieve the record. */
  readonly retrievalCommands: readonly string[];
  readonly durationSeconds: number | null;
  readonly counts: {
    readonly checks: ConfiguredCountBucket;
    readonly tests: ConfiguredCountBucket | null;
    readonly scenarios: ConfiguredCountBucket | null;
  } | null;
  readonly detail: string;
}

/** What nested discovery skipped and could not decide, as the provider answered it. */
export interface ConfiguredNestedDiscovery {
  readonly status: 'complete' | 'indeterminate';
  readonly skipped: readonly {
    readonly projectRoot: string;
    readonly enclosingProject: string;
    readonly reason: 'external' | 'output' | 'repository' | 'packages' | 'generated';
    readonly directory: string;
  }[];
  readonly unavailable: readonly {
    readonly enclosingProject: string;
    readonly reason: string;
    readonly definitions: readonly string[];
  }[];
}

/**
 * One configured audit request's outcome, in the harness's vocabulary. A
 * `completed` result carries the provider's composed verdict, which is the
 * audit's health; a `refused` one completed with evidence that does not
 * answer the request (another definition, universe or project, or a
 * partial record for a full request), which the harness never treats as a
 * pass. The provider result and its published check results are retained
 * whole.
 *
 * A nested request's verdict is the provider's invocation verdict: a
 * nested project's failure fails it, and indeterminate discovery or an
 * unrun project leaves it indeterminate, whatever the root answered.
 */
export interface ConfiguredAuditResult {
  readonly status: 'completed' | 'failed' | 'cancelled' | 'refused';
  readonly requestId: string;
  readonly mode: ConfiguredAuditMode;
  /** Whether the request audited the tracked nested definitions too. */
  readonly nested: boolean;
  /** Every project of a nested invocation, the root first; null for a request of the root alone. */
  readonly projects: readonly ConfiguredProjectResult[] | null;
  /** What nested discovery skipped or could not decide; null for a request of the root alone. */
  readonly discovery: ConfiguredNestedDiscovery | null;
  readonly requestedSourceCommit: string;
  /** The commit the returned record audited: the requested one, or the original one of a reused record. */
  readonly auditedSourceCommit: string | null;
  readonly reused: boolean;
  readonly reuse: ConfiguredAuditReuse | null;
  /** The mode the provider resolved the request to, and the one it executed. */
  readonly requestedMode: 'full' | 'ramify-partial' | null;
  readonly executedMode: 'full' | 'ramify-partial' | null;
  readonly fallbackReason: string | null;
  readonly verdict: 'pass' | 'fail' | 'indeterminate' | null;
  readonly reportCommit: string | null;
  readonly runRef: string | null;
  readonly treeRef: string | null;
  readonly definition: { readonly path: string; readonly blob: string };
  readonly detail: string;
  /** The exact provider result. */
  readonly provider: unknown;
  /** The published per-check results of the returned record, raw runner output included by reference. */
  readonly checks: unknown;
}

/** Readiness's name for the same result. */
export type ConfiguredFullAuditResult = ConfiguredAuditResult;

/** Only machine-readable producer failures qualify a bounded rerun. */
export function configuredFullRecovery(provider: unknown): 'timeout' | 'infrastructure' | null {
  if (typeof provider !== 'object' || provider === null || !('status' in provider)) return null;
  const result = provider as AuditResult;
  if (result.status === 'failed') {
    if (result.error.code === 'timeout' || result.error.code === 'test-lock-wait-exceeded' ||
      (result.error.code === 'setup-command-timed-out' && result.error.details?.['cause'] === 'environment')) return 'timeout';
    if (result.error.retryable === true && result.error.code !== 'discovery-failed') return 'infrastructure';
    return null;
  }
  if (result.status !== 'completed') return null;
  const commands = Object.values(result.summary.checks).flatMap(check => [check, ...Object.values(check.commands ?? {})]);
  if (commands.some(command => (command.termination as { reason?: unknown } | undefined)?.reason === 'timeout' || command.runnerError?.kind === 'timeout')) return 'timeout';
  return null;
}

/** One configured audit, as readiness and every committing gate ask for it. */
export interface ConfiguredAuditInput {
  readonly projectRoot: string;
  readonly sourceCommit: string;
  /** The configuration the run captured; the commit's own must equal it. */
  readonly configuration: CommittedAuditConfiguration;
  readonly mode: ConfiguredAuditMode;
  /** Audit the tracked nested definitions too, as the final gate does. */
  readonly nested?: boolean;
  readonly runId: string;
  readonly attemptId: string;
  readonly signal?: AbortSignal;
  readonly started?: GateCommandStarted;
  readonly waiting?: (command: GateCommandStart, line: string) => Promise<void>;
  readonly lockAcquired?: () => void;
}

/**
 * Whether two reads of the committed audit definition carry the same policy:
 * the same definition path and blob, checks, ignore list, undetected
 * configuration and workspace preparation. The commit each was read at is
 * not part of the policy: a run captures it at readiness and asks it of
 * every later candidate commit, whose definition must be unchanged.
 */
export function sameAuditPolicy(current: CommittedAuditConfiguration, captured: CommittedAuditConfiguration): boolean {
  const policy = ({ sourceCommit: _commit, ...rest }: CommittedAuditConfiguration) => canonical(rest);
  return policy(current) === policy(captured);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface ConfiguredAuditPort {
  read(projectRoot: string, sourceCommit: string, signal?: AbortSignal): Promise<CommittedAuditConfiguration>;
  run(input: ConfiguredAuditInput): Promise<ConfiguredAuditResult>;
}

export function createConfiguredAudit(options: AuditCheckExecutionOptions): ConfiguredAuditPort {
  return {
    read: readCommittedAuditConfiguration,
    run: input => runConfiguredAudit({ ...input, workspaceOwnership: options.workspaceOwnership,
      ...(options.testLock === undefined ? {} : { testLock: options.testLock }) }),
  };
}

/**
 * Run the project's committed audit over `sourceCommit` with durable
 * workspace ownership. A completed request of the same identity is
 * recovered rather than run again. The captured configuration must equal the
 * commit's own: a run never audits under a policy it did not capture.
 */
export async function runConfiguredAudit(input: ConfiguredAuditInput & {
  readonly workspaceOwnership: AuditWorkspaceOwnershipRecorder;
  readonly testLock?: TestLockOverride;
}): Promise<ConfiguredAuditResult> {
  const baseGit = gitWithHarnessEnvironment();
  const signal = input.signal ?? new AbortController().signal;
  const mapping = await resolvePathMapping(input.projectRoot, baseGit, signal);
  const current = await readCommittedAuditConfiguration(input.projectRoot, input.sourceCommit, signal);
  if (!sameAuditPolicy(current, input.configuration)) {
    throw new Error(`Captured audit policy conflicts with ${current.path} at ${input.sourceCommit}; start a new run after reconciling the configuration`);
  }
  const nested = input.nested === true;
  const request = await requestFromCommittedConfiguration({
    git: baseGit, repositoryPath: mapping.repositoryRoot, sourceCommit: input.sourceCommit,
    projectRoot: mapping.projectPrefix || '.', full: input.mode === 'full', force: false, nested,
  });
  request.requestId = `${input.runId}:${input.attemptId}`;
  const repository = await resolveRepositoryExecutionLeaseIdentity(mapping.repositoryRoot, { git: baseGit });
  const identity = await createNodeExecutionLeaseProcessLookup().lookup(process.pid);
  if (identity.status !== 'alive') throw new Error('The audit process identity could not be established before workspace creation');
  let workspace: IntendedAuditWorkspace | null = null;
  const git = recordingGit({
    base: baseGit, mapping, repository, sourceCommit: input.sourceCommit, attemptId: input.attemptId,
    runId: input.runId, processIdentity: identity.startMarker, recorder: input.workspaceOwnership,
    recorded: value => { workspace = value; },
  });
  const baseLease = createNodeRepositoryExecutionLease({ git: baseGit });
  const executionLease = {
    async acquire(value: Parameters<typeof baseLease.acquire>[0]) {
      const ownership = await baseLease.acquire(value);
      try {
        await input.workspaceOwnership.recoverAbandonedWorkspaces({
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
  // A completed request is retrieved by its durable identities, never run
  // again. A root alone is found by its request; a nested invocation by the
  // receipt the harness recorded when the provider answered it. A root
  // record without a receipt is an invocation interrupted before its nested
  // projects completed: the provider is asked again, and answers every
  // project it already published from that evidence.
  const receipt = nested ? await input.workspaceOwnership.auditInvocation(input.runId, input.attemptId) : null;
  if (receipt !== null && (receipt.requestId !== request.requestId || receipt.sourceCommit !== input.sourceCommit
    || receipt.projectRoot !== (mapping.projectPrefix || '.'))) {
    throw new Error(`The recorded audit invocation of ${input.attemptId} answers request ${receipt.requestId} at ${receipt.sourceCommit}, not ${request.requestId} at ${input.sourceCommit}`);
  }
  const recovered = receipt !== null
    ? await retrieveInvocation(receipt, mapping.repositoryRoot, baseGit)
    : nested ? null : await findCompletedAuditRequest({ repositoryPath: mapping.repositoryRoot,
      projectRoot: mapping.projectPrefix || '.', requestId: request.requestId, sourceCommit: input.sourceCommit, git: baseGit });
  if (recovered?.status === 'completed') {
    // Settle any abandoned workspace of this request before its recovered result is used.
    const ownership = await executionLease.acquire({ repositoryPath: mapping.repositoryRoot,
      operation: 'audit-request-recovery', metadata: { requestId: request.requestId }, signal });
    await ownership.release();
  }
  const checkStarts = new Map(request.checks.map((check, index) => [check.id, {
    kind: 'configured' as const, name: check.name, position: index + 1, total: request.checks.length,
  }]));
  const progress = configuredAuditProgress(checkStarts, input);
  const result = recovered ?? await createAuditService({ git, processExecutor: configuredProcessExecutor(input.configuration, () => {
    if (workspace === null) throw new Error('The configured audit workspace was not recorded before process execution');
    return mapping.projectRootIn(workspace.worktreePath);
  }, nested ? nestedDefinitionCommands(baseGit, mapping.repositoryRoot, input.sourceCommit, () => {
    if (workspace === null) throw new Error('The configured audit workspace was not recorded before process execution');
    return workspace.worktreePath;
  }) : undefined), executionLease,
    ...(input.testLock === undefined ? {} : { machineTestLock: input.testLock }),
    eventSink: { emit: progress.emit },
  }).run(request, signal).finally(progress.settleAll);
  if (workspace !== null) await input.workspaceOwnership.recordWorkspaceCleaned(workspace);
  // A cancelled invocation keeps no receipt: asked again, the provider
  // answers the projects it published and runs the ones it did not.
  if (nested && recovered === null && !signal.aborted
    && result.projects !== undefined && result.discovery !== undefined && result.invocationVerdict !== undefined) {
    await input.workspaceOwnership.recordAuditInvocation(invocationReceipt(result, input, request.requestId, mapping.projectPrefix || '.'));
  }
  return configuredAuditResult(result, { ...input, nested }, request.requestId, mapping.repositoryRoot);
}

/** The identities of a nested invocation's answer, as its durable receipt holds them. */
function invocationReceipt(
  result: AuditResult,
  input: Pick<ConfiguredAuditInput, 'runId' | 'attemptId' | 'sourceCommit'>,
  requestId: string,
  projectRoot: string,
): AuditInvocationReceipt {
  return {
    schema: 'ramify-agent.audit-invocation/1', runId: input.runId, attemptId: input.attemptId, requestId, projectRoot,
    sourceCommit: input.sourceCommit,
    projects: (result.projects ?? []).map(project => {
      const answer = project.result;
      return {
        projectRoot: project.projectRoot, verdict: project.verdict, execution: project.execution, failures: [...project.failures],
        requestId: answer.requestId, runId: answer.status === 'failed' ? answer.runId ?? null : answer.runId,
        record: answer.status === 'completed' ? {
          requestId: answer.summary.execution?.requestId ?? answer.requestId, sourceCommit: answer.summary.sourceCommit,
          reportCommit: answer.refs.reportCommit, runRef: answer.refs.runRef, treeRef: answer.refs.treeRef,
        } : null,
        reused: answer.status === 'completed' && answer.reused !== undefined ? {
          sourceCommit: answer.reused.sourceCommit, auditedCommit: answer.reused.auditedCommit,
          ignoredChangedPaths: [...answer.reused.ignoredChangedPaths],
          requestedMode: answer.reused.requestedMode, resolution: answer.reused.resolution,
        } : null,
        unpublished: answer.status === 'completed' ? null : structuredClone(answer),
      };
    }),
    discovery: structuredClone(result.discovery!) as ConfiguredNestedDiscovery,
    invocationVerdict: result.invocationVerdict!,
  };
}

/**
 * A recorded nested invocation, rebuilt from its projects' exact published
 * records: each found again by its own request and source commit, never by
 * a mutable latest ref, and checked against the receipt. Nothing runs. The
 * invocation's discovery and verdict are the receipt's, which no project
 * record holds.
 */
async function retrieveInvocation(receipt: AuditInvocationReceipt, repositoryRoot: string, git: GitExecutorPort): Promise<AuditResult> {
  const projects: NonNullable<AuditResult['projects']> = [];
  for (const project of receipt.projects) {
    let answer: ProjectAuditResult;
    if (project.record === null) {
      answer = structuredClone(project.unpublished) as ProjectAuditResult;
      if (typeof answer !== 'object' || answer === null || answer.status === 'completed') {
        throw new Error(`The recorded audit invocation keeps no answer for unpublished project ${project.projectRoot}`);
      }
    } else {
      const found = await findCompletedAuditRequest({ repositoryPath: repositoryRoot, projectRoot: project.projectRoot,
        requestId: project.record.requestId, sourceCommit: project.record.sourceCommit, git });
      if (found?.status !== 'completed' || found.refs.reportCommit !== project.record.reportCommit || found.refs.runRef !== project.record.runRef) {
        throw new Error(`The recorded audit report ${project.record.reportCommit} of project ${project.projectRoot} is not retrievable`);
      }
      if (found.composition.verdict !== project.verdict) {
        throw new Error(`The recorded audit report of project ${project.projectRoot} composes ${found.composition.verdict}, not the recorded ${project.verdict}`);
      }
      answer = {
        ...found, requestId: project.requestId, runId: project.runId ?? found.runId,
        ...(project.reused === null ? {} : { reused: { ...project.reused, ignoredChangedPaths: [...project.reused.ignoredChangedPaths] } }),
      };
    }
    projects.push({ projectRoot: project.projectRoot, verdict: project.verdict, execution: project.execution,
      failures: [...project.failures], result: answer });
  }
  const root = projects.find(project => project.projectRoot === receipt.projectRoot);
  if (root === undefined) throw new Error(`The recorded audit invocation has no result for its root ${receipt.projectRoot}`);
  return { ...root.result, projects, discovery: structuredClone(receipt.discovery) as NestedDiscoveryOutcome,
    invocationVerdict: receipt.invocationVerdict };
}

/** The harness's account of one provider result, refusing completed evidence that does not answer the request. */
async function configuredAuditResult(
  result: AuditResult,
  input: Pick<ConfiguredAuditInput, 'sourceCommit' | 'configuration' | 'mode'> & { readonly nested: boolean },
  requestId: string,
  repositoryRoot: string,
): Promise<ConfiguredAuditResult> {
  const nested = input.nested;
  const projects = nested && result.projects !== undefined
    ? result.projects.map(project => configuredProjectResult(project, input.configuration.projectRoot, input.mode, input.sourceCommit))
    : null;
  const discovery = nested && result.discovery !== undefined ? structuredClone(result.discovery) as ConfiguredNestedDiscovery : null;
  const base = {
    requestId, mode: input.mode, nested, projects, discovery, requestedSourceCommit: input.sourceCommit,
    definition: { path: input.configuration.path, blob: input.configuration.blob },
  };
  if (result.status !== 'completed') return {
    ...base, status: result.status, auditedSourceCommit: null, reused: false, reuse: null,
    requestedMode: null, executedMode: null, fallbackReason: null,
    verdict: null, reportCommit: null, runRef: null, treeRef: null,
    detail: result.status === 'failed' ? `${result.error.code}: ${result.error.message}` : result.reason,
    provider: result, checks: {},
  };
  const reuse = result.reused === undefined ? null : {
    auditedCommit: result.reused.auditedCommit, ignoredChangedPaths: [...result.reused.ignoredChangedPaths],
    requestedMode: result.reused.requestedMode, resolution: result.reused.resolution,
  };
  const completed = {
    ...base, auditedSourceCommit: result.summary.sourceCommit, reused: reuse !== null, reuse,
    requestedMode: result.summary.mode.requestedMode, executedMode: result.summary.mode.executedMode,
    fallbackReason: result.summary.mode.fallbackReason ?? null,
    reportCommit: result.refs.reportCommit, runRef: result.refs.runRef, treeRef: result.refs.treeRef,
    provider: result,
  };
  const refusal = configuredResultRefusal(result, input.configuration, input.mode, input.sourceCommit)
    ?? (nested ? nestedInvocationRefusal(result, projects ?? []) : null);
  if (refusal !== null) return { ...completed, status: 'refused', verdict: null, detail: refusal, checks: {} };
  // The record's published check results carry each command's complete
  // runner evidence; the run-local summary is never read in their place.
  const checks = await readRawCheckResults(result.summary, result.refs.reportCommit, repositoryRoot, gitWithHarnessEnvironment());
  if (nested) {
    // The invocation's verdict, never the root's alone: a nested failure,
    // an unrun project or indeterminate discovery decides it.
    const verdict = result.invocationVerdict!;
    return { ...completed, status: 'completed', verdict, detail: invocationDetail(verdict, projects ?? [], discovery!), checks };
  }
  return {
    ...completed, status: 'completed', verdict: result.composition.verdict,
    detail: result.composition.reason ?? `composed ${result.composition.verdict}`, checks,
  };
}

/**
 * Why a completed nested invocation does not answer the request, or null
 * when it does: it must carry every project, its discovery and its verdict,
 * name the root first, and every nested project's completed record must
 * answer the request as the root's does. A project that did not complete is
 * an unrun project, which the invocation verdict already accounts for.
 */
export function nestedInvocationRefusal(result: AuditResult, projects: readonly ConfiguredProjectResult[]): string | null {
  if (result.projects === undefined || result.discovery === undefined || result.invocationVerdict === undefined) {
    return 'a nested request was answered without its project results, discovery and invocation verdict';
  }
  const root = result.status === 'completed' ? result.summary.coverage.projectRoot : null;
  if (projects[0]?.projectRoot !== root) return `a nested request was answered without the root project ${root ?? 'unknown'} first`;
  if (new Set(projects.map(project => project.projectRoot)).size !== projects.length) return 'a nested request was answered with a project twice';
  const refused = projects.find(project => project.status === 'refused');
  return refused === undefined ? null : `nested project ${refused.projectRoot}: ${refused.detail}`;
}

/** One provider project outcome in the harness's vocabulary, its completed record checked as the root's is. */
export function configuredProjectResult(
  outcome: AuditProjectOutcome,
  rootProject: string,
  mode: ConfiguredAuditMode,
  sourceCommit: string,
): ConfiguredProjectResult {
  const answer = outcome.result;
  const common = {
    projectRoot: outcome.projectRoot, verdict: outcome.verdict, execution: outcome.execution, failures: [...outcome.failures],
    requestId: answer.requestId,
  };
  if (answer.status !== 'completed') return {
    ...common, status: answer.status, auditedSourceCommit: null, requestedMode: null, executedMode: null, fallbackReason: null,
    reuse: null, reportCommit: null, runRef: null, treeRef: null, retrievalCommands: [], durationSeconds: null, counts: null,
    detail: answer.status === 'failed' ? `${answer.error.code}: ${answer.error.message}` : answer.reason,
  };
  // The root is checked against the captured definition; a nested project
  // against its own record: the same project, source and full execution.
  const refusal = outcome.projectRoot === rootProject ? null : nestedProjectRefusal(answer, outcome.projectRoot, mode, sourceCommit);
  return {
    ...common, status: refusal === null ? 'completed' : 'refused',
    auditedSourceCommit: answer.summary.sourceCommit,
    requestedMode: answer.summary.mode.requestedMode, executedMode: answer.summary.mode.executedMode,
    fallbackReason: answer.summary.mode.fallbackReason ?? null,
    reuse: answer.reused === undefined ? null : {
      auditedCommit: answer.reused.auditedCommit, ignoredChangedPaths: [...answer.reused.ignoredChangedPaths],
      requestedMode: answer.reused.requestedMode, resolution: answer.reused.resolution,
    },
    reportCommit: answer.refs.reportCommit, runRef: answer.refs.runRef, treeRef: answer.refs.treeRef,
    retrievalCommands: [...answer.retrievalCommands],
    durationSeconds: answer.summary.durationSeconds ?? null,
    counts: countsOf(answer.summary.checks),
    detail: refusal ?? answer.composition.reason ?? `composed ${answer.composition.verdict}`,
  };
}

/** Why a nested project's completed record does not answer the request, or null when it does. */
function nestedProjectRefusal(
  answer: Extract<ProjectAuditResult, { status: 'completed' }>,
  projectRoot: string,
  mode: ConfiguredAuditMode,
  sourceCommit: string,
): string | null {
  if (answer.summary.evidenceSchemaVersion !== 4 || answer.summary.producer.name !== 'ramify-audit') return 'the result is not schema-4 ramify-audit evidence';
  if (answer.summary.coverage.projectRoot !== projectRoot) return `the result audited project ${answer.summary.coverage.projectRoot}, not ${projectRoot}`;
  if (answer.reused === undefined ? answer.summary.sourceCommit !== sourceCommit
    : answer.reused.sourceCommit !== sourceCommit || answer.reused.auditedCommit !== answer.summary.sourceCommit) {
    return `the result does not answer source ${sourceCommit}`;
  }
  if (mode === 'full' && (answer.summary.mode.executedMode !== 'full' || answer.composition.scoped || answer.summary.coverage.selection.kind !== 'full')) {
    return 'a full request was answered by evidence that is not an executed full audit';
  }
  return null;
}

/** The record's own counts: its checks by status, and its tests and scenarios summed over every check that reports them. */
function countsOf(checks: Readonly<Record<string, AuditCheckSummary>>): ConfiguredProjectResult['counts'] {
  const bucket = () => ({ total: 0, passed: 0, failed: 0, skipped: 0 });
  const tally = bucket();
  let tests: ConfiguredCountBucket | null = null;
  let scenarios: ConfiguredCountBucket | null = null;
  const add = (into: ConfiguredCountBucket | null, value: unknown): ConfiguredCountBucket | null => {
    if (typeof value !== 'object' || value === null) return into;
    const counts = value as Partial<Record<keyof ConfiguredCountBucket, unknown>>;
    const number = (key: keyof ConfiguredCountBucket) => (typeof counts[key] === 'number' ? counts[key] as number : 0);
    const base = into ?? bucket();
    return { total: base.total + number('total'), passed: base.passed + number('passed'), failed: base.failed + number('failed'), skipped: base.skipped + number('skipped') };
  };
  for (const check of Object.values(checks)) {
    tally.total += 1;
    const status = check.status ?? (check.passed ? 'pass' : 'fail');
    if (status === 'pass' || status === 'warn') tally.passed += 1;
    else if (status === 'fail') tally.failed += 1;
    else tally.skipped += 1;
    tests = add(tests, check.counts?.['tests']);
    scenarios = add(scenarios, check.counts?.['scenarios']);
  }
  return { checks: tally, tests, scenarios };
}

/** One sentence for a nested invocation's verdict: which projects failed or did not run, and what discovery could not decide. */
function invocationDetail(verdict: 'pass' | 'fail' | 'indeterminate', projects: readonly ConfiguredProjectResult[], discovery: ConfiguredNestedDiscovery): string {
  const parts = [`invocation ${verdict} over ${projects.length} project${projects.length === 1 ? '' : 's'}`];
  const failed = projects.filter(project => project.verdict === 'fail').map(project => project.projectRoot);
  const unsettled = projects.filter(project => project.verdict === 'indeterminate').map(project => project.projectRoot);
  if (failed.length > 0) parts.push(`failed: ${failed.join(', ')}`);
  if (unsettled.length > 0) parts.push(`indeterminate: ${unsettled.join(', ')}`);
  if (discovery.status === 'indeterminate') parts.push(`discovery indeterminate beneath ${discovery.unavailable.map(gap => gap.enclosingProject).join(', ')}`);
  if (discovery.skipped.length > 0) parts.push(`skipped: ${discovery.skipped.map(skip => `${skip.projectRoot} (${skip.reason})`).join(', ')}`);
  return parts.join('; ');
}

/**
 * Why a completed provider result does not answer this request, or null
 * when it does. Its record must be schema-4 ramify-audit evidence of the
 * same project, definition and check universe, for the requested commit or,
 * when reused, applicable to it. A full request is answered only by an
 * executed full record; a partial chain never stands in for one.
 */
export function configuredResultRefusal(
  result: Extract<AuditResult, { status: 'completed' }>,
  configuration: CommittedAuditConfiguration,
  mode: ConfiguredAuditMode,
  sourceCommit: string,
): string | null {
  const claim = result.summary.coverage.claim['configuration'];
  const identity = typeof claim === 'object' && claim !== null && !Array.isArray(claim) ? claim as Record<string, unknown> : {};
  const expected = configuration.checks.flatMap(check => typeof check === 'object' && check !== null && 'id' in check && typeof check.id === 'string' ? [check.id] : []);
  if (result.summary.evidenceSchemaVersion !== 4 || result.summary.producer.name !== 'ramify-audit') return 'the result is not schema-4 ramify-audit evidence';
  if (result.summary.coverage.projectRoot !== configuration.projectRoot) return `the result audited project ${result.summary.coverage.projectRoot}, not ${configuration.projectRoot}`;
  if (identity['path'] !== configuration.path || identity['blob'] !== configuration.blob) return `the result was not produced under the captured definition ${configuration.path} blob ${configuration.blob}`;
  if (expected.length !== configuration.checks.length ||
    JSON.stringify([...result.summary.coverage.universe.checkIds].sort()) !== JSON.stringify([...expected].sort())) return 'the result ran another check universe';
  if (result.reused === undefined ? result.summary.sourceCommit !== sourceCommit
    : result.reused.sourceCommit !== sourceCommit || result.reused.auditedCommit !== result.summary.sourceCommit) {
    return `the result does not answer source ${sourceCommit}`;
  }
  if (mode === 'full' && (result.summary.mode.executedMode !== 'full' || result.composition.scoped || result.summary.coverage.selection.kind !== 'full')) {
    return 'a full request was answered by evidence that is not an executed full audit';
  }
  // Every check of the universe is either selected or omitted by the
  // provider's own selection, and every selected check has its record: no
  // required check passes through an absent result. The record is the
  // original audit's; reuse adds no receipt and needs none.
  const selection = result.summary.coverage.selection;
  const accounted = [...selection.selectedCheckIds, ...selection.omittedCheckIds].sort();
  if (JSON.stringify(accounted) !== JSON.stringify([...expected].sort())) return 'the result\'s selection does not account for every configured check';
  const unrecorded = selection.selectedCheckIds.filter(id => result.summary.checks[id] === undefined);
  if (unrecorded.length > 0) return `the result has no record of selected check ${unrecorded.join(', ')}`;
  return null;
}

/** Internal recovery predicate: only compatible executed-full evidence may complete readiness. */
export function configuredFullResultMatches(result: Extract<AuditResult, { status: 'completed' }>, configuration: CommittedAuditConfiguration): boolean {
  return configuredResultRefusal(result, configuration, 'full', result.reused?.sourceCommit ?? result.summary.sourceCommit) === null;
}

/** Read only the exact committed definition through the installed public provider. */
export async function readCommittedAuditConfiguration(projectRoot: string, sourceCommit: string, signal?: AbortSignal): Promise<CommittedAuditConfiguration> {
  const git = gitWithHarnessEnvironment();
  const mapping = await resolvePathMapping(projectRoot, git, signal ?? new AbortController().signal);
  const request = await requestFromCommittedConfiguration({
    git, repositoryPath: mapping.repositoryRoot, sourceCommit, projectRoot: mapping.projectPrefix || '.', full: true, force: false,
  });
  const configuration = (request.coverageClaim as { configuration?: { path?: string; sourceCommit?: string; blob?: string } } | undefined)?.configuration;
  if (configuration?.sourceCommit !== sourceCommit || typeof configuration.path !== 'string' || typeof configuration.blob !== 'string') {
    throw new Error(`The audit provider did not bind the committed definition to ${sourceCommit}`);
  }
  if (request.workspaceMode === 'existing-worktree' || request.workspacePreparation?.preparationId !== preparationId) {
    throw new Error(`${configuration.path} must declare supported nodejs preparation for a harness run`);
  }
  const options = request.workspacePreparation.options ?? {};
  const projectPrefix = options['projectPrefix'];
  if (projectPrefix !== undefined && projectPrefix !== mapping.projectPrefix && projectPrefix !== (mapping.projectPrefix || '.')) {
    throw new Error(`${configuration.path} workspace.options.projectPrefix must equal the audited project root ${mapping.projectPrefix || '.'}`);
  }
  const linkNodeModules = options['linkNodeModules'] ?? true;
  if (typeof linkNodeModules !== 'boolean') throw new Error(`${configuration.path} workspace.options.linkNodeModules must be boolean`);
  const directories = options['packageDirectories'];
  const setup = options['setupCommands'];
  if (directories !== undefined && (!Array.isArray(directories) || directories.some(value => typeof value !== 'string'))) {
    throw new Error(`${configuration.path} workspace.options.packageDirectories must be string paths`);
  }
  if (directories !== undefined && linkNodeModules === false) throw new Error(`${configuration.path} cannot list packageDirectories with linkNodeModules: false`);
  const relativeDirectory = (value: string) => value.replaceAll('\\', '/').split('/').every(segment => segment !== '..') &&
    !value.startsWith('/') && !/^[A-Za-z]:/u.test(value);
  if ((directories ?? []).some(value => typeof value !== 'string' || !relativeDirectory(value))) {
    throw new Error(`${configuration.path} workspace packageDirectories must remain inside the project`);
  }
  if (setup !== undefined && !Array.isArray(setup)) {
    throw new Error(`${configuration.path} workspace.options.setupCommands must be an ordered command array`);
  }
  const commands = (setup ?? []).map((value: unknown, index: number) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${configuration.path} setup command ${index + 1} must be an object`);
    const item = value as Record<string, unknown>;
    if (typeof item['cmd'] !== 'string' || item['cmd'] === '' || !Array.isArray(item['args']) || item['args'].some(arg => typeof arg !== 'string') ||
      (item['cwd'] !== undefined && typeof item['cwd'] !== 'string') ||
      (item['env'] !== undefined && (typeof item['env'] !== 'object' || item['env'] === null || Array.isArray(item['env']) || Object.values(item['env']).some(entry => typeof entry !== 'string'))) ||
      (item['timeoutMs'] !== undefined && (!Number.isInteger(item['timeoutMs']) || (item['timeoutMs'] as number) <= 0))) {
      throw new Error(`${configuration.path} setup command ${index + 1} has unsupported argv, cwd, env or timeout`);
    }
    return {
      ...(typeof item['name'] === 'string' ? { name: item['name'] } : {}),
      argv: [item['cmd'], ...item['args']] as string[],
      cwd: typeof item['cwd'] === 'string' ? item['cwd'] : '.',
      env: (item['env'] ?? {}) as Record<string, string>,
      timeoutMs: typeof item['timeoutMs'] === 'number' ? item['timeoutMs'] : 600_000,
    };
  });
  const build = options['build'] === undefined ? setup === undefined : options['build'];
  if (typeof build !== 'boolean') throw new Error(`${configuration.path} workspace.options.build must be boolean`);
  if (build) {
    const manifest = await gitText(git, mapping.repositoryRoot,
      ['show', `${sourceCommit}:${mapping.projectPrefix === '' ? '' : `${mapping.projectPrefix}/`}package.json`], signal ?? new AbortController().signal).catch(() => null);
    let scripts: unknown;
    try { scripts = manifest === null ? undefined : (JSON.parse(manifest) as { scripts?: unknown }).scripts; }
    catch { scripts = undefined; }
    if (typeof scripts === 'object' && scripts !== null && typeof (scripts as Record<string, unknown>)['build'] === 'string') {
      commands.unshift({ name: 'build', argv: ['npm', 'run', 'build'], cwd: '.', env: {}, timeoutMs: 120_000 });
    }
  }
  return {
    sourceCommit, path: configuration.path, blob: configuration.blob, projectRoot: mapping.projectPrefix || '.',
    checks: structuredClone(request.checks), ignorePaths: request.ignorePaths ?? [],
    undetectedConfigFilesForcingFullAudit: request.undetectedConfigFilesForcingFullAudit ?? [],
    workspace: { preparationId, packageDirectoriesDeclared: directories !== undefined, linkNodeModules,
      packageDirectories: (directories ?? ['']) as string[], setupCommands: commands },
  };
}

/** Project provider check events into existing run progress without command records. */
export function configuredAuditProgress(
  checks: ReadonlyMap<string, GateCommandStart>,
  callbacks: { readonly started?: GateCommandStarted; readonly waiting?: (command: GateCommandStart, line: string) => Promise<void>;
    readonly lockAcquired?: () => void },
): { emit(event: AuditEvent): Promise<void>; settleAll(): void } {
  const waits = new Set<string>();
  let activeWait = false;
  const releaseIfIdle = () => { if (activeWait && waits.size === 0) { activeWait = false; callbacks.lockAcquired?.(); } };
  return {
    async emit(event) {
      if (event.type === 'check.started') {
        const command = checks.get(event.checkId);
        if (command !== undefined) await callbacks.started?.(command);
      }
      if (event.type === 'check.waiting') {
        const command = checks.get(event.checkId);
        if (command !== undefined) {
          waits.add(`${event.checkId}\0${event.command}`);
          activeWait = true;
          await callbacks.waiting?.(command, `Waiting for audit test lock ${event.lockPath}`);
        }
      }
      if (event.type === 'check.lock-acquired') {
        if (waits.delete(`${event.checkId}\0${event.command}`)) releaseIfIdle();
      }
      if (event.type === 'check.completed') {
        for (const key of waits) if (key.startsWith(`${event.checkId}\0`)) waits.delete(key);
        releaseIfIdle();
      }
    },
    settleAll() { waits.clear(); releaseIfIdle(); },
  };
}

/** One command a committed definition declares: a setup command or a check's command. */
interface DeclaredCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

/** The commands a nested project's own committed definition declares, and its directory in the audit worktree. */
type NestedCommands = (workingDirectory: string) => Promise<{ readonly root: string; readonly commands: readonly DeclaredCommand[] } | null>;

function checkCommands(checks: readonly unknown[]): DeclaredCommand[] {
  const commands: DeclaredCommand[] = [];
  for (const check of checks) {
    if (typeof check !== 'object' || check === null) continue;
    const executor = (check as { executor?: { kind?: string; commands?: Array<{ cmd: string; args: string[]; cwd?: string; env?: Record<string, string> }> } }).executor;
    if (executor?.kind !== 'command') continue;
    for (const command of executor.commands ?? []) commands.push({ command: command.cmd, args: command.args,
      cwd: command.cwd ?? '.', env: command.env ?? {} });
  }
  return commands;
}

/**
 * Keep the harness's inherited environment boundary while retaining
 * declared/provider-added values. A command of a nested project, which a
 * nested invocation runs from that project's directory, is matched against
 * that project's own committed definition rather than the root's.
 */
export function configuredProcessExecutor(configuration: CommittedAuditConfiguration, projectRoot: () => string, nested?: NestedCommands): ProcessExecutorPort {
  const node = createNodeProcessExecutor();
  const providerEnvironment = new Set([
    TEST_LOCK_HELD_ENVIRONMENT, 'RAMIFY_AUDIT_VITEST_SUMMARY', 'RAMIFY_AUDIT_VITEST_ROOT',
    'RAMIFY_AUDIT_VITEST_DISCOVERY', 'RAMIFY_AUDIT_VITEST_EXCLUDES',
    'RAMIFY_AUDIT_CUCUMBER_SELECTION', 'CUCUMBER_SUMMARY_FILE',
  ]);
  const rootCommands: DeclaredCommand[] = [
    ...configuration.workspace.setupCommands.map(command => ({ command: command.argv[0]!, args: command.argv.slice(1),
      cwd: command.cwd, env: command.env })),
    ...checkCommands(configuration.checks),
  ];
  return { async execute(request, signal) {
    const owner = (await nested?.(request.workingDirectory)) ?? { root: projectRoot(), commands: rootCommands };
    const commands = owner.commands;
    const declaredNames = new Set(commands.flatMap(command => Object.keys(command.env)));
    const allowed = childEnvironment();
    const environment = { ...allowed };
    const matches = commands.filter(command => command.command === request.command && command.args.every((arg, index) => request.args[index] === arg)
      && resolve(owner.root, command.cwd) === resolve(request.workingDirectory));
    const longestArgs = Math.max(0, ...matches.map(command => command.args.length));
    const exact = matches.filter(command => command.args.length === longestArgs);
    if (exact.length === 0 && Object.keys(request.environment ?? {}).some(name => declaredNames.has(name))) {
      throw new Error(`No committed command identity matches ${request.command} ${request.args.join(' ')}; its declared environment cannot be projected safely`);
    }
    const signature = new Set(exact.map(command => JSON.stringify(command.env)));
    if (signature.size > 1) throw new Error(`Ambiguous declared environment for configured audit command ${request.command} ${request.args.join(' ')}`);
    const declared = exact[0]?.env ?? {};
    for (const [name, value] of Object.entries(declared)) {
      if (request.environment?.[name] !== value) throw new Error(`The provider did not preserve declared environment ${name} for ${request.command}`);
    }
    for (const [name, value] of Object.entries(request.environment ?? {})) {
      if (name in allowed || providerEnvironment.has(name)) environment[name] = value;
      else if (declared[name] !== undefined) environment[name] = declared[name];
    }
    return node.execute({ ...request, environment }, signal);
  } };
}

/**
 * The nested project a working directory of the audit worktree lies in:
 * the nearest directory below the worktree root with its own
 * `ramify-audit.json`, whose definition is read from the audited commit
 * through the provider. Null for the root project's own directories.
 */
function nestedDefinitionCommands(git: GitExecutorPort, repositoryRoot: string, sourceCommit: string, worktree: () => string): NestedCommands {
  const read = new Map<string, Promise<readonly DeclaredCommand[]>>();
  return async workingDirectory => {
    const top = resolve(worktree());
    let directory = resolve(workingDirectory);
    while (directory !== top && directory.startsWith(`${top}${sep}`) && !existsSync(join(directory, 'ramify-audit.json'))) directory = dirname(directory);
    if (directory === top || !directory.startsWith(`${top}${sep}`)) return null;
    const projectRoot = relative(top, directory).split(sep).join('/');
    let commands = read.get(projectRoot);
    if (commands === undefined) {
      commands = requestFromCommittedConfiguration({ git, repositoryPath: repositoryRoot, sourceCommit, projectRoot, full: true, force: false })
        .then(request => {
          const setup = request.workspacePreparation?.options?.['setupCommands'];
          const declared: DeclaredCommand[] = Array.isArray(setup) ? setup.flatMap(value => {
            if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
            const item = value as { cmd?: unknown; args?: unknown; cwd?: unknown; env?: unknown };
            if (typeof item.cmd !== 'string' || !Array.isArray(item.args)) return [];
            return [{ command: item.cmd, args: item.args.map(String), cwd: typeof item.cwd === 'string' ? item.cwd : '.',
              env: typeof item.env === 'object' && item.env !== null ? item.env as Record<string, string> : {} }];
          }) : [];
          return [...declared, ...checkCommands(request.checks)];
        });
      read.set(projectRoot, commands);
    }
    return { root: directory, commands: await commands };
  };
}

interface PathMapping {
  readonly repositoryRoot: string;
  /** The project root, its real path. */
  readonly projectRoot: string;
  readonly projectPrefix: string;
  projectRootIn(worktreeRoot: string): string;
}

async function resolvePathMapping(projectRoot: string, git: GitExecutorPort, signal: AbortSignal): Promise<PathMapping> {
  const project = await realpath(projectRoot);
  const repositoryRoot = await gitText(git, project, ['rev-parse', '--show-toplevel'], signal);
  const repository = await realpath(repositoryRoot);
  const projectPrefix = relative(repository, project);
  if (isAbsolute(projectPrefix) || projectPrefix === '..' || projectPrefix.startsWith(`..${sep}`)) {
    throw new Error(`Project root ${project} is outside repository ${repository}`);
  }
  return {
    repositoryRoot: repository,
    projectPrefix: projectPrefix.split(sep).join('/'),
    projectRoot: project,
    projectRootIn: worktreeRoot => projectPrefix === '' ? worktreeRoot : join(worktreeRoot, projectPrefix),
  };
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
  readonly sourceCommit: string;
  readonly attemptId: string;
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
        if (sourceCommit !== input.sourceCommit) {
          throw new Error(`git worktree add selected ${sourceCommit}, expected ${input.sourceCommit}`);
        }
        const workspace: IntendedAuditWorkspace = {
          repositoryRoot: input.mapping.repositoryRoot,
          gitCommonDirectory: input.repository.gitCommonDirectory,
          repositoryId: input.repository.repositoryId,
          temporaryDirectory: dirname(worktreePath),
          worktreePath,
          sourceCommit,
          runId: input.runId,
          attemptId: input.attemptId,
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

async function gitText(git: GitExecutorPort, root: string, args: string[], signal: AbortSignal): Promise<string> {
  const result = await git.execute({ repositoryPath: root, args }, signal);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim() || `exit ${String(result.exitCode)}`}`);
  }
  return result.stdout.trim();
}
