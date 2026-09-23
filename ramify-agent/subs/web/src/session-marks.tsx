import type { RunSessionView, SessionReach, SessionRef, ShownSessionState } from '../../harness/src/interfaces/protocol/sessions.js';
import { chapterHref, sessionHref } from './routes.js';
import { reachText, SessionState } from './run-labels.js';

/*
 * Where agents are working, on the progress diagrams. The harness says which
 * elements each session reaches; this module only groups the run's sessions
 * by the elements a diagram draws. A node is marked with its live sessions,
 * counted with their roles, and its suspended and interrupted ones, each
 * counted and named apart. A finished session leaves no mark; it is listed
 * with the node's sessions when the node is selected. A session that reaches
 * no drawn element, such as the initial architect, which reaches the run
 * itself, is shown in the run-level strip instead.
 */

/** A run's sessions as a diagram marks them: the run, to link each session to its transcript. */
export interface DiagramSessions {
  readonly planId: string;
  readonly runId: string;
  readonly sessions: readonly RunSessionView[];
}

/** The capability a session reaches, if any. */
export function capabilityOf(reach: SessionReach): string | null {
  return reach.kind === 'work-item' || reach.kind === 'request' ? reach.capability : null;
}

/** The module a session reaches, if any. */
export function moduleOf(reach: SessionReach): string | null {
  return reach.kind === 'work-item' || reach.kind === 'module' ? reach.module : null;
}

/** The sessions of each element, keyed by what `elementOf` answers; a session with no element is left out. */
export function sessionsBy(sessions: readonly RunSessionView[], elementOf: (reach: SessionReach) => string | null): Map<string, RunSessionView[]> {
  const byElement = new Map<string, RunSessionView[]>();
  for (const session of sessions) {
    const element = elementOf(session.reaches);
    if (element === null) continue;
    byElement.set(element, [...(byElement.get(element) ?? []), session]);
  }
  return byElement;
}

const markedStates = ['live', 'suspended', 'interrupted'] as const satisfies readonly ShownSessionState[];

/** Each role of the live sessions with how many hold it, in the order they were opened. */
function liveRoles(sessions: readonly RunSessionView[]): Array<[string, number]> {
  const roles = new Map<string, number>();
  for (const session of sessions) if (session.state === 'live') roles.set(session.role, (roles.get(session.role) ?? 0) + 1);
  return [...roles];
}

function count(sessions: readonly RunSessionView[], state: ShownSessionState): number {
  return sessions.filter(session => session.state === state).length;
}

/** Whether an element carries a mark: some session of it is not finished. */
export function isMarked(sessions: readonly RunSessionView[] | undefined): boolean {
  return (sessions ?? []).some(session => session.state !== 'finished');
}

/** The marks in words, for a node's accessible name and its width: `1 live (engineer), 1 suspended`. */
export function marksText(sessions: readonly RunSessionView[] | undefined): string {
  const all = sessions ?? [];
  return markedStates.flatMap(state => {
    const n = count(all, state);
    if (n === 0) return [];
    if (state !== 'live') return [`${n} ${state}`];
    return [`${n} live (${liveRoles(all).map(([role, times]) => (times > 1 ? `${role} ×${times}` : role)).join(', ')})`];
  }).join(', ');
}

/**
 * An element's marks: the number of its live sessions with a chip for each
 * role, then its suspended and interrupted sessions, each counted in its own
 * words. Nothing when every session of it is finished or it has none.
 */
export function SessionMarks({ sessions }: { readonly sessions: readonly RunSessionView[] | undefined }) {
  const all = sessions ?? [];
  if (!isMarked(all)) return null;
  const live = count(all, 'live');
  return (
    <span className="session-marks">
      {live > 0 && (
        <>
          <span className="session-mark session-mark-live">{live} live</span>
          {liveRoles(all).map(([role, times]) => (
            <span key={role} className="role-chip">{role}{times > 1 ? ` ×${times}` : ''}</span>
          ))}
        </>
      )}
      {count(all, 'suspended') > 0 && <span className="session-mark session-mark-suspended">{count(all, 'suspended')} suspended</span>}
      {count(all, 'interrupted') > 0 && <span className="session-mark session-mark-interrupted">{count(all, 'interrupted')} interrupted</span>}
    </span>
  );
}

const stateOrder: Record<ShownSessionState, number> = { live: 0, suspended: 1, interrupted: 2, finished: 3 };

/**
 * Live and suspended sessions first, then interrupted ones, each in the
 * order they were opened; then finished ones, the latest change first.
 */
export function panelOrder(sessions: readonly RunSessionView[]): RunSessionView[] {
  return [...sessions].sort((left, right) => stateOrder[left.state] - stateOrder[right.state]
    || (left.state === 'finished' ? right.changed.sequence - left.changed.sequence : left.opened.sequence - right.opened.sequence));
}

function refOf(diagram: DiagramSessions, session: RunSessionView): SessionRef {
  return { source: 'run', planId: diagram.planId, runId: diagram.runId, session: session.session };
}

function SessionLine({ diagram, session, where }: { readonly diagram: DiagramSessions; readonly session: RunSessionView; readonly where?: boolean }) {
  const ref = refOf(diagram, session);
  return (
    <>
      <a href={sessionHref(ref)}><code>{session.session}</code> {session.role}</a>
      <SessionState state={session.state} />
      {session.state === 'live' && session.awaiting !== null && (
        <span className="muted"> awaiting <a href={chapterHref(ref, session.awaiting)}>{session.awaiting}</a></span>
      )}
      {session.finished && <span className="muted"> {session.finished}</span>}
      {where && <span className="muted"> · {reachText(session.reaches)}</span>}
    </>
  );
}

/** The sessions of one selected element, each opening its transcript. */
export function ElementSessions({ diagram, sessions, element }: {
  readonly diagram: DiagramSessions;
  readonly sessions: readonly RunSessionView[] | undefined;
  /** What the sessions are of, in words, such as `send-button`. */
  readonly element: string;
}) {
  const ordered = panelOrder(sessions ?? []);
  return (
    <section className="element-sessions" aria-label={`Sessions of ${element}`}>
      <h4>Sessions</h4>
      {ordered.length === 0
        ? <p className="muted">No session of this run has reached it.</p>
        : (
          <ul className="element-session-list">
            {ordered.map(session => (
              <li key={session.session} className={`element-session element-session-${session.state}`}>
                <SessionLine diagram={diagram} session={session} />
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

/**
 * The run-level strip: the sessions a diagram draws no element for. The
 * initial architect reaches the run itself; any other session here reaches
 * an element this view does not draw, which is named. Sessions that are not
 * finished are listed; finished ones are counted and listed on request.
 */
export function RunSessionStrip({ diagram, sessions }: { readonly diagram: DiagramSessions; readonly sessions: readonly RunSessionView[] }) {
  if (sessions.length === 0) return null;
  const ordered = panelOrder(sessions);
  const open = ordered.filter(session => session.state !== 'finished');
  const finished = ordered.filter(session => session.state === 'finished');
  return (
    <section className="session-strip" aria-label="Sessions without an element here">
      <p className="session-strip-label">
        <strong>Run level</strong> <span className="muted">Sessions of the run itself, or of an element this view does not draw.</span>
        <SessionMarks sessions={sessions} />
      </p>
      {open.length > 0 && (
        <ul className="session-strip-list">
          {open.map(session => (
            <li key={session.session} className={`element-session element-session-${session.state}`}>
              <SessionLine diagram={diagram} session={session} where={session.reaches.kind !== 'run'} />
            </li>
          ))}
        </ul>
      )}
      {finished.length > 0 && (
        <details className="session-strip-finished">
          <summary>{finished.length} finished</summary>
          <ul className="session-strip-list">
            {finished.map(session => (
              <li key={session.session} className="element-session element-session-finished">
                <SessionLine diagram={diagram} session={session} where={session.reaches.kind !== 'run'} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** How the diagrams' legends name the marks. */
export function SessionMarksLegend() {
  return (
    <>
      <span><span className="session-mark session-mark-live">N live</span><span className="role-chip">role</span> sessions awaited now</span>
      <span><span className="session-mark session-mark-suspended">N suspended</span> kept to be continued</span>
      <span><span className="session-mark session-mark-interrupted">N interrupted</span> left live when the run ended</span>
    </>
  );
}
