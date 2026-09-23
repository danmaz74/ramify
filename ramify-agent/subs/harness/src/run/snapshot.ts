import type { JobState } from '../interfaces/protocol/jobs.js';
import type { Role, RunFailureReason, RunPhase } from '../interfaces/protocol/runs.js';
import type { RunEvent } from './log.js';
import type { RunRecord } from './records.js';

/*
 * The run's projection. It is a pure function of the run's `job.json` and
 * its event log, and of nothing else: it never appends an event, writes a
 * file or infers a transition. Status lives in the log and in no snapshot.
 */

export interface RunSnapshot {
  readonly jobId: string;
  readonly planId: string;
  readonly agent: string;
  readonly version: number;
  readonly state: JobState;
  readonly phase: RunPhase;
  /** A stop was accepted and the run has not ended yet. */
  readonly stopRequested: boolean;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly endedAt: string | null;
  readonly failure: { readonly reason: RunFailureReason; readonly message: string; readonly evidence: readonly string[] } | null;
  readonly current: { readonly role?: Role; readonly invocation?: string; readonly waitingFor?: string } | null;
  readonly counts: {
    readonly workItems: number;
    readonly completedWorkItems: number;
    readonly openRequirements: number;
    readonly invocations: number;
    readonly readinessAttempts: number;
    readonly gateAttempts: number;
    /** Invocations whose `invocation-ended` records a degraded start. */
    readonly degradedStarts: number;
  };
  /** The writer's standing: whether one is held, and whether the last release was confirmed. */
  readonly writer: { readonly held: string | null; readonly unsettled: string | null };
  /** Things the person must be told, kept for the whole run and after it, resolved or not. */
  readonly notices: readonly RunNotice[];
}

/**
 * One thing the person is told about, with where in the log it was
 * established. A notice is never removed: a cycle that a re-plan resolved
 * stays, marked resolved, because a cycle between capabilities is an
 * architectural finding whatever became of it.
 */
export type RunNotice =
  | {
      readonly kind: 'module-created' | 'module-removed';
      readonly at: string;
      readonly sequence: number;
      readonly summary: string;
      readonly module: string;
      readonly declaration: string;
      readonly commit: string;
      readonly iteration: string;
      /** The placement decision that proposed it; null when no decision did. */
      readonly decision: string | null;
    }
  | {
      readonly kind: 'dependency-cycle';
      readonly at: string;
      readonly sequence: number;
      readonly summary: string;
      readonly cycle: readonly string[];
      readonly closedBy: string;
      readonly resolved: boolean;
    };

const stateOf: Partial<Record<RunEvent['type'], JobState>> = {
  'job-completed': 'completed',
  'job-failed': 'failed',
  'job-stopped': 'stopped',
  'job-interrupted': 'interrupted',
};

/** A run's snapshot, derived from its `job.json` and its event log. */
export function runSnapshot(record: RunRecord, events: readonly RunEvent[]): RunSnapshot {
  const last = events.at(-1);
  const ended = events.find(event => stateOf[event.type] !== undefined);

  let phase: RunPhase = 'analysis';
  let stopRequested = false;
  let failure: RunSnapshot['failure'] = null;
  let currentInvocation: string | undefined;
  let currentRole: Role | undefined;
  let heldWriter: string | null = null;
  let unsettled: string | null = null;
  let invocations = 0;
  let readinessAttempts = 0;
  let gateAttempts = 0;
  let degradedStarts = 0;
  let workItems = 0;
  let completedWorkItems = 0;
  /** Each requirement at its latest committed revision, and the ones verified there. */
  const requirementRevisions = new Map<string, number>();
  const verifiedRequirements = new Set<string>();
  const notices: RunNotice[] = [];
  const completedItems = new Set<string>();

  for (const event of events) {
    switch (event.type) {
      case 'invocation-started':
        invocations += 1;
        currentInvocation = event.data.invocation;
        currentRole = event.data.role as Role;
        break;
      case 'invocation-ended':
        currentInvocation = undefined;
        currentRole = undefined;
        if (event.data.degraded !== undefined) degradedStarts += 1;
        break;
      case 'analysis-accepted':
        workItems = event.data.workItems;
        phase = 'readiness';
        break;
      case 'work-item-started':
        phase = 'working';
        break;
      case 'contract-registered':
        for (const requirement of event.data.requirements) requirementRevisions.set(requirement, event.data.revision);
        break;
      // A revision reopens every attached requirement: each stands at the
      // new revision, and is open again until its own verification closes
      // it there. An earlier revision's verification does not close it.
      case 'evidence-reopened':
        for (const requirement of event.data.requirements) requirementRevisions.set(requirement, event.data.revision);
        break;
      case 'requirement-verified':
        verifiedRequirements.add(`${event.data.requirement}@${event.data.revision}`);
        break;
      case 'iteration-closed':
        for (const notice of event.data.notices) {
          notices.push({
            kind: notice.kind,
            at: event.at,
            sequence: event.sequence,
            summary: `${notice.kind === 'module-created' ? 'Module created' : 'Module removed'}: ${notice.module} (${notice.declaration})`,
            module: notice.module,
            declaration: notice.declaration,
            commit: notice.commit,
            iteration: notice.iteration,
            decision: notice.decision === null ? null : notice.decision.id,
          });
        }
        break;
      case 'dependency-cycle-detected':
        notices.push({
          kind: 'dependency-cycle',
          at: event.at,
          sequence: event.sequence,
          summary: `A capability depends on itself: ${event.data.members.join(' → ')} → ${event.data.members[0]!}`,
          cycle: event.data.members,
          closedBy: event.data.closedBy,
          resolved: false,
        });
        break;
      case 'work-item-completed':
        completedItems.add(event.data.workItem);
        completedWorkItems += 1;
        // The final verification follows the last work item; an empty queue
        // alone never satisfies completion, which the final gate decides.
        if (completedWorkItems === workItems) phase = 'final-verification';
        break;
      case 'readiness-passed':
        readinessAttempts += 1;
        gateAttempts += 1;
        phase = workItems > 0 ? 'working' : 'final-verification';
        break;
      case 'readiness-failed':
        readinessAttempts += 1;
        if (event.data.recovery !== null) gateAttempts += 0;
        break;
      case 'writer-acquired':
        heldWriter = event.data.invocation;
        break;
      case 'writer-released':
        heldWriter = null;
        if (!event.data.confirmed) unsettled = event.data.invocation;
        break;
      case 'gate-attempted':
        gateAttempts += 1;
        break;
      case 'stop-requested':
        stopRequested = true;
        break;
      case 'job-failed':
        failure = { reason: event.data.reason, message: event.data.message, evidence: event.data.evidence };
        break;
      default:
        break;
    }
  }

  // A cycle is resolved when the work item whose registration closed it went
  // on to complete and the same cycle was not detected again. The notice
  // stays either way: the person is told about every cycle.
  const resolvedNotices = notices.map(notice => {
    if (notice.kind !== 'dependency-cycle') return notice;
    const later = notices.some(other =>
      other.kind === 'dependency-cycle'
      && other.sequence > notice.sequence
      && other.cycle.join(' → ') === notice.cycle.join(' → '));
    return { ...notice, resolved: !later && completedItems.has(notice.closedBy) };
  });

  if (ended !== undefined) phase = 'ended';
  else if (stopRequested) phase = phase === 'analysis' ? 'analysis' : phase;

  return {
    jobId: record.jobId,
    planId: record.planId,
    agent: record.agent,
    version: events.length,
    state: ended === undefined ? 'running' : stateOf[ended.type]!,
    phase,
    stopRequested: stopRequested && ended === undefined,
    startedAt: record.createdAt,
    updatedAt: last?.at ?? record.createdAt,
    endedAt: ended?.at ?? null,
    failure,
    current: currentInvocation === undefined
      ? null
      : { invocation: currentInvocation, ...(currentRole === undefined ? {} : { role: currentRole }) },
    counts: {
      workItems,
      completedWorkItems,
      openRequirements: [...requirementRevisions]
        .filter(([requirement, revision]) => !verifiedRequirements.has(`${requirement}@${revision}`)).length,
      invocations,
      readinessAttempts,
      gateAttempts,
      degradedStarts,
    },
    writer: { held: heldWriter, unsettled },
    notices: resolvedNotices,
  };
}
