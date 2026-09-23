import { runQueryLimits, type ProjectedRunEvent, type RunEventPage, type RunEventRefKind } from '../interfaces/protocol/runs.js';
import type { RunEvent } from '../run/log.js';
import type { RunView } from './inputs.js';
import { snapshotOf } from './snapshot.js';

/*
 * The run's event page. A projected event names its transition, the records
 * it refers to and its time, and a sentence; it carries no record body and
 * is not the internal event union, so the log can change without changing
 * the wire. A client reads it after a cursor, as Plan 1's did, and one that
 * reconnects asks again from the last cursor it holds.
 */

type Ref = { kind: RunEventRefKind; id: string };
const ref = (kind: RunEventRefKind, id: string | null | undefined): Ref[] => (id === null || id === undefined ? [] : [{ kind, id }]);

/** One event, as a client reads it. Every internal event type has a projection here. */
export function projectEvent(event: RunEvent): ProjectedRunEvent {
  const [summary, refs] = describe(event);
  return { sequence: event.sequence, at: event.at, transition: event.type, summary, refs };
}

function describe(event: RunEvent): [string, Ref[]] {
  switch (event.type) {
    case 'job-started':
      return ['The run started', []];
    case 'invocation-started':
      return [`The ${event.data.role} session ${event.data.invocation} started`, ref('invocation', event.data.invocation)];
    case 'invocation-ended':
      return [`Session ${event.data.invocation} ended: ${event.data.ended}`, ref('invocation', event.data.invocation)];
    case 'analysis-accepted':
      return [
        `The initial analysis was accepted: ${counted(event.data.entries, 'entry capability', 'entry capabilities')}, ${counted(event.data.hypotheses, 'hypothesis', 'hypotheses')}, ${counted(event.data.workItems, 'work item', 'work items')}`,
        ref('invocation', event.data.invocation),
      ];
    case 'review-requested':
      return ['The run waits for a person to approve its analysis', []];
    case 'analysis-approved':
      return [
        `${event.data.reviewer} approved the analysis${event.data.duringRun ? ' while the run was working' : ''}${event.data.note === null ? '' : `: ${event.data.note}`}`,
        [],
      ];
    case 'readiness-passed':
      return [`Readiness passed at attempt ${event.data.attempt}`, ref('gate', event.data.gate)];
    case 'readiness-failed':
      return [
        `Readiness attempt ${event.data.attempt} failed at ${event.data.step}${event.data.final ? '; its recoveries are spent' : ''}: ${event.data.detail || 'no detail'}`,
        [],
      ];
    case 'work-item-started':
      return [`Work item ${event.data.workItem} started in ${event.data.module}`, ref('work-item', event.data.workItem)];
    case 'hypotheses-delivered':
      return [
        `${event.data.refs.length} hypothesis revision${event.data.refs.length === 1 ? '' : 's'} delivered to ${event.data.workItem}`,
        ref('work-item', event.data.workItem),
      ];
    case 'placement-requested':
      return [
        `${event.data.workItem} asked where ${event.data.capability} belongs`,
        [...ref('request', event.data.request), ...ref('work-item', event.data.workItem), ...ref('capability', event.data.capability)],
      ];
    case 'view-refreshed':
      return [
        event.data.unavailable === null
          ? `The architect view was refreshed for ${event.data.request}`
          : `The architect view could not be refreshed for ${event.data.request}: ${event.data.unavailable}`,
        ref('request', event.data.request),
      ];
    case 'fork-returned-partial':
      return [`The fork for ${event.data.request} returned partial findings (retry ${event.data.retry})`, [...ref('request', event.data.request), ...ref('invocation', event.data.invocation)]];
    case 'decision-accepted':
      return [
        `Decision ${event.data.decision} was accepted for ${event.data.request}`,
        [...ref('decision', event.data.decision), ...ref('request', event.data.request), ...ref('work-item', event.data.workItem)],
      ];
    case 'brief-appended':
      return [`The brief of ${event.data.decision} reached the global architect's context (${event.data.outcome})`, ref('decision', event.data.decision)];
    case 'global-context-rebuilt':
      return [`The global architect's context was rebuilt (generation ${event.data.generation}): ${event.data.reason}`, []];
    case 'decision-delivered':
      return [`Decision ${event.data.decision} was delivered to ${event.data.workItem}`, [...ref('decision', event.data.decision), ...ref('work-item', event.data.workItem)]];
    case 'outline-revised':
      return [`${event.data.workItem}'s outline reached revision ${event.data.revision}`, ref('work-item', event.data.workItem)];
    case 'iteration-assigned':
      return [
        `Iteration ${event.data.iteration} (${event.data.kind}) was assigned`,
        [...ref('iteration', event.data.iteration), ...ref('work-item', event.data.workItem), ...event.data.decisions.map(id => ({ kind: 'decision' as const, id }))],
      ];
    case 'iteration-closed':
      return [
        `Iteration ${event.data.iteration} closed: ${event.data.outcome}${event.data.notices.length === 0 ? '' : `; ${event.data.notices.map(notice => `${notice.kind === 'module-created' ? 'created' : 'removed'} ${notice.module}`).join(', ')}`}`,
        [...ref('iteration', event.data.iteration), ...ref('work-item', event.data.workItem), ...ref('gate', event.data.gate), ...ref('commit', event.data.commit)],
      ];
    case 'contract-requested':
      return [
        `A contract for ${event.data.capability} between ${event.data.consumer} and ${event.data.provider} was requested${event.data.revises === null ? '' : `, revising ${event.data.revises}`}`,
        [...ref('iteration', event.data.iteration), ...ref('work-item', event.data.workItem), ...ref('capability', event.data.capability), ...ref('contract', event.data.revises)],
      ];
    case 'contract-registered':
      return [
        `Contract ${event.data.contract} revision ${event.data.revision} was registered (${event.data.mode})`,
        [
          ...ref('contract', event.data.contract), ...ref('iteration', event.data.iteration), ...ref('obligation', event.data.obligation),
          ...event.data.requirements.map(id => ({ kind: 'requirement' as const, id })), ...ref('work-item', event.data.providerWorkItem),
        ],
      ];
    case 'work-item-yielded':
      return [
        `${event.data.workItem} yielded, waiting for ${event.data.requirements.join(', ')}`,
        [...ref('work-item', event.data.workItem), ...event.data.requirements.map(id => ({ kind: 'requirement' as const, id }))],
      ];
    case 'work-item-resumed':
      return [`${event.data.workItem} resumed`, [...ref('work-item', event.data.workItem), ...event.data.requirements.map(id => ({ kind: 'requirement' as const, id }))]];
    case 'provider-conformed':
      return [
        `The provider conformed to ${event.data.obligation} revision ${event.data.revision}`,
        [...ref('obligation', event.data.obligation), ...ref('work-item', event.data.workItem), ...ref('iteration', event.data.iteration), ...ref('gate', event.data.gate)],
      ];
    case 'requirement-verified':
      return [
        `Requirement ${event.data.requirement} was verified at revision ${event.data.revision}`,
        [...ref('requirement', event.data.requirement), ...ref('work-item', event.data.workItem), ...ref('iteration', event.data.iteration), ...ref('gate', event.data.gate)],
      ];
    case 'evidence-reopened':
      return [
        `Evidence of ${event.data.contract} was reopened at revision ${event.data.revision} (${event.data.cause})`,
        [
          ...ref('contract', event.data.contract), ...ref('iteration', event.data.iteration), ...ref('obligation', event.data.obligation),
          ...event.data.requirements.map(id => ({ kind: 'requirement' as const, id })),
          ...event.data.followUps.map(followUp => ({ kind: 'work-item' as const, id: followUp.workItem })),
        ],
      ];
    case 'revision-needed':
      return [
        `The provider cannot conform to ${event.data.obligation.id}; ${event.data.consumerWorkItem} is asked to revise the agreement`,
        [...ref('obligation', event.data.obligation.id), ...ref('iteration', event.data.iteration), ...ref('work-item', event.data.consumerWorkItem)],
      ];
    case 'dependency-cycle-detected':
      return [
        `A dependency cycle was detected (detection ${event.data.detection}): ${event.data.members.join(' → ')}; closed by ${event.data.closedBy}`,
        [...event.data.members.map(id => ({ kind: 'capability' as const, id })), ...ref('work-item', event.data.closedBy)],
      ];
    case 'work-item-completed':
      return [`Work item ${event.data.workItem} completed`, [...ref('work-item', event.data.workItem), ...ref('gate', event.data.gate)]];
    case 'writer-acquired':
      return [`Session ${event.data.invocation} holds the writer`, ref('invocation', event.data.invocation)];
    case 'writer-released':
      return [
        event.data.confirmed ? `Session ${event.data.invocation} released the writer` : `Session ${event.data.invocation}'s release was not confirmed; no writer or gate may follow`,
        ref('invocation', event.data.invocation),
      ];
    case 'gate-committing':
      return [`Gate ${event.data.gate} (${event.data.checkpoint}) is committing before audit`, ref('gate', event.data.gate)];
    case 'gate-attempted':
      return [`Gate ${event.data.gate} (${event.data.checkpoint}): ${event.data.verdict}, next ${event.data.next}`, ref('gate', event.data.gate)];
    case 'stop-requested':
      return ['A stop was requested', []];
    case 'job-completed':
      return [`The run completed after ${counted(event.data.workItems, 'work item', 'work items')}`, [...ref('gate', event.data.gate), ...ref('commit', event.data.commit)]];
    case 'job-failed':
      return [`The run failed (${event.data.reason}): ${event.data.message || 'no message'}`, []];
    case 'job-stopped':
      return [event.data.settled ? 'The run stopped' : 'The run stopped; its session did not become idle in time, and anything it produces is discarded', []];
    case 'job-interrupted':
      return [`The run was interrupted: ${event.data.message}`, []];
    default:
      return unreachable(event);
  }
}

const counted = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

function unreachable(event: never): never {
  throw new Error(`No projection for event ${(event as RunEvent).type}`);
}

/** The run's snapshot and at most 500 projected events after `after`. */
export function eventPage(view: RunView, after: number): RunEventPage {
  const following = view.events.filter(event => event.sequence > after);
  const page = following.slice(0, runQueryLimits.events);
  return {
    run: snapshotOf(view),
    events: page.map(projectEvent),
    cursor: page.at(-1)?.sequence ?? after,
    more: following.length > page.length,
  };
}
