import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { implementationMapSchema, mapApprovalSchema, type MapApproval, type MapSubmission } from '../interfaces/map.js';
import type { ErrorCode } from '../interfaces/protocol/errors.js';
import type {
  AcceptedCommand,
  Command,
  EventPage,
  FailureReason,
  JobSnapshot,
  Receipt,
} from '../interfaces/protocol/jobs.js';
import type { MappingState } from '../interfaces/protocol/queries.js';
import type { AgentPort, AgentSession, SubmissionVerdict } from '../../subs/agent/src/interfaces/port.js';
import { EvidenceUnavailableError, InputsChangedError, sha256, type MappingContext, type MappingJob, type MappingJobHooks, type MappingProcedure } from '../mapping/procedure.js';
import { planPath, readPlan } from '../plans/discover.js';
import { writeFileAtomic, writeFileExclusive } from '../store/atomic.js';
import type { ProjectLock } from '../store/lock.js';
import { activityOf } from './activity.js';
import { JobLog, type EventInput } from './log.js';
import { Mutex } from './mutex.js';
import {
  approvalFileName,
  createJobFiles,
  ensurePlanDirectories,
  highestRevision,
  jobPaths,
  listJobDirectories,
  mapDirectory,
  newJobId,
  readJobRecord,
  revisionFileName,
  type JobPaths,
  type JobRecord,
} from './records.js';
import { snapshotOf } from './snapshot.js';

/** A command the harness refused, with the protocol's error code. */
export class CommandRejection extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly currentVersion?: number) {
    super(message);
    this.name = 'CommandRejection';
  }
}

/** A publication write: 1 `output/map.json`, 2 `map-validated`, 3 `map/<revision>.json`, 4 `job-completed`. */
export type PublicationWrite = 1 | 2 | 3 | 4;

export interface JobServiceOptions {
  readonly projectRoot: string;
  /** The project lock, held for as long as the service runs. */
  readonly lock: ProjectLock;
  /** The agent that runs mapping sessions. Without one, a start is refused as unavailable. */
  readonly agent?: AgentPort | undefined;
  /** The evidence side of each job: its manifest, session, validation and final input check. */
  readonly procedure: MappingProcedure;
  /** How long Stop waits for the session to become idle before the job is marked stopped anyway. */
  readonly stopGraceMs?: number | undefined;
  /** How many invalid submissions are answered with their errors before the job fails. */
  readonly maxCorrections?: number | undefined;
  /** Called after each publication write; tests use it to freeze a job there, as a crash would. */
  readonly afterPublicationWrite?: ((write: PublicationWrite, jobId: string) => Promise<void>) | undefined;
  /** Receives warnings, such as a job directory that cannot be loaded. */
  readonly warn?: ((message: string) => void) | undefined;
}

/** What a recovery did with each job it found without a terminal event. */
export interface RecoveryReport {
  readonly interrupted: string[];
  readonly completed: string[];
  readonly failed: string[];
  /** Job directories that could not be loaded and are not served. */
  readonly skipped: string[];
  /** Approval records written from their `map-approved` event, which a crash had left unwritten. */
  readonly approvals: string[];
}

class Job {
  readonly mutex = new Mutex();
  session: AgentSession | undefined;
  stopRequested: boolean;
  publishing = false;
  accepted: MapSubmission | undefined;
  /** The job's own procedure, once its evidence is loaded. */
  mapping: MappingJob | undefined;
  attempts = 0;
  boundReached = false;
  lastErrors: readonly string[] = [];
  /** The last queued append; awaited before the job decides its outcome. */
  pending: Promise<unknown> = Promise.resolve();
  /** Settles when the job's runner has nothing left to do. */
  done: Promise<void> = Promise.resolve();

  constructor(readonly record: JobRecord, readonly paths: JobPaths, readonly log: JobLog) {
    this.stopRequested = log.find('stop-requested') !== undefined;
  }

  get key(): string {
    return jobKey(this.record.planId, this.record.jobId);
  }

  /** Appends after every append queued before it. */
  append(input: EventInput, at?: Date): Promise<unknown> {
    this.pending = this.mutex.run(() => this.log.append(input, at));
    return this.pending;
  }
}

const jobKey = (planId: string, jobId: string) => `${planId}/${jobId}`;

/**
 * The mapping jobs of one project: their commands, their lifecycle and the
 * queries that read them. Each job's event log is its only authority; this
 * service keeps each log in memory exactly as written and derives every
 * answer from it. One job runs at a time.
 */
export class JobService {
  private readonly jobs = new Map<string, Job>();
  private readonly commands = new Map<string, AcceptedCommand>();
  private readonly commandMutex = new Mutex();
  private readonly procedure: MappingProcedure;
  private closed = false;

  private constructor(private readonly options: JobServiceOptions) {
    this.procedure = options.procedure;
  }

  /**
   * Loads every job of the project and recovers those without a terminal
   * event, under the project lock the caller holds: a job whose map was
   * validated is published and completed, or failed when its reserved
   * revision holds a different map; any other job is marked interrupted.
   */
  static async open(options: JobServiceOptions): Promise<{ service: JobService; recovery: RecoveryReport }> {
    const service = new JobService(options);
    const recovery = await service.load();
    return { service, recovery };
  }

  get projectRoot(): string {
    return this.options.projectRoot;
  }

  get agentName(): string | undefined {
    return this.options.agent?.name;
  }

  private warn(message: string): void {
    (this.options.warn ?? console.warn)(message);
  }

  private async load(): Promise<RecoveryReport> {
    const report: RecoveryReport = { interrupted: [], completed: [], failed: [], skipped: [], approvals: [] };
    for (const { planId, jobId } of await listJobDirectories(this.projectRoot)) {
      const paths = jobPaths(this.projectRoot, planId, jobId);
      let job: Job;
      try {
        const record = await readJobRecord(paths.record);
        if (!record) {
          // Created but never given its job.json: not a job. Left for a person to remove.
          report.skipped.push(jobKey(planId, jobId));
          this.warn(`Skipping ${paths.directory}: it has no job.json`);
          continue;
        }
        if (record.jobId !== jobId || record.planId !== planId) throw new Error('job.json names another job');
        job = new Job(record, paths, await JobLog.open(paths.events, jobId));
      } catch (error) {
        report.skipped.push(jobKey(planId, jobId));
        this.warn(`Skipping ${paths.directory}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      this.jobs.set(job.key, job);
      if (!job.log.terminal) {
        const validated = job.log.find('map-validated');
        if (validated) await this.completePublication(job, validated.data.mapHash, validated.data.revision, true);
        else {
          const unreferenced = await exists(paths.output);
          await job.append({
            type: 'job-interrupted',
            data: { message: `The harness stopped while the job was running${unreferenced ? '; its output was not published' : ''}. Start a new job to map the plan again.` },
          });
        }
        await job.pending;
        const state = snapshotOf(job.record, job.log.events).state;
        (state === 'completed' ? report.completed : state === 'failed' ? report.failed : report.interrupted).push(job.key);
      }
      const approved = job.log.find('map-approved');
      if (approved && await this.writeApproval(approved.data.approval) === 'written') report.approvals.push(`${job.key}: revision ${approved.data.approval.revision}`);
      for (const event of job.log.events) {
        if (event.type === 'job-started' || event.type === 'stop-requested' || event.type === 'map-approved') {
          this.commands.set(event.data.command.commandId, event.data.command);
        }
      }
    }
    return report;
  }

  // Queries

  /** The plan's latest mapping state: its latest job's state and its highest saved revision. */
  async mappingState(planId: string): Promise<MappingState> {
    const latest = this.jobsOf(planId)[0];
    if (!latest) return { state: 'not-mapped' };
    const state = snapshotOf(latest.record, latest.log.events).state;
    return { state, jobId: latest.record.jobId, latestRevision: await highestRevision(this.projectRoot, planId) } as MappingState;
  }

  /** The plan's jobs, newest first. */
  listJobs(planId: string): JobSnapshot[] {
    return this.jobsOf(planId).map(job => snapshotOf(job.record, job.log.events));
  }

  getJob(planId: string, jobId: string): JobSnapshot | undefined {
    const job = this.jobs.get(jobKey(planId, jobId));
    return job && snapshotOf(job.record, job.log.events);
  }

  /** The events after `after`, at most `limit` of them, with the snapshot. */
  eventPage(planId: string, jobId: string, after: number, limit = 500): EventPage | undefined {
    const job = this.jobs.get(jobKey(planId, jobId));
    if (!job) return undefined;
    const events = job.log.events.slice(after, after + limit);
    return {
      job: snapshotOf(job.record, job.log.events),
      events: [...events],
      cursor: events.at(-1)?.sequence ?? Math.min(after, job.log.version),
      more: after + events.length < job.log.version,
    };
  }

  /** Settles when the job's runner and its stop, if any, have nothing left to do. For tests and shutdown. */
  async settled(planId: string, jobId: string): Promise<void> {
    const job = this.jobs.get(jobKey(planId, jobId));
    if (job) await job.done;
  }

  private jobsOf(planId: string): Job[] {
    return [...this.jobs.values()]
      .filter(job => job.record.planId === planId)
      .sort((a, b) => (a.record.createdAt === b.record.createdAt
        ? (a.record.jobId < b.record.jobId ? 1 : -1)
        : (a.record.createdAt < b.record.createdAt ? 1 : -1)));
  }

  // Commands

  /**
   * Runs a command and returns its receipt. A command whose ID and content
   * match an accepted command returns that command's receipt and does
   * nothing more, whatever the job's version now is. A reused ID with other
   * content is a conflict. A new command whose expected version is not the
   * job's is stale and carries the current version.
   */
  execute(command: Command): Promise<Receipt> {
    return this.commandMutex.run(async () => {
      if (this.closed) throw new CommandRejection('unavailable', 'The harness is shutting down');
      const contentHash = commandHash(command);
      const earlier = this.commands.get(command.commandId);
      if (earlier) {
        if (earlier.contentHash === contentHash) return earlier.receipt;
        throw new CommandRejection('conflict', `Command ID "${command.commandId}" was already used for a different command`);
      }
      switch (command.type) {
        case 'start-mapping': return this.start(command, contentHash);
        case 'stop-job': return this.stop(command, contentHash);
        case 'approve-map': return this.approve(command, contentHash);
      }
    });
  }

  private async start(command: Extract<Command, { type: 'start-mapping' }>, contentHash: string): Promise<Receipt> {
    const { planId } = command.payload;
    if (command.expectedVersion !== 0) {
      throw new CommandRejection('stale-version', 'A start creates a job, whose version is 0', 0);
    }
    const agent = this.options.agent;
    if (!agent) throw new CommandRejection('unavailable', 'No agent is configured, so no mapping job can start');
    const running = [...this.jobs.values()].find(job => !job.log.terminal);
    if (running) {
      throw new CommandRejection('busy', `Job ${running.record.jobId} of plan "${running.record.planId}" is still running; one job runs at a time`);
    }
    const plan = await readPlan(this.projectRoot, planId);
    if (!plan) throw new CommandRejection('not-found', `No plan with ID "${planId}"`);
    if (plan.status === 'unreadable') throw new CommandRejection('unreadable', `${plan.path}: ${plan.message}`);
    if (!await this.options.lock.held()) throw new CommandRejection('internal', 'This harness no longer holds the project lock');

    // Capture the plan, then write the manifest and the captured plan, then the first event.
    // The plan's state and map directories exist before the evidence is
    // captured, so that the job's records and saved maps never change what
    // the evidence describes.
    await ensurePlanDirectories(this.projectRoot, planId);
    const captured = await readFile(join(this.projectRoot, planPath(planId)));
    let manifest;
    try {
      manifest = await this.procedure.capture(this.projectRoot, captured);
    } catch (error) {
      if (error instanceof EvidenceUnavailableError) throw new CommandRejection('unavailable', error.message);
      throw error;
    }
    const now = new Date();
    const jobId = newJobId(now);
    const record: JobRecord = { schema: 'ramify-agent.job/1', jobId, planId, kind: 'mapping', agent: agent.name, createdAt: now.toISOString(), manifest };
    const paths = jobPaths(this.projectRoot, planId, jobId);
    await createJobFiles(paths, captured, record);
    const job = new Job(record, paths, await JobLog.open(paths.events, jobId));
    const receipt: Receipt = { commandId: command.commandId, jobId, sequence: job.log.nextSequence, acceptedAt: now.toISOString() };
    const accepted: AcceptedCommand = { commandId: command.commandId, contentHash, receipt };
    this.jobs.set(job.key, job);
    await job.append({ type: 'job-started', data: { command: accepted } }, now);
    this.commands.set(command.commandId, accepted);

    const context: MappingContext = { projectRoot: this.projectRoot, planId, plan: new TextDecoder().decode(captured), manifest };
    job.done = this.run(job, agent, context)
      .catch(error => this.fail(job, 'internal', message(error)))
      .catch(error => this.warn(`Job ${jobId}: ${error instanceof Error ? error.stack : String(error)}`));
    return receipt;
  }

  private async stop(command: Extract<Command, { type: 'stop-job' }>, contentHash: string): Promise<Receipt> {
    const { planId, jobId } = command.payload;
    const job = this.jobs.get(jobKey(planId, jobId));
    if (!job) throw new CommandRejection('not-found', `No job ${jobId} for plan "${planId}"`);
    const receipt = await job.mutex.run(async () => {
      if (command.expectedVersion !== job.log.version) {
        throw new CommandRejection('stale-version', `The job is at version ${job.log.version}, not ${command.expectedVersion}`, job.log.version);
      }
      if (job.log.terminal) throw new CommandRejection('conflict', `The job has already ended (${job.log.terminal.type})`);
      if (job.stopRequested) throw new CommandRejection('conflict', 'A stop was already accepted for this job');
      if (job.publishing) throw new CommandRejection('conflict', 'The job is publishing its map and can no longer be stopped');
      const at = new Date();
      const receipt: Receipt = { commandId: command.commandId, jobId, sequence: job.log.nextSequence, acceptedAt: at.toISOString() };
      const accepted: AcceptedCommand = { commandId: command.commandId, contentHash, receipt };
      await job.log.append({ type: 'stop-requested', data: { command: accepted } }, at);
      job.stopRequested = true;
      this.commands.set(command.commandId, accepted);
      return receipt;
    });
    // The job is done once it is marked stopped; its runner may wait forever on a session that ignores Stop.
    job.done = this.endStopped(job).catch(error => this.warn(`Job ${jobId}: ${message(error)}`));
    return receipt;
  }

  /**
   * Ends a stopped job: asks the session to stop, waits for it at most the
   * grace period, and marks the job stopped whether or not it became idle.
   * Whatever the session produces afterwards is discarded.
   */
  private async endStopped(job: Job): Promise<void> {
    const grace = this.options.stopGraceMs ?? 5000;
    let settled = true;
    if (job.session) {
      let timer: NodeJS.Timeout | undefined;
      settled = await Promise.race([
        job.session.stop().then(() => true, () => true),
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), grace); }),
      ]);
      clearTimeout(timer);
    }
    if (this.closed) return;
    await job.mutex.run(async () => {
      if (!job.log.terminal) await job.log.append({ type: 'job-stopped', data: { settled } });
    });
  }

  /**
   * Approves the revision a completed job saved. The harness hashes the
   * plan and materializes the architect view; when either identity differs
   * from the map's manifest, the approval is refused as stale. Otherwise the
   * `map-approved` event records the command and the approval, and then
   * `map/<revision>.approval.json` is written once. A restart writes a record
   * whose event exists and whose file does not.
   */
  private async approve(command: Extract<Command, { type: 'approve-map' }>, contentHash: string): Promise<Receipt> {
    const { planId, jobId, revision } = command.payload;
    const job = this.jobs.get(jobKey(planId, jobId));
    if (!job) throw new CommandRejection('not-found', `No job ${jobId} for plan "${planId}"`);
    if (command.expectedVersion !== job.log.version) {
      throw new CommandRejection('stale-version', `The job is at version ${job.log.version}, not ${command.expectedVersion}`, job.log.version);
    }
    const ended = job.log.terminal;
    if (ended?.type !== 'job-completed') throw new CommandRejection('conflict', `Job ${jobId} saved no map; only a completed job's revision can be approved`);
    if (ended.data.revision !== revision) throw new CommandRejection('conflict', `Job ${jobId} saved revision ${ended.data.revision}, not ${revision}`);
    const approved = job.log.find('map-approved');
    if (approved) throw new CommandRejection('conflict', `Revision ${revision} was already approved at ${approved.data.approval.approvedAt}`);
    const directory = mapDirectory(this.projectRoot, planId);
    if (await exists(join(directory, approvalFileName(revision)))) {
      throw new CommandRejection('conflict', `plans/${planId}/map/${approvalFileName(revision)} already exists`);
    }
    const saved = await readIfExists(join(directory, revisionFileName(revision)));
    if (saved === undefined || sha256(saved) !== ended.data.mapHash) {
      throw new CommandRejection('conflict', `plans/${planId}/map/${revisionFileName(revision)} is ${saved === undefined ? 'missing' : 'not the map the job saved'}`);
    }
    const { manifest } = job.record;
    if (manifest.architectView.status !== 'materialized') {
      throw new CommandRejection('unavailable', 'The map\'s manifest names no materialized architect view, so its source state cannot be compared');
    }
    let changes: string[];
    try {
      changes = await this.procedure.approvalChanges(this.projectRoot, planId, manifest);
    } catch (error) {
      if (error instanceof EvidenceUnavailableError) throw new CommandRejection('unavailable', error.message);
      throw error;
    }
    if (changes.length) {
      throw new CommandRejection('inputs-changed', `Revision ${revision} is stale and cannot be approved: ${changes.join('; ')}. Regenerate the map.`);
    }
    const at = new Date();
    const approval: MapApproval = mapApprovalSchema.parse({
      schema: 'ramify-agent.map-approval/1',
      planId,
      revision,
      mapHash: ended.data.mapHash,
      planHash: manifest.planHash,
      input: manifest.architectView.input,
      approvedAt: at.toISOString(),
    });
    const receipt = await job.mutex.run(async () => {
      const receipt: Receipt = { commandId: command.commandId, jobId, sequence: job.log.nextSequence, acceptedAt: at.toISOString() };
      const accepted: AcceptedCommand = { commandId: command.commandId, contentHash, receipt };
      await job.log.append({ type: 'map-approved', data: { command: accepted, approval } }, at);
      this.commands.set(command.commandId, accepted);
      return receipt;
    });
    await this.writeApproval(approval);
    return receipt;
  }

  /**
   * Writes an approval record unless it exists. A record that exists with
   * other content was not written by this approval and is left alone.
   */
  private async writeApproval(approval: MapApproval): Promise<'written' | 'present'> {
    const target = join(mapDirectory(this.projectRoot, approval.planId), approvalFileName(approval.revision));
    const content = `${JSON.stringify(approval, null, 2)}\n`;
    if (await writeFileExclusive(target, content) === 'created') return 'written';
    const existing = await readIfExists(target);
    if (existing?.toString('utf8') !== content) this.warn(`${target} exists with content other than its map-approved event; it was left unchanged`);
    return 'present';
  }

  // The job's run

  private async run(job: Job, agent: AgentPort, context: MappingContext): Promise<void> {
    const workingDirectory = this.projectRoot;
    const ignoring = () => job.stopRequested || this.closed || job.log.terminal !== undefined;
    const hooks: MappingJobHooks = {
      recordApiView: async evidence => {
        if (!ignoring()) await job.append({ type: 'api-view-materialized', data: evidence });
      },
      inputsChanged: changes => {
        void this.failRunning(job, 'inputs-changed', 'The inputs changed during the job; nothing was saved', changes)
          .catch(error => this.warn(`Job ${job.record.jobId}: ${message(error)}`));
      },
    };
    let mapping: MappingJob;
    try {
      mapping = await this.procedure.forJob(context, hooks);
    } catch (error) {
      if (error instanceof InputsChangedError) await this.fail(job, 'inputs-changed', error.message, error.changes);
      else await this.fail(job, error instanceof EvidenceUnavailableError ? 'evidence-unavailable' : 'internal', message(error));
      return;
    }
    job.mapping = mapping;
    if (ignoring()) return;
    const plan = mapping.session;
    try {
      job.session = agent.startSession({
        role: plan.role,
        scope: { workingDirectory },
        systemPrompt: plan.systemPrompt,
        prompt: plan.prompt,
        builtinTools: plan.builtinTools,
        tools: plan.tools,
        submission: { ...plan.submission, accept: input => this.judge(job, input) },
        sessionDirectory: job.paths.session,
        onEvent: event => {
          if (ignoring()) return;
          const activity = activityOf(event, workingDirectory, this.projectRoot);
          if (activity) {
            job.append({ type: 'activity', data: { activity } })
              .catch(error => this.warn(`Job ${job.record.jobId}: activity not recorded: ${String(error)}`));
          }
        },
      });
    } catch (error) {
      await this.fail(job, 'agent-failed', `The agent session could not start: ${message(error)}`);
      return;
    }
    const outcome = await job.session.outcome;
    await job.pending.catch(() => undefined);
    if (job.stopRequested || this.closed) return;
    try {
      switch (outcome.kind) {
        case 'submitted':
          if (!job.accepted) await this.fail(job, 'internal', 'The session reported a submission the harness did not accept');
          else await this.publish(job, job.accepted);
          return;
        case 'ended':
          if (job.boundReached) {
            await this.fail(job, 'invalid-submission', `The map was invalid after ${job.attempts} submissions`, job.lastErrors);
          } else {
            await this.fail(job, 'no-submission', `The agent ended without submitting a map${outcome.message ? `: ${outcome.message}` : ''}`);
          }
          return;
        case 'failed':
          await this.fail(job, 'agent-failed', `The agent session failed: ${outcome.error}`);
          return;
        case 'stopped':
          await this.fail(job, 'agent-failed', 'The agent session stopped without a stop request');
          return;
      }
    } catch (error) {
      await this.fail(job, 'internal', message(error));
    }
  }

  /** Judges one submission. Errors go back to the session until the bound is reached. */
  private async judge(job: Job, input: unknown): Promise<SubmissionVerdict> {
    const closed = (): SubmissionVerdict | undefined => (job.stopRequested || this.closed || job.log.terminal || job.boundReached || job.accepted
      ? { accepted: false, final: true, errors: ['This job accepts no further submissions'] }
      : undefined);
    const refused = closed();
    if (refused) return refused;
    const attempt = ++job.attempts;
    const result = await job.mapping!.validate(input);
    const late = closed();
    if (late) return late;
    if (!result.ok) {
      job.lastErrors = result.errors;
      await job.append({ type: 'submission-rejected', data: { attempt, errors: [...result.errors] } });
      if (attempt > (this.options.maxCorrections ?? 2)) {
        job.boundReached = true;
        return { accepted: false, final: true, errors: [...result.errors, 'No further submissions are accepted; the job has failed.'] };
      }
      return { accepted: false, errors: result.errors };
    }
    job.accepted = result.value;
    await job.append({ type: 'submission-accepted', data: { attempt } });
    return { accepted: true };
  }

  /**
   * Publishes an accepted map in four writes, each atomic, in order:
   * `output/map.json`, the `map-validated` event with the map's hash and the
   * reserved revision, `map/<revision>.json` by a write that never
   * overwrites, and `job-completed`.
   */
  private async publish(job: Job, submission: MapSubmission): Promise<void> {
    const proceed = await job.mutex.run(async () => {
      if (job.stopRequested || job.log.terminal || this.closed) return false;
      job.publishing = true;
      return true;
    });
    if (!proceed) return;
    let changes: string[];
    try {
      changes = await job.mapping!.changes();
    } catch (error) {
      await this.fail(job, error instanceof EvidenceUnavailableError ? 'evidence-unavailable' : 'internal', message(error));
      return;
    }
    if (changes.length) {
      await this.fail(job, 'inputs-changed', 'The inputs changed during the job; nothing was saved', changes);
      return;
    }
    const revision = ((await highestRevision(this.projectRoot, job.record.planId)) ?? 0) + 1;
    const map = implementationMapSchema.parse({
      schema: 'ramify-agent.implementation-map/1',
      identity: { planId: job.record.planId, revision, jobId: job.record.jobId, manifest: job.record.manifest },
      ...submission,
    });
    const content = `${JSON.stringify(map, null, 2)}\n`;
    const mapHash = sha256(content);
    const hook = this.options.afterPublicationWrite ?? (async () => undefined);

    await writeFileAtomic(job.paths.output, content);
    await hook(1, job.record.jobId);
    await job.append({ type: 'map-validated', data: { mapHash, revision } });
    await hook(2, job.record.jobId);
    await this.completePublication(job, mapHash, revision, false);
  }

  /**
   * Writes 3 and 4 of a publication, also used by recovery: the map file is
   * written from `output/map.json` unless it is already there with the same
   * hash. A map file with a different hash fails the job and is left alone.
   */
  private async completePublication(job: Job, mapHash: string, revision: number, recovering: boolean): Promise<void> {
    const hook = recovering ? async () => undefined : this.options.afterPublicationWrite ?? (async () => undefined);
    const directory = mapDirectory(this.projectRoot, job.record.planId);
    const target = join(directory, revisionFileName(revision));
    const relativeTarget = `plans/${job.record.planId}/map/${revisionFileName(revision)}`;
    let existing = await readIfExists(target);
    if (existing === undefined) {
      const output = await readIfExists(job.paths.output);
      if (output === undefined || sha256(output) !== mapHash) {
        await this.fail(job, 'internal', `The validated map in output/map.json is ${output === undefined ? 'missing' : 'not the one validated'}; nothing was published`);
        return;
      }
      await mkdir(directory, { recursive: true });
      if (await writeFileExclusive(target, output) === 'exists') existing = await readIfExists(target);
      else await hook(3, job.record.jobId);
    }
    if (existing !== undefined && sha256(existing) !== mapHash) {
      await this.fail(job, 'revision-conflict', `${relativeTarget} holds a different map; it was left unchanged and nothing was published`);
      return;
    }
    await job.append({ type: 'job-completed', data: { revision, mapHash } });
    await hook(4, job.record.jobId);
  }

  /**
   * Fails a job whose session may still run, then asks the session to stop
   * and waits for it at most the grace period. Whatever the session produces
   * afterwards is discarded.
   */
  private async failRunning(job: Job, reason: FailureReason, text: string, diagnostics: readonly string[]): Promise<void> {
    await this.fail(job, reason, text, diagnostics);
    if (job.session) await Promise.race([job.session.stop().catch(() => undefined), delay(this.options.stopGraceMs ?? 5000)]);
  }

  private async fail(job: Job, reason: FailureReason, text: string, diagnostics: readonly string[] = []): Promise<void> {
    await job.mutex.run(async () => {
      if (!job.log.terminal) await job.log.append({ type: 'job-failed', data: { reason, message: text, diagnostics: [...diagnostics] } });
    });
  }

  /**
   * Stops accepting commands and asks a running session to stop, without
   * recording anything: the next start of the harness marks the job
   * interrupted. Then releases the project lock.
   */
  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.jobs.values()]
      .filter(job => !job.log.terminal && job.session)
      .map(job => Promise.race([job.session!.stop().catch(() => undefined), delay(this.options.stopGraceMs ?? 5000)])));
    await this.options.lock.release();
  }
}

/** The SHA-256 of a command without its ID, over JSON with sorted keys. */
export function commandHash(command: Command): string {
  const { commandId: _id, ...content } = command;
  return createHash('sha256').update(canonicalJson(content)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function readIfExists(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  return (await readIfExists(path)) !== undefined;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms).unref());
}
