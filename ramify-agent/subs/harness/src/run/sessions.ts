import type { Role } from '../interfaces/protocol/runs.js';
import type { RunEvent, RunEventOf } from './log.js';
import type { InvocationWork, SessionFinishReason, SessionId } from './records.js';

/*
 * The sessions of one run, derived from its log.
 *
 * A session is the conversation one or more invocations share. Its state is
 * a pure function of the log, with a closed set of transitions:
 *
 *   none       session-opened, then its first invocation-started   live
 *   live       invocation-ended, kept                               suspended
 *   live       invocation-ended, finished                           finished
 *   suspended  invocation-started                                   live
 *   suspended  brief-appended                                       suspended
 *   suspended  session-finished                                     finished
 *
 * A session is live from `session-opened`, while its first invocation is
 * being started. A run that ends, or a crash, between the two appends leaves
 * it opened with no invocation awaited, and `session-finished` finishes it
 * as it finishes a suspended one: a session the harness awaits no
 * invocation of. Every other pair is invalid, and the reducer rejects it
 * with the event's sequence: a live session never starts a second
 * invocation, since two branches at once are a fork, which opens a new
 * session.
 *
 * Interrupted is not a state. A reader shows a live session whose harness is
 * gone as interrupted until recovery records its end.
 */

export type SessionState = 'live' | 'suspended' | 'finished';

/** Where a session's history changed: the event's sequence and time. */
export interface SessionMoment {
  readonly sequence: number;
  readonly at: string;
}

/** One session of a run, as its log holds it after some prefix of events. */
export interface RunSession {
  readonly id: SessionId;
  readonly role: Role;
  readonly work: InvocationWork;
  /** The executor that runs it, by the agent port's name. */
  readonly executor: string;
  /** The model the harness asked the executor for; null where the executor chose its own. */
  readonly model: string | null;
  readonly state: SessionState;
  /** Its invocations in order: each one is a segment of the session. */
  readonly invocations: readonly string[];
  /** The invocation the harness awaits while it is live; null before its first starts, and while it is not live. */
  readonly awaiting: string | null;
  /** The sequences of the `brief-appended` events that appended to it. */
  readonly appends: readonly number[];
  /** Why it finished, once it has. */
  readonly finished: SessionFinishReason | null;
  readonly opened: SessionMoment;
  /** Its last change of state or history. */
  readonly changed: SessionMoment;
}

/** Every session of a run by its identifier, in the order they were opened. */
export type RunSessions = ReadonlyMap<SessionId, RunSession>;

/** The events the session reducer reads; every other event leaves the sessions unchanged. */
export const sessionEventTypes = [
  'session-opened', 'invocation-started', 'invocation-ended', 'brief-appended', 'session-finished',
] as const satisfies readonly RunEvent['type'][];

type SessionEvent = RunEventOf<(typeof sessionEventTypes)[number]>;

/** The state a session was in when an event named it, or `none` where it did not exist. */
export type SessionTransitionFrom = SessionState | 'none';

/** An event that is not a valid transition of the session it names. */
export class InvalidSessionTransitionError extends Error {
  constructor(
    /** The event's sequence in the log. */
    readonly sequence: number,
    readonly session: SessionId,
    readonly from: SessionTransitionFrom,
    /** The event, and for `invocation-ended` whether it kept the session. */
    readonly event: string,
    readonly detail: string,
  ) {
    super(`Event ${sequence} (${event}) is not a transition of ${session} from ${from}: ${detail}`);
    this.name = 'InvalidSessionTransitionError';
  }
}

/** The sessions of a run after every event of `events`, in order. Throws on an invalid transition. */
export function reduceSessions(events: readonly RunEvent[]): RunSessions {
  let sessions: RunSessions = new Map();
  for (const event of events) sessions = applySessionEvent(sessions, event);
  return sessions;
}

/**
 * The sessions after one more event. An event the model does not read returns
 * the same map; one it reads returns a new map and leaves `sessions` as it
 * was.
 */
export function applySessionEvent(sessions: RunSessions, event: RunEvent): RunSessions {
  if (!isSessionEvent(event)) return sessions;
  const id = event.data.session;
  const current = sessions.get(id);
  const moment = { sequence: event.sequence, at: event.at };
  const reject = (detail: string): never => {
    throw new InvalidSessionTransitionError(event.sequence, id, current?.state ?? 'none', labelOf(event), detail);
  };
  const next = (session: RunSession): RunSessions => new Map(sessions).set(id, session);

  if (event.type === 'session-opened') {
    if (current !== undefined) reject('the session is already open');
    return next({
      id,
      role: event.data.role,
      work: event.data.work,
      executor: event.data.executor,
      model: event.data.model,
      state: 'live',
      invocations: [],
      awaiting: null,
      appends: [],
      finished: null,
      opened: moment,
      changed: moment,
    });
  }
  if (current === undefined) return reject('no session-opened precedes it');

  switch (event.type) {
    case 'invocation-started': {
      const opening = current.state === 'live' && current.invocations.length === 0;
      if (event.data.start === 'opened' && !opening) {
        reject(current.state === 'live' ? `it already awaits ${current.awaiting}` : 'only a session just opened starts its first invocation');
      }
      if (event.data.start === 'continued' && current.state !== 'suspended') {
        reject(opening ? 'a session just opened has nothing to continue' : 'only a suspended session is continued');
      }
      if (current.invocations.includes(event.data.invocation)) reject(`${event.data.invocation} has already started`);
      return next({ ...current, state: 'live', invocations: [...current.invocations, event.data.invocation], awaiting: event.data.invocation, changed: moment });
    }
    case 'invocation-ended': {
      if (current.state !== 'live' || current.awaiting !== event.data.invocation) {
        reject(current.state === 'live' ? `it awaits ${current.awaiting ?? 'no invocation yet'}, not ${event.data.invocation}` : 'only a live session ends an invocation');
      }
      return next(event.data.kept
        ? { ...current, state: 'suspended', awaiting: null, changed: moment }
        : { ...current, state: 'finished', awaiting: null, finished: event.data.finished, changed: moment });
    }
    case 'brief-appended': {
      if (current.state !== 'suspended') reject('only a suspended session is appended to');
      return next({ ...current, appends: [...current.appends, event.sequence], changed: moment });
    }
    case 'session-finished': {
      const opening = current.state === 'live' && current.invocations.length === 0;
      if (current.state !== 'suspended' && !opening) {
        reject(current.state === 'live' ? `it awaits ${current.awaiting}; that invocation's end finishes it` : 'it has already finished');
      }
      return next({ ...current, state: 'finished', awaiting: null, finished: event.data.reason, changed: moment });
    }
  }
}

/** The sessions in one state, in the order they were opened. */
export function sessionsIn(sessions: RunSessions, state: SessionState): RunSession[] {
  return [...sessions.values()].filter(session => session.state === state);
}

function isSessionEvent(event: RunEvent): event is SessionEvent {
  return (sessionEventTypes as readonly string[]).includes(event.type);
}

function labelOf(event: SessionEvent): string {
  return event.type === 'invocation-ended' ? `invocation-ended, ${event.data.kept ? 'kept' : 'finished'}` : event.type;
}
