import { useId, useMemo, type ReactNode } from 'react';
import type {
  RunSessionView, RunSessionsResponse, SessionAppend, SessionInvocation, SessionRef, SessionSuspension,
} from '../../harness/src/interfaces/protocol/sessions.js';
import type { TranscriptPoint } from '../../harness/src/interfaces/protocol/transcripts.js';
import { chapterHref, pointHref, sessionHref } from './routes.js';
import { reachText, SessionState } from './run-labels.js';
import { pointText } from './transcript.js';

/*
 * Run → Sessions: the run's session history as a timeline. Each session is
 * a lane, in the order the run opened them; its invocations are segments,
 * each opening its chapter of the transcript; the time it was suspended is
 * a gap, and each brief appended to it a mark. Forks branch from their
 * source point, replacements are dashed links from the session replaced,
 * and requested sessions are linked from the invocation that asked for them.
 *
 * The harness owns every displayed fact; the browser owns only the
 * placement. Columns are the run events at which some session changed, in
 * order: an event's position, never a duration.
 */

const labelWidth = 148;
const firstColumn = labelWidth + 28;
const step = 76;
const trailingRoom = 36;
const axisHeight = 30;
const laneHeight = 52;
const segmentHeight = 26;
/** How far a segment's box stays inside its columns, so that neighbours never touch. */
const segmentInset = 2;

export interface TimelineColumn {
  /** The run event's sequence, or null for the latest edge, where what has not ended yet reaches. */
  readonly sequence: number | null;
  readonly x: number;
}

export interface TimelineLane {
  readonly session: RunSessionView;
  readonly index: number;
  readonly top: number;
  readonly center: number;
  readonly start: number;
  readonly end: number;
}

export interface TimelineSegment {
  readonly session: string;
  readonly invocation: SessionInvocation;
  /** Its chapter's number in the session's transcript. */
  readonly chapter: number;
  readonly x: number;
  readonly width: number;
  /** It has not ended: it reaches the latest edge. */
  readonly open: boolean;
}

export interface TimelineGap {
  readonly session: string;
  readonly suspension: SessionSuspension;
  readonly x: number;
  readonly width: number;
  readonly open: boolean;
}

export interface TimelineMark {
  readonly session: string;
  readonly append: SessionAppend;
  readonly x: number;
}

export type TimelineLinkKind = 'fork' | 'replace' | 'request';

/** A relation between two lanes, drawn from its source in one lane to the start of the other. */
export interface TimelineLink {
  readonly kind: TimelineLinkKind;
  readonly from: string;
  readonly to: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** A relation whose source is not in the answer: said in words, never drawn. */
export interface TimelineUnplaced {
  readonly kind: TimelineLinkKind;
  readonly session: string;
  readonly source: string;
}

export interface SessionTimelineLayout {
  readonly columns: readonly TimelineColumn[];
  readonly lanes: readonly TimelineLane[];
  readonly segments: readonly TimelineSegment[];
  readonly gaps: readonly TimelineGap[];
  readonly marks: readonly TimelineMark[];
  readonly links: readonly TimelineLink[];
  readonly unplaced: readonly TimelineUnplaced[];
  readonly width: number;
  readonly height: number;
}

function samePoint(left: TranscriptPoint, right: TranscriptPoint): boolean {
  return left.session === right.session
    && ('invocation' in left ? 'invocation' in right && left.invocation === right.invocation : 'append' in right && left.append === right.append);
}

/**
 * A deterministic layout of one answer. Every sequence at which a session
 * started or ended an invocation, received a brief, or stopped being
 * suspended is a column, one step apart. An invocation or suspension that
 * has not ended reaches a last column, the latest edge.
 */
export function layoutSessionTimeline(sessions: readonly RunSessionView[]): SessionTimelineLayout {
  const sequences = new Set<number>();
  let open = false;
  for (const session of sessions) {
    if (session.invocations.length === 0) sequences.add(session.opened.sequence);
    for (const invocation of session.invocations) {
      sequences.add(invocation.started.sequence);
      if (invocation.ended) sequences.add(invocation.ended.sequence);
      else open = true;
    }
    for (const suspension of session.suspended) {
      sequences.add(suspension.from.sequence);
      if (suspension.until) sequences.add(suspension.until.sequence);
      else open = true;
    }
    for (const append of session.appends) sequences.add(append.appended.sequence);
  }
  const ordered = [...sequences].sort((left, right) => left - right);
  const columns: TimelineColumn[] = ordered.map((sequence, index) => ({ sequence, x: firstColumn + index * step }));
  if (open) columns.push({ sequence: null, x: firstColumn + ordered.length * step });
  const xOf = new Map(columns.map(column => [column.sequence, column.x]));
  const at = (sequence: number | null): number => xOf.get(sequence)!;

  const lanes: TimelineLane[] = [];
  const segments: TimelineSegment[] = [];
  const gaps: TimelineGap[] = [];
  const marks: TimelineMark[] = [];
  sessions.forEach((session, index) => {
    const top = axisHeight + index * laneHeight;
    const own: number[] = [];
    session.invocations.forEach((invocation, chapter) => {
      const x = at(invocation.started.sequence);
      const end = at(invocation.ended?.sequence ?? null);
      segments.push({ session: session.session, invocation, chapter: chapter + 1, x, width: end - x, open: invocation.ended === null });
      own.push(x, end);
    });
    for (const suspension of session.suspended) {
      const x = at(suspension.from.sequence);
      const end = at(suspension.until?.sequence ?? null);
      gaps.push({ session: session.session, suspension, x, width: end - x, open: suspension.until === null });
      own.push(x, end);
    }
    for (const append of session.appends) {
      const x = at(append.appended.sequence);
      marks.push({ session: session.session, append, x });
      own.push(x);
    }
    if (own.length === 0) own.push(at(session.opened.sequence));
    lanes.push({ session, index, top, center: top + laneHeight / 2, start: Math.min(...own), end: Math.max(...own) });
  });

  const laneOf = new Map(lanes.map(lane => [lane.session.session, lane]));
  const segmentOf = (session: string, invocation: string) =>
    segments.find(segment => segment.session === session && segment.invocation.invocation === invocation);
  /** Where a point is drawn: the end of its invocation's segment, or its append's mark. */
  const pointX = (point: TranscriptPoint): number | undefined => {
    if ('invocation' in point) {
      const segment = segmentOf(point.session, point.invocation);
      return segment && !segment.open ? segment.x + segment.width : undefined;
    }
    return marks.find(mark => mark.session === point.session && samePoint(mark.append.point, point))?.x;
  };

  const links: TimelineLink[] = [];
  const unplaced: TimelineUnplaced[] = [];
  for (const lane of lanes) {
    const { lineage } = lane.session;
    const relate = (kind: TimelineLinkKind, source: string, x1: number | undefined) => {
      const from = laneOf.get(source);
      if (from === undefined || x1 === undefined) {
        unplaced.push({ kind, session: lane.session.session, source });
        return;
      }
      links.push({ kind, from: source, to: lane.session.session, x1, y1: from.center, x2: lane.start, y2: lane.center });
    };
    if (lineage.fork) relate('fork', lineage.fork.from.session, pointX(lineage.fork.from));
    if (lineage.replaces) relate('replace', lineage.replaces.session, laneOf.get(lineage.replaces.session)?.end);
    if (lineage.requestedBy) {
      const { session, invocation } = lineage.requestedBy;
      const segment = session === null ? undefined : segmentOf(session, invocation);
      // The requester's result asked for the session: its end, or its start while it runs.
      relate('request', session ?? invocation, segment && (segment.open ? segment.x : segment.x + segment.width));
    }
  }

  const last = columns.at(-1)?.x ?? firstColumn;
  return {
    columns,
    lanes,
    segments,
    gaps,
    marks,
    links,
    unplaced,
    width: last + trailingRoom,
    height: axisHeight + sessions.length * laneHeight,
  };
}

// Words: every drawn fact is also said, in the segment's name and in the list.

function startText(session: RunSessionView, invocation: SessionInvocation): string {
  if (invocation.start === 'continued') {
    const continues = invocation.continues;
    if (continues === null) return 'continued';
    return `continued from ${pointText(continues.from, session.session)} (${continues.reason})${continues.briefs.length > 0 ? `, with briefs ${continues.briefs.join(', ')} appended since` : ''}`;
  }
  const { fork, replaces, requestedBy } = session.lineage;
  const parts: string[] = [];
  if (fork) parts.push(`forked from ${pointText(fork.from, session.session)} (${fork.reason}${fork.generation === undefined ? '' : `, context generation ${fork.generation}`})`);
  if (replaces) parts.push(`opened in place of ${replaces.session} (${replaces.reason})`);
  if (requestedBy) parts.push(`requested by ${requestedBy.invocation}${requestedBy.session ? ` in ${requestedBy.session}` : ''} (${requestedBy.reason})`);
  return parts.length === 0 ? 'opened fresh' : parts.join(', ');
}

function endText(session: RunSessionView, invocation: SessionInvocation): string {
  if (invocation.outcome !== null) return `${invocation.outcome}${invocation.kept === true ? ', kept' : invocation.kept === false ? ', finished the session' : ''}`;
  if (session.state === 'live' && session.awaiting === invocation.invocation) return 'awaited';
  return 'not ended';
}

function degradedText(invocation: SessionInvocation): string | null {
  const degraded = invocation.degraded;
  if (degraded === null) return null;
  return `degraded start: ${degraded.requested} was requested and ${degraded.actual} was made${degraded.reason ? ` (${degraded.reason})` : ''}`;
}

function eventsText(invocation: SessionInvocation): string {
  return invocation.ended
    ? `events ${invocation.started.sequence} to ${invocation.ended.sequence}`
    : `from event ${invocation.started.sequence}`;
}

/** A segment's name: its chapter, how it started and ended, and a degraded start. */
export function segmentName(session: RunSessionView, segment: TimelineSegment): string {
  const { invocation } = segment;
  return [
    `Chapter ${segment.chapter} of ${session.session}: ${invocation.invocation}`,
    startText(session, invocation),
    endText(session, invocation),
    degradedText(invocation),
    eventsText(invocation),
  ].filter(Boolean).join(', ');
}

function appendName(session: string, append: SessionAppend): string {
  return `Brief ${append.decision} appended to ${session} at event ${append.appended.sequence}, context generation ${append.generation}${append.outcome === 'already-present' ? ', already present' : ''}`;
}

const linkWords: Record<TimelineLinkKind, string> = { fork: 'forked from', replace: 'in place of', request: 'requested by' };

// Drawing

function linkPath(link: TimelineLink): string {
  // Out of the source vertically, into the target's start horizontally.
  return `M ${link.x1} ${link.y1} C ${link.x1} ${link.y2}, ${link.x1} ${link.y2}, ${link.x2 - segmentInset} ${link.y2}`;
}

export function SessionTimeline({ planId, runId, answer }: {
  readonly planId: string;
  readonly runId: string;
  readonly answer: RunSessionsResponse;
}) {
  const { sessions, total } = answer;
  const layout = useMemo(() => layoutSessionTimeline(sessions), [sessions]);
  const markerPrefix = useId().replaceAll(':', '');
  const refOf = (session: string): SessionRef => ({ source: 'run', planId, runId, session });
  const bounded = total > sessions.length;
  const running = sessions.some(session => session.state === 'live' || session.state === 'suspended');

  const coverage = (bounded || layout.unplaced.length > 0) && (
    <div className="graph-coverage warn" role="status" aria-label="Response coverage">
      {bounded && <p>Showing <strong>{sessions.length} / {total}</strong> sessions: the response is bounded, and the other {total - sessions.length} are not in it.</p>}
      {layout.unplaced.length > 0 && (
        <>
          <p>Relations whose source is not in this response, and are not drawn:</p>
          <ul aria-label="Relations not drawn">
            {layout.unplaced.map(item => <li key={`${item.kind}-${item.session}`}><code>{item.session}</code> {linkWords[item.kind]} <code>{item.source}</code></li>)}
          </ul>
        </>
      )}
    </div>
  );

  return (
    <section className="panel session-timeline" aria-labelledby={`${markerPrefix}-heading`}>
      <div className="capability-graph-header">
        <div>
          <h2 id={`${markerPrefix}-heading`}>Session timeline</h2>
          <p className="muted">
            One lane per session, in the order the run opened them. Columns are the run events at which a session changed,
            in order, not durations. Select a segment to open its chapter of the transcript.
          </p>
        </div>
      </div>
      {coverage}
      <div className="graph-legend" aria-label="Timeline legend">
        <span><i className="legend-segment" /> invocation</span>
        <span><i className="legend-segment legend-awaited" /> awaited</span>
        <span><i className="legend-gap" /> suspended</span>
        <span><i className="legend-mark" /> brief appended</span>
        <span><i className="legend-link" /> fork</span>
        <span><i className="legend-link legend-replace" /> replacement</span>
        <span><i className="legend-link legend-request" /> request</span>
        <span><i className="legend-degraded">!</i> degraded start</span>
      </div>
      <div className="timeline-scroll" tabIndex={0} aria-label="Scrollable session timeline">
        <div className="timeline-surface" style={{ width: layout.width, height: layout.height }} role="group"
          aria-label={`${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}, one lane each, over ${layout.columns.length} run event columns`}>
          <svg className="timeline-drawing" width={layout.width} height={layout.height} aria-hidden="true">
            <defs>
              {(['fork', 'replace', 'request'] as const).map(kind => (
                <marker key={kind} id={`${markerPrefix}-${kind}`} className={`timeline-arrow timeline-arrow-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              ))}
            </defs>
            {layout.lanes.map(lane => lane.index % 2 === 1 && <rect key={lane.session.session} className="timeline-lane-band" x={0} y={lane.top} width={layout.width} height={laneHeight} />)}
            {layout.columns.map(column => <line key={column.sequence ?? 'latest'} className="timeline-rule" x1={column.x} y1={axisHeight - 4} x2={column.x} y2={layout.height} />)}
            {layout.gaps.map(gap => {
              const center = layout.lanes.find(lane => lane.session.session === gap.session)!.center;
              return (
                <line key={`${gap.session}-${gap.suspension.from.sequence}`} className={`timeline-gap${gap.open ? ' timeline-gap-open' : ''}`}
                  data-session={gap.session} x1={gap.x} y1={center} x2={gap.x + gap.width} y2={center} />
              );
            })}
            {layout.links.map(link => (
              <path key={`${link.kind}-${link.to}`} className={`timeline-link timeline-link-${link.kind}`} data-from={link.from} data-to={link.to}
                d={linkPath(link)} markerEnd={`url(#${markerPrefix}-${link.kind})`} />
            ))}
          </svg>
          <div className="timeline-axis" style={{ height: axisHeight }} aria-hidden="true">
            <span className="timeline-corner" style={{ width: labelWidth }} />
            {layout.columns.map(column => (
              <span key={column.sequence ?? 'latest'} className="timeline-tick" style={{ left: column.x }}>
                {column.sequence ?? (running ? 'now' : 'end')}
              </span>
            ))}
          </div>
          {layout.lanes.map(lane => {
            const { session } = lane;
            const ref = refOf(session.session);
            return (
              <div key={session.session} className={`timeline-lane timeline-lane-${session.state}`} style={{ height: laneHeight }} role="group"
                aria-label={`${session.session} ${session.role}, ${session.state}`}>
                <div className="timeline-lane-label" style={{ width: labelWidth }}>
                  <a href={sessionHref(ref)}><code>{session.session}</code></a>
                  <SessionState state={session.state} />
                  <span className="timeline-lane-role">{session.role}</span>
                </div>
                {layout.segments.filter(segment => segment.session === session.session).map(segment => {
                  const { invocation } = segment;
                  const name = segmentName(session, segment);
                  const classes = [
                    'timeline-segment',
                    `timeline-segment-${invocation.outcome ?? (session.state === 'live' ? 'awaited' : 'not-ended')}`,
                    invocation.degraded ? 'timeline-segment-degraded' : '',
                    segment.open ? 'timeline-segment-open' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <a key={invocation.invocation} className={classes} href={chapterHref(ref, invocation.invocation)} aria-label={name} title={name}
                      data-invocation={invocation.invocation}
                      style={{ left: segment.x + segmentInset, width: Math.max(segment.width - 2 * segmentInset, 8), top: (laneHeight - segmentHeight) / 2, height: segmentHeight }}>
                      {invocation.degraded && <span className="timeline-degraded" aria-hidden="true">!</span>}
                      <span className="timeline-segment-label" aria-hidden="true">{invocation.invocation}</span>
                    </a>
                  );
                })}
                {layout.marks.filter(mark => mark.session === session.session).map(mark => {
                  const name = appendName(session.session, mark.append);
                  return (
                    <a key={mark.append.appended.sequence} className="timeline-mark" href={pointHref(ref, mark.append.point)} aria-label={name} title={name}
                      style={{ left: mark.x, top: laneHeight / 2 }} />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <details className="capability-dependency-list timeline-list">
        <summary>Session list</summary>
        <ol aria-label="Sessions and their relations">
          {sessions.map(session => <SessionItem key={session.session} session={session} refOf={refOf} />)}
        </ol>
      </details>
    </section>
  );
}

function joined(items: readonly ReactNode[]): ReactNode {
  return items.map((item, index) => <span key={index}>{index > 0 && ', '}{item}</span>);
}

/** One session in words: its facts, its relations and each chapter, append and suspension. */
function SessionItem({ session, refOf }: { readonly session: RunSessionView; readonly refOf: (session: string) => SessionRef }) {
  const ref = refOf(session.session);
  const { lineage } = session;
  const sessionLink = (id: string) => <a key={id} href={sessionHref(refOf(id))}>{id}</a>;
  const relations: ReactNode[] = [];
  if (lineage.fork) {
    relations.push(<>forked from <a href={pointHref(ref, lineage.fork.from)}>{pointText(lineage.fork.from, session.session)}</a> ({lineage.fork.reason}{lineage.fork.generation === undefined ? '' : `, context generation ${lineage.fork.generation}`}{lineage.fork.briefs.length > 0 ? `, holding briefs ${lineage.fork.briefs.join(', ')}` : ''})</>);
  }
  if (lineage.replaces) relations.push(<>in place of {sessionLink(lineage.replaces.session)} ({lineage.replaces.reason})</>);
  if (lineage.replacedBy) relations.push(<>replaced by {sessionLink(lineage.replacedBy)}</>);
  if (lineage.requestedBy) {
    const by = lineage.requestedBy;
    relations.push(<>requested by {by.session ? <a href={chapterHref(refOf(by.session), by.invocation)}>{by.invocation} in {by.session}</a> : by.invocation} ({by.reason})</>);
  }
  if (lineage.requested.length > 0) relations.push(<>requested {joined(lineage.requested.map(sessionLink))}</>);
  if (lineage.forks.length > 0) relations.push(<>forked into {joined(lineage.forks.map(sessionLink))}</>);
  return (
    <li className="timeline-list-session">
      <p>
        <a href={sessionHref(ref)}><code>{session.session}</code> {session.role}</a> <SessionState state={session.state} />
        {session.finished && <span className="muted"> {session.finished}</span>}
        <span className="muted"> · {reachText(session.reaches)}</span>
      </p>
      {relations.length > 0 && <p>{joined(relations)}</p>}
      <ul>
        {session.invocations.map((invocation, index) => {
          const degraded = degradedText(invocation);
          return (
            <li key={invocation.invocation}>
              <a href={chapterHref(ref, invocation.invocation)}>Chapter {index + 1}: {invocation.invocation}</a>: {startText(session, invocation)}; {endText(session, invocation)}; {eventsText(invocation)}
              {degraded && <span className="warn">; {degraded}</span>}
            </li>
          );
        })}
        {session.suspended.map(suspension => (
          <li key={`suspended-${suspension.from.sequence}`}>
            Suspended from event {suspension.from.sequence}{suspension.until ? ` to event ${suspension.until.sequence}` : ', and still is'}
          </li>
        ))}
        {session.appends.map(append => (
          <li key={`append-${append.appended.sequence}`}>
            <a href={pointHref(ref, append.point)}>{appendName(session.session, append)}</a>
          </li>
        ))}
      </ul>
    </li>
  );
}
