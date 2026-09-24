import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { InvocationEvaluation } from '../../harness/src/interfaces/protocol/runs.js';
import type {
  RunSessionView, SessionInvocation, SessionRef, ShownSessionState,
} from '../../harness/src/interfaces/protocol/sessions.js';
import type { TranscriptEntry, TranscriptEntryOf } from '../../harness/src/interfaces/protocol/transcripts.js';
import { ClientError, type ProtocolClient } from './client.js';
import { EvaluationFacts } from './evaluation.js';
import { chapterHref, routeHref, sessionHref, type SessionAnchor } from './routes.js';
import { reachText, SessionState } from './run-labels.js';
import { isFinal, useSessionTranscript, type SessionDetail, type SessionTranscript } from './session-progress.js';
import {
  PointLink, pointElementId, TranscriptBodies, TranscriptEntryView, transcriptCalls, type TranscriptContext,
} from './transcript.js';

/*
 * One session's transcript, read-only. Its invocations are chapters, each
 * with its start relation and reason and the evaluation the Run page shows
 * for it. A live or suspended session is followed: new entries are appended
 * as they arrive, and the view keeps to the bottom while the reader is
 * there; otherwise a control says how many entries arrived below.
 */

/** How close to the bottom, in pixels, still counts as at the bottom. */
export const stickMargin = 48;

type Chapter =
  | { readonly kind: 'chapter'; readonly invocation: string; readonly number: number; readonly entries: readonly TranscriptEntry[]; readonly first: boolean }
  | { readonly kind: 'between'; readonly entries: readonly TranscriptEntry[] };

/**
 * The entries in order, grouped by invocation: consecutive entries of one
 * invocation are one chapter, and what the harness did between invocations
 * stands between them. An invocation the session names that has no entry
 * yet, or whose transcript is missing, is an empty chapter at the end.
 */
function chaptersOf(entries: readonly TranscriptEntry[], invocations: readonly string[]): Chapter[] {
  const chapters: Chapter[] = [];
  const seen = new Map<string, number>();
  const numberOf = (invocation: string) => {
    if (!seen.has(invocation)) seen.set(invocation, seen.size + 1);
    return seen.get(invocation)!;
  };
  for (const entry of entries) {
    const last = chapters.at(-1);
    const invocation = entry.invocation;
    if (invocation === null) {
      if (last?.kind === 'between') chapters[chapters.length - 1] = { ...last, entries: [...last.entries, entry] };
      else chapters.push({ kind: 'between', entries: [entry] });
    } else if (last?.kind === 'chapter' && last.invocation === invocation) {
      chapters[chapters.length - 1] = { ...last, entries: [...last.entries, entry] };
    } else {
      const first = !seen.has(invocation);
      chapters.push({ kind: 'chapter', invocation, number: numberOf(invocation), entries: [entry], first });
    }
  }
  for (const invocation of invocations) {
    if (!seen.has(invocation)) chapters.push({ kind: 'chapter', invocation, number: numberOf(invocation), entries: [], first: true });
  }
  return chapters;
}

function workText(work: RunSessionView['work']): string {
  const parts = [work.workItem, work.iteration, work.request && `request ${work.request}`].filter(Boolean);
  return parts.length === 0 ? 'none' : parts.join(', ');
}

function SessionLink({ from, session, sessions }: { readonly from: SessionRef; readonly session: string; readonly sessions: ReadonlyMap<string, RunSessionView> }) {
  const role = sessions.get(session)?.role;
  const ref: SessionRef = from.source === 'run' ? { ...from, session } : from;
  return <a href={sessionHref(ref)}>{session}{role ? ` (${role})` : ''}</a>;
}

function joined(items: readonly ReactNode[]): ReactNode {
  return items.map((item, index) => <span key={index}>{index > 0 && ', '}{item}</span>);
}

/** The session's own facts and its relations to other sessions. */
function SessionFacts({ at: ref, detail }: { readonly at: SessionRef; readonly detail: SessionDetail }) {
  if (detail.source === 'standalone') {
    const { session, prompt, outcome } = detail.standalone;
    return (
      <dl className="facts">
        <div><dt>Role</dt><dd>{session.role}</dd></div>
        <div><dt>Reaches</dt><dd>{reachText(session.reaches)}</dd></div>
        <div><dt>Executor</dt><dd>{session.executor}{session.model ? `, model ${session.model}` : ', the executor\'s own model'}</dd></div>
        <div><dt>Started</dt><dd>{session.startedAt}</dd></div>
        <div><dt>Last change</dt><dd>{session.changedAt}</dd></div>
        <div>
          <dt>Outcome</dt>
          <dd>{outcome === null
            ? 'none recorded: the session was interrupted before it ended'
            : `${outcome.ended}${outcome.interruption ? `, interrupted: ${outcome.interruption}` : ''}${outcome.error ? `, error: ${outcome.error}` : ''}, at ${outcome.finishedAt}`}</dd>
        </div>
        <div><dt>Prompt</dt><dd className="prompt-line">{prompt}</dd></div>
      </dl>
    );
  }
  const { session, sessions } = detail;
  const { lineage } = session;
  const relations: ReactNode[] = [];
  if (lineage.fork) {
    relations.push(<>Forked from <PointLink from={ref} point={lineage.fork.from} /> ({lineage.fork.reason}, context generation {lineage.fork.generation}{lineage.fork.briefs.length > 0 ? `, holding briefs ${lineage.fork.briefs.join(', ')}` : ''})</>);
  }
  if (lineage.replaces) relations.push(<>Replaces <SessionLink from={ref} session={lineage.replaces.session} sessions={sessions} /> ({lineage.replaces.reason})</>);
  if (lineage.replacedBy) relations.push(<>Replaced by <SessionLink from={ref} session={lineage.replacedBy} sessions={sessions} /></>);
  if (lineage.requestedBy) {
    const by = lineage.requestedBy;
    relations.push(<>Requested by {by.session
      ? <a href={chapterHref({ ...ref, session: by.session } as SessionRef, by.invocation)}>{by.invocation} in {by.session}</a>
      : by.invocation} ({by.reason})</>);
  }
  if (lineage.requested.length > 0) relations.push(<>Requested {joined(lineage.requested.map(id => <SessionLink key={id} from={ref} session={id} sessions={sessions} />))}</>);
  if (lineage.forks.length > 0) relations.push(<>Forks from its points: {joined(lineage.forks.map(id => <SessionLink key={id} from={ref} session={id} sessions={sessions} />))}</>);
  return (
    <dl className="facts">
      <div><dt>Role</dt><dd>{session.role}</dd></div>
      <div><dt>Work</dt><dd>{workText(session.work)}</dd></div>
      <div><dt>Reaches</dt><dd>{reachText(session.reaches)}</dd></div>
      <div><dt>Executor</dt><dd>{session.executor}{session.model ? `, model ${session.model}` : ', the executor\'s own model'}</dd></div>
      <div><dt>Opened</dt><dd>{session.opened.at} (event {session.opened.sequence})</dd></div>
      <div><dt>Last change</dt><dd>{session.changed.at} (event {session.changed.sequence})</dd></div>
      {session.awaiting && <div><dt>Awaiting</dt><dd>{session.awaiting}</dd></div>}
      {session.finished && <div><dt>Finished because</dt><dd>{session.finished}</dd></div>}
      {session.point && <div><dt>Latest point</dt><dd><PointLink from={ref} point={session.point} /></dd></div>}
      <div><dt>Lineage</dt><dd>{relations.length === 0 ? 'opened fresh, with no relation to another session' : <ul className="relations">{relations.map((relation, index) => <li key={index}>{relation}</li>)}</ul>}</dd></div>
    </dl>
  );
}

/**
 * The session's degraded starts, before its facts, so a reader sees them
 * without scrolling: each links to its chapter. Nothing when it has none.
 */
function DegradedStartsNotice({ at: ref, session }: { readonly at: SessionRef; readonly session: RunSessionView }) {
  // A chapter's number is its invocation's place in the session.
  const degraded = session.invocations.flatMap((invocation, index) => invocation.degraded === null ? [] : [{ ...invocation.degraded, invocation: invocation.invocation, number: index + 1 }]);
  if (degraded.length === 0) return null;
  return (
    <section className="notice degraded-notice" aria-label="Degraded starts">
      <p>
        <strong>{degraded.length === 1 ? 'A degraded start' : `${degraded.length} degraded starts`}.</strong>
        {' '}The executor was asked to continue or fork this session's conversation and started a fresh one instead, without its history.
      </p>
      <ul>
        {degraded.map(({ invocation, number, requested, actual, reason }) => (
          <li key={invocation}>
            <a href={chapterHref(ref, invocation)}>Chapter {number}: {invocation}</a>: {requested} was requested and {actual} was made{reason ? ` (${reason})` : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** How a chapter's invocation started: from the run's view where there is one, else from its `started` entry. */
function StartRelation({ at: ref, invocation, started, session, sessions }: {
  readonly at: SessionRef;
  readonly invocation: SessionInvocation | undefined;
  readonly started: TranscriptEntryOf<'started'> | undefined;
  readonly session: RunSessionView | undefined;
  readonly sessions: ReadonlyMap<string, RunSessionView>;
}) {
  const start = invocation?.start ?? started?.start;
  const continues = invocation?.continues ?? started?.continues ?? null;
  const parts: ReactNode[] = [];
  if (start === 'continued') {
    parts.push(continues
      ? <>Continued from <PointLink from={ref} point={continues.from} />, because {continues.reason}{continues.briefs.length > 0 ? `; briefs appended since: ${continues.briefs.join(', ')}` : ''}</>
      : <>Continued</>);
  } else if (start === 'opened') {
    const fork = session?.lineage.fork ?? started?.fork ?? null;
    const replaces = session?.lineage.replaces ?? started?.replaces ?? null;
    const requestedBy = session?.lineage.requestedBy ?? started?.requestedBy ?? null;
    if (fork) parts.push(<>Forked from <PointLink from={ref} point={fork.from} />, because {fork.reason} (context generation {fork.generation})</>);
    if (replaces) parts.push(<>Opened in place of <SessionLink from={ref} session={replaces.session} sessions={sessions} />, {replaces.reason}</>);
    if (requestedBy) parts.push(<>Requested by {requestedBy.invocation}, because {requestedBy.reason}</>);
    if (parts.length === 0) parts.push(<>Opened fresh</>);
  } else {
    parts.push(<>Its start is not recorded yet</>);
  }
  if (started) parts.push(<>requested {started.requested}</>);
  if (invocation?.degraded) {
    const { requested, actual, reason } = invocation.degraded;
    parts.push(<span className="warn">degraded: {requested} was requested and {actual} was made{reason ? ` (${reason})` : ''}</span>);
  }
  return <p className="chapter-start">{joined(parts)}</p>;
}

function ChapterView({ chapter, context, detail, anchor }: {
  readonly chapter: Extract<Chapter, { kind: 'chapter' }>;
  readonly context: TranscriptContext;
  readonly detail: SessionDetail;
  readonly anchor: SessionAnchor | null;
}) {
  const ref = context.session;
  const run = detail.source === 'run' ? detail : undefined;
  const invocation = run?.session.invocations.find(candidate => candidate.invocation === chapter.invocation);
  const started = chapter.entries.find((entry): entry is TranscriptEntryOf<'started'> => entry.type === 'started');
  const evaluation: InvocationEvaluation | null | undefined = run ? invocation?.evaluation : detail.source === 'standalone' ? detail.standalone.evaluation : undefined;
  const headingId = `chapter-${chapter.invocation}${chapter.first ? '' : `-${chapter.entries[0]?.n ?? 0}`}`;
  const selected = anchor?.kind === 'chapter' && anchor.invocation === chapter.invocation && chapter.first;
  const awaited = run?.session.state === 'live' && run.session.awaiting === chapter.invocation;
  const outcome = invocation?.outcome ?? chapter.entries.find((entry): entry is TranscriptEntryOf<'ended'> => entry.type === 'ended')?.ended ?? null;
  return (
    <section className={`chapter${selected ? ' chapter-selected' : ''}`} aria-labelledby={headingId}>
      <header className="chapter-header">
        <h2 id={chapter.first ? `chapter-${chapter.invocation}` : headingId} tabIndex={-1}>
          Chapter {chapter.number}: {chapter.invocation}{chapter.first ? '' : ' (continued)'}
          {' '}<span className="badge">{outcome ?? (awaited ? 'awaited' : 'not ended')}</span>
        </h2>
        {chapter.first && (
          <>
            <StartRelation at={ref} invocation={invocation} started={started} session={run?.session} sessions={context.sessions} />
            {invocation && (
              <p className="muted chapter-moments">
                Started at {invocation.started.at} (event {invocation.started.sequence})
                {invocation.ended ? `; ended at ${invocation.ended.at} (event ${invocation.ended.sequence})` : ''}
                {invocation.kept === true ? '; it kept the session' : invocation.kept === false ? '; it finished the session' : ''}
                {invocation.point && <>; its end is <PointLink from={ref} point={invocation.point} /></>}
              </p>
            )}
            {evaluation !== undefined && <EvaluationFacts evaluation={evaluation} />}
          </>
        )}
      </header>
      {chapter.entries.length === 0
        ? <p className="muted">No entries of this invocation are in the transcript.</p>
        : <ol className="entries">{chapter.entries.map(entry => <TranscriptEntryView key={entry.n} entry={entry} context={context} />)}</ol>}
    </section>
  );
}

function stateSentence(state: ShownSessionState, detail: SessionDetail): string {
  const reason = detail.source === 'run' && detail.session.finished ? ` (${detail.session.finished})` : '';
  switch (state) {
    case 'live': return 'live: the harness awaits one of its invocations';
    case 'suspended': return 'suspended: the harness keeps it to continue or fork from it';
    case 'finished': return `finished${reason}: the harness will not use it again`;
    case 'interrupted': return 'interrupted: its log leaves it live, and its harness is gone';
  }
}

function isAtBottom(element: HTMLElement | null): boolean {
  if (element === null) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= stickMargin;
}

export function SessionPage({ client, session: ref, anchor, interval }: {
  readonly client: ProtocolClient;
  readonly session: SessionRef;
  readonly anchor: SessionAnchor | null;
  readonly interval?: number;
}) {
  const reading = useSessionTranscript(client, ref, interval);
  return <SessionReading client={client} session={ref} anchor={anchor} reading={reading} />;
}

/** The same chapters, bodies and evaluations used by full-page and workspace transcripts. */
export function SessionReading({ client, session: ref, anchor, anchorNonce = 0, reading, compact = false }: {
  readonly client: ProtocolClient;
  readonly session: SessionRef;
  readonly anchor: SessionAnchor | null;
  readonly anchorNonce?: number;
  readonly reading: SessionTranscript;
  readonly compact?: boolean;
}) {
  const { detail, entries, file, unreadable, following, error } = reading;
  const state = detail === undefined ? undefined : detail.source === 'run' ? detail.session.state : detail.standalone.session.state;
  const firstState = useRef<ShownSessionState | undefined>(undefined);
  if (firstState.current === undefined && state !== undefined) firstState.current = state;

  const sessions = useMemo(() => detail?.source === 'run' ? detail.sessions : new Map<string, RunSessionView>(), [detail]);
  const { calls, results } = useMemo(() => transcriptCalls(entries), [entries]);
  const context: TranscriptContext = useMemo(() => ({
    session: ref, live: state === 'live', calls, results, sessions,
  // The session's route names it; its object is new on every render.
  }), [JSON.stringify(ref), state, calls, results, sessions]);
  const invocations = useMemo(() => detail?.source === 'run' ? detail.session.invocations.map(invocation => invocation.invocation)
    : detail?.source === 'standalone' ? [detail.standalone.session.ref.session] : [], [detail]);
  const chapters = useMemo(() => chaptersOf(entries, invocations), [entries, invocations]);

  // Following: keep to the bottom while the reader is there, else count what arrived below.
  const scroller = useRef<HTMLDivElement | null>(null);
  const atBottom = useRef(true);
  const shown = useRef(0);
  const [unseen, setUnseen] = useState(0);
  const toBottom = useCallback(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
    atBottom.current = true;
    setUnseen(0);
  }, []);
  const onScroll = useCallback(() => {
    atBottom.current = isAtBottom(scroller.current);
    if (atBottom.current) setUnseen(0);
  }, []);
  const anchored = useRef(false);
  useLayoutEffect(() => {
    const added = entries.length - shown.current;
    const initial = shown.current === 0;
    shown.current = entries.length;
    if (added <= 0) return;
    if (initial) {
      // A live session opens at its latest entry, unless a link names a place in it.
      if (anchor === null && state === 'live') toBottom();
      else atBottom.current = false;
      return;
    }
    if (atBottom.current) toBottom();
    else setUnseen(count => count + added);
  }, [entries, anchor, state, toBottom]);

  // A link to a chapter or a point opens it once the transcript is read, and again when the link changes.
  const anchorKey = `${anchor === null ? '' : JSON.stringify(anchor)}:${anchorNonce}`;
  useEffect(() => { anchored.current = false; }, [anchorKey]);
  useEffect(() => {
    if (anchor === null || anchored.current || detail === undefined) return;
    const id = anchor.kind === 'chapter' ? `chapter-${anchor.invocation}` : pointElementId(anchor.kind === 'point'
      ? { session: ref.session, invocation: anchor.invocation }
      : { session: ref.session, append: anchor.append });
    const target = [...(scroller.current?.querySelectorAll<HTMLElement>('[id]') ?? [])].find(element => element.id === id) ?? null;
    if (target === null) return;
    anchored.current = true;
    atBottom.current = false;
    target.scrollIntoView?.({ block: 'start' });
    target.focus({ preventScroll: true });
  }, [anchor, anchorKey, detail, chapters, ref.session]);

  const back = ref.source === 'run'
    ? <a href={routeHref({ page: 'run', planId: ref.planId, runId: ref.runId })}>← The run</a>
    : <a href={routeHref({ page: 'sessions' })}>← Sessions</a>;
  const notFound = error instanceof ClientError && error.kind === 'protocol';
  const changed = state !== undefined && firstState.current !== undefined && firstState.current !== state;

  return (
    <section className={compact ? 'session-reading session-reading-compact' : 'page session-page'}>
      {!compact && <><p className="page-links">{back} · <a href={routeHref({ page: 'sessions' })}>All sessions</a></p>
        <header className="page-header"><h1>Session <code>{ref.session}</code></h1>{state && <SessionState state={state} />}</header>
        {ref.source === 'run' && <p className="muted">Of run <code>{ref.runId}</code> of plan <code>{ref.planId}</code>.</p>}</>}
      <p className={`connection-line${error ? ' connection-line-lost' : ''}`} role="status" aria-label="Following">
        {error
          ? detail
            ? `The harness is not answering (${error.message}). What is shown is the last read; the session does not depend on this page.`
            : `Could not read the session: ${error.message}`
          : detail === undefined || state === undefined ? 'Reading the session…'
            : `${changed ? `It became ${state} while this page was open. ` : ''}The session is ${stateSentence(state, detail)}. ${following ? 'Following its transcript as it grows.' : 'Its transcript is complete as read.'}`}
      </p>
      {notFound && !detail && <p className="failure" role="alert">{error.message}</p>}
      {detail?.source === 'run' && <DegradedStartsNotice at={ref} session={detail.session} />}
      {detail && <SessionFacts at={ref} detail={detail} />}
      {file === 'missing' && (
        <p className="warn transcript-missing" role="alert">
          The transcript file of this session is missing. Its invocations are shown with their evaluations, without entries.
        </p>
      )}
      {unreadable.length > 0 && <p className="warn">Lines {unreadable.join(', ')} of the transcript are not entries and were skipped.</p>}
      {detail && state !== undefined && !isFinal(state) && entries.length === 0 && file === 'present' && <p className="muted">No entries yet.</p>}
      {detail && (
        <TranscriptBodies client={client} session={ref}>
          <div className="transcript-frame">
            <div className="transcript" ref={scroller} onScroll={onScroll} tabIndex={0} role="region" aria-label={`Transcript of ${ref.session}`}>
              {chapters.map(chapter => chapter.kind === 'chapter'
                ? <ChapterView key={`${chapter.invocation}-${chapter.entries[0]?.n ?? 'empty'}`} chapter={chapter} context={context} detail={detail} anchor={anchor} />
                : (
                  <section key={`between-${chapter.entries[0]!.n}`} className="between" aria-label="Between invocations">
                    <p className="muted between-label">Between invocations</p>
                    <ol className="entries">{chapter.entries.map(entry => <TranscriptEntryView key={entry.n} entry={entry} context={context} />)}</ol>
                  </section>
                ))}
            </div>
            {unseen > 0 && (
              <button type="button" className="new-entries" onClick={toBottom}>
                {unseen === 1 ? '1 new entry' : `${unseen} new entries`} below{compact ? ' · Jump to live' : ''}
              </button>
            )}
          </div>
        </TranscriptBodies>
      )}
    </section>
  );
}
