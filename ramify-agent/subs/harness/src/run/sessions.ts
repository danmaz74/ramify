import type { Role } from '../interfaces/protocol/runs.js';
import type { RunEvent, RunEventOf } from './log.js';
import type {
  ForkRelation, InvocationWork, ReplaceRelation, RequestRelation, SessionFinishReason, SessionId, SessionPoint,
} from './records.js';

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
 *
 * Lineage names harness points, never an executor's ref. A session's point
 * moves to the end of each of its invocations and to each append. A
 * continuation continues from its session's latest point; a fork names a
 * point its source reached, whatever state the source is in now; a
 * replacement names a session that was opened before it; a request names an
 * invocation that started before it. A relation that names anything else is
 * rejected as an invalid transition is.
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
  /** Its latest point: the end of its last invocation, or its last append since. Null before its first invocation ends. */
  readonly point: SessionPoint | null;
  /** The point it was forked from, where it was. */
  readonly fork: ForkRelation | null;
  /** The session it took the place of, where it did. */
  readonly replaces: ReplaceRelation | null;
  /** The invocation whose result asked for it, where one did. */
  readonly requestedBy: RequestRelation | null;
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
    const { fork, replaces, requestedBy } = event.data;
    if (fork !== undefined) {
      const source = sessions.get(fork.from.session);
      if (source === undefined || !reached(source, fork.from)) reject(`it forks from ${pointLabel(fork.from)}, which no session has reached`);
    }
    if (replaces !== undefined && !sessions.has(replaces.session)) reject(`it replaces ${replaces.session}, which was never opened`);
    if (requestedBy !== undefined && ![...sessions.values()].some(session => session.invocations.includes(requestedBy.invocation))) {
      reject(`it was requested by ${requestedBy.invocation}, which has not started`);
    }
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
      point: null,
      fork: fork ?? null,
      replaces: replaces ?? null,
      requestedBy: requestedBy ?? null,
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
      const continues = event.data.continues;
      if (continues !== undefined && event.data.start !== 'continued') reject('only a continued start continues from a point');
      if (continues !== undefined && (current.point === null || !samePoint(continues.from, current.point))) {
        reject(`it continues from ${pointLabel(continues.from)}, and the session's latest point is ${current.point === null ? 'none' : pointLabel(current.point)}`);
      }
      return next({ ...current, state: 'live', invocations: [...current.invocations, event.data.invocation], awaiting: event.data.invocation, changed: moment });
    }
    case 'invocation-ended': {
      if (current.state !== 'live' || current.awaiting !== event.data.invocation) {
        reject(current.state === 'live' ? `it awaits ${current.awaiting ?? 'no invocation yet'}, not ${event.data.invocation}` : 'only a live session ends an invocation');
      }
      const point = { session: id, invocation: event.data.invocation };
      return next(event.data.kept
        ? { ...current, state: 'suspended', awaiting: null, point, changed: moment }
        : { ...current, state: 'finished', awaiting: null, finished: event.data.finished, point, changed: moment });
    }
    case 'brief-appended': {
      if (current.state !== 'suspended') reject('only a suspended session is appended to');
      return next({ ...current, appends: [...current.appends, event.sequence], point: { session: id, append: event.sequence }, changed: moment });
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

/**
 * The session each invocation belongs to, by its `invocation-started`. It
 * reads no executor ref and derives no state, so a projection can group by
 * session over a log it does not validate.
 */
export function invocationSessions(events: readonly RunEvent[]): ReadonlyMap<string, SessionId> {
  const sessions = new Map<string, SessionId>();
  for (const event of events) if (event.type === 'invocation-started') sessions.set(event.data.invocation, event.data.session);
  return sessions;
}

/** Whether two points are the same point. */
export function samePoint(left: SessionPoint, right: SessionPoint): boolean {
  if (left.session !== right.session) return false;
  return 'invocation' in left
    ? 'invocation' in right && left.invocation === right.invocation
    : 'append' in right && left.append === right.append;
}

/** A point as a sentence names it: `ses-0001 at inv-0001`, or `ses-0001 at append 12`. */
export function pointLabel(point: SessionPoint): string {
  return 'invocation' in point ? `${point.session} at ${point.invocation}` : `${point.session} at append ${point.append}`;
}

/** Whether a session has reached a point: one of its invocations has ended there, or one of its appends made it. */
function reached(session: RunSession, point: SessionPoint): boolean {
  if (point.session !== session.id) return false;
  return 'invocation' in point
    ? session.invocations.includes(point.invocation) && session.awaiting !== point.invocation
    : session.appends.includes(point.append);
}

function isSessionEvent(event: RunEvent): event is SessionEvent {
  return (sessionEventTypes as readonly string[]).includes(event.type);
}

function labelOf(event: SessionEvent): string {
  return event.type === 'invocation-ended' ? `invocation-ended, ${event.data.kept ? 'kept' : 'finished'}` : event.type;
}
