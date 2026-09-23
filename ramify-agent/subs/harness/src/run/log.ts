import { dirname } from 'node:path';
import { z } from 'zod';
import { jobIdSchema } from '../interfaces/protocol/ids.js';
import { acceptedCommandSchema } from '../interfaces/protocol/jobs.js';
import { roleSchema, runFailureReasonSchema } from '../interfaces/protocol/runs.js';
import { modulePathSchema, viewIdentitySchema } from '../interfaces/protocol/evidence.js';
import {
  continueRelationSchema, degradeRelationSchema, forkRelationSchema, invocationWorkSchema, recordRefSchema,
  replaceRelationSchema, requestRelationSchema, sessionFinishReasonSchema, sessionIdSchema,
} from './records.js';
import { moduleNoticeSchema } from '../work/iterations.js';
import { LedgerCorruptError, openLedger, type Ledger } from '../../subs/ledger/src/ledger.js';

/*
 * The run log, `events.jsonl`: state transitions only, and the canonical
 * state of the run. One line is one transaction of the ledger, carrying the
 * event and the bodies of every record that transition commits. What is the
 * run's own stays here: the event schema, the rule that nothing follows a
 * terminal event, and that every event names this run.
 *
 * Observations are not here. Each invocation has its own observation log,
 * which no state derives from.
 */

const eventBase = {
  sequence: z.int().positive(),
  jobId: jobIdSchema,
  at: z.iso.datetime(),
};
const event = <T extends string, D extends z.ZodType>(type: T, data: D) => z.object({ ...eventBase, type: z.literal(type), data }).strict();

const text = z.string().min(1);

/** What an invocation ended with, as its outcome record says. */
const invocationEndedSchema = z.enum(['submitted', 'ended', 'failed', 'stopped', 'context-budget-reached', 'invalid-submission']);

/** The fields every `invocation-ended` carries, whether its session is kept or finished. */
const invocationEndedFields = {
  invocation: text,
  ended: invocationEndedSchema,
  submission: z.string().nullable(),
  /** The session the invocation belongs to. */
  session: sessionIdSchema,
  /**
   * A start the executor could not honor. It is recorded here, at the end,
   * because the actual start is known only once the session has started,
   * after `invocation-started` is committed.
   */
  degraded: degradeRelationSchema.optional(),
};

/** One line of a run's event log. */
export const runEventSchema = z.discriminatedUnion('type', [
  /** The run's first event, holding the start command. It licenses the initial architect. */
  event('job-started', z.object({ command: acceptedCommandSchema }).strict()),
  /**
   * A fresh or forked invocation opens a session, appended just before that
   * invocation's `invocation-started`. It names the role and the work the
   * session is for, the executor that runs it and the model the harness
   * asked for, null where the executor chooses its own. How the session
   * relates to others is beside these fields: the point a fork was taken
   * from, the session it replaces, and the invocation whose result asked
   * for it.
   */
  event('session-opened', z.object({
    session: sessionIdSchema,
    role: roleSchema,
    work: invocationWorkSchema,
    executor: text,
    model: text.nullable(),
    fork: forkRelationSchema.optional(),
    replaces: replaceRelationSchema.optional(),
    requestedBy: requestRelationSchema.optional(),
  }).strict()),
  /**
   * Appended before `startSession`, so a stop arriving between this event and
   * the session's start applies to a known invocation. It commits the
   * `Invocation` and the `MeasurementSnapshot` its scope was measured at.
   * `start` says whether it is the first invocation of the session just
   * opened or continues a suspended one, and `continues` names the point a
   * continued one continues from and why.
   */
  event('invocation-started', z.object({
    invocation: text,
    role: text,
    session: sessionIdSchema,
    work: invocationWorkSchema,
    start: z.enum(['opened', 'continued']),
    continues: continueRelationSchema.optional(),
  }).strict()),
  /**
   * Commits the `InvocationOutcome` and the hash of the submission, if any,
   * and whether the harness keeps the session to use it again or finishes it,
   * with the reason.
   */
  event('invocation-ended', z.discriminatedUnion('kept', [
    z.object({ ...invocationEndedFields, kept: z.literal(true) }).strict(),
    z.object({ ...invocationEndedFields, kept: z.literal(false), finished: sessionFinishReasonSchema }).strict(),
  ])),
  /**
   * A session the harness kept is released: none of its invocations is
   * awaited and it will not be used again. A run records one for every
   * session it still keeps before its terminal event.
   */
  event('session-finished', z.object({ session: sessionIdSchema, reason: sessionFinishReasonSchema }).strict()),
  /**
   * Commits `EntryAssignments`, every `Hypothesis` at revision 1, one
   * `RegistryEntry` per entry capability and one `WorkItem` per entry
   * capability. One event holds every record of the phase.
   */
  event('analysis-accepted', z.object({
    invocation: text,
    entries: z.int().nonnegative(),
    hypotheses: z.int().nonnegative(),
    registry: z.int().nonnegative(),
    workItems: z.int().nonnegative(),
  }).strict()),
  /** Commits the readiness `GateAttempt` and the `ReadinessAttempt` that names it. */
  event('readiness-passed', z.object({ attempt: z.int().positive(), gate: text }).strict()),
  /**
   * Commits the `ReadinessAttempt`, and the `InfrastructureRecovery` it
   * attempted where the failure was recoverable. `final` says whether the
   * bounded recoveries are spent.
   */
  event('readiness-failed', z.object({
    attempt: z.int().positive(),
    step: text,
    detail: z.string(),
    recovery: z.string().nullable(),
    final: z.boolean(),
  }).strict()),
  /** The work item's turn begins; it licenses its local architect. */
  event('work-item-started', z.object({ workItem: text, module: text }).strict()),
  /**
   * Which hypothesis revisions the work item received, at a coordination
   * point. Delivery never rewrites an active assignment, and no work is
   * derived from what it delivers.
   */
  event('hypotheses-delivered', z.object({ workItem: text, refs: z.array(recordRefSchema) }).strict()),
  /**
   * Commits the `PlacementRequest` one local architect made. Requests run
   * one at a time, and this one licenses no agent by itself.
   */
  event('placement-requested', z.object({
    request: text,
    workItem: text,
    requester: modulePathSchema,
    capability: text,
  }).strict()),
  /**
   * The architect view as it stands for this request, recorded with it. It
   * licenses exactly one fork. A refresh that could not be made says so and
   * leaves the older view marked as not current.
   */
  event('view-refreshed', z.object({
    request: text,
    attempt: z.int().positive(),
    view: viewIdentitySchema,
    unavailable: z.string().nullable(),
  }).strict()),
  /**
   * A fork returned findings and gaps instead of a decision. It is never
   * appended to the parent context and is never a decision; it consumes one
   * retry of this request.
   */
  event('fork-returned-partial', z.object({
    request: text,
    invocation: text,
    retry: z.int().positive(),
  }).strict()),
  /**
   * Commits the `PlacementDecision`, the `RegistryEntry` revisions it
   * creates and the `Hypothesis` revisions it makes, in one transition. It
   * is the intent of the parent append, which is keyed by the decision.
   */
  event('decision-accepted', z.object({
    request: text,
    decision: text,
    workItem: text,
    invocation: text,
    registry: z.int().nonnegative(),
    hypotheses: z.int().nonnegative(),
  }).strict()),
  /** The completion of the append effect: the brief is in the parent context, once. */
  event('brief-appended', z.object({
    decision: text,
    generation: z.int().positive(),
    /** The session that holds the parent context, which the brief was appended to. */
    session: sessionIdSchema,
    /** The executor's opaque point the parent's history reached, which the next fork forks from. */
    ref: text,
    /** Whether the append added the brief or found its key already there. */
    outcome: z.enum(['appended', 'already-present']),
  }).strict()),
  /**
   * The parent context can no longer be read. The generation rises, the
   * pending list is cleared, and the next fork is oriented from the
   * hypotheses, the registry and the decisions.
   */
  event('global-context-rebuilt', z.object({
    generation: z.int().positive(),
    reason: text,
  }).strict()),
  /** The accepted decision returns to the requesting local architect. */
  event('decision-delivered', z.object({ decision: text, workItem: text }).strict()),
  /** Commits one revision of a `WorkItemOutline`, revision 1 included. */
  event('outline-revised', z.object({ workItem: text, revision: z.int().positive(), invocation: text }).strict()),
  /**
   * Commits one `IterationAssignment` with its captured `WriteScope`, its
   * derived gate and its guarded hashes. It licenses the engineer that works
   * it.
   */
  event('iteration-assigned', z.object({
    workItem: text,
    iteration: text,
    kind: text,
    scopeRevision: z.int().nonnegative(),
    invocation: text,
    /** The local architect's own placement decisions, committed with the assignment. */
    decisions: z.array(text),
  }).strict()),
  /**
   * Commits the `IterationResult`. For `accepted` it names the passing gate
   * and its audited commit, and carries a notice for every module added or
   * removed since the preceding accepted boundary.
   */
  event('iteration-closed', z.object({
    workItem: text,
    iteration: text,
    outcome: z.enum(['accepted', 'partial', 'unsuitable', 'exhausted', 'superseded']),
    gate: z.string().nullable(),
    commit: z.string().nullable(),
    notices: z.array(moduleNoticeSchema),
  }).strict()),
  /**
   * Commits the `contract` `IterationAssignment` of one sub-session, and
   * licenses the contract engineer. `requestedBy` names the engineer
   * iteration that asked; a committed record, so a caller that dies
   * discovers the outcome without its original reply.
   */
  event('contract-requested', z.object({
    workItem: text,
    iteration: text,
    scopeRevision: z.int().nonnegative(),
    invocation: text,
    capability: text,
    consumer: modulePathSchema,
    provider: modulePathSchema,
    requestedBy: z.string().nullable(),
    /** The agreement a direct revision assignment revises; null for a sub-session. */
    revises: z.string().nullable(),
  }).strict()),
  /**
   * Commits the `ContractRecord`, the one `ProviderObligation` keyed
   * `ob-<contract-id>`, one `ConsumerRequirement` per consumer and the
   * provider work item. Registration is keyed by `(obligation, revision)`
   * and `(requirement, revision)`: a registration already in the log is not
   * appended again. An access-only agreement commits neither an obligation
   * nor fake-backed requirements.
   */
  event('contract-registered', z.object({
    contract: text,
    revision: z.int().positive(),
    mode: z.enum(['fake-backed', 'access-only']),
    iteration: text,
    obligation: z.string().nullable(),
    requirements: z.array(text),
    /** The provider work item this registration started, or the one it reuses. */
    providerWorkItem: z.string().nullable(),
  }).strict()),
  /** The consumer has done what it can against its fakes and waits for these requirements. */
  event('work-item-yielded', z.object({ workItem: text, requirements: z.array(text), invocation: text }).strict()),
  /**
   * Every provider this consumer waits for has conformed at the current
   * contract revisions. It licenses the consumer's architect to assign
   * verification while the requirements are still open.
   */
  event('work-item-resumed', z.object({ workItem: text, requirements: z.array(text) }).strict()),
  /** The conformance suite passed against the real provider, once per obligation revision. */
  event('provider-conformed', z.object({
    obligation: text,
    revision: z.int().positive(),
    workItem: text,
    iteration: text,
    gate: text,
  }).strict()),
  /**
   * The only event that closes a delegation. It requires a passing gate and
   * that no `fakeInjections` location still references the fake.
   */
  event('requirement-verified', z.object({
    requirement: text,
    revision: z.int().positive(),
    workItem: text,
    iteration: text,
    gate: text,
  }).strict()),
  /**
   * One transaction reopens the evidence of an agreement: the contract, the
   * obligation and a new revision of every attached requirement, the
   * scheduling binding from each to the work item responsible for it, the
   * follow-up work items of the ones that had completed, and the results
   * that close unfinished assignments of the previous revision as
   * `superseded`. It replaces `contract-registered` for a revision.
   */
  event('evidence-reopened', z.object({
    cause: text,
    contract: text,
    revision: z.int().positive(),
    /** The iteration whose passing contract gate established the revision. */
    iteration: text,
    obligation: z.string().nullable(),
    requirements: z.array(text),
    /** Each subject revision and the work item responsible for it. */
    bindings: z.array(z.object({ subject: recordRefSchema, workItem: text }).strict()),
    /** The work items this transaction created, each naming the completed item it follows. */
    followUps: z.array(z.object({ workItem: text, follows: text }).strict()),
    /** Iterations closed as `superseded` because they were bound to the previous revision. */
    superseded: z.array(text),
  }).strict()),
  /**
   * An ordinary provider engineer reported that it cannot conform to the
   * agreement as it stands. Deduplicated per obligation revision, it returns
   * to the requesting consumer's local architect, even while that consumer
   * is yielded. The agreement stays unchanged until a revision is
   * registered.
   */
  event('revision-needed', z.object({
    obligation: recordRefSchema,
    iteration: text,
    consumerWorkItem: text,
  }).strict()),
  /**
   * A capability transitively depends on itself. The cycle returns to the
   * local architect of the work item whose registration closed it, and is a
   * notice the person sees whether or not the re-plan resolved it.
   */
  event('dependency-cycle-detected', z.object({
    /** The capabilities of the cycle, in their normalized order. */
    members: z.array(text).min(1),
    requirements: z.array(text),
    workItems: z.array(text),
    /** The work item whose registration closed the cycle; its architect receives it. */
    closedBy: text,
    /** How many times this same cycle has been detected, this detection included. */
    detection: z.int().positive(),
  }).strict()),
  /** Requires a passing `work-item` gate; the work item is closed by it. */
  event('work-item-completed', z.object({ workItem: text, gate: text }).strict()),
  /** Appended before a writer starts; the one writer of the run holds it. */
  event('writer-acquired', z.object({ invocation: text, scopeRevision: z.int().nonnegative().nullable() }).strict()),
  /** `confirmed: false` blocks every writer and every gate that follows. */
  event('writer-released', z.object({ invocation: text, confirmed: z.boolean(), groupsKilled: z.int().nonnegative() }).strict()),
  /** The durable intent of a verified committing gate's commit-and-audit effect. */
  event('gate-committing', z.object({ gate: text, checkpoint: text }).strict()),
  /** A gate finished and commits its one complete `GateAttempt`. */
  event('gate-attempted', z.object({
    gate: text,
    checkpoint: text,
    verdict: z.enum(['passed', 'failed', 'not-verified']),
    next: text,
    committing: z.boolean().optional(),
  }).strict()),
  event('stop-requested', z.object({ command: acceptedCommandSchema }).strict()),
  /** Requires a passing `final` gate on the current tree; an empty queue alone never satisfies it. */
  event('job-completed', z.object({ gate: text, commit: z.string().nullable(), workItems: z.int().nonnegative() }).strict()),
  event('job-failed', z.object({ reason: runFailureReasonSchema, message: z.string(), evidence: z.array(z.string()) }).strict()),
  /** `settled` says whether the writer was confirmed settled within the bound. */
  event('job-stopped', z.object({ settled: z.boolean() }).strict()),
  event('job-interrupted', z.object({ message: z.string() }).strict()),
]);
export type RunEvent = z.infer<typeof runEventSchema>;
export type RunEventType = RunEvent['type'];
export type RunEventOf<T extends RunEventType> = Extract<RunEvent, { type: T }>;

/** The event types that end a run. Nothing follows one. */
export const terminalRunEvents = ['job-completed', 'job-failed', 'job-stopped', 'job-interrupted'] as const satisfies readonly RunEventType[];

const terminal = new Set<string>(terminalRunEvents);

/** An event to append: its type and data. The log assigns the sequence and time. */
export type RunEventInput = { [T in RunEventType]: { readonly type: T; readonly data: RunEventOf<T>['data'] } }[RunEventType];

/** A log line that is not a valid event in sequence. */
export class CorruptRunLogError extends Error {
  constructor(path: string, line: number, reason: string) {
    super(`${path}:${line}: ${reason}`);
    this.name = 'CorruptRunLogError';
  }
}

/** Builds one event from its input, for a transaction a caller commits itself. */
export function runEvent(runId: string, sequence: number, input: RunEventInput, at: Date): RunEvent {
  return runEventSchema.parse({ sequence, jobId: runId, at: at.toISOString(), type: input.type, data: input.data });
}

/**
 * A run's event log. The ledger flushes an append before it counts, refuses a
 * line it did not write, and discards a trailing partial line on load.
 */
export class RunLog {
  private constructor(
    readonly path: string,
    readonly runId: string,
    /** The transaction service beneath the log; a caller that commits records uses it. */
    readonly ledger: Ledger<RunEvent>,
  ) {}

  static async open(path: string, runId: string): Promise<RunLog> {
    let ledger: Ledger<RunEvent>;
    try {
      ledger = await openLedger({ logPath: path, recordsRoot: dirname(path), eventSchema: runEventSchema });
    } catch (error) {
      if (error instanceof LedgerCorruptError) throw new CorruptRunLogError(error.path, error.line, error.reason);
      throw error;
    }
    const events = ledger.replay().map(entry => entry.transaction.event);
    events.forEach((current, index) => {
      if (current.sequence !== index + 1) throw new CorruptRunLogError(path, index + 1, `sequence ${current.sequence}, expected ${index + 1}`);
      if (current.jobId !== runId) throw new CorruptRunLogError(path, index + 1, `event of run ${current.jobId}`);
      const ended = terminalOf(events.slice(0, index));
      if (ended) throw new CorruptRunLogError(path, index + 1, `the run has ended; ${current.type} cannot follow ${ended.type}`);
    });
    return new RunLog(path, runId, ledger);
  }

  /**
   * Every event, read from the ledger each time. The log keeps no copy, so a
   * transaction a caller committed through the ledger is here at once and
   * the two can never disagree.
   */
  get events(): readonly RunEvent[] {
    return this.ledger.replay().map(entry => entry.transaction.event);
  }

  get version(): number {
    return this.ledger.version;
  }

  /** The event that ended the run, if any. Nothing follows it. */
  get terminal(): RunEvent | undefined {
    return terminalOf(this.events);
  }

  get nextSequence(): number {
    return this.ledger.version + 1;
  }

  find<T extends RunEventType>(type: T): RunEventOf<T> | undefined {
    return this.events.find((current): current is RunEventOf<T> => current.type === type);
  }

  last<T extends RunEventType>(type: T): RunEventOf<T> | undefined {
    return this.all(type).at(-1);
  }

  all<T extends RunEventType>(type: T): RunEventOf<T>[] {
    return this.events.filter((current): current is RunEventOf<T> => current.type === type);
  }

  /** The count of committed events of one type: the counter every ID is derived from. */
  count(type: RunEventType): number {
    return this.events.reduce((total, current) => (current.type === type ? total + 1 : total), 0);
  }

  /** Appends one event with no record body. A terminal log accepts nothing more. */
  async append(input: RunEventInput, at: Date = new Date()): Promise<RunEvent> {
    const current = this.next(input, at);
    await this.ledger.append({ event: current, records: [] });
    return current;
  }

  /** The event a caller is about to commit with its records, refused after a terminal event. */
  next(input: RunEventInput, at: Date = new Date()): RunEvent {
    const ended = this.terminal;
    if (ended) throw new Error(`Run ${this.runId}: the run has ended; ${input.type} cannot follow ${ended.type}`);
    return runEvent(this.runId, this.nextSequence, input, at);
  }
}

function terminalOf(events: readonly RunEvent[]): RunEvent | undefined {
  return events.find(current => terminal.has(current.type));
}
