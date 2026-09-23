import { useEffect, useState, type ReactNode } from 'react';
import type {
  DecisionView, GateView, HypothesisView, LineageMetric, Metric, MetricsResponse,
  ProjectedRunEvent, RunNotice, RunSnapshot, WorkItemResponse,
} from '../../harness/src/interfaces/protocol/runs.js';
import { CapabilityDependencyGraph } from './capability-graph.js';
import { CapabilityModuleTree, type ModuleCapabilitySelection } from './capability-module-tree.js';
import { newCommandId, type ConnectionState, type ProtocolClient } from './client.js';
import { Markdown } from './markdown.js';
import { chapterHref, routeHref } from './routes.js';
import { figure, metricValue, RunState, StateBadge } from './run-labels.js';
import { useRunProgress, useRunQuery } from './run-progress.js';
import { ApproveForm, canApprove, reviewText, ReviewPanel, ScenarioCheckSummaryView, ScenarioReview, ScenarioTable } from './run-scenarios.js';
import type { DiagramSessions } from './session-marks.js';
import { SessionTimeline } from './session-timeline.js';

/*
 * The Run page: one run, as the harness projects it. Its overview shows
 * notices first: every module created or removed, every detected dependency
 * cycle, resolved or not, during the run and after it, and every degraded
 * start. Stop and Approve are its commands; Start is on the Plan page. The
 * connection to the harness is shown apart from the run's state: losing it
 * changes nothing in the run.
 */

const areas = [
  ['overview', 'Overview'],
  ['plan', 'Plan and entries'],
  ['decisions', 'Hypotheses and decisions'],
  ['work', 'Work items'],
  ['scenarios', 'Scenarios'],
  ['checks', 'Checks'],
  ['progress', 'Progress'],
  ['sessions', 'Sessions'],
  ['measurements', 'Measurements'],
] as const;
type Area = typeof areas[number][0];

interface AreaProps {
  readonly client: ProtocolClient;
  readonly planId: string;
  readonly runId: string;
  readonly version: number | undefined;
}

function useConnection(client: ProtocolClient): ConnectionState {
  const [state, setState] = useState(client.connection());
  useEffect(() => {
    setState(client.connection());
    return client.onConnectionChange(setState);
  }, [client]);
  return state;
}

export function RunPage({ client, planId, runId, interval }: {
  readonly client: ProtocolClient;
  readonly planId: string;
  readonly runId: string;
  readonly interval?: number;
}) {
  const { run, events, error, refresh } = useRunProgress(client, planId, runId, interval);
  const connection = useConnection(client);
  const [area, setArea] = useState<Area>('overview');
  const [workItem, setWorkItem] = useState<string | undefined>(undefined);
  const [moduleSelection, setModuleSelection] = useState<ModuleCapabilitySelection | null>(null);
  const version = run?.version;
  const props: AreaProps = { client, planId, runId, version };

  return (
    <section className="page run-page">
      <p><a href={routeHref({ page: 'plan', planId })}>← The plan</a></p>
      <header className="page-header">
        <h1>Run <code>{runId}</code></h1>
        {run && <RunState state={run.state} />}
      </header>
      <p className={`connection-line connection-line-${error ? 'lost' : connection}`} aria-label="Connection to the harness">
        {error
          ? `The harness is not answering (${error.message}). What is shown is the last state read${run ? `, at version ${run.version}` : ''}; the run does not depend on this page.`
          : run ? `Read at version ${run.version}. Closing or reloading this page does not affect the run.` : 'Reading the run…'}
      </p>
      {!run && error && <p className="failure" role="alert">Could not read the run: {error.message}</p>}
      <nav className="tabs" aria-label="Areas of the run">
        {areas.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={area === id} className={area === id ? 'tab tab-selected' : 'tab'} onClick={() => setArea(id)}>{label}</button>
        ))}
      </nav>
      {run && area === 'overview' && <Overview client={client} run={run} events={events} onApproved={refresh} />}
      {area === 'plan' && <PlanAndEntries {...props} run={run} onApproved={refresh} />}
      {area === 'decisions' && <HypothesesAndDecisions {...props} />}
      {area === 'work' && <WorkItems {...props} selected={workItem} onSelect={setWorkItem} />}
      {area === 'scenarios' && <Scenarios {...props} />}
      {area === 'checks' && <Checks {...props} events={events} />}
      {area === 'progress' && (
        <Progress {...props} moduleSelection={moduleSelection} onSelectModule={setModuleSelection}
          onOpenWorkItem={id => { setWorkItem(id); setArea('work'); }} />
      )}
      {area === 'sessions' && <RunSessions {...props} />}
      {area === 'measurements' && <Measurements {...props} />}
    </section>
  );
}

// Overview

function Overview({ client, run, events, onApproved }: {
  readonly client: ProtocolClient;
  readonly run: RunSnapshot;
  readonly events: readonly ProjectedRunEvent[];
  readonly onApproved: () => void;
}) {
  const [stop, setStop] = useState<{ status: 'idle' | 'sending' | 'sent' } | { status: 'failed'; message: string }>({ status: 'idle' });
  const stopRun = async () => {
    setStop({ status: 'sending' });
    try {
      await client.sendCommand({ commandId: newCommandId(), expectedVersion: run.version, type: 'stop-job', payload: { planId: run.planId, jobId: run.jobId } });
      setStop({ status: 'sent' });
    } catch (error) {
      setStop({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };
  const running = run.state === 'running';
  return (
    <div className="area" aria-label="Overview">
      <Notices client={client} run={run} />
      <section className="panel" aria-labelledby="state-heading">
        <header className="page-header">
          <h2 id="state-heading">State</h2>
          {running && (
            <button type="button" onClick={() => void stopRun()} disabled={run.stopRequested || stop.status === 'sending' || stop.status === 'sent'}>
              {run.stopRequested || stop.status === 'sent' ? 'Stopping…' : 'Stop'}
            </button>
          )}
        </header>
        {stop.status === 'failed' && <p className="failure" role="alert">The stop was refused: {stop.message}</p>}
        <dl className="facts">
          <div><dt>Run state</dt><dd><RunState state={run.state} />{run.stopRequested ? ' (a stop was requested)' : ''}</dd></div>
          <div><dt>Phase</dt><dd>{run.phase}</dd></div>
          <div><dt>Agent</dt><dd>{run.agent}</dd></div>
          <div><dt>Current</dt><dd>{run.current === null ? 'nothing open' : currentText(run.current)}</dd></div>
          <div><dt>Work items</dt><dd>{run.counts.completedWorkItems} of {run.counts.workItems} completed</dd></div>
          <div><dt>Open requirements</dt><dd>{run.counts.openRequirements}</dd></div>
          <div><dt>Invocations</dt><dd>{run.counts.invocations}</dd></div>
          <div><dt>Gate attempts</dt><dd>{run.counts.gateAttempts} (readiness attempts {run.counts.readinessAttempts})</dd></div>
          <div><dt>Scenarios</dt><dd>{run.counts.scenarios.implemented} implemented, {run.counts.scenarios.declared} declared, {run.counts.scenarios.bound} bound, {run.counts.scenarios.pending} pending</dd></div>
          <div><dt>Review</dt><dd>{reviewText(run.review)}</dd></div>
          <div><dt>Writer</dt><dd>{run.writer.held === null ? 'none held' : `held by ${run.writer.held}`}{run.writer.unsettled === null ? '' : `; ${run.writer.unsettled} was not confirmed settled`}</dd></div>
          <div><dt>Started</dt><dd>{run.startedAt}</dd></div>
          <div><dt>Ended</dt><dd>{run.endedAt ?? 'not ended'}</dd></div>
        </dl>
        {run.waits.length > 0 && (
          <>
            <h3>Waits</h3>
            <ul>{run.waits.map(wait => <li key={wait.workItem}>{wait.reason}</li>)}</ul>
          </>
        )}
        {run.failure && (
          <div className="run-failure" role="alert">
            <p><strong>Failed: {run.failure.reason}.</strong> {run.failure.message}</p>
            {run.failure.evidence.length > 0 && <ul>{run.failure.evidence.map(item => <li key={item}><code>{item}</code></li>)}</ul>}
          </div>
        )}
      </section>
      <ReviewPanel client={client} run={run} onApproved={onApproved} />
      <section className="panel" aria-labelledby="events-heading">
        <h2 id="events-heading">Events</h2>
        <ol className="feed" aria-label="Run events">
          {events.map(event => (
            <li key={event.sequence} className={`feed-${event.transition}`}>
              <span className="muted">{event.sequence}</span> <time dateTime={event.at}>{event.at.slice(11, 19)}</time> {event.summary}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function currentText(current: NonNullable<RunSnapshot['current']>): string {
  const parts = [
    current.role && `${current.role}`,
    current.invocation && `session ${current.invocation}`,
    current.workItem && `work item ${current.workItem}`,
    current.iteration && `iteration ${current.iteration}`,
    current.request && `request ${current.request}`,
    current.waitingFor && `waiting: ${current.waitingFor}`,
  ].filter(Boolean);
  return parts.join(', ');
}

/**
 * What the person must be told, first: modules created or removed, then
 * every dependency cycle, then the run's degraded starts, where it has any.
 */
function Notices({ client, run }: { readonly client: ProtocolClient; readonly run: RunSnapshot }) {
  const ended = run.state !== 'running';
  const degraded = run.counts.degradedStarts;
  return (
    <section className="panel notices" aria-labelledby="notices-heading">
      <h2 id="notices-heading">Notices</h2>
      {run.notices.length === 0 && degraded === 0
        ? <p className="muted">{ended ? 'No module was created or removed, and no dependency cycle was detected.' : 'None so far: no module created or removed, and no dependency cycle detected.'}</p>
        : (
          <ul className="notice-list">
            {run.notices.map(notice => <Notice key={`${notice.kind}-${notice.sequence}-${'module' in notice ? notice.module : notice.cycle.join()}`} notice={notice} />)}
            {degraded > 0 && <DegradedStartsNotice client={client} run={run} />}
          </ul>
        )}
    </section>
  );
}

/**
 * The run's degraded starts: counted by its snapshot, and read from its
 * sessions, which are asked for only when there is one, to link each to
 * its chapter.
 */
function DegradedStartsNotice({ client, run }: { readonly client: ProtocolClient; readonly run: RunSnapshot }) {
  const { planId, jobId: runId, version } = run;
  const state = useRunQuery(`degraded-starts:${runId}`, version, () => client.getRunSessions(planId, runId));
  const count = run.counts.degradedStarts;
  const starts = state.status === 'ready'
    ? state.data.sessions.flatMap(session => session.invocations.flatMap(invocation => invocation.degraded === null ? [] : [{ session, invocation: invocation.invocation, ...invocation.degraded }]))
    : [];
  return (
    <li className="notice notice-degraded-start">
      <strong>{count === 1 ? 'A degraded start' : `${count} degraded starts`}</strong>
      <p>The executor was asked to continue or fork a session's conversation and started a fresh one instead, without its history.</p>
      {state.status === 'failed' && <p className="muted">The sessions could not be read to name them: {state.error.message}</p>}
      {starts.length > 0 && (
        <ul>
          {starts.map(({ session, invocation, requested, actual, reason }) => (
            <li key={invocation}>
              <a href={chapterHref({ source: 'run', planId, runId, session: session.session }, invocation)}>{session.session} {session.role}, {invocation}</a>
              : {requested} was requested and {actual} was made{reason ? ` (${reason})` : ''}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Notice({ notice }: { readonly notice: RunNotice }) {
  if (notice.kind === 'dependency-cycle') {
    return (
      <li className="notice notice-cycle">
        <strong>Dependency cycle</strong> <span className={`badge ${notice.resolved ? 'state-completed' : 'state-failed'}`}>{notice.resolved ? 'resolved' : 'not resolved'}</span>
        <p>{notice.summary}</p>
        <p className="muted">Members: {notice.cycle.join(' → ')}. Closed by {notice.closedBy}. Event {notice.sequence}.</p>
      </li>
    );
  }
  return (
    <li className={`notice notice-${notice.kind}`}>
      <strong>{notice.kind === 'module-created' ? 'Module created' : 'Module removed'}: <code>{notice.module}</code></strong>
      <p>{notice.summary}</p>
      <p className="muted">
        Declaration <code>{notice.declaration}</code>, iteration {notice.iteration}, commit <code>{notice.commit.slice(0, 12)}</code>, event {notice.sequence}.
      </p>
    </li>
  );
}

// Plan and entries

function Loading<T>({ state, what, children }: {
  readonly state: { status: 'loading' } | { status: 'ready'; data: T } | { status: 'failed'; error: Error };
  readonly what: string;
  readonly children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') return <p className="muted">Loading {what}…</p>;
  if (state.status === 'failed') return <p className="failure" role="alert">Could not load {what}: {state.error.message}</p>;
  return <>{children(state.data)}</>;
}

function PlanAndEntries({ client, planId, runId, version, run, onApproved }: AreaProps & { readonly run: RunSnapshot | undefined; readonly onApproved: () => void }) {
  const state = useRunQuery(`analysis:${runId}`, version, () => client.getAnalysis(planId, runId));
  return (
    <div className="area" aria-label="Plan and entries">
      <Loading state={state} what="the analysis">
        {data => (
          <>
            <section className="panel">
              <h2>Entry assignments</h2>
              {data.analysis.status === 'pending'
                ? <p className="muted">The initial analysis has not been accepted yet.</p>
                : (
                  <table className="table">
                    <thead><tr><th>Capability</th><th>Owner</th><th>Work item</th><th>Description</th></tr></thead>
                    <tbody>
                      {data.analysis.entries.map(entry => (
                        <tr key={entry.capability}>
                          <td><code>{entry.capability}</code></td>
                          <td><code>{entry.owner}</code>{entry.proposed && <span className="proposed">proposed under {entry.proposed.parent}</span>}</td>
                          <td>{entry.workItem ?? '—'}</td>
                          <td>{entry.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </section>
            {data.analysis.status === 'accepted' && (
              <section className="panel" aria-labelledby="scenario-review-heading">
                <h2 id="scenario-review-heading">Review of the scenarios</h2>
                <p className="muted">
                  The acceptance scenarios the analysis froze, per entry, with where each comes from.
                  {run ? ` ${reviewText(run.review)}.` : ''}
                </p>
                <ScenarioReview entries={data.analysis.entries} scenarios={data.analysis.scenarios} warnings={data.analysis.warnings} total={data.analysis.total.scenarios} />
                {run && canApprove(run) && <ApproveForm client={client} run={run} onApproved={onApproved} label="Approve the reviewed analysis" />}
              </section>
            )}
            <section className="panel">
              <h2>The captured plan</h2>
              <p className="muted">As the run captured it, with SHA-256 <code>{data.plan.hash.slice(0, 16)}…</code></p>
              <details><summary>Show the plan</summary><Markdown source={data.plan.markdown} /></details>
            </section>
          </>
        )}
      </Loading>
    </div>
  );
}

// Hypotheses and decisions

function HypothesesAndDecisions({ client, planId, runId, version }: AreaProps) {
  const analysis = useRunQuery(`analysis:${runId}`, version, () => client.getAnalysis(planId, runId));
  const decisions = useRunQuery(`decisions:${runId}`, version, () => client.getDecisions(planId, runId));
  return (
    <div className="area columns" aria-label="Hypotheses and decisions">
      <section className="panel" aria-labelledby="hypotheses-heading">
        <h2 id="hypotheses-heading">Hypotheses</h2>
        <p className="muted">Forecasts, never commitments: no work derives from a hypothesis. Revision 1 is never rewritten.</p>
        <Loading state={analysis} what="the hypotheses">
          {data => data.analysis.status === 'pending'
            ? <p className="muted">The initial analysis has not been accepted yet.</p>
            : data.analysis.hypotheses.length === 0 ? <p className="muted">The analysis recorded no hypothesis.</p>
              : <ul className="cards">{data.analysis.hypotheses.map(hypothesis => <Hypothesis key={hypothesis.id} hypothesis={hypothesis} />)}</ul>}
        </Loading>
      </section>
      <section className="panel" aria-labelledby="decisions-heading">
        <h2 id="decisions-heading">Decisions</h2>
        <p className="muted">Accepted choices, each read from the record that holds it.</p>
        <Loading state={decisions} what="the decisions">
          {data => data.decisions.length === 0 ? <p className="muted">No decision has been recorded yet.</p>
            : <ul className="cards">{data.decisions.map(decision => <Decision key={`${decision.kind}-${decision.sequence}-${decisionKey(decision)}`} decision={decision} />)}</ul>}
        </Loading>
      </section>
    </div>
  );
}

function Hypothesis({ hypothesis }: { readonly hypothesis: HypothesisView }) {
  const changed = hypothesis.revision > 1;
  return (
    <li className={`card hypothesis hypothesis-${hypothesis.standing}`}>
      <p><span className="badge tentative">hypothesis</span> <code>{hypothesis.id}</code>: {hypothesis.change} <code>{hypothesis.capability}</code> in <code>{hypothesis.suggestedOwner}</code></p>
      <p className="muted">Standing: <strong>{hypothesis.standing}</strong>, revision {hypothesis.revision}, confidence {hypothesis.confidence}.</p>
      <p>{hypothesis.rationale}</p>
      {changed && <p className="muted">Initially forecast: {hypothesis.initial.change} in <code>{hypothesis.initial.suggestedOwner}</code>. {hypothesis.initial.rationale}</p>}
      {hypothesis.decisions.length > 0 && <p className="muted">Revised by {hypothesis.decisions.join(', ')}.</p>}
      {hypothesis.supersededBy && <p className="muted">Superseded by {hypothesis.supersededBy}.</p>}
    </li>
  );
}

function decisionKey(decision: DecisionView): string {
  switch (decision.kind) {
    case 'placement': return decision.id;
    case 'scope': return decision.iteration;
    case 'breaking': return `${decision.workItem}-${decision.outlineRevision}-${decision.guarantee}`;
    case 'plan-revision': return `${decision.workItem}-${decision.outlineRevision}`;
    case 'contract': return `${decision.contract}-${decision.revision}`;
  }
}

function Decision({ decision }: { readonly decision: DecisionView }) {
  switch (decision.kind) {
    case 'placement':
      return (
        <li className="card decision">
          <p><span className="badge decided">placement</span> <code>{decision.id}</code> ({decision.authority}) for {decision.workItem}: {decision.outcome} <code>{decision.capability}</code>{decision.owner && <> in <code>{decision.owner}</code></>}{decision.changesExistingSymbols && <> — changes symbols that already have consumers</>}</p>
          <p className="muted">{decision.question}</p>
          <p>{decision.rationale}</p>
          {decision.proposed && <p className="muted">Proposes a module under {decision.proposed.parent}: {decision.proposed.purpose}</p>}
          {decision.revises && <p className="muted">Revises {decision.revises}.</p>}
          {decision.hypotheses.length > 0 && <p className="muted">Hypothesis revisions: {decision.hypotheses.map(h => `${h.id}@${h.revision}`).join(', ')}.</p>}
        </li>
      );
    case 'scope':
      return (
        <li className="card decision">
          <p><span className="badge decided">scope</span> {decision.iteration} ({decision.iterationKind}): {decision.modules.map(module => <code key={module}>{module} </code>)}{decision.broad ? '(explicitly broad)' : ''}</p>
          {decision.includedChildren.length > 0 && <p className="muted">Included children: {decision.includedChildren.join(', ')}</p>}
          <p>{decision.rationale}</p>
          {decision.authorizations.length > 0 && <p className="muted">Authorized guarded changes: {decision.authorizations.map(a => `${a.path} (by ${a.by}: ${a.rationale})`).join('; ')}</p>}
        </li>
      );
    case 'breaking':
      return (
        <li className="card decision">
          <p><span className="badge decided">breaking change</span> {decision.workItem}, outline revision {decision.outlineRevision}</p>
          <p>{decision.guarantee}: {decision.reason}</p>
          <p className="muted">Affected consumers: {decision.affectedConsumers.join(', ') || 'none named'}</p>
        </li>
      );
    case 'plan-revision':
      return (
        <li className="card decision">
          <p><span className="badge decided">plan</span> {decision.workItem}, outline revision {decision.outlineRevision}: {decision.decomposition}{decision.stages > 0 ? `, ${decision.stages} stages` : ''}</p>
          <p>{decision.rationale}</p>
          {decision.reason && <p className="muted">Why it changed: {decision.reason}</p>}
        </li>
      );
    case 'contract':
      return (
        <li className="card decision">
          <p><span className="badge decided">contract</span> <code>{decision.contract}</code> revision {decision.revision} ({decision.mode}): <code>{decision.capability}</code> provided by <code>{decision.provider}</code></p>
          <p className="muted">Authority: {decision.authority.kind} at {decision.authority.owner}. {decision.authority.rationale}</p>
          <p className="muted">Established by {decision.establishedBy.iteration}, gate {decision.establishedBy.gate}{decision.decision ? `; placed by ${decision.decision}` : ''}.</p>
        </li>
      );
  }
}

// Work items

function WorkItems({ client, planId, runId, version, selected, onSelect: setSelected }: AreaProps & {
  readonly selected: string | undefined;
  readonly onSelect: (workItem: string) => void;
}) {
  const list = useRunQuery(`work-items:${runId}`, version, () => client.getWorkItems(planId, runId));
  return (
    <div className="area" aria-label="Work items">
      <Loading state={list} what="the work items">
        {data => data.workItems.length === 0 ? <p className="muted">No work item yet.</p> : (
          <ul className="run-list">
            {data.workItems.map(item => (
              <li key={item.id}>
                <button type="button" className="link" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{item.id}</button>
                <StateBadge state={item.state} />
                <code>{item.module}</code>
                <span className="muted">{item.capability ?? ''} · {item.counts.iterations} iterations · {item.counts.gateAttempts} gates{item.waitingFor.length > 0 ? ` · waits for ${item.waitingFor.join(', ')}` : ''}{item.follows ? ` · follows ${item.follows}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Loading>
      {selected && <WorkItemDetail client={client} planId={planId} runId={runId} version={version} workItem={selected} />}
    </div>
  );
}

function WorkItemDetail({ client, planId, runId, version, workItem }: AreaProps & { readonly workItem: string }) {
  const state = useRunQuery(`work-item:${runId}:${workItem}`, version, () => client.getWorkItem(planId, runId, workItem));
  return (
    <section className="panel" aria-label={`Work item ${workItem}`}>
      <Loading state={state} what={`work item ${workItem}`}>
        {(data: WorkItemResponse) => (
          <>
            <h2>{data.workItem.id}: {data.workItem.goal}</h2>
            <h3>Outline revisions</h3>
            <ol>
              {data.outlines.map(outline => (
                <li key={outline.revision}>
                  Revision {outline.revision}: {outline.decomposition.kind}. {outline.changes}
                  {outline.revisionReason && <span className="muted"> Why: {outline.revisionReason}</span>}
                  {outline.breakingChanges.map(change => <p key={change.guarantee} className="muted">Breaking: {change.guarantee}: {change.reason}</p>)}
                </li>
              ))}
            </ol>
            <h3>Iterations</h3>
            {data.iterations.length === 0 ? <p className="muted">None assigned.</p> : (
              <ul className="cards">
                {data.iterations.map(iteration => (
                  <li key={iteration.id} className="card">
                    <p><strong>{iteration.id}</strong> ({iteration.kind}, checkpoint {iteration.checkpoint}): {iteration.goal}</p>
                    <p className="muted">Scope: {iteration.scope.modules.join(', ')}{iteration.scope.includedChildren.length ? ` with ${iteration.scope.includedChildren.join(', ')}` : ''}. {iteration.scope.rationale}</p>
                    <p>Result: {iteration.result ? `${iteration.result.outcome}${iteration.result.commit ? `, commit ${iteration.result.commit.slice(0, 12)}` : ''}` : 'open'}</p>
                    {iteration.result && iteration.result.findings.length > 0 && <ul>{iteration.result.findings.map(finding => <li key={finding}>{finding}</li>)}</ul>}
                    <p className="muted">Gates: {iteration.gates.map(gate => `${gate.id} ${gate.verdict}${gate.cause ? ` (${gate.cause})` : ''}`).join(', ') || 'none'}</p>
                    <p className="muted">Sessions: {iteration.invocations.map(invocation => `${invocation.id} ${invocation.role} ${invocation.ended ?? 'running'}`).join(', ')}</p>
                    {iteration.invocations.some(invocation => invocation.outsideScope.length > 0) && (
                      <p className="warn">Changed outside the write scope: {iteration.invocations.flatMap(invocation => invocation.outsideScope).join(', ')}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {data.gates.length > 0 && <p className="muted">Work-item gates: {data.gates.map(gate => `${gate.id} ${gate.verdict}`).join(', ')}</p>}
            {data.requirements.length > 0 && (
              <>
                <h3>Requirements</h3>
                <ul>{data.requirements.map(requirement => <li key={requirement.id}>{requirement.id}@{requirement.revision} on {requirement.obligation}: {requirement.verified ? 'verified' : 'open'}</li>)}</ul>
              </>
            )}
            {data.requests.length > 0 && (
              <>
                <h3>Placement requests</h3>
                <ul>{data.requests.map(request => <li key={request.id}>{request.id}: {request.question} → {request.decision ?? 'no decision yet'}</li>)}</ul>
              </>
            )}
          </>
        )}
      </Loading>
    </section>
  );
}

// Scenarios

function Scenarios({ client, planId, runId, version }: AreaProps) {
  const state = useRunQuery(`scenarios:${runId}`, version, () => client.getScenarios(planId, runId));
  return (
    <div className="area" aria-label="Scenarios">
      <Loading state={state} what="the scenarios">
        {data => <ScenarioTable scenarios={data.scenarios} total={data.total} />}
      </Loading>
    </div>
  );
}

// Checks

function Checks({ client, planId, runId, version, events }: AreaProps & { readonly events: readonly ProjectedRunEvent[] }) {
  const attempts = events.filter(event => event.transition === 'gate-attempted' || event.transition === 'readiness-passed');
  const [selected, setSelected] = useState<string | undefined>(undefined);
  return (
    <div className="area" aria-label="Checks">
      {attempts.length === 0 ? <p className="muted">No gate has run yet.</p> : (
        <ul className="run-list">
          {attempts.map(event => {
            const gate = event.refs.find(ref => ref.kind === 'gate')!.id;
            return (
              <li key={`${event.sequence}`}>
                <button type="button" className="link" aria-pressed={selected === gate} onClick={() => setSelected(gate)}>{gate}</button>
                <span>{event.summary}</span>
              </li>
            );
          })}
        </ul>
      )}
      {selected && <GateDetail client={client} planId={planId} runId={runId} version={version} gate={selected} />}
    </div>
  );
}

function GateDetail({ client, planId, runId, version, gate }: AreaProps & { readonly gate: string }) {
  const state = useRunQuery(`gate:${runId}:${gate}`, version, () => client.getGate(planId, runId, gate));
  return (
    <section className="panel" aria-label={`Gate ${gate}`}>
      <Loading state={state} what={`gate ${gate}`}>
        {(data: GateView) => (
          <>
            <h2>{data.id}: {data.checkpoint}, {data.verdict}</h2>
            <p className="muted">Cause {data.cause ?? 'none'}, next {data.next}, repair round {data.repairRound}, infrastructure attempt {data.infrastructureAttempt}.</p>
            <dl className="facts">
              <div><dt>Attempt commit</dt><dd>{data.commit === null ? 'none (this attempt made no commit)' : <code>{data.commit}</code>}</dd></div>
              <div><dt>Audited commit</dt><dd>{data.audited === null ? 'not audited' : <code>{data.audited}</code>}</dd></div>
              <div>
                <dt>Audit evidence</dt>
                <dd>{data.evidence === null
                  ? 'not published'
                  : <><span>run ref <code>{data.evidence.runRef}</code></span>; <span>report commit <code>{data.evidence.reportCommit}</code></span>; <span>tree ref <code>{data.evidence.treeRef}</code></span></>}</dd>
              </div>
            </dl>
            {data.guardedChanges.length > 0 && (
              <ul>{data.guardedChanges.map(change => <li key={change.path}>Guarded change <code>{change.path}</code>{change.after === null ? ' (deleted)' : ''}: {change.authorizedBy ? `authorized by ${change.authorizedBy.id}@${change.authorizedBy.revision}` : 'not authorized'}</li>)}</ul>
            )}
            {data.commands.map((command, index) => (
              <div key={index} className="command">
                <p><strong>{command.kind}</strong>: {command.outcome}{command.notVerified ? ` (${command.notVerified})` : ''}, exit {command.exitCode ?? 'none'}, {command.elapsedMs} ms</p>
                <p className="muted"><code>{command.argv.join(' ')}</code></p>
                {command.selection && <p className="muted">Selection ({command.selection.policy}): {command.selection.resolved.length} files{command.selection.resolved.length ? `: ${command.selection.resolved.join(', ')}` : ''}</p>}
                <p className="muted">Output: {command.output.bytes} bytes in <code>{command.output.path}</code>; the last {Math.min(command.output.bytes, 8192)} are shown.</p>
                {command.scenarios && <ScenarioCheckSummaryView summary={command.scenarios} />}
                <pre className="tail" aria-label={`Output tail of ${command.kind}`}>{command.output.tail}</pre>
              </div>
            ))}
          </>
        )}
      </Loading>
    </section>
  );
}

// Progress

const progressViews = [
  ['module', 'By module'],
  ['dependencies', 'Dependencies'],
] as const;
type ProgressView = typeof progressViews[number][0];

/*
 * Two views of the harness's capability progress. Only the selected one is
 * mounted, so the page never loads both large visualizations at once. By
 * module is the default: it answers the run's initial-versus-current
 * placement question.
 *
 * Both are marked with the run's sessions. They are read again whenever the
 * run's version moves, which the run's own poll reads, and every change of a
 * session's state is an event of the run: a mark changes within one poll of
 * the change. Without them the diagrams are drawn unmarked, and say so.
 */
function Progress({ onOpenWorkItem, moduleSelection, onSelectModule, ...props }: AreaProps & {
  readonly onOpenWorkItem: (workItem: string) => void;
  readonly moduleSelection: ModuleCapabilitySelection | null;
  readonly onSelectModule: (selection: ModuleCapabilitySelection | null) => void;
}) {
  const [view, setView] = useState<ProgressView>('module');
  const { client, planId, runId, version } = props;
  const state = useRunQuery(`progress-sessions:${runId}`, version, () => client.getRunSessions(planId, runId));
  const sessions: DiagramSessions | undefined = state.status === 'ready' ? { planId, runId, sessions: state.data.sessions } : undefined;
  return (
    <div className="area area-wide" aria-label="Progress">
      <nav className="tabs progress-views" aria-label="Progress views">
        {progressViews.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'tab tab-selected' : 'tab'} onClick={() => setView(id)}>{label}</button>
        ))}
      </nav>
      {state.status === 'failed' && <p className="warn" role="status">The sessions are not marked: {state.error.message}</p>}
      {view === 'module' && <ByModule {...props} sessions={sessions} selection={moduleSelection} onSelect={onSelectModule} />}
      {view === 'dependencies' && <Dependencies {...props} sessions={sessions} onOpenWorkItem={onOpenWorkItem} />}
    </div>
  );
}

/** The module-capability comparison on the shared module tree, or the condition that stands in for it. */
function ByModule({ client, planId, runId, version, selection, onSelect, sessions }: AreaProps & {
  readonly selection: ModuleCapabilitySelection | null;
  readonly onSelect: (selection: ModuleCapabilitySelection | null) => void;
  readonly sessions: DiagramSessions | undefined;
}) {
  const state = useRunQuery(`module-capabilities:${runId}`, version, () => client.getModuleCapabilities(planId, runId));
  return (
    <section className="progress-view" aria-label="By module">
      {state.status === 'loading' && <p className="muted" role="status">Loading the module comparison…</p>}
      {state.status === 'failed' && <p className="failure" role="alert">The module comparison is unavailable: {state.error.message}</p>}
      {state.status === 'ready' && <CapabilityModuleTree comparison={state.data} selection={selection} onSelect={onSelect} sessions={sessions} />}
    </section>
  );
}

/** The dependency graph, or the condition that stands in for it: never a `todo` in place of an answer. */
function Dependencies({ client, planId, runId, version, onOpenWorkItem, sessions }: AreaProps & {
  readonly onOpenWorkItem: (workItem: string) => void;
  readonly sessions: DiagramSessions | undefined;
}) {
  const state = useRunQuery(`capabilities:${runId}`, version, () => client.getCapabilities(planId, runId));
  return (
    <section className="progress-view" aria-label="Dependencies">
      {state.status === 'loading' && <p className="muted" role="status">Loading the capability progress…</p>}
      {state.status === 'failed' && <p className="failure" role="alert">The capability progress is unavailable: {state.error.message}</p>}
      {state.status === 'ready' && (
        <CapabilityDependencyGraph capabilities={state.data.capabilities} total={state.data.total} onOpenWorkItem={onOpenWorkItem} sessions={sessions} />
      )}
    </section>
  );
}

// Sessions

/*
 * The run's sessions as a lineage timeline. It is read again whenever the
 * run's version moves, so a live session's segments grow as the run does.
 */
function RunSessions({ client, planId, runId, version }: AreaProps) {
  const state = useRunQuery(`sessions:${runId}`, version, () => client.getRunSessions(planId, runId));
  return (
    <div className="area area-wide" aria-label="Sessions">
      <Loading state={state} what="the sessions">
        {data => data.sessions.length === 0
          ? <p className="muted">No session has been opened yet.</p>
          : <SessionTimeline planId={planId} runId={runId} answer={data} />}
      </Loading>
    </div>
  );
}

// Measurements

function Measurements({ client, planId, runId, version }: AreaProps) {
  const state = useRunQuery(`metrics:${runId}`, version, () => client.getMetrics(planId, runId));
  return (
    <div className="area" aria-label="Measurements">
      <Loading state={state} what="the measurements">
        {(data: MetricsResponse) => (
          <>
            <section className="panel">
              <h2>What was guarded</h2>
              <p className={data.evaluation.guarding.complete ? '' : 'warn'}>{data.evaluation.guarding.statement}</p>
              <p className="muted">Guarded: {data.evaluation.guarding.guarded.join(', ') || 'no tool'}. Not guarded: {data.evaluation.guarding.unguarded.join(', ') || 'none observed'}. Verdicts: {data.evaluation.guarding.verdicts.allowed} allowed, {data.evaluation.guarding.verdicts['blocked-scope']} blocked by scope, {data.evaluation.guarding.verdicts['blocked-unresolved']} blocked unresolved.</p>
              <h3>Changed outside a write scope</h3>
              {data.evaluation.outsideScope.length === 0
                ? <p className="muted">No writer left a change outside its write scope.</p>
                : <ul aria-label="Outside the write scope">{data.evaluation.outsideScope.map(entry => <li key={`${entry.invocation}-${entry.path}`}><code>{entry.path}</code> by {entry.invocation} ({entry.role}{entry.iteration ? `, ${entry.iteration}` : ''})</li>)}</ul>}
            </section>
            <section className="panel">
              <h2>Metrics</h2>
              <p className="muted">KPI projection {data.policyVersion}; sizes under {data.measurementPolicy}. Baseline B: {data.baseline.state === 'measured' ? `${data.baseline.bytes} bytes (${data.baseline.snapshot})` : `unavailable: ${data.baseline.reason}`}.</p>
              <table className="table metrics" aria-label="Metrics">
                <thead><tr><th>Metric</th><th>State</th><th>Value</th><th>Numerator</th><th>Denominator</th><th>Coverage</th><th>Note</th></tr></thead>
                <tbody>{data.metrics.map(metric => <MetricRow key={metric.id} metric={metric} />)}</tbody>
              </table>
            </section>
            <section className="panel">
              <h2>Lineage</h2>
              <p className="muted">Lineage measurements {data.lineage.policyVersion}. Each segment counts as the start its executor made: a fork or continuation it made fresh is measured as a fresh start and counted as degraded. Forks are grouped by the context generation they forked.</p>
              <table className="table metrics" aria-label="Lineage measurements">
                <thead><tr><th>Measurement</th><th>State</th><th>Value</th><th>Numerator</th><th>Denominator</th><th>Coverage</th><th>Note</th></tr></thead>
                <tbody>{data.lineage.metrics.map(metric => <MetricRow key={metric.id} metric={metric} />)}</tbody>
              </table>
            </section>
          </>
        )}
      </Loading>
    </div>
  );
}

function MetricRow({ metric }: { readonly metric: Metric | LineageMetric }) {
  return (
    <tr className={`metric metric-${metric.state}`} data-metric={metric.id}>
      <td><code>{metric.id}</code><div className="muted">{metric.unit}</div></td>
      <td>{metric.state}</td>
      <td>{metricValue(metric)}{metric.subtotal !== null ? <div className="muted">known subtotal {figure(metric.subtotal)}</div> : null}</td>
      <td>{figure(metric.numerator)}</td>
      <td>{figure(metric.denominator)}</td>
      <td>{metric.coverage ? `${metric.coverage.covered} of ${metric.coverage.total}` : '—'}</td>
      <td>{metric.note ?? ''}{metric.evidence.length > 0 && <details><summary>evidence</summary><ul>{metric.evidence.map(item => <li key={item}>{item}</li>)}</ul></details>}</td>
    </tr>
  );
}
