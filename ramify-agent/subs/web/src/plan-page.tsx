import { useState } from 'react';
import type { RunListResponse } from '../../harness/src/interfaces/protocol/runs.js';
import { newCommandId, type ProtocolClient } from './client.js';
import { DecisionWaitBadge, workItemsText } from './decision-waits.js';
import { Markdown } from './markdown.js';
import { routeHref } from './routes.js';
import { RunState } from './run-labels.js';
import { useQuery } from './use-query.js';

/** One plan: its runs, the Start command, and its Markdown, read-only. */
export function PlanPage({ client, planId, navigate = hash => { window.location.hash = hash; } }: {
  readonly client: ProtocolClient;
  readonly planId: string;
  /** Opens a page by its fragment; the Run page of a started run. */
  readonly navigate?: (hash: string) => void;
}) {
  const { state } = useQuery(`plan:${planId}`, () => client.getPlan(planId));
  return (
    <section className="page">
      <p><a href={routeHref({ page: 'plans' })}>← All plans</a></p>
      {state.status === 'loading' && <p className="muted">Loading the plan…</p>}
      {state.status === 'failed' && <p className="failure" role="alert">Could not load the plan “{planId}”: {state.error.message}</p>}
      {state.status === 'ready' && (
        <>
          <header className="plan-header">
            <h1>{state.data.title}</h1>
            <p className="muted"><code>{state.data.path}</code></p>
          </header>
          <Runs client={client} planId={planId} navigate={navigate} />
          <article className="plan-body" aria-label="Plan text"><Markdown source={state.data.markdown} /></article>
        </>
      )}
    </section>
  );
}

/** The plan's implementation runs, newest first, and Start, with or without the review stop. */
function Runs({ client, planId, navigate }: { readonly client: ProtocolClient; readonly planId: string; readonly navigate: (hash: string) => void }) {
  const { state, reload } = useQuery(`runs:${planId}`, () => client.listRuns(planId));
  const [start, setStart] = useState<{ status: 'idle' | 'sending' } | { status: 'failed'; message: string }>({ status: 'idle' });
  const [reviewStop, setReviewStop] = useState(false);
  const list: RunListResponse | undefined = state.status === 'ready' ? state.data : undefined;
  const running = list?.runs.find(run => run.state === 'running');

  const startRun = async () => {
    if (!list?.agent) return;
    setStart({ status: 'sending' });
    try {
      const receipt = await client.sendCommand({
        commandId: newCommandId(), expectedVersion: 0, type: 'start-run', payload: { planId, agent: list.agent, reviewStop },
      });
      setStart({ status: 'idle' });
      navigate(routeHref({ page: 'run', planId, runId: receipt.jobId }));
    } catch (error) {
      setStart({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
      reload();
    }
  };

  return (
    <section className="runs" aria-labelledby="runs-heading">
      <header className="page-header">
        <h2 id="runs-heading">Implementation runs</h2>
        <button type="button" onClick={() => void startRun()} disabled={!list?.agent || running !== undefined || start.status === 'sending'}>
          {start.status === 'sending' ? 'Starting…' : 'Start a run'}
        </button>
      </header>
      <label className="review-stop">
        <input type="checkbox" checked={reviewStop} onChange={event => setReviewStop(event.target.checked)} />
        {' '}Stop for review after the analysis: the run waits, holding the project and writing nothing, until its analysis is approved.
      </label>
      {list && list.agent === null && <p className="muted">No agent is configured, so no run can start. The harness starts runs with <code>--agent pi</code> or <code>--agent fake</code>.</p>}
      {list?.agent && <p className="muted">Runs start on the <strong>{list.agent}</strong> agent.{running ? ` Run ${running.jobId} is running; one run runs at a time.` : ''}</p>}
      {start.status === 'failed' && <p className="failure" role="alert">The start was refused: {start.message}</p>}
      {state.status === 'failed' && <p className="failure" role="alert">Could not load the runs: {state.error.message}</p>}
      {list && list.runs.length === 0 && list.unserved.length === 0 && <p className="muted">This plan has no run yet.</p>}
      {list && (list.runs.length > 0 || list.unserved.length > 0) && (
        <ul className="run-list">
          {list.runs.map(run => (
            <li key={run.jobId}>
              <a href={routeHref({ page: 'run', planId, runId: run.jobId })}><code>{run.jobId}</code></a>
              <RunState state={run.state} />
              {run.decisionRequests.waiting && (
                <DecisionWaitBadge title={`Held until you answer: ${workItemsText(run.decisionRequests.workItems.map(item => item.workItem))}`} />
              )}
              <span className="muted">{run.phase} · {run.counts.completedWorkItems}/{run.counts.workItems} work items · started {run.startedAt}</span>
              {run.notices.length > 0 && <span className="notice-count">{run.notices.length} notice{run.notices.length === 1 ? '' : 's'}</span>}
            </li>
          ))}
          {list.unserved.map(run => (
            <li key={run.jobId} className="failure">
              <code>{run.jobId}</code> {run.code}: {run.message}
            </li>
          ))}
        </ul>
      )}
      {list && list.total > list.runs.length && <p className="muted">Showing the newest {list.runs.length} of {list.total} runs.</p>}
    </section>
  );
}
