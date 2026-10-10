import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AgentPort, AgentSession, JsonSchema, SessionSpec, SessionStart } from '../../subs/agent/src/interfaces/port.js';
import type { GitService } from '../../subs/evidence/src/git.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { writeFileAtomic } from '../../subs/ledger/src/atomic.js';
import type { GuardedScope } from '../guard/write-guard.js';
import type { Role } from '../interfaces/protocol/runs.js';
import { canonicalJson } from '../jobs/commands.js';
import { commitRecord, type RecordRef as CommitRecord } from '../jobs/commit.js';
import type { Mutex, PriorityMutex } from '../jobs/mutex.js';
import { deliveredScopeInputs, invocationScope, scopeSize, type DeclaredScope } from '../kpi/capture.js';
import { inputsHash, sha256, type LoadedPackage } from '../prompts/packages.js';
import type { TaskEnvironment, TaskKind, TaskPacket } from '../prompts/tasks.js';
import { ExcursionWatcher } from '../run/excursions.js';
import type { RunEventInput, RunLog } from '../run/log.js';
import { recordSettledSnapshot } from '../run/mutations.js';
import { ObservationLog } from '../run/observations.js';
import { contextPolicyOf, invocationLimits } from '../run/policy.js';
import { endedOf, InvocationBounds, PortEventRecorder, type CallInFlight } from '../run/port-events.js';
import { declaredModuleDirectories } from '../run/project-config.js';
import {
  invocationId, invocationOutcomeSchema, invocationSchema, measurementSnapshotSchema, runLayout, sessionId,
  type ContinueReason, type ContinueRelation, type DegradeRelation, type ForkRelation, type Invocation, type InvocationOutcome,
  type MeasurementSnapshot, type RecordRef, type ReplaceRelation, type RequestRelation, type RunPolicy, type SessionFinishReason, type SessionId,
} from '../run/records.js';
import {
  HarnessSessionOperations, ReusableSessionUnavailableError, readSessionPointReference, settleSessionEquipment, type HarnessTaskBrief,
} from '../run/session-operations.js';
import { reduceSessions, type RunSessions } from '../run/sessions.js';
import { SubmissionJudge, type SubmissionValidation } from '../run/submissions.js';
import type { WriterOwnership } from '../run/writer.js';
import { InvocationTranscript, verdictNote } from '../transcripts/recorder.js';
import type { ContentStore } from '../transcripts/store.js';
import { readBody, readTranscript, TranscriptWriter } from '../transcripts/writer.js';
import type { EquipContext, Equipment } from '../work/engineer-equipment.js';
import type { StartingPointGroup } from '../work/starting-inputs.js';
import { scratchSafetyRule } from '../work/scratch.js';
import { serializeStepInputs, type StepInputs } from './inputs.js';

/*
 * The invocation runner: one invocation, from the event that licenses it to
 * the outcome that closes it, for every role. A run calls it for each of its
 * invocations, and `step run` and `session` call it for the one invocation
 * they make in a manual run. It writes the run's records: the invocation and
 * its outcome in the run log, the step inputs, the submission, the
 * observations and the transcript. It binds the equipment, judges the
 * submissions, holds the bounds and records the usage.
 *
 * What only an implementation run knows is its host's: when the run accepts
 * nothing more, the source boundary an invocation starts from, the run-wide
 * bounds, a task brief composed from its records and the restoration of an
 * invocation after a restart. A manual run answers each of them itself.
 */

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** One invocation the run has open: the writer or a reader, and its session once it started. */
export interface LiveInvocation {
  readonly role: Role;
  readonly reader: boolean;
  session: AgentSession | undefined;
  readonly done: Promise<void>;
}

/** The run state an invocation is started in and recorded into. */
export interface RunnerRun {
  readonly jobId: string;
  readonly planId: string;
  /** The run's directory, which its log's records are relative to. */
  readonly directory: string;
  readonly createdAt: string;
  readonly policy: RunPolicy;
  /** The frozen measurement baseline an invocation's scope is measured against; null where the run has none. */
  readonly baselineMeasurement: RecordRef | null;
  readonly log: RunLog;
  readonly mutex: Mutex;
  readonly starting: PriorityMutex;
  readonly live: Map<string, LiveInvocation>;
  readonly writer: WriterOwnership;
  readonly store: ContentStore;
  readonly transcripts: Map<SessionId, TranscriptWriter>;
  readonly index: ArchitectIndex | null;
  path(relative: string): string;
}

/** The writes the runner reports to its host after each one is durable. */
export type RunnerWrite = 'session-opened' | 'invocation-started' | 'writer-acquired' | 'writer-released' | 'invocation-ended';

/** What a step's live output shows as the invocation happens. */
export type InvocationProgress =
  | { readonly type: 'started'; readonly invocation: string; readonly session: SessionId; readonly message: string }
  | { readonly type: 'tool-call'; readonly callId: string; readonly tool: string; readonly input: unknown }
  | { readonly type: 'tool-error'; readonly callId: string; readonly tool: string; readonly text: string }
  | { readonly type: 'message'; readonly text: string }
  /** Text of the harness's own in a tool result: a refusal by the guard, or what is appended after a mutation. */
  | { readonly type: 'harness-text'; readonly callId: string; readonly tool: string; readonly kind: 'refusal' | 'appended'; readonly text: string }
  | { readonly type: 'submission'; readonly input: unknown; readonly accepted: boolean; readonly answer: string };

/** What one invocation is: its role, its work, its prompt and the one submission it may make. */
export interface InvocationRequest<T> {
  readonly restore?: boolean;
  readonly originalInvocation?: string | undefined;
  readonly role: Role;
  readonly work: Invocation['work'];
  /** The count of this role's invocations for this work, this one included. */
  readonly attempt: number;
  readonly loaded: LoadedPackage;
  readonly systemPrompt: string;
  readonly prompt: string;
  /** Full ordinary task message where the reused start deliberately sends a thin delta. */
  readonly freshPrompt?: string | undefined;
  /** Exact owning task inputs; headings in the old display brief carry no ancestry authority. */
  readonly task?: { readonly kind?: TaskKind; readonly goal: string; readonly requirements: readonly string[]; readonly omit?: readonly string[]; readonly literalSections?: HarnessTaskBrief['sections']; readonly startingPointGroups?: readonly StartingPointGroup[]; readonly candidate?: string; readonly snapshot?: string; readonly consultationSubmissionSchema?: string; readonly views?: TaskEnvironment['views']; readonly cucumberConfiguration?: string | null; readonly modules?: readonly string[] } | undefined;
  readonly start: SessionStart;
  /** The task brief a step constructor composed; the run composes one from its records where absent. */
  readonly brief?: HarnessTaskBrief | undefined;
  /** The context policy a step constructor took from its inputs; the run policy's for the role where absent. */
  readonly context?: RunPolicy['context']['engineer'] | undefined;
  /** The step inputs this invocation was constructed from, written to its directory before its session starts. */
  readonly stepInputs?: StepInputs | undefined;
  /**
   * What a fresh start that replaces an unavailable continued or forked
   * session is given: the step's fresh construction. Without it the fresh
   * prompt, or the prompt, is sent with the same brief.
   */
  readonly fallback?: ((reason: string) => { readonly prompt: string; readonly brief: HarnessTaskBrief; readonly stepInputs: StepInputs } | undefined) | undefined;
  readonly toolName: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  /** The schema literal the stored submission declares; the agent never supplies it. */
  readonly submissionSchema: string;
  readonly validate: (input: unknown) => SubmissionValidation<T> | Promise<SubmissionValidation<T>>;
  readonly beforeSubmission?: ((input: unknown, signal: AbortSignal) => Promise<void>) | undefined;
  /**
   * What an accepted submission is answered with. Without it the agent
   * implementation's own acknowledgement is used, which knows nothing of the
   * kind that was submitted.
   */
  readonly acceptedText?: ((value: T) => string) | undefined;
  readonly scope: Invocation['scope'];
  /**
   * The snapshot and the declared scope `S_s` is measured from when the
   * invocation starts, with its own prompt package, the plan and the brief
   * it is delivered as its support documents. Without it `scope.size` stands.
   */
  readonly measured?: { readonly snapshot: MeasurementSnapshot; readonly scope: DeclaredScope; readonly readScope?: DeclaredScope } | undefined;
  /** Whether this invocation holds the run's one writer. */
  readonly writer?: boolean | undefined;
  /** Exact tree at writer start when task-local mutation attribution is required. */
  readonly candidateBefore?: string | undefined;
  /**
   * The scope this invocation may write, where it has one. The guard needs
   * it, and so do the two observations that read the tree afterwards: the
   * snapshot of what changed while the writer held it, and the reads that
   * left the scope.
   */
  readonly guarded?: GuardedScope | undefined;
  /**
   * What this role is given beyond reading and its submission tool: the
   * implementation's own mutating built-ins, the harness's own tools, and
   * the guard each mutating call passes. It is built once, with the
   * invocation's own observation log, so that everything the session does is
   * recorded against the invocation that did it.
   */
  readonly equip?: ((session: EquipContext) => Equipment) | undefined;
  /** A session that ended for a reason only the caller can name, such as a tool's exhausted bound. */
  readonly endedAs?: (() => InvocationOutcome['ended'] | undefined) | undefined;
  /**
   * Whether this invocation is a reader beside the writer: it holds no
   * writer, a run-wide bound it meets refuses it without failing the run,
   * and a session of it that does not become idle blocks no writer, since it
   * was given nothing that writes or starts a process.
   */
  readonly reader?: boolean | undefined;
  /** The session's working directory; the project root when absent. A reader's is an empty directory of its own. */
  readonly workingDirectory?: string | undefined;
  /** A tighter absolute bound than the run policy's, such as a review attempt's. */
  readonly absoluteMs?: number | undefined;
  /**
   * An engineer's effective command, idle and absolute bounds, which replace the policy's:
   * the policy's defaults, or what its assignment raised them to.
   */
  readonly bounds?: { readonly idleMs: number; readonly absoluteMs: number; readonly commandTimeoutMs?: number } | undefined;
  /** Called once `invocation-started` is committed and before the session starts, such as to commit what the invocation is for. */
  readonly onStarted?: ((invocation: string, session: SessionId) => Promise<void>) | undefined;
  /**
   * Whether the invocation, once started, ends at once as stopped with no
   * session: a reader whose request its work item's deadline settled while
   * it was being started. Asked after `onStarted`.
   */
  readonly fenced?: (() => boolean) | undefined;
  /** A session mode the caller could not honor, recorded on the invocation. */
  readonly degraded?: { readonly requested: 'fresh' | 'continued' | 'fork'; readonly reason: string } | undefined;
  /** The session a continued start joins; a fresh or forked start opens a new one. */
  readonly session?: SessionId | undefined;
  /**
   * Why a continued start continues its session; required with one. The
   * point it continues from is the session's latest, which the log holds.
   */
  readonly continuing?: ContinueReason | undefined;
  /** The harness point a forked start forks, and why; required with one. */
  readonly fork?: ForkRelation | undefined;
  /** The session a session this invocation opens takes the place of. */
  readonly replaces?: ReplaceRelation | undefined;
  /** The invocation whose result asked for the session this invocation opens. */
  readonly requestedBy?: RequestRelation | undefined;
  /**
   * Whether the harness keeps the session once this invocation ends: kept,
   * to continue it or append to it, or finished with the reason. It is
   * answered from how the invocation ended and what it submitted, before the
   * end is recorded. A run that is ending finishes it as `run-ended`,
   * whatever this answers.
   */
  readonly keep: (ended: InvocationOutcome['ended'], value: T | undefined) => SessionKeeping;
  /** The tree when the invocation started: whether it was dirty, recorded on the invocation. A manual run records it; a run does not. */
  readonly startingTree?: Invocation['startingTree'] | undefined;
  /** Told what the session does as it happens; a live output reads it. A reader that throws changes nothing. */
  readonly progress?: ((event: InvocationProgress) => void) | undefined;
  /** Stops the session, as a person interrupting it does; its outcome records the stop as the caller's. */
  readonly signal?: AbortSignal | undefined;
}

/** What one invocation ended with. `value` is present only for an accepted submission. */
export interface InvocationResult<T> {
  readonly id: string;
  readonly ended: InvocationOutcome['ended'];
  readonly value: T | undefined;
  /** The point the session's history reached, for a turn that continues it. */
  readonly ref: string;
  readonly outcomeKind: string;
  /** The session the invocation belongs to; empty where no invocation started. */
  readonly session: SessionId;
  /** Whether the harness kept the session to use it again. */
  readonly kept: boolean;
  /** The bound or fault that interrupted it, where one did. */
  readonly interruption?: InvocationOutcome['interruption'];
  /** What ended a failed invocation, as its outcome records it. */
  readonly error?: string | undefined;
  /** The mode the executor actually started the session in; absent where none started. */
  readonly actual?: 'fresh' | 'continue' | 'fork' | undefined;
  /** How long the invocation ran, where its session started. */
  readonly elapsedMs?: number | undefined;
  /** The tool calls in flight when it ended: when a bound fired, or when its outcome arrived. */
  readonly inFlight?: readonly CallInFlight[] | undefined;
  /** The text of its last assistant message that had any. */
  readonly lastText?: string | null | undefined;
}

/** What the harness does with a session when one of its invocations ends. */
export type SessionKeeping = { readonly kept: true } | { readonly kept: false; readonly finished: SessionFinishReason };

export const kept: SessionKeeping = { kept: true };
export const finished = (reason: SessionFinishReason): SessionKeeping => ({ kept: false, finished: reason });

/** An invocation started and not yet run: its identifiers, its observations and its transcript. */
export interface StartedInvocation {
  readonly id: string;
  readonly session: SessionId;
  readonly observations: ObservationLog;
  readonly transcript: InvocationTranscript;
  readonly closed: () => void;
}

/** An invocation a restarted run restores from its original records: its result, or its start to run again. */
export interface RestoredInvocation<T> {
  readonly hasIntent: boolean;
  readonly result?: InvocationResult<T> | undefined;
  readonly started?: StartedInvocation | undefined;
}

/** What the runner asks of the run that hosts it. */
export interface RunnerHost<R extends RunnerRun> {
  readonly projectRoot: string;
  readonly git: GitService;
  /** The model the agent was asked to run, recorded with each session; null where it chose its own. */
  readonly model: string | null;
  now(): Date;
  warn(text: string): void;
  afterWrite(write: RunnerWrite, runId: string): Promise<void>;
  operations(agent: AgentPort): Promise<HarnessSessionOperations>;
  /** The session operations once opened, which an invocation's end reads its delivered packet from; undefined before. */
  openedOperations(): Promise<HarnessSessionOperations> | undefined;
  /** Whether the run accepts nothing more: it is stopping, closing or has ended. */
  ignoring(run: R): boolean;
  /** The source boundary an invocation starts from. */
  base(run: R): string;
  /** Why the run starts no further invocation, or null where it may. */
  refusal(run: R): string | null;
  /** What the run does when its bounds refused an invocation: the writer's refusal fails a run, a reader's does not. */
  refused(run: R, reason: string, reader: boolean): Promise<void>;
  /** The task brief of a request that brings none, composed from the run's records. */
  taskBrief<T>(run: R, request: InvocationRequest<T>, spec: SessionSpec, limits: RunPolicy['limits']): Promise<HarnessTaskBrief>;
  /** An invocation a restarted run restores instead of starting a new one; null where there is none. */
  restore?<T>(run: R, agent: AgentPort, request: InvocationRequest<T>): Promise<RestoredInvocation<T> | null>;
  previewCandidateTree(): Promise<{ readonly tree: string }>;
}

/** A record body as the log committed it, never the materialized file. */
export function committedBody(run: Pick<RunnerRun, 'log'>, path: string): unknown {
  for (const entry of run.log.ledger.replay()) {
    for (const record of entry.transaction.records) if (record.path === path) return record.body;
  }
  return undefined;
}

/** Latest immutable invocation revision, unlike owning assignment/license lookups. */
export function invocationRecord(run: Pick<RunnerRun, 'log'>, id: string): { readonly revision: number; readonly body: Invocation } {
  const record = run.log.ledger.replay().flatMap(entry => entry.transaction.records).filter(record => record.path === runLayout.invocation(id)).at(-1);
  if (!record) throw new Error('Invocation record missing');
  return { revision: record.revision, body: invocationSchema.parse(record.body) };
}

/** The outcome of an invocation whose session never ran: stopped, with nothing observed. */
export function stoppedOutcome(): Omit<InvocationOutcome, 'schema' | 'invocation'> {
  return {
    ended: 'stopped',
    rejectedSubmissions: 0,
    disposition: 'incomplete',
    submission: null,
    settled: { confirmed: true, at: new Date().toISOString(), groupsKilled: 0, lateWrites: [] },
    outsideScope: [],
    usage: { unavailable: 'the session never started' },
    elapsedMs: 0,
  };
}

function requestedSession<T>(request: InvocationRequest<T>): Invocation['session'] {
  if (request.degraded !== undefined) {
    return {
      requested: request.degraded.requested,
      actual: request.start.mode === 'continue' ? 'continued' : 'fresh',
      ref: '',
      degradedReason: request.degraded.reason,
    };
  }
  if (request.start.mode === 'continue') {
    return { requested: 'continued', actual: 'continued', ref: request.start.ref, from: request.start.ref };
  }
  if (request.start.mode === 'fork') {
    return { requested: 'fork', actual: 'fork', ref: request.start.from, from: request.start.from };
  }
  return { requested: 'fresh', actual: 'fresh', ref: '' };
}

/** The shared invocation runner over one host's runs. */
export class InvocationRunner<R extends RunnerRun> {
  constructor(private readonly host: RunnerHost<R>) {}

  private get projectRoot(): string {
    return this.host.projectRoot;
  }

  /**
   * One run-log write, serialized with every other. The event is built
   * inside the lock, so its sequence is the one the ledger gives its line
   * and two writes can never disagree about it. A terminal log accepts
   * nothing more: the event that ends a run is its last write.
   */
  write(run: R, input: RunEventInput, records: readonly CommitRecord[] = [], at?: Date): Promise<'committed' | 'already-committed' | 'ended'> {
    return run.mutex.run(async () => {
      if (run.log.terminal) return 'ended';
      if (records.length === 0) {
        await run.log.append(input, at);
        return 'committed';
      }
      return commitRecord(run.log.ledger, { event: run.log.next(input), records: [...records] });
    });
  }

  /** The run's sessions as its log derives them, or undefined, with a warning, where the log breaks the lifecycle. */
  sessionsOf(run: R): RunSessions | undefined {
    try {
      return reduceSessions(run.log.events);
    } catch (error) {
      this.host.warn(`Run ${run.jobId}: its sessions cannot be derived: ${message(error)}`);
      return undefined;
    }
  }

  /**
   * What a continued invocation continues from: its session's latest point,
   * the end of its previous invocation or an append since, and the briefs
   * appended since that invocation ended. An executor's ref is never read
   * for it.
   */
  continuationOf(run: R, session: SessionId, reason: ContinueReason): ContinueRelation {
    const point = this.sessionsOf(run)?.get(session)?.point ?? null;
    if (point === null) throw new Error(`Run ${run.jobId}: ${session} has no point to continue from`);
    const ended = run.log.all('invocation-ended').filter(event => event.data.session === session).at(-1)?.sequence ?? 0;
    const briefs = run.log.all('brief-appended')
      .filter(event => event.data.session === session && event.sequence > ended)
      .map(event => event.data.decision);
    // A reconciliation's brief is appended to the local architect's own
    // session; the append is the executor's and names no harness point.
    const reconciled = run.log.all('reconciliation-brief-appended')
      .filter(event => event.data.session === session && event.sequence > ended && (event.data.outcome === 'appended' || event.data.outcome === 'already-present'))
      .map(event => event.data.reconciliation);
    return { from: point, reason, briefs: [...briefs, ...reconciled] };
  }

  /** The transcript of one of the run's sessions. */
  transcriptOf(run: R, session: SessionId): TranscriptWriter {
    let writer = run.transcripts.get(session);
    if (writer === undefined) {
      writer = new TranscriptWriter({
        session,
        path: run.path(runLayout.transcript(session)),
        root: run.directory,
        store: run.store,
        inlineBytes: run.policy.transcript.inlineBodyBytes,
        now: () => this.host.now(),
      });
      run.transcripts.set(session, writer);
    }
    return writer;
  }

  /**
   * What one invocation writes to its session's transcript. An entry that
   * could not be written is a coverage gap in the invocation's own
   * observations, and never fails the invocation.
   */
  invocationTranscript(run: R, session: SessionId, invocation: string, observations?: ObservationLog): InvocationTranscript {
    return new InvocationTranscript(this.transcriptOf(run, session), invocation, async detail => {
      const log = observations ?? await ObservationLog.open(run.path(runLayout.observations(invocation)));
      await log.record({ type: 'coverage-gap', data: { kind: 'transcript-incomplete', detail } });
    });
  }

  /**
   * One invocation, from the event that licenses it to the outcome that
   * closes it. Every role goes through here: the record is committed before
   * the preserving operation, the judge is the one answer to an invalid submission,
   * the session's settlement is the harness's own observation, and the
   * closing event is the last write of the invocation.
   */
  async runInvocation<T>(run: R, agent: AgentPort, request: InvocationRequest<T>): Promise<InvocationResult<T>> {
    const result = await this.invokeOnce(run, agent, request);
    if (request.start.mode === 'fresh' || result.interruption !== 'session-lost' || this.host.ignoring(run) || request.fenced?.()) return result;
    const reason = result.error ?? 'The retained session is unavailable';
    const fresh = request.fallback?.(reason);
    return this.invokeOnce(run, agent, {
      ...request, originalInvocation: undefined, restore: false, start: { mode: 'fresh' }, session: undefined,
      continuing: undefined, fork: undefined, replaces: undefined,
      prompt: fresh?.prompt ?? request.freshPrompt ?? request.prompt,
      ...(fresh === undefined ? {} : { brief: fresh.brief, stepInputs: fresh.stepInputs }),
      degraded: { requested: request.start.mode === 'continue' ? 'continued' : 'fork', reason },
    });
  }

  private async invokeOnce<T>(run: R, agent: AgentPort, request: InvocationRequest<T>): Promise<InvocationResult<T>> {
    // The start is serialized with every other start, since the identifiers
    // are counted from the log; the session itself runs outside it, so a
    // reader and the writer run at once.
    const restored = (await this.host.restore?.(run, agent, request)) ?? null;
    if (restored?.result) return restored.result;
    const started = restored?.started ?? await run.starting.run(() => this.startInvocation(run, agent, request), request.reader === true ? 'after' : 'first');
    if ('refused' in started) {
      // A run that has spent its bounds starts nothing more. The writer's
      // path fails the run with the counter as evidence; a reader is only
      // refused, and the next writer invocation meets the same bound.
      await this.host.refused(run, started.refused, request.reader === true);
      return { id: '', ended: 'stopped', value: undefined, ref: '', outcomeKind: 'stopped', session: '', kept: false };
    }
    try {
      return await this.runSession(run, agent, started, restored ? { ...request, restore: restored.hasIntent } : request);
    } finally {
      started.closed();
    }
  }

  /** The actual delivered packet and execution identity, committed as the invocation's next revision before its events. */
  private async prepareInvocation<T>(run: R, id: string,
    supplied?: { packet: TaskPacket; request: InvocationRequest<T> },
    identity?: import('../../subs/agent/src/interfaces/session-operations.js').SessionExecutionIdentity): Promise<void> {
    const prior = invocationRecord(run, id);
    let body = prior.body;
    if (supplied) {
      const { packet, request } = supplied;
      const hash = inputsHash([packet.roleInstructions, packet.message]);
      if (body.prompt.inputsHash !== undefined) {
        if (body.prompt.inputsHash !== hash || canonicalJson(body.prompt.manifest) !== canonicalJson(packet.manifest)) throw new Error('Original delivered invocation inputs changed');
      } else {
        let size: Invocation['scope']['size'];
        let readSize: Invocation['scope']['size'] = null;
        try {
          const baseline = run.baselineMeasurement;
          const snapshot = request.measured?.snapshot ?? (baseline === null ? null : measurementSnapshotSchema.parse(JSON.parse(await readFile(run.path(runLayout.measurement(baseline.id)), 'utf8'))));
          const declared: DeclaredScope = request.measured?.scope ?? { exactOwners: [], subtrees: [], apiViews: false, architectView: false, supportDocuments: [] };
          const actual = deliveredScopeInputs(declared, packet.manifest);
          if (snapshot === null) {
            const known = actual.supplementary.reduce((sum, entry) => sum + entry.bytes, 0) + (actual.scope.brief ?? 0);
            size = { policy: 'scope-size/2', snapshot: 'unavailable', bytes: null, subtotal: known, coverage: 'partial', components: [
              { component: 'owned-source', detail: request.role, state: 'unavailable', bytes: null, reason: 'No frozen measurement snapshot is available' },
              { component: 'support-documents', detail: 'Actual delivered/inherited inputs', state: 'measured', bytes: known },
            ] };
          } else {
            if (request.measured?.readScope) readSize = scopeSize(snapshot, request.measured.readScope);
            else if (request.writer !== true && request.measured) readSize = scopeSize(snapshot, { ...request.measured.scope, supportDocuments: [], brief: 0 });
            const paths = new Set(actual.supplementary.map(entry => entry.path));
            const frozen = { ...snapshot, supplementary: [...snapshot.supplementary.filter(entry => !paths.has(entry.path)), ...actual.supplementary] };
            size = scopeSize(frozen, await invocationScope(this.projectRoot, run.planId, declared, request.loaded, packet.message, packet.manifest));
            // One owned-source component: the unknown one stands in for the
            // empty selection's.
            if (!request.measured) size = { ...size, bytes: null, coverage: 'partial', components: size.components.map(component => component.component === 'owned-source'
              ? { component: 'owned-source', detail: request.role, state: 'unknown', bytes: null, reason: 'This role has no recorded owned-source size declaration; delivered support subtotal retained' } : component) };
          }
        } catch (error) {
          const known = request.measured ? scopeSize(request.measured.snapshot, { ...request.measured.scope, supportDocuments: [], brief: 0 }) : null;
          size = { policy: 'scope-size/2', snapshot: request.measured?.snapshot.id ?? 'unavailable', bytes: null, subtotal: known?.subtotal ?? 0, coverage: 'partial', components: [
            ...(known?.components.filter(component => component.component !== 'support-documents') ?? []),
            { component: 'support-documents', detail: request.role, bytes: null, state: 'unavailable', reason: message(error) },
          ] };
        }
        body = { ...body, prompt: { ...body.prompt, inputsHash: hash, manifest: { ...packet.manifest } }, scope: { ...body.scope, size, readSize } };
      }
    }
    if (identity) {
      if (body.sessionOperation?.sourcePoint && canonicalJson(body.sessionOperation.sourcePoint) !== canonicalJson(identity.sourcePoint)) throw new Error('Original invocation operation point changed');
      body = { ...body, sessionOperation: { ...identity, point: body.sessionOperation?.point } };
    }
    if (canonicalJson(body) === canonicalJson(prior.body)) return;
    await this.write(run, { type: 'invocation-prepared', data: { invocation: id, recorded: supplied ? 'delivered-inputs' : 'operation-identity' } },
      [{ path: runLayout.invocation(id), id, revision: prior.revision + 1, body }]);
  }

  /**
   * Everything before an invocation's session starts, under `run.starting`:
   * the run-wide bounds, the identifiers, the events that license it, its
   * transcript's start and, for the writer, the writer's acquisition.
   */
  private async startInvocation<T>(run: R, agent: AgentPort, request: InvocationRequest<T>): Promise<{ readonly refused: string } | StartedInvocation> {
    // The run-wide bounds are read before an invocation is started, so a run
    // that has spent them starts nothing more.
    const refusal = this.host.refusal(run);
    if (refusal !== null) return { refused: refusal };
    const id = invocationId(run.log.count('invocation-started') + 1);
    // A fresh or forked start opens a session; a continued one joins the
    // session the caller kept. The executor's ref stays the caller's.
    const opens = request.start.mode !== 'continue';
    if (!opens && request.session === undefined) throw new Error(`The ${request.role} invocation ${id} continues a session it does not name`);
    // Every start that is not fresh names its harness point and its reason.
    if (!opens && request.continuing === undefined) throw new Error(`The ${request.role} invocation ${id} continues a session without a reason`);
    if (request.start.mode === 'fork' && request.fork === undefined) throw new Error(`The ${request.role} invocation ${id} forks without naming its point`);
    const session = opens ? sessionId(run.log.count('session-opened') + 1) : request.session!;
    const continues = opens ? undefined : this.continuationOf(run, session, request.continuing!);
    const invocation = invocationSchema.parse({
      schema: 'ramify-agent.invocation/1',
      sessionOperation: { runId: run.jobId, operationId: id },
      id,
      role: request.role,
      work: request.work,
      attempt: request.attempt,
      session: requestedSession(request),
      prompt: { package: request.loaded.package, hash: request.loaded.hash, requestedInputsHash: inputsHash([request.systemPrompt, request.prompt]) },
      // Actual delivered size is committed by invocation-prepared, before events.
      scope: { ...request.scope, size: null },
      writer: request.writer === true,
      ...(request.candidateBefore === undefined ? {} : { candidateBefore: request.candidateBefore }),
      base: this.host.base(run),
      ...(request.startingTree === undefined ? {} : { startingTree: request.startingTree }),
      startedAt: this.host.now().toISOString(),
    } satisfies Invocation);

    const observations = await ObservationLog.open(run.path(runLayout.observations(id)));

    // Registered before any event, so a stop that arrives between the
    // invocation's start and its session's applies to a known invocation.
    let closed = () => undefined as void;
    run.live.set(id, { role: request.role, reader: request.reader === true, session: undefined, done: new Promise<void>(resolve => { closed = () => resolve(); }) });
    const release = () => {
      run.live.delete(id);
      closed();
    };
    try {
      if (opens) {
        await this.write(run, {
          type: 'session-opened',
          data: {
            session, role: request.role, work: request.work, executor: agent.name, model: this.host.model,
            ...(request.start.mode === 'fork' ? { fork: request.fork! } : {}),
            ...(request.replaces === undefined ? {} : { replaces: request.replaces }),
            ...(request.requestedBy === undefined ? {} : { requestedBy: request.requestedBy }),
          },
        });
        await this.host.afterWrite('session-opened', run.jobId);
      }
      await this.write(run, {
        type: 'invocation-started',
        data: {
          invocation: id, role: request.role, session, work: request.work, start: opens ? 'opened' : 'continued',
          ...(continues === undefined ? {} : { continues }),
        },
      }, [
        { path: runLayout.invocation(id), id, revision: 1, body: invocation },
      ]);
      // The inputs the invocation was constructed from, before its session
      // starts: a step run later builds the same invocation from them.
      if (request.stepInputs !== undefined) {
        const target = run.path(runLayout.stepInputs(id));
        await mkdir(dirname(target), { recursive: true });
        await writeFileAtomic(target, serializeStepInputs(request.stepInputs));
      }
      // The transcript's start holds the prompts, and is written before the
      // session starts, so a crash before the first reply still leaves them.
      const transcript = this.invocationTranscript(run, session, id, observations);
      if (request.writer === true) {
        // The writer is acquired before the session starts, so a stop that
        // arrives between them applies to a writer the log already names.
        run.writer.acquire(id);
        await this.write(run, { type: 'writer-acquired', data: { invocation: id, scopeRevision: request.scope.write } });
        await this.host.afterWrite('writer-acquired', run.jobId);
      }
      await request.onStarted?.(id, session);
      return { id, session, observations, transcript, closed: release };
    } catch (error) {
      release();
      throw error;
    }
  }

  private async runSession<T>(run: R, agent: AgentPort, started: StartedInvocation, request: InvocationRequest<T>): Promise<InvocationResult<T>> {
    const { id, session, observations, transcript } = started;
    const progress = (event: InvocationProgress): void => {
      try { request.progress?.(event); } catch { /* A reader that fails does not end the invocation. */ }
    };
    // What the harness does with the session once this invocation ends. A
    // run that is ending uses none again.
    const keeping = (ended: InvocationOutcome['ended'], value: T | undefined): SessionKeeping =>
      (this.host.ignoring(run) ? finished('run-ended') : request.keep(ended, value));
    await this.host.afterWrite('invocation-started', run.jobId);
    if (this.host.ignoring(run) || request.fenced?.() === true) {
      await this.endInvocation(run, id, session, keeping('stopped', undefined), stoppedOutcome(), undefined, transcript);
      return { id, ended: 'stopped', value: undefined, ref: '', outcomeKind: 'stopped', session, kept: false };
    }

    const startedAt = this.host.now().getTime();
    let value: T | undefined;
    let submissionHash: string | null = null;
    const judge = new SubmissionJudge<T>({
      target: request.toolName,
      bound: run.policy.limits.rejectedSubmissionsPerTurn,
      validate: input => request.validate(input),
      accept: async accepted => {
        const content = `${JSON.stringify({ schema: request.submissionSchema, ...(accepted as object) }, null, 2)}\n`;
        await writeFileAtomic(run.path(runLayout.submission(id)), content);
        value = accepted;
        submissionHash = sha256(content);
      },
      observations,
      ...(request.acceptedText === undefined ? {} : { acceptedText: request.acceptedText }),
      closed: () => (this.host.ignoring(run) ? 'This run accepts no further submissions.' : undefined),
    });

    // Read boundaries are soft: an excursion into another module is
    // permitted, recorded once, and reminded of once.
    const excursions = new ExcursionWatcher({
      projectRoot: this.projectRoot,
      index: run.index,
      scope: request.guarded,
    });
    const context = request.context ?? contextPolicyOf(run.policy, request.role);
    const recorder = new PortEventRecorder({
      projectRoot: this.projectRoot, workingDirectory: request.workingDirectory ?? this.projectRoot, observations, judge, excursions, context, transcript,
      invocation: { id, role: request.role, startedAt: invocationSchema.parse(committedBody(run, runLayout.invocation(id))).startedAt, submissionTool: request.toolName, declaredPaths: request.guarded?.roots ?? [] },
    });
    // Every port event is activity; `touch` is what the idle bound resets.
    // A command the equipment runs for the session holds it instead. An
    // engineer's own bounds replace the policy's; a reader's may only be
    // tighter.
    const limits = invocationLimits(run.policy.limits, request);
    const bounds = new InvocationBounds(limits);
    // What was in flight at the moment a bound fired, before the stop it
    // asks for ends those calls.
    let inFlightAtBound: CallInFlight[] | undefined;
    bounds.onReached(() => { inFlightAtBound = recorder.inFlight(); });
    const equipment: Equipment = request.equip?.({
      invocation: id,
      observations,
      callId: tool => recorder.callId(tool),
      reminders: () => excursions.takeReminders(),
      transcript,
      hold: timeoutMs => bounds.hold(timeoutMs),
    }) ?? {};
    let budget: InvocationOutcome['budget'] | undefined;
    const { guard, afterMutation } = equipment;

    const spec: SessionSpec = {
      role: request.role,
      scope: { workingDirectory: request.workingDirectory ?? this.projectRoot },
      systemPrompt: request.systemPrompt,
      prompt: request.prompt,
      session: request.start,
      context,
      builtinTools: equipment.builtinTools ?? ['read', 'grep', 'ls'],
      tools: [...(equipment.tools ?? [])],
      ...(guard === undefined ? {} : {
        guard: request.progress === undefined ? guard : async call => {
          const decision = await guard(call);
          if (!decision.allow) progress({ type: 'harness-text', callId: call.callId, tool: call.tool, kind: 'refusal', text: decision.text });
          return decision;
        },
      }),
      ...(afterMutation === undefined ? {} : {
        afterMutation: request.progress === undefined ? afterMutation : async call => {
          const appended = await afterMutation(call);
          if (appended !== null) progress({ type: 'harness-text', callId: call.callId, tool: call.tool, kind: 'appended', text: appended.text });
          return appended;
        },
      }),
      submission: {
        name: request.toolName,
        description: request.description,
        inputSchema: request.inputSchema,
        accept: async (input, signal) => {
          await request.beforeSubmission?.(input, signal);
          signal.throwIfAborted();
          const verdict = await judge.judge(input);
          transcript.note(verdictNote(recorder.callId(request.toolName), request.toolName, verdict));
          progress({ type: 'submission', input, accepted: verdict.accepted, answer: verdict.accepted ? verdict.text ?? '' : verdict.errors.join('\n') });
          return verdict;
        },
      },

      onEvent: event => {
        bounds.touch();
        if (request.progress !== undefined) {
          if (event.type === 'tool-started' && event.tool !== request.toolName) {
            progress({ type: 'tool-call', callId: event.callId, tool: event.tool, input: event.input });
          } else if (event.type === 'tool-finished' && event.isError && event.tool !== request.toolName) {
            progress({ type: 'tool-error', callId: event.callId, tool: event.tool, text: event.errorText ?? '' });
          } else if (event.type === 'message' && event.role === 'assistant' && event.blocks.some(block => block.type === 'text' && block.text.trim() !== '')) {
            // The assistant's own text; its tool calls are shown as calls.
            progress({ type: 'message', text: event.text });
          }
        }
        void recorder.record(event)
          .catch(error => this.host.warn(`Run ${run.jobId}: observation not recorded: ${message(error)}`));
      },
    };

    let agentSession: AgentSession & { readonly unavailableReason?: string | undefined };
    try {
      agentSession = await (await this.host.operations(agent)).start({ runId: run.jobId, operationId: id, session, loaded: request.loaded,
        brief: request.brief ?? await this.host.taskBrief(run, request, spec, limits), spec, restore: request.restore,
        authority: { scope: request.guarded === undefined ? null : { revision: request.guarded.revision, projectRoot: request.guarded.projectRoot, roots: request.guarded.roots, files: request.guarded.files, excluded: request.guarded.excluded ?? [], denied: request.guarded.denied ?? [], guarded: request.guarded.guarded ?? [] }, writer: request.writer === true, work: request.work },
        validator: { name: request.toolName, schema: request.inputSchema, submissionSchema: request.submissionSchema, bound: limits.rejectedSubmissionsPerTurn },
        destination: { run: run.jobId, invocation: id, submission: runLayout.submission(id) },
        accepted: () => { if (value === undefined || submissionHash === null) throw new Error('Accepted destination was not retained'); return { value, schema: request.submissionSchema, submissionHash }; }, currentAuthority: async () => !this.host.ignoring(run) && request.fenced?.() !== true && request.signal?.aborted !== true,
        identified: async identity => {
          recorder.identify(identity);
          await this.prepareInvocation(run, id, undefined, identity);
        },
        prepared: async packet => {
          await this.prepareInvocation(run, id, { packet, request });
          const recorded = await readTranscript(run.path(runLayout.transcript(session))).catch(error => {
            if (request.restore === true) throw error;
            // A new invocation keeps display transcript failures as coverage gaps.
            // Its operation/store input remains authoritative.
            return { entries: [], unreadable: [] };
          });
          const starts = recorded.entries.filter(entry => entry.type === 'started' && entry.invocation === id);
          if ((request.restore === true && recorded.unreadable.length > 0) || starts.length > 1) throw new Error('Original invocation transcript start is unavailable or ambiguous');
          const prior = starts[0];
          if (prior?.type === 'started') {
            if (prior.role !== request.role || JSON.stringify(prior.work) !== JSON.stringify(request.work) ||
              await readBody(run.directory, run.store, prior.systemPrompt) !== packet.roleInstructions ||
              await readBody(run.directory, run.store, prior.prompt) !== packet.message) throw new Error('Original invocation transcript input identity changed');
            return;
          }
          progress({ type: 'started', invocation: id, session, message: packet.message });
          await transcript.started({ role: request.role, work: request.work, start: request.start.mode === 'continue' ? 'continued' : 'opened', requested: request.start.mode,
            continues: request.start.mode === 'continue' ? this.continuationOf(run, session, request.continuing!) : undefined, fork: request.fork, replaces: request.replaces, requestedBy: request.requestedBy,
            executor: agent.name, model: this.host.model, systemPrompt: packet.roleInstructions, prompt: packet.message });
        } });
    } catch (error) {
      const keptAs = keeping('failed', undefined);
      const failure = `The agent session could not start: ${message(error)}`;
      const interruption = error instanceof ReusableSessionUnavailableError && request.start.mode !== 'fresh' ? 'session-lost' as const : 'adapter-fault' as const;

      await this.endInvocation(run, id, session, keptAs, {
        ...stoppedOutcome(),
        ended: 'failed',
        interruption,
        error: failure,
      }, undefined, transcript);
      return {
        id, ended: 'failed', value: undefined, ref: '', outcomeKind: 'failed', session, kept: keptAs.kept,
        interruption, error: failure, elapsedMs: 0, inFlight: [], lastText: null,
      };
    }
    const live = run.live.get(id);
    if (live !== undefined) live.session = agentSession;
    // A start the executor could not honor is known only now, after the
    // invocation's start is committed; its end records it.
    const degraded: DegradeRelation | undefined = request.degraded !== undefined && request.degraded.requested !== 'fresh'
      ? { requested: request.degraded.requested === 'continued' ? 'continue' : request.degraded.requested, actual: agentSession.start.mode, reason: request.degraded.reason }
      : request.start.mode !== 'fresh' && agentSession.start.mode !== request.start.mode
      ? { requested: request.start.mode, actual: agentSession.start.mode, reason: agentSession.start.degradedReason ?? null }
      : undefined;

    // A caller's stop asks the session to stop, as a bound does.
    let stoppedByCaller = false;
    const stop = () => {
      stoppedByCaller = true;
      void agentSession.stop().catch(() => undefined);
    };
    if (request.signal?.aborted === true) stop();
    else request.signal?.addEventListener('abort', stop, { once: true });
    // The policy's two bounds on one invocation. Either asks the session to
    // stop and ends the invocation as failed with the bound as its
    // interruption; settlement below is what then says whether it is gone.
    let outcome: Awaited<AgentSession['outcome']>;
    try {
      outcome = await bounds.outcome(agentSession);
    } finally {
      request.signal?.removeEventListener('abort', stop);
    }
    if (outcome.kind === 'submitted' && value === undefined) {
      const accepted = await (await this.host.operations(agent)).acceptance(run.jobId, id);
      const bytes = await readIfExists(run.path(runLayout.submission(id)));
      if (!accepted || !bytes || accepted.schema !== request.submissionSchema || canonicalJson(accepted.destination) !== canonicalJson({ run: run.jobId, invocation: id, submission: runLayout.submission(id) }) || canonicalJson(accepted.validator) !== canonicalJson({ name: request.toolName, schema: request.inputSchema, submissionSchema: request.submissionSchema, bound: limits.rejectedSubmissionsPerTurn }) || sha256(bytes) !== accepted.submissionHash || canonicalJson(accepted.input) !== canonicalJson(outcome.input)) throw new Error('Original accepted destination is unavailable or changed');
      const { schema, ...body } = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
      if (schema !== accepted.schema || canonicalJson(body) !== canonicalJson(accepted.value)) throw new Error('Original accepted destination value changed');
      value = accepted.value as T; submissionHash = accepted.submissionHash;
    }
    const interruption = bounds.interruption ?? (agentSession.unavailableReason === undefined ? undefined : 'session-lost');
    const inFlight = inFlightAtBound ?? recorder.inFlight();
    const elapsedMs = this.host.now().getTime() - startedAt;
    if (outcome.kind === 'context-budget-reached') {
      budget = { threshold: context.budgetTokens ?? 0, observed: outcome.tokens, reportDelivered: outcome.report !== undefined };
      transcript.note({ kind: 'budget-reached', tokens: outcome.tokens, threshold: context.budgetTokens, reportDelivered: outcome.report !== undefined });
    }

    // Whatever the equipment started ends before the writer is released:
    // discarding a reply is not shutdown, and a command still running is a
    // command that can still write.
    await settleSessionEquipment(equipment.settle, limits.stopSettleMs).catch(error => this.host.warn(`Run ${run.jobId}: ${id} did not settle its own tools: ${message(error)}`));

    // An architect writes nothing, so it holds no writer; its settlement is
    // still the harness's own observation of the session.
    const settled = await this.settleSession(run, id, agentSession, request.reader === true);
    if (settled.confirmed) await equipment.drained?.();
    // `onEvent` cannot be async at the port boundary. Its ordered writes must
    // still finish before gaps are derived and before this driver can settle.
    await recorder.drain();
    await recorder.recordGaps(agent);
    const ref = agentSession.ref;

    // What the tree says changed since the invocation's base. It is the
    // only observation that sees a write no guard saw, and comparing it with
    // the scope is what fills `outsideScope`. Nothing here blocks anything.
    let outsideScope: string[] = [];
    if (request.writer === true) {
      const snapshot = await recordSettledSnapshot({
        projectRoot: this.projectRoot,
        changed: () => this.host.git.changedPaths(this.projectRoot, this.host.base(run)),
        scope: request.guarded,
      }, observations);
      outsideScope = [...snapshot.outsideScope];
    }

    const ended = interruption !== undefined ? 'failed' : request.endedAs?.() ?? endedOf(outcome.kind, judge.boundReached);
    const keptAs = keeping(ended, ended === 'submitted' ? value : undefined);
    const scratchAtSettlement = request.candidateBefore === undefined ? null
      : await scratchSafetyRule(this.projectRoot, await declaredModuleDirectories(this.projectRoot), this.host.git);
    const candidateAfter = scratchAtSettlement?.outcome === 'passed' ? (await this.host.previewCandidateTree()).tree : undefined;
    const error = interruption === 'idle-timeout'
      ? `No port event for ${limits.invocationIdleMs} ms`
      : interruption === 'absolute-timeout'
        ? `The invocation ran for ${limits.invocationAbsoluteMs} ms, its absolute bound`
        : outcome.kind === 'failed' ? outcome.error : undefined;
    const callerStop = stoppedByCaller && interruption === undefined && outcome.kind !== 'failed' ? { error: 'Stopped by the caller' } : {};
    await this.endInvocation(run, id, session, keptAs, {
      ended,
      ...(interruption === undefined ? {} : { interruption, error }),
      // What the implementation answered, not what was asked for: a fork it
      // could not take is a fresh session, and the comparison of fork cost
      // must not be corrupted by one that silently became fresh.
      sessionOperation: { runId: run.jobId, operationId: id, ...(readSessionPointReference(ref) === null ? { point: null } : { sessionId: readSessionPointReference(ref)!.point.sessionId, point: readSessionPointReference(ref)!.point }) },
      session: {
        ref,
        mode: agentSession.start.mode === 'continue' ? 'continued' : agentSession.start.mode,
        ...(agentSession.start.degradedReason === undefined ? {} : { degradedReason: agentSession.start.degradedReason }),
      },
      disposition: this.host.ignoring(run) ? 'superseded' : ended === 'submitted' ? 'applied' : 'incomplete',
      submission: submissionHash === null ? null : { hash: submissionHash },
      rejectedSubmissions: judge.rejections,
      ...(budget === undefined ? {} : { budget }),
      settled,
      outsideScope,
      ...(candidateAfter === undefined ? {} : { candidateAfter }),
      usage: recorder.outcomeUsage(agent),
      elapsedMs,
      ...(outcome.kind === 'failed' && interruption === undefined ? { error: outcome.error } : {}),
      ...callerStop,
    }, degraded, transcript);

    return {
      id,
      ended,
      value: ended === 'submitted' ? value : undefined,
      ref,
      outcomeKind: interruption === undefined ? outcome.kind : 'failed',
      session,
      kept: keptAs.kept,
      ...(interruption === undefined ? {} : { interruption }),
      ...(ended === 'failed' && error !== undefined ? { error } : {}),
      ...callerStop,
      actual: agentSession.start.mode,
      elapsedMs,
      inFlight,
      lastText: recorder.lastText,
    };
  }

  /**
   * What the harness observed when one invocation's session ended: the
   * session idle, and every process group it registered killed and gone.
   * Neither `stop()` resolving nor the agent's word is evidence.
   */
  async settleSession(run: R, id: string, session: AgentSession, reader = false) {
    if (run.writer.held === id) {
      const released = await run.writer.release(id, session);
      // The release is in the log before anything else may write or check:
      // an unconfirmed one blocks every writer and every gate that follows.
      await this.write(run, {
        type: 'writer-released',
        data: { invocation: id, confirmed: released.confirmed, groupsKilled: released.groupsKilled },
      });
      await this.host.afterWrite('writer-released', run.jobId);
      return released;
    }
    const idle = await session.settled().catch(() => 'timed-out' as const);
    const settled = { confirmed: idle === 'settled', at: this.host.now().toISOString(), groupsKilled: 0, lateWrites: [] as string[] };
    // A reader was given no tool that writes or starts a process, so its
    // session not becoming idle leaves the tree as the writer's settlement
    // found it; it is recorded on its outcome and blocks no writer. Its
    // session stays the run's to stop at a stop or a shutdown.
    if (!settled.confirmed && !reader) {
      run.writer.markUnsettled(id, 'its session did not become idle within the implementation\'s bound');
    }
    return settled;
  }

  /**
   * Closes one invocation: the outcome record and the event, in one
   * transition, with whether the harness keeps its session.
   */
  async endInvocation(
    run: R,
    id: string,
    session: SessionId,
    keeping: SessionKeeping,
    body: Omit<InvocationOutcome, 'schema' | 'invocation'>,
    degraded?: DegradeRelation,
    transcript?: InvocationTranscript,
  ): Promise<void> {
    if (run.log.all('invocation-ended').some(event => event.data.invocation === id)) return;
    const outcome = invocationOutcomeSchema.parse({ schema: 'ramify-agent.invocation-outcome/1', invocation: id, ...body });
    const ended = {
      invocation: id, ended: outcome.ended, submission: outcome.submission?.hash ?? null, session,
      ...(degraded === undefined ? {} : { degraded }),
    };
    // A session operation that settled without a point leaves nothing to
    // continue; the kept session says so rather than implying it can resume.
    const pointRetained = outcome.sessionOperation?.point === null && outcome.session?.ref === '' ? { pointRetained: false as const } : {};
    const opened = this.host.openedOperations();
    const packet = opened === undefined ? null : await opened.then(operations => operations.packet(run.jobId, id), () => null);
    const latest = packet === null ? null : invocationRecord(run, id);
    const invocation = latest?.body ?? null;
    const written = await this.write(run, {
      type: 'invocation-ended',
      data: keeping.kept ? { ...ended, kept: true, ...pointRetained } : { ...ended, kept: false, finished: keeping.finished },
    }, [
      { path: runLayout.outcome(id), id, revision: 1, body: outcome },
      ...(invocation === null || packet === null ? [] : [{ path: runLayout.invocation(id), id, revision: latest!.revision + 1, body: { ...invocation, prompt: { ...invocation.prompt, inputsHash: inputsHash([packet.roleInstructions, packet.message]), manifest: packet.manifest } } }]),
    ]);
    // The transcript's end follows the log's, so the point it names is one
    // the log has; recovery ends an interrupted invocation's transcript too.
    if (written !== 'ended') {
      await (transcript ?? this.invocationTranscript(run, session, id)).end({
        ended: outcome.ended,
        interruption: outcome.interruption ?? null,
        error: outcome.error ?? null,
        actual: outcome.session === undefined ? null : {
          mode: outcome.session.mode === 'continued' ? 'continue' : outcome.session.mode,
          degradedReason: outcome.session.degradedReason ?? null,
        },
      });
    }
    await this.host.afterWrite('invocation-ended', run.jobId);
  }
}

async function readIfExists(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
