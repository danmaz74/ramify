import type { RunNotice, RunSnapshot } from '../interfaces/protocol/runs.js';
import { runSnapshot } from '../run/snapshot.js';
import type { RunView } from './inputs.js';

/*
 * The run's snapshot as a client reads it: the harness's own snapshot of the
 * log, with the work the open invocation belongs to, the waits of every
 * yielded work item, and the notices in the order the person reads them.
 *
 * A created or removed module is what the person must learn at the end of a
 * run, so module notices come first; every detected dependency cycle
 * follows, kept after the run ends, resolved or not.
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
