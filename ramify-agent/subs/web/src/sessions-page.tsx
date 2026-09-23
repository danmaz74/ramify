import { useEffect, useState } from 'react';
import { sessionQueryLimits, type SessionListEntry, type SessionListResponse } from '../../harness/src/interfaces/protocol/sessions.js';
import type { ProtocolClient } from './client.js';
import { routeHref, sessionHref, sessionKey } from './routes.js';
import { DegradedStarts, reachText, SessionState } from './run-labels.js';
import { isFinal } from './session-progress.js';
import { useQuery } from './use-query.js';

/*
 * Every session of the project: those of every plan's runs and the
 * standalone sessions, live and suspended first, as the harness orders them.
 * The list is read again every `interval` milliseconds while one of them is
 * live or suspended, and on Refresh.
 */

function workText(entry: SessionListEntry): string {
  const { workItem, iteration, request } = entry.work;
  return [workItem, iteration, request && `request ${request}`].filter(Boolean).join(', ');
}

function SessionItem({ entry }: { readonly entry: SessionListEntry }) {
  const { ref } = entry;
  const work = workText(entry);
  return (
    <li className={`session-entry session-entry-${entry.state}`}>
      <p className="session-entry-title">
        <a href={sessionHref(ref)}><code>{ref.session}</code> {entry.role}</a>
        <SessionState state={entry.state} />
        {entry.degradedStarts > 0 && <DegradedStarts count={entry.degradedStarts} />}
        {entry.finished && <span className="muted"> {entry.finished}</span>}
      </p>
      <p className="muted session-entry-where">
        {ref.source === 'run'
          ? <>Run <a href={routeHref({ page: 'run', planId: ref.planId, runId: ref.runId })}><code>{ref.runId}</code></a> of <code>{ref.planId}</code></>
          : 'Standalone session'}
        {work && <> · {work}</>} · {reachText(entry.reaches)}
      </p>
      <p className="muted session-entry-facts">
        {entry.executor}{entry.model ? `, ${entry.model}` : ''} · {entry.invocations === 1 ? '1 invocation' : `${entry.invocations} invocations`}
        {' '}· started <time dateTime={entry.startedAt}>{entry.startedAt.replace('T', ' ').slice(0, 19)}</time>
        {' '}· changed <time dateTime={entry.changedAt}>{entry.changedAt.replace('T', ' ').slice(0, 19)}</time>
      </p>
    </li>
  );
}

function SessionGroup({ title, entries }: { readonly title: string; readonly entries: readonly SessionListEntry[] }) {
  if (entries.length === 0) return null;
  const id = `sessions-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <ul className="session-list">{entries.map(entry => <SessionItem key={sessionKey(entry.ref)} entry={entry} />)}</ul>
    </section>
  );
}

function SessionList({ list }: { readonly list: SessionListResponse }) {
  const open = list.sessions.filter(entry => !isFinal(entry.state));
  const closed = list.sessions.filter(entry => isFinal(entry.state));
  return (
    <>
      {list.unserved.length > 0 && (
        <div className="warn" role="alert">
          <p>Some sessions cannot be listed:</p>
          <ul>{list.unserved.map(source => <li key={source.path}><code>{source.path}</code> ({source.source}): {source.message}</li>)}</ul>
        </div>
      )}
      {list.total === 0
        ? <p className="empty">No session has been recorded in this project yet. A run's agents and <code>ramify-agent session</code> each record theirs.</p>
        : (
          <>
            <p className="muted">
              {list.total} sessions{list.sessions.length < list.total ? `; ${list.offset + 1}–${list.offset + list.sessions.length} shown` : ''}.
            </p>
            <SessionGroup title="Live and suspended" entries={open} />
            <SessionGroup title="Finished and interrupted" entries={closed} />
          </>
        )}
    </>
  );
}

export function SessionsPage({ client, interval = 5000 }: { readonly client: ProtocolClient; readonly interval?: number }) {
  const [offset, setOffset] = useState(0);
  const { state, reload, reloading } = useQuery(`sessions:${offset}`, () => client.listSessions(offset));
  const active = state.status === 'ready' && state.data.sessions.some(entry => !isFinal(entry.state));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(reload, interval);
    return () => clearInterval(timer);
  }, [active, reload, interval]);
  return (
    <section className="page sessions-page" aria-labelledby="sessions-heading">
      <header className="page-header">
        <h1 id="sessions-heading">Sessions</h1>
        <button type="button" onClick={reload} disabled={reloading || state.status === 'loading'}>
          {reloading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>
      <p className="muted">Every session of the project's runs and every standalone session, live and suspended first.</p>
      {state.status === 'loading' && <p className="muted">Loading the sessions…</p>}
      {state.status === 'failed' && <p className="failure" role="alert">Could not load the sessions: {state.error.message}</p>}
      {state.status === 'ready' && (
        <>
          <SessionList list={state.data} />
          {(offset > 0 || state.data.next !== null) && (
            <nav className="pager" aria-label="Pages of sessions">
              <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - sessionQueryLimits.sessions))}>Previous</button>
              <button type="button" disabled={state.data.next === null} onClick={() => state.data.next !== null && setOffset(state.data.next)}>Next</button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
