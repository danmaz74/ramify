import { join } from 'node:path';
import type {
  RunSessionView, SessionAppend, SessionInvocation, SessionReach, SessionListEntry, SessionSuspension, ShownSessionState,
} from '../interfaces/protocol/sessions.js';
import { terminalRunEvents } from '../run/log.js';
import type { SessionId } from '../run/records.js';
import { InvalidSessionTransitionError, reduceSessions, type RunSession } from '../run/sessions.js';
import { standaloneSessionState, type SessionOutcomeRecord, type SessionRecord } from '../sessions/records.js';
import { ProjectionError, type RunView } from './inputs.js';
import { capabilityOfItem } from './work.js';

/*
 * The sessions of a run and of the project, as a reader shows them. Each is
 * a pure function of the run's log and records, or of a standalone
 * session's records.
 *
 * Interrupted is what a reader shows for a session whose log says live and
 * whose harness is gone. The server holds the project lock, so it drives
 * every run it serves that has not ended: a live session of a run that has
 * ended, such as one whose stop's grace expired, is interrupted. A
 * standalone session holds the lock too, so the server never sees one
 * running: without its outcome it was interrupted.
 */

const terminal = new Set<string>(terminalRunEvents);

/** The state a reader shows for a run's session. */
export function shownState(session: RunSession, ended: boolean): ShownSessionState {
  return session.state === 'live' && ended ? 'interrupted' : session.state;
}

/** The diagram elements one of a run's sessions reaches. */
export function reachOf(view: RunView, session: RunSession): SessionReach {
  if (session.role === 'initial-architect') return { kind: 'run' };
  const { workItem, request } = session.work;
  if (session.role === 'global-fork' && request !== undefined) {
    const record = view.records.requests.get(request);
    return { kind: 'request', request, workItem: record?.workItem ?? workItem ?? null, capability: record?.forCapability ?? null };
  }
  if (workItem !== undefined) {
    const item = view.records.workItems.find(candidate => candidate.id === workItem);
    return { kind: 'work-item', workItem, capability: item === undefined ? null : capabilityOfItem(view, item), module: item?.module ?? null };
  }
  return { kind: 'run' };
}

/**
 * Every session of a run in the order it opened them, each invocation's
 * evaluation still null: the caller reads those. A log whose sessions break
 * their lifecycle is unreadable, with the event that breaks it.
 */
export function runSessionViews(view: RunView): RunSessionView[] {
  let sessions: ReadonlyMap<SessionId, RunSession>;
  try {
    sessions = reduceSessions(view.events);
  } catch (error) {
    if (!(error instanceof InvalidSessionTransitionError)) throw error;
    const log = join('plans', view.record.planId, '.harness', 'jobs', view.record.jobId, 'events.jsonl');
    throw new ProjectionError('unreadable', `The sessions of run ${view.record.jobId} cannot be derived: ${error.message}`, [log, `event ${error.sequence}`]);
  }
  const ended = view.events.some(event => terminal.has(event.type));

  const invocations = new Map<string, SessionInvocation>();
  const appends = new Map<SessionId, SessionAppend[]>();
  const suspended = new Map<SessionId, SessionSuspension[]>();
  const resume = (session: SessionId, until: SessionSuspension['from']): void => {
    const list = suspended.get(session);
    const open = list?.at(-1);
    if (list !== undefined && open !== undefined && open.until === null) list[list.length - 1] = { ...open, until };
  };
  for (const event of view.events) {
    const moment = { sequence: event.sequence, at: event.at };
    switch (event.type) {
      case 'invocation-started':
        resume(event.data.session, moment);
        invocations.set(event.data.invocation, {
          invocation: event.data.invocation,
          start: event.data.start,
          started: moment,
          ended: null,
          outcome: null,
          kept: null,
          continues: event.data.continues ?? null,
          degraded: null,
          point: null,
          evaluation: null,
        });
        break;
      case 'invocation-ended': {
        const started = invocations.get(event.data.invocation);
        if (started === undefined) break;
        invocations.set(event.data.invocation, {
          ...started,
          ended: moment,
          outcome: event.data.ended,
          kept: event.data.kept,
          degraded: event.data.degraded ?? null,
          point: { session: event.data.session, invocation: event.data.invocation },
        });
        if (event.data.kept) suspended.set(event.data.session, [...(suspended.get(event.data.session) ?? []), { from: moment, until: null }]);
        break;
      }
      case 'brief-appended':
        appends.set(event.data.session, [...(appends.get(event.data.session) ?? []), {
          appended: moment,
          decision: event.data.decision,
          generation: event.data.generation,
          outcome: event.data.outcome,
          point: { session: event.data.session, append: event.sequence },
        }]);
        break;
      case 'session-finished':
        resume(event.data.session, moment);
        break;
      default:
        break;
    }
  }

  const all = [...sessions.values()];
  const sessionOf = (invocation: string): SessionId | null => all.find(session => session.invocations.includes(invocation))?.id ?? null;
  return all.map(session => ({
    session: session.id,
    state: shownState(session, ended),
    finished: session.finished,
    role: session.role,
    work: session.work,
    executor: session.executor,
    model: session.model,
    reaches: reachOf(view, session),
    opened: session.opened,
    changed: session.changed,
    awaiting: session.awaiting,
    point: session.point,
    invocations: session.invocations.map(id => invocations.get(id)!),
    appends: appends.get(session.id) ?? [],
    suspended: suspended.get(session.id) ?? [],
    lineage: {
      fork: session.fork,
      replaces: session.replaces,
      replacedBy: all.find(other => other.replaces?.session === session.id)?.id ?? null,
      requestedBy: session.requestedBy === null ? null : { ...session.requestedBy, session: sessionOf(session.requestedBy.invocation) },
      requested: all.filter(other => other.requestedBy !== null && session.invocations.includes(other.requestedBy.invocation)).map(other => other.id),
      forks: all.filter(other => other.fork?.from.session === session.id).map(other => other.id),
    },
  }));
}

/** One of a run's sessions, as the project's list shows it. */
export function runSessionEntry(planId: string, runId: string, session: RunSessionView): SessionListEntry {
  return {
    ref: { source: 'run', planId, runId, session: session.session },
    state: session.state,
    finished: session.finished,
    role: session.role,
    work: session.work,
    executor: session.executor,
    model: session.model,
    invocations: session.invocations.length,
    reaches: session.reaches,
    startedAt: session.opened.at,
    changedAt: session.changed.at,
  };
}

/**
 * A standalone session, as the project's list shows it. Its record names
 * the executor `agent`; the list names it `executor`, as the run log does.
 * It changed last when it finished, or, interrupted, at its transcript's
 * last entry, where there is one.
 */
export function standaloneEntry(record: SessionRecord, outcome: SessionOutcomeRecord | null, lastEntryAt: string | null): SessionListEntry {
  return {
    ref: { source: 'standalone', session: record.id },
    state: standaloneSessionState(outcome),
    finished: null,
    role: record.role,
    work: {},
    executor: record.agent,
    model: record.model,
    invocations: 1,
    reaches: { kind: 'module', module: record.module },
    startedAt: record.startedAt,
    changedAt: outcome?.finishedAt ?? lastEntryAt ?? record.startedAt,
  };
}

/**
 * The project's order: live and suspended sessions first, by start, then
 * finished and interrupted ones, by last change; newest first in each.
 */
export function orderSessions(sessions: readonly SessionListEntry[]): SessionListEntry[] {
  const active = (session: SessionListEntry): boolean => session.state === 'live' || session.state === 'suspended';
  const time = (session: SessionListEntry): number => Date.parse(active(session) ? session.startedAt : session.changedAt);
  const key = (session: SessionListEntry): string => (session.ref.source === 'run'
    ? `run/${session.ref.planId}/${session.ref.runId}/${session.ref.session}`
    : `standalone/${session.ref.session}`);
  return [...sessions].sort((left, right) => {
    if (active(left) !== active(right)) return active(left) ? -1 : 1;
    const difference = time(right) - time(left);
    if (difference !== 0) return difference;
    return key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0;
  });
}
