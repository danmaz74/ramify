import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { AgentPort } from '../../subs/agent/src/interfaces/port.js';
import type { GitService } from '../../subs/evidence/src/git.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { writeFileAtomic } from '../../subs/ledger/src/atomic.js';
import { canonicalJson } from '../jobs/commands.js';
import type { RecordRef as CommitRecord } from '../jobs/commit.js';
import { Mutex, PriorityMutex } from '../jobs/mutex.js';
import { jobSchemaVersion } from '../jobs/records.js';
import { jobIdSchema, planIdSchema } from '../interfaces/protocol/ids.js';
import { defaultRunPolicy } from '../run/policy.js';
import { acquireProjectLock, ProjectLockError, type ProjectLock } from '../store/lock.js';
import { RunLog } from '../run/log.js';
import { manualRunRecordSchema, runDirectory, runLayout, type ManualRunRecord, type RunPolicy, type SessionId } from '../run/records.js';
import { HarnessSessionOperations } from '../run/session-operations.js';
import { nodeProcessGroups, WriterOwnership, type ProcessGroups } from '../run/writer.js';
import { ContentStore } from '../transcripts/store.js';
import type { TranscriptWriter } from '../transcripts/writer.js';
import { iterationLayout } from '../work/iterations.js';
import { integrationScenarioOf, originKindOf, workLayout } from '../work/records.js';
import { authoredOutlineInvocation } from './authoring.js';
import type { EngineerStepInputs } from './inputs.js';
import { committedBody, InvocationRunner, type LiveInvocation, type RunnerRun } from './runner.js';

/*
 * A manual run: the run layout `plans/<plan>/.harness/jobs/<run>/` with a
 * `job.json` of kind `manual`, which `step run` and `session` write one
 * invocation at a time. Its records are a run's records, written by the same
 * invocation runner with the same schemas, so the same readers read them.
 * It has no drive and no phase progression, and a server that loads the
 * project neither executes nor recovers it.
 *
 * Its identity, the project, the plan, the base commit and the candidate
 * branch, is recorded when it is created and checked each time it is used
 * again. An implementation run's directory is never a destination.
 */

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Where the harness keeps the session operations every run and manual run starts its sessions through. */
export const sessionOperationsDirectory = (projectRoot: string): string => join(projectRoot, 'plans', '.harness', 'session-operations');

/** One manual run, opened under the project lock. */
export class ManualRun implements RunnerRun {
  readonly mutex = new Mutex();
  readonly starting = new PriorityMutex();
  readonly live = new Map<string, LiveInvocation>();
  readonly transcripts = new Map<SessionId, TranscriptWriter>();
  readonly store: ContentStore;
  readonly baselineMeasurement = null;
  index: ArchitectIndex | null = null;
  /** The commit HEAD named when the next invocation starts, which its record names as its base. */
  invocationBase = '';
  /** The limits the next invocation's step inputs carry, which replace the recorded policy's for it. */
  invocationLimits: RunPolicy['limits'] | undefined;
  /** The commit-and-audit effect of a `step gate` in progress, as a run holds its gate's. */
  gating: Promise<unknown> | undefined;

  constructor(readonly record: ManualRunRecord, readonly directory: string, readonly log: RunLog, readonly writer: WriterOwnership) {
    this.store = new ContentStore(join(directory, runLayout.blobs));
  }

  get jobId(): string { return this.record.jobId; }
  get planId(): string { return this.record.planId; }
  get createdAt(): string { return this.record.createdAt; }
  /** The commit the manual run was created at: the accepted boundary before its first passing gate. */
  get base(): string { return this.record.base; }
  get policy(): RunPolicy {
    return this.invocationLimits === undefined ? this.record.policy : { ...this.record.policy, limits: this.invocationLimits };
  }

  path(relative: string): string {
    return join(this.directory, relative);
  }
}

export interface OpenManualRunOptions {
  /** The project's real path. */
  readonly projectRoot: string;
  readonly planId: string;
  readonly runId: string;
  readonly git: GitService;
  /** The policy a run created now records; a reused run keeps its own. */
  readonly policy: RunPolicy;
  readonly origin: ManualRunRecord['origin'];
  /** Whether the run works on its own candidate branch, created with it and checked on each reuse. */
  readonly branch: boolean;
  /** The commit HEAD names, where the caller has read it already; a run created now records it as its base. */
  readonly base?: string | undefined;
  readonly now?: (() => Date) | undefined;
  readonly groups?: ProcessGroups | undefined;
}

export type OpenedManualRun =
  | { readonly status: 'opened'; readonly run: ManualRun; readonly created: boolean }
  | { readonly status: 'refused'; readonly reason: string };

/**
 * Opens the manual run a directory names, creating it where it does not
 * exist, or refuses with the reason. A directory that holds anything but a
 * manual run of this project, plan and run is refused, and so is one whose
 * branch or base no longer stands.
 */
export async function openManualRun(options: OpenManualRunOptions): Promise<OpenedManualRun> {
  const { projectRoot, planId, runId, git } = options;
  const directory = runDirectory(projectRoot, planId, runId);
  const refused = (reason: string): OpenedManualRun => ({ status: 'refused', reason });
  const recordPath = join(directory, runLayout.record);
  let text: string | null;
  try { text = await readFile(recordPath, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return refused(`${recordPath} cannot be read: ${message(error)}`);
    text = null;
  }

  let record: ManualRunRecord;
  let created = false;
  if (text !== null) {
    let document: unknown;
    try { document = JSON.parse(text) as unknown; }
    catch { return refused(`${recordPath} is not JSON`); }
    const kind = (document as { kind?: unknown } | null)?.kind;
    if (kind !== 'manual') {
      return refused(`${directory} is ${kind === 'implementation' ? 'an implementation run' : 'not a manual run'}; a manual run never writes into another run's records`);
    }
    const parsed = manualRunRecordSchema.safeParse(document);
    if (!parsed.success) return refused(`${recordPath} is not a manual run record this harness reads: ${parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')}`);
    record = parsed.data;
    if (record.jobId !== runId || record.planId !== planId) return refused(`${recordPath} names run ${record.planId}/${record.jobId}, not its directory ${planId}/${runId}`);
    if (record.projectRoot !== projectRoot) return refused(`the manual run was created for the project ${record.projectRoot}, not ${projectRoot}`);
    if (record.origin !== options.origin) return refused(`the manual run was created by ${record.origin === 'session' ? 'the session command' : 'step run'}, which alone uses it again`);
    // The branch the run's invocations work on, as it was created.
    if (record.branch !== null) {
      let branch: { readonly branch: string; readonly created: boolean };
      try { branch = await git.createRunBranch(projectRoot, runId); }
      catch (error) { return refused(`the manual run's branch ${record.branch} cannot be checked out: ${message(error)}`); }
      if (branch.branch !== record.branch) return refused(`the manual run works on ${record.branch}, not ${branch.branch}`);
      if (branch.created) return refused(`the manual run's branch ${record.branch} no longer existed; it was created again at the current commit, and the run is not used on it`);
    }
    // The commit it was created at must still be one Git can compare the tree with.
    if (record.base !== '') {
      try { await git.changedPaths(projectRoot, record.base); }
      catch (error) { return refused(`the manual run's base commit ${record.base} cannot be read: ${message(error)}`); }
    }
  } else {
    if (await stat(directory).then(found => !found.isDirectory(), () => false)) return refused(`${directory} is not a directory`);
    const existing = await stat(join(directory, runLayout.events)).then(() => true, () => false);
    if (existing) return refused(`${directory} holds a run log without a job record; it is not a manual run`);
    let branch: string | null = null;
    if (options.branch) {
      try { branch = (await git.createRunBranch(projectRoot, runId)).branch; }
      catch (error) { return refused(`the manual run's candidate branch cannot be created: ${message(error)}`); }
    }
    const base = options.base ?? await git.currentHead(projectRoot).catch(() => '');
    record = manualRunRecordSchema.parse({
      schema: jobSchemaVersion, jobId: runId, planId, kind: 'manual', createdAt: (options.now?.() ?? new Date()).toISOString(),
      projectRoot, base, branch, origin: options.origin, policy: options.policy,
    } satisfies ManualRunRecord);
    await mkdir(directory, { recursive: true });
    await writeFileAtomic(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    created = true;
  }

  let log: RunLog;
  try { log = await RunLog.open(join(directory, runLayout.events), runId); }
  catch (error) { return refused(`the manual run's log cannot be read: ${message(error)}`); }
  const writer = new WriterOwnership({
    settleMs: record.policy.limits.writerSettleMs,
    tree: { changed: () => git.changedPaths(projectRoot).catch(() => []) },
    groups: options.groups ?? nodeProcessGroups,
  });
  return { status: 'opened', run: new ManualRun(record, directory, log, writer), created };
}

/**
 * Reads the manual run a directory names, for a command that writes
 * nothing: no lock, no branch checkout and no creation. A directory that
 * holds no manual run of this project, plan and run is refused.
 */
export async function readManualRun(directory: string): Promise<{ readonly status: 'opened'; readonly run: ManualRun; readonly projectRoot: string } | { readonly status: 'refused'; readonly reason: string }> {
  const refused = (reason: string) => ({ status: 'refused' as const, reason });
  const location = manualRunLocationOf(directory);
  if (typeof location === 'string') return refused(location);
  let projectRoot: string;
  try { projectRoot = await realpath(location.projectRoot); }
  catch (error) { return refused(`The project root ${location.projectRoot} cannot be read: ${message(error)}`); }
  const runPath = runDirectory(projectRoot, location.planId, location.runId);
  const recordPath = join(runPath, runLayout.record);
  let document: unknown;
  try { document = JSON.parse(await readFile(recordPath, 'utf8')) as unknown; }
  catch (error) { return refused((error as NodeJS.ErrnoException).code === 'ENOENT' ? `${runPath} holds no manual run` : `${recordPath} cannot be read: ${message(error)}`); }
  if ((document as { kind?: unknown } | null)?.kind !== 'manual') return refused(`${runPath} is not a manual run`);
  const parsed = manualRunRecordSchema.safeParse(document);
  if (!parsed.success) return refused(`${recordPath} is not a manual run record this harness reads`);
  const record = parsed.data;
  if (record.jobId !== location.runId || record.planId !== location.planId || record.projectRoot !== projectRoot) {
    return refused(`${recordPath} names run ${record.planId}/${record.jobId} of ${record.projectRoot}, not its directory`);
  }
  let log: RunLog;
  try { log = await RunLog.open(join(runPath, runLayout.events), record.jobId); }
  catch (error) { return refused(`the manual run's log cannot be read: ${message(error)}`); }
  const writer = new WriterOwnership({ settleMs: record.policy.limits.writerSettleMs, tree: { changed: async () => [] }, groups: nodeProcessGroups });
  return { status: 'opened', run: new ManualRun(record, runPath, log, writer), projectRoot };
}

/** The invocation runner over manual runs, and the session operations it starts sessions through. */
export interface ManualRunner {
  readonly runner: InvocationRunner<ManualRun>;
  /** Closes the session operations; false where a session they started did not settle. */
  close(): Promise<boolean>;
}

/**
 * The invocation runner as a manual run hosts it. A manual run accepts every
 * invocation a person starts: it has no run-wide bound and no stop of its
 * own, an invocation's base is the commit HEAD names when it starts, and
 * every request brings its own task brief.
 */
export function manualRunner(options: {
  readonly projectRoot: string;
  readonly git: GitService;
  readonly model: string | null;
  readonly agent: AgentPort;
  readonly now?: (() => Date) | undefined;
  readonly warn?: ((text: string) => void) | undefined;
}): ManualRunner {
  let operations: Promise<HarnessSessionOperations> | undefined;
  const open = (agent: AgentPort) => operations ??= HarnessSessionOperations.open(sessionOperationsDirectory(options.projectRoot), agent);
  const runner = new InvocationRunner<ManualRun>({
    projectRoot: options.projectRoot,
    git: options.git,
    model: options.model,
    now: () => options.now?.() ?? new Date(),
    warn: text => (options.warn ?? console.warn)(text),
    afterWrite: async () => undefined,
    operations: agent => open(agent),
    openedOperations: () => operations,
    ignoring: () => false,
    base: run => run.invocationBase,
    refusal: () => null,
    refused: async () => undefined,
    taskBrief: async () => { throw new Error('A manual run\'s invocation brings its own task brief'); },
    previewCandidateTree: async () => { throw new Error('A manual run records no candidate tree'); },
  });
  return {
    runner,
    close: async () => (operations === undefined ? true : (await operations.catch(() => undefined))?.close() ?? true),
  };
}

/**
 * Records what inputs authored without a run carry, before the invocation
 * that uses them starts: the work item, its outline revisions and the
 * assignment, each with the event and the record path a run commits it
 * with. A record the run already holds unchanged is not written again; one
 * that differs is refused, with nothing written.
 */
export async function recordAuthoredInputs(runner: InvocationRunner<ManualRun>, run: ManualRun, inputs: EngineerStepInputs): Promise<string | null> {
  const provenance = inputs.provenance;
  if (provenance === undefined || !('origin' in provenance) || provenance.origin !== 'authored') return null;
  const { workItem: item, outlines } = provenance;
  const { assignment } = inputs;
  const number = Number(assignment.id.slice(assignment.id.lastIndexOf('.i') + 2));
  if (!Number.isInteger(number) || number < 1) return `the assignment ${assignment.id} names no iteration number`;
  const writes: Array<{ readonly event: Parameters<InvocationRunner<ManualRun>['write']>[1]; readonly record: CommitRecord }> = [
    {
      event: { type: 'work-item-started', data: { workItem: item.id, module: item.module, origin: originKindOf(item),
        ...(integrationScenarioOf(item) === null ? {} : { scenario: integrationScenarioOf(item)! }) } },
      record: { path: workLayout.item(item.id), id: item.id, revision: 1, body: item },
    },
    ...outlines.map(outline => ({
      event: { type: 'outline-revised' as const, data: { workItem: item.id, revision: outline.revision, invocation: outline.invocation } },
      record: { path: workLayout.outline(item.id, outline.revision), id: item.id, revision: outline.revision, body: outline },
    })),
    {
      event: { type: 'iteration-assigned', data: { workItem: item.id, iteration: assignment.id, kind: assignment.kind,
        scopeRevision: assignment.scope.revision, invocation: authoredOutlineInvocation,
        decisions: [], architectRef: null } },
      record: { path: iterationLayout.assignment(item.id, number), id: assignment.id, revision: 1, body: assignment },
    },
  ];
  // Every record is compared before any is written, so a refusal writes nothing.
  const pending = [];
  for (const write of writes) {
    const held = committedBody(run, write.record.path);
    if (held === undefined) pending.push(write);
    else if (canonicalJson(held) !== canonicalJson(write.record.body)) {
      return `the manual run already holds a different ${write.record.path}; authored records are never replaced`;
    }
  }
  for (const write of pending) await runner.write(run, write.event, [write.record]);
  return null;
}

/** An existing manual run a `gate` or `after` command works on, under the project lock it holds. */
export interface LockedManualRun {
  readonly run: ManualRun;
  readonly projectRoot: string;
  /** Releases the project lock. */
  release(): Promise<void>;
}

/**
 * Opens the manual run a directory names for `gate` and `after`, under the
 * project lock, or refuses with the reason before any effect: a directory
 * that holds no manual run yet, an implementation run, a manual run of
 * another project, plan, branch or command, a held lock, and a writer that
 * has not settled. Nothing is created: `step run` creates a manual run.
 */
export async function openLockedManualRun(options: {
  readonly directory: string;
  readonly git: GitService;
  readonly now?: (() => Date) | undefined;
  readonly groups?: ProcessGroups | undefined;
}): Promise<{ readonly status: 'opened'; readonly opened: LockedManualRun } | { readonly status: 'refused'; readonly reason: string }> {
  const refused = (reason: string) => ({ status: 'refused' as const, reason });
  const location = manualRunLocationOf(options.directory);
  if (typeof location === 'string') return refused(location);
  let projectRoot: string;
  try { projectRoot = await realpath(location.projectRoot); }
  catch (error) { return refused(`The project root ${location.projectRoot} cannot be read: ${message(error)}`); }
  const directory = runDirectory(projectRoot, location.planId, location.runId);
  if (!await stat(join(directory, runLayout.record)).then(() => true, () => false)) {
    return refused(`${directory} holds no manual run; \`step run\` creates one`);
  }
  let lock: ProjectLock;
  try { lock = await acquireProjectLock(projectRoot); }
  catch (error) {
    // A held lock is someone else's and is left exactly as it is.
    return refused(error instanceof ProjectLockError ? error.message : `The project lock could not be taken: ${message(error)}`);
  }
  try {
    const opened = await openManualRun({
      projectRoot, planId: location.planId, runId: location.runId, git: options.git, origin: 'step-run', branch: true,
      // A run that exists keeps its own policy; this one is never recorded.
      policy: defaultRunPolicy({ projectRoot }), now: options.now, groups: options.groups,
    });
    if (opened.status === 'refused') {
      await lock.release();
      return refused(`The manual run cannot be used: ${opened.reason}`);
    }
    const unsettled = unsettledWriter(opened.run.log);
    if (unsettled !== null) {
      await lock.release();
      return refused(unsettled);
    }
    return { status: 'opened', opened: { run: opened.run, projectRoot, release: () => lock.release() } };
  } catch (error) {
    await lock.release();
    throw error;
  }
}

/**
 * Why the manual run's writer is not known to be settled, or null: an
 * invocation that started and has not ended, or a writer whose release did
 * not confirm that its processes were gone. A later command never writes
 * over a writer that may still be writing.
 */
export function unsettledWriter(log: RunLog): string | null {
  const ended = new Set(log.all('invocation-ended').map(event => event.data.invocation));
  const running = log.all('invocation-started').filter(event => !ended.has(event.data.invocation));
  if (running.length > 0) return `invocation ${running.map(event => event.data.invocation).join(', ')} of the manual run started and has not ended; its writer is not settled`;
  const released = new Map(log.all('writer-released').map(event => [event.data.invocation, event.data.confirmed] as const));
  for (const acquired of log.all('writer-acquired')) {
    const confirmed = released.get(acquired.data.invocation);
    if (confirmed === undefined) return `the writer ${acquired.data.invocation} of the manual run was never released`;
    if (!confirmed) return `the writer ${acquired.data.invocation} of the manual run was released without confirming that its processes ended; its settlement is not known`;
  }
  return null;
}

/** The project root and identities a run directory names, or why it names none. */
export function manualRunLocationOf(directory: string): { readonly projectRoot: string; readonly planId: string; readonly runId: string } | string {
  const run = resolve(directory);
  const jobs = dirname(run);
  const harness = dirname(jobs);
  const plan = dirname(harness);
  const plans = dirname(plan);
  if (basename(jobs) !== 'jobs' || basename(harness) !== '.harness' || basename(plans) !== 'plans') {
    return `${run} is not a run directory: expected <project>/plans/<plan>/.harness/jobs/<run>`;
  }
  if (!planIdSchema.safeParse(basename(plan)).success) return `${basename(plan)} is not a plan ID`;
  if (!jobIdSchema.safeParse(basename(run)).success) return `${basename(run)} is not a run ID: letters, digits, "_" and "-"`;
  return { projectRoot: dirname(plans), planId: basename(plan), runId: basename(run) };
}
