import { replayCheckFindingState } from '../check-findings/state.js';
import type { RunDecisionRequests, RunNotice, RunPlanDeviations, RunSnapshot } from '../interfaces/protocol/runs.js';
import { runSnapshot } from '../run/snapshot.js';
import type { CommittedLine, RunView } from './inputs.js';

/*
 * The run's snapshot as a client reads it: the harness's own snapshot of the
 * log, with the work the open invocation belongs to, the waits of every
 * yielded work item, and the notices in the order the person reads them.
 *
 * A created or removed module is what the person must learn at the end of a
 * run, so module notices come first; every detected dependency cycle
 * follows, kept after the run ends, resolved or not.
 *
 * A request for a person's decision holds its work item, and so the run,
 * until a person answers, with no time limit. The snapshot says so, read
 * from the CheckFinding state the log replays, so every page that shows a
 * run can show that it waits for a person rather than looking slow.
 *
 * A plan deviation holds nothing, unless the run recorded it past its
 * limit; the snapshot counts the run's deviations and those still awaiting
 * the person, so a completed run reads "completed with N plan deviations
 * to review".
 */

/** A run's public snapshot, from its view. */
export function snapshotOf(view: RunView): RunSnapshot {
  const internal = runSnapshot(view.record, view.events);
  const invocation = internal.current?.invocation;
  const work = invocation === undefined ? undefined : view.records.invocations.get(invocation)?.work;
  const waits = waitsOf(view);
  const waitingFor = waits.map(wait => wait.reason).join('; ');

  const current = internal.current === null
    ? (waits.length > 0 && internal.state === 'running' ? { waitingFor } : null)
    : {
        ...(work?.workItem === undefined ? {} : { workItem: work.workItem }),
        ...(work?.iteration === undefined ? {} : { iteration: work.iteration }),
        ...(work?.request === undefined ? {} : { request: work.request }),
        ...(internal.current.role === undefined ? {} : { role: internal.current.role }),
        ...(internal.current.invocation === undefined ? {} : { invocation: internal.current.invocation }),
        ...(waits.length === 0 ? {} : { waitingFor }),
      };

  return {
    jobId: internal.jobId,
    planId: internal.planId,
    agent: view.record.agent,
    version: internal.version,
    state: internal.state,
    phase: internal.phase,
    stopRequested: internal.stopRequested,
    startedAt: internal.startedAt,
    updatedAt: internal.updatedAt,
    endedAt: internal.endedAt,
    failure: internal.failure === null ? null : { ...internal.failure, evidence: [...internal.failure.evidence] },
    current,
    waits,
    counts: { ...internal.counts },
    writer: { ...internal.writer },
    review: internal.review === 'not-reviewed' ? 'not-reviewed' : { ...internal.review },
    notices: orderedNotices(internal.notices.map(notice => withDecisionStatement(notice))),
    decisionRequests: decisionRequestsOf(view.entries, internal.state === 'running' && !internal.stopRequested),
    planDeviations: planDeviationsOf(view.entries),
  };
}

/**
 * The plan deviations the run recorded, and those whose CheckFinding still
 * awaits the person's decision.
 */
export function planDeviationsOf(entries: readonly CommittedLine[]): RunPlanDeviations {
  const recorded = recordedDeviations(entries);
  if (recorded.length === 0) return { recorded: 0, toReview: 0 };
  const state = replayCheckFindingState(entries);
  return {
    recorded: recorded.length,
    toReview: recorded.filter(entry => state.findings.get(entry.checkFinding)?.pendingUserDecision != null).length,
  };
}

/** Every `plan-deviation-recorded` of the log: its CheckFinding, its work item and whether it holds the run. */
function recordedDeviations(entries: readonly CommittedLine[]): Array<{ readonly checkFinding: string; readonly workItem: string; readonly held: boolean }> {
  return entries.flatMap(entry => {
    const event = entry.transaction.event;
    return event.type === 'plan-deviation-recorded' ? [{ checkFinding: event.data.checkFinding, workItem: event.data.workItem, held: event.data.held }] : [];
  });
}

/**
 * The open requests for a person's decision, from the CheckFinding state
 * the log replays, and the work items they hold. `live` says the run's
 * driver would wait on them: it is running and no stop was requested, the
 * same conditions under which the harness holds a work item for an answer.
 */
export function decisionRequestsOf(entries: readonly CommittedLine[], live: boolean): RunDecisionRequests {
  const state = replayCheckFindingState(entries);
  // A plan deviation is the run's; one recorded past the limit holds the work item that asked.
  const held = new Map(recordedDeviations(entries).filter(entry => entry.held).map(entry => [entry.checkFinding, entry.workItem]));
  let open = 0;
  const workItems = new Map<string, Array<{ checkFinding: string; request: string }>>();
  // The state holds CheckFindings in the order they were created, which is their IDs' order.
  for (const [id, entry] of state.findings) {
    if (entry.pendingUserDecision === null) continue;
    open += 1;
    const holder = entry.owner.kind === 'work-item' ? entry.owner.workItem : held.get(id);
    if (holder === undefined) continue;
    const requests = workItems.get(holder) ?? [];
    requests.push({ checkFinding: id, request: entry.pendingUserDecision });
    workItems.set(holder, requests);
  }
  return {
    open,
    waiting: live && workItems.size > 0,
    workItems: [...workItems].map(([workItem, requests]) => ({ workItem, requests })),
  };
}

/** Module notices first, then cycles, each in the order the log established them. */
function orderedNotices(notices: readonly RunNotice[]): RunNotice[] {
  const rank = (notice: RunNotice) => (notice.kind === 'dependency-cycle' ? 1 : 0);
  return [...notices].sort((a, b) => rank(a) - rank(b) || a.sequence - b.sequence);
}

/**
 * A module notice's summary says which decision proposed the module, or that
 * none did. A cycle's says what closed it and whether the re-plan resolved it.
 */
function withDecisionStatement(notice: RunSnapshot['notices'][number] | ReturnType<typeof runSnapshot>['notices'][number]): RunNotice {
  if (notice.kind === 'dependency-cycle') {
    const cycle = [...notice.cycle];
    return {
      kind: 'dependency-cycle',
      at: notice.at,
      sequence: notice.sequence,
      summary: `${notice.summary}. Closed by ${notice.closedBy}; ${notice.resolved ? 'the re-plan resolved it' : 'not resolved'}.`,
      cycle,
      closedBy: notice.closedBy,
      resolved: notice.resolved,
    };
  }
  const proposedBy = notice.decision === null
    ? 'No placement decision proposed it.'
    : `Proposed by placement decision ${notice.decision}.`;
  return {
    kind: notice.kind,
    at: notice.at,
    sequence: notice.sequence,
    summary: `${notice.summary} in ${notice.iteration}, commit ${notice.commit.slice(0, 12)}. ${proposedBy}`,
    module: notice.module,
    declaration: notice.declaration,
    commit: notice.commit,
    iteration: notice.iteration,
    decision: notice.decision,
  };
}

/**
 * Every work item that yielded and has not resumed or completed since, with
 * the requirements it waits for and the provider obligations behind them.
 */
export function waitsOf(view: RunView): RunSnapshot['waits'] {
  const waiting = new Map<string, string[]>();
  for (const event of view.events) {
    if (event.type === 'work-item-yielded') waiting.set(event.data.workItem, [...event.data.requirements]);
    else if (event.type === 'work-item-resumed' || event.type === 'work-item-completed') waiting.delete(event.data.workItem);
  }
  return [...waiting].map(([workItem, requirements]) => {
    const obligations = [...new Set(requirements.map(id => view.records.requirements.get(id)?.obligation).filter((id): id is string => id !== undefined))];
    return {
      workItem,
      requirements,
      reason: `${workItem} waits for provider ${obligations.length === 0 ? 'work' : obligations.join(', ')} (${requirements.join(', ')})`,
    };
  });
}
