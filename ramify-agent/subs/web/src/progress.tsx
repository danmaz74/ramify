import { useEffect, useRef, useState } from 'react';
import type { JobEvent, JobSnapshot } from '../../harness/src/interfaces/protocol/jobs.js';
import { ClientError, newCommandId, type ConnectionState, type ProtocolClient } from './client.js';
import { jobStateLabel, revisionLabel } from './mapping.js';

export interface JobProgress {
  readonly job: JobSnapshot | undefined;
  readonly events: readonly JobEvent[];
  /** The last failure to fetch progress; the last known state stays shown. */
  readonly error: Error | undefined;
}

/**
 * A job's snapshot and every event so far, fetched after a cursor: all pages
 * at once, then again every `interval` milliseconds while the job runs.
 */
export function useJobProgress(client: ProtocolClient, planId: string, jobId: string, interval = 1000): JobProgress {
  const [progress, setProgress] = useState<JobProgress & { key: string }>({ key: '', job: undefined, events: [], error: undefined });
  const key = `${planId}/${jobId}`;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor = 0;
    let events: JobEvent[] = [];
    let job: JobSnapshot | undefined;
    const poll = async () => {
      try {
        for (;;) {
          const page = await client.getEvents(planId, jobId, cursor);
          if (cancelled) return;
          events = events.concat(page.events.filter(event => event.sequence > cursor));
          cursor = page.cursor;
          job = page.job;
          if (!page.more) break;
        }
        setProgress({ key, job, events, error: undefined });
        if (job?.state !== 'running') return;
      } catch (error) {
        if (cancelled) return;
        setProgress({ key, job, events, error: error instanceof Error ? error : new Error(String(error)) });
      }
      timer = setTimeout(() => void poll(), interval);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, planId, jobId, interval, key]);
  return progress.key === key ? progress : { job: undefined, events: [], error: undefined };
}

function useConnection(client: ProtocolClient): ConnectionState {
  const [state, setState] = useState(client.connection());
  useEffect(() => {
    setState(client.connection());
    return client.onConnectionChange(setState);
  }, [client]);
  return state;
}

/** Re-renders every second while `active`, returning the current time. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** A duration as `m:ss` or `h:mm:ss`. */
export function formatElapsed(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** One line of the activity feed for an event. */
export function describeEvent(event: JobEvent): string {
  switch (event.type) {
    case 'job-started': return 'Job started';
    case 'activity': {
      const { activity } = event.data;
      switch (activity.kind) {
        case 'read': return `Read ${activity.path}`;
        case 'search': return activity.tool === 'ls' ? `Listed ${activity.query}` : `Searched ${activity.query} (${activity.tool})`;
        case 'tool': return `Called ${activity.tool}`;
        case 'tool-error': return `${activity.tool} returned an error: ${activity.error}`;
        case 'message': return `Agent: ${activity.text}${activity.usage ? ` (${activity.usage.total} tokens)` : ''}`;
      }
      break;
    }
    case 'api-view-materialized': return `API views of ${event.data.module} materialized: ${event.data.views.length
      ? event.data.views.map(view => `${view.area} ${view.coverage === null ? 'complete' : `with coverage limits (${view.coverage})`}`).join(', ')
      : 'it has no source area'}`;
    case 'submission-rejected': return `Submission ${event.data.attempt} rejected: ${event.data.errors.join('; ')}`;
    case 'submission-accepted': return `Submission ${event.data.attempt} accepted`;
    case 'stop-requested': return 'Stop requested';
    case 'map-validated': return `Map validated; revision ${revisionLabel(event.data.revision)} reserved`;
    case 'job-completed': return `Map revision ${revisionLabel(event.data.revision)} saved`;
    case 'job-failed': return `Failed: ${event.data.message}`;
    case 'job-stopped': return event.data.settled
      ? 'Stopped'
      : 'Stopped; the agent did not become idle in time, and anything it produces is discarded';
    case 'job-interrupted': return `Interrupted: ${event.data.message}`;
    case 'map-approved': return `Map revision ${revisionLabel(event.data.approval.revision)} approved`;
  }
}

function currentActivity(job: JobSnapshot, events: readonly JobEvent[]): string {
  if (job.state !== 'running') {
    const last = events.at(-1);
    return last ? describeEvent(last) : jobStateLabel(job.state);
  }
  if (job.stopRequested) return 'Stopping…';
  const last = [...events].reverse().find(event => event.type === 'activity' || event.type.startsWith('submission-') || event.type === 'map-validated');
  if (!last) return 'Starting the agent…';
  if (last.type === 'activity') {
    const { activity } = last.data;
    if (activity.kind === 'read') return `Reading ${activity.path}`;
    if (activity.kind === 'search') return activity.tool === 'ls' ? `Listing ${activity.query}` : `Searching ${activity.query}`;
    if (activity.kind === 'message') return 'Thinking';
  }
  if (last.type === 'submission-accepted' || last.type === 'map-validated') return 'Saving the map';
  return describeEvent(last);
}

/**
 * The progress of one mapping job: its state, current activity, elapsed
 * time, totals and activity feed, and Stop. The connection to the harness
 * is shown apart from the job's state; losing it changes nothing in the job.
 */
export function Progress({ client, planId, jobId, interval, onEnded }: {
  readonly client: ProtocolClient;
  readonly planId: string;
  readonly jobId: string;
  readonly interval?: number;
  /** Called once when the job is seen to have ended. */
  readonly onEnded?: (job: JobSnapshot) => void;
}) {
  const { job, events, error } = useJobProgress(client, planId, jobId, interval);
  const connection = useConnection(client);
  const now = useNow(job?.state === 'running');
  const [stop, setStop] = useState<{ status: 'idle' | 'sending' | 'sent' } | { status: 'failed'; message: string }>({ status: 'idle' });
  const endedFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (job && job.state !== 'running' && endedFor.current !== job.jobId) {
      endedFor.current = job.jobId;
      onEnded?.(job);
    }
  }, [job, onEnded]);

  if (!job) {
    return error
      ? <p className="failure" role="alert">Could not load the job: {error.message}</p>
      : <p className="muted">Loading the job…</p>;
  }

  const requestStop = async () => {
    setStop({ status: 'sending' });
    // Activity advances the job's version constantly. Stop's intent does not
    // depend on it, so a stale rejection is sent again, as a new command, at
    // the version the harness reports.
    let expectedVersion = job.version;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await client.sendCommand({ commandId: newCommandId(), expectedVersion, type: 'stop-job', payload: { planId, jobId } });
        setStop({ status: 'sent' });
        return;
      } catch (failure) {
        if (failure instanceof ClientError && failure.code === 'stale-version' && failure.currentVersion !== undefined) {
          expectedVersion = failure.currentVersion;
          continue;
        }
        setStop({ status: 'failed', message: failure instanceof Error ? failure.message : String(failure) });
        return;
      }
    }
    setStop({ status: 'failed', message: 'The job kept changing; try again.' });
  };

  const running = job.state === 'running';
  const ended = job.endedAt ? Date.parse(job.endedAt) : now;
  const { totals } = job;
  return (
    <section className={`progress progress-${job.state}`} aria-label="Mapping progress">
      <header className="progress-header">
        <p className={`job-state job-state-${job.state}`} role="status" aria-label="Job state">
          {jobStateLabel(job.state)}{running && job.stopRequested ? ' · stopping' : ''}
        </p>
        <p className="elapsed" aria-label="Elapsed time">{formatElapsed(ended - Date.parse(job.startedAt))}</p>
        {running && (
          <button type="button" onClick={() => void requestStop()} disabled={job.stopRequested || stop.status === 'sending' || stop.status === 'sent'}>
            {job.stopRequested || stop.status === 'sent' ? 'Stopping…' : 'Stop'}
          </button>
        )}
      </header>
      <p className="current-activity" aria-label="Current activity">{currentActivity(job, events)}</p>
      {job.failure && <p className="failure" role="alert">{job.failure.message}</p>}
      {stop.status === 'failed' && <p className="failure" role="alert">Stop was not accepted: {stop.message}</p>}
      {connection === 'disconnected' && (
        <p className="connection-note" role="note">
          Not connected to the harness. This is the last known state{running ? '; the job continues without this page' : ''}.
        </p>
      )}
      <dl className="totals">
        <div><dt>Files read</dt><dd>{totals.filesRead}</dd></div>
        <div><dt>Searches</dt><dd>{totals.searches}</dd></div>
        <div><dt>Tokens</dt><dd>{totals.usage.total > 0 ? `${totals.usage.input} in · ${totals.usage.output} out` : 'not reported'}</dd></div>
        <div><dt>Agent</dt><dd>{job.agent}</dd></div>
      </dl>
      <ul className="inputs">
        {job.inputs.source === null
          ? <li>The project is not a git checkout; its source state is identified only by the architect view.</li>
          : job.inputs.source.dirty
            ? <li>The checkout has uncommitted changes at <code>{job.inputs.source.commit.slice(0, 12)}</code>; the agent sees them.</li>
            : <li>Source at commit <code>{job.inputs.source.commit.slice(0, 12)}</code>, with no uncommitted changes.</li>}
        {job.inputs.architectView === 'placeholder' && <li>The architect view was not materialized for this job.</li>}
      </ul>
      <h2 className="feed-heading">Activity</h2>
      <ol className="feed" aria-label="Activity feed" reversed>
        {[...events].reverse().slice(0, 200).map(event => (
          <li key={event.sequence} className={`feed-${event.type}`}>
            <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time> {describeEvent(event)}
          </li>
        ))}
      </ol>
    </section>
  );
}
