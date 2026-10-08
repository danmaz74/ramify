import type { CapabilityTaskView } from '../../harness/src/interfaces/protocol/capability-tasks.js';
import type { ProtocolClient } from './client.js';
import { useQuery } from './use-query.js';

/** One obligation the task's architect reports on: its status, the latest binding's fakes and the architect's own report, as recorded. */
function Obligation({ obligation }: { obligation: CapabilityTaskView['obligations'][number] }) {
  const subject = obligation.kind === 'outcome' ? 'delegated outcome'
    : obligation.kind === 'test' ? `registered test: ${obligation.description ?? ''}` : `registered case ${obligation.case ?? ''}`;
  return <li><code>{obligation.id}</code> · {subject} · <span className={`badge state-${obligation.status}`}>{obligation.status}</span>
    {obligation.binding !== null && <> · bound by <code>{obligation.binding.invocation}</code>{obligation.binding.fakes.length > 0 ? `, fakes: ${obligation.binding.fakes.join(', ')}` : ', no fakes'}</>}
    {obligation.report === null ? ' · no architect report'
      : <> · architect report {obligation.report.judgment} by <code>{obligation.report.invocation}</code> (revision {obligation.report.revision}){obligation.report.where !== null && <>, where: {obligation.report.where}</>}</>}
  </li>;
}

function Task({ task, onOpenWorkItem, onOpenGate }: { task: CapabilityTaskView;
  onOpenWorkItem?: (id: string) => void; onOpenGate?: (id: string) => void }) {
  const pending = task.assignments.filter(item => item.status !== 'accepted');
  const outcome = task.obligations.find(obligation => obligation.id === task.id);
  return <article className="panel capability-task" aria-label={`Capability task ${task.id}`}>
    <header className="page-header"><h3><code>{task.id}</code> · {task.original.need}</h3>
      <span className={`badge state-${task.status}`}>{task.status}{task.active ? ' · current' : ''}</span></header>
    <p>Requested by {task.consumer}; provider {task.provider}. {task.placementReason}</p>
    <p className="muted">Request <code>{task.request}</code> · {task.parent.kind} <code>{task.parent.id}</code> · plan revision {task.plan.revision} · coordinator {task.currentCoordinator ?? 'not active'}</p>
    {task.parent.kind === 'work-item' && onOpenWorkItem && <button type="button" onClick={() => onOpenWorkItem(task.parent.id)}>Open requesting work item</button>}
    <details><summary>Original need and provisional source</summary>
      <p>{task.original.need}</p>
      <p>{task.original.knownInterface.kind === 'none-known' ? 'No existing interface was known at request time.'
        : <>Known interface <code>{task.original.knownInterface.path}</code> · {task.original.knownInterface.symbol}: {task.original.knownInterface.missing}</>}</p>
      {task.original.suggestedProvider && <p>Suggested provider at request time: {task.original.suggestedProvider.module} · {task.original.suggestedProvider.reason}.</p>}
      <h4>Calling code</h4><ul>{task.original.usage.map((site, index) => <li key={`${site.path}:${index}`}><code>{site.path}</code>{site.symbol ? ` · ${site.symbol}` : ''}: {site.use}{site.prospective ? ' (prospective)' : ''}</li>)}</ul>
      <h4>Examples</h4><p className="muted">The request's original examples, unchanged by plan revisions. They carry no state; the architect's reports below judge the outcome.</p><ul>{task.original.examples.map(example => <li key={example.id}><strong>{example.title}</strong> · {example.designation}<pre>{example.code}</pre></li>)}</ul>
      {task.original.constraints.length > 0 && <><h4>Constraints</h4><ul>{task.original.constraints.map(item => <li key={item}>{item}</li>)}</ul></>}
      <p>Suspended source tree <code>{task.source.tree}</code>; accepted base <code>{task.source.acceptedBase}</code>.</p>
      <p>Provisional paths: {task.source.delta.length ? task.source.delta.map(change => change.path).join(', ') : 'none recorded'}.</p>
    </details>
    <details open={task.active}><summary>Current design · revision {task.plan.revision}</summary>
      <p>{task.plan.need}</p><p>{task.plan.proposedInterface}</p>
      {task.plan.outline.length > 0 && <><h4>Work outline</h4><ol>{task.plan.outline.map((item, index) => <li key={index}>{item}</li>)}</ol></>}
      {task.plan.useCases.length > 0 && <><h4>Cases</h4><ul>{task.plan.useCases.map(item => <li key={item.id}><strong>{item.id}</strong>: {item.expectedBehavior}{item.derivedFrom.length === 1 && item.derivedFrom[0] === item.id ? '' : ` · from ${item.derivedFrom.join(', ')}`}</li>)}</ul></>}
      {task.plan.compatibility.length > 0 && <><h4>Compatibility</h4><ul>{task.plan.compatibility.map(item => <li key={item}>{item}</li>)}</ul></>}
      {task.plan.openQuestions.length > 0 && <><h4>Open questions</h4><ul>{task.plan.openQuestions.map(item => <li key={item}>{item}</li>)}</ul></>}
      {task.plan.decisions.length > 0 && <><h4>Decisions</h4><ul>{task.plan.decisions.map((item, index) => <li key={index}>{item.decision}: {item.reason}</li>)}</ul></>}
    </details>
    <section aria-label={`Architect reports of ${task.id}`}><h4>Architect reports</h4>
      {task.obligations.length === 0 ? <p className="muted">No obligation is recorded for this task.</p>
        : <ul>{task.obligations.map(obligation => <Obligation key={obligation.id} obligation={obligation} />)}</ul>}
    </section>
    {task.consultations.length > 0 && <section><h4>Consultations</h4><ul>{task.consultations.map(item => <li key={item.id}><code>{item.id}</code>: {item.question} · {item.answer === null ? 'awaiting A engineer' : `answered: ${item.answer}`}{item.objections.length ? `; objections: ${item.objections.join('; ')}` : ''}</li>)}</ul></section>}
    <section><h4>Assignments</h4>{task.assignments.length === 0 ? <p>No owner assignment yet.</p>
      : <ul>{task.assignments.map(item => <li key={item.id}><code>{item.id}</code> · {item.owner} · {item.status}: {item.purpose}
        {item.result && <p>Iteration result: {item.result.outcome}. Commit {item.result.commit === null ? 'none recorded' : <code>{item.result.commit}</code>}.
          {item.result.gate && <> Gate {onOpenGate ? <button type="button" onClick={() => onOpenGate(item.result!.gate!)}>{item.result.gate}</button> : <code>{item.result.gate}</code>}.</>}</p>}
        {item.reviews && item.reviews.length > 0 && <ul>{item.reviews.map(review => <li key={review.id}>
          <code>{review.id}</code> · {review.kind} review coverage: {review.result ?? 'pending'}
        </li>)}</ul>}
        {item.failures.length > 0 && <ul>{item.failures.map((failure, index) => <li key={index} className="failure">{failure}</li>)}</ul>}
      </li>)}</ul>}
      {pending.length > 0 && <p className="warn">Pending or provisional: {pending.map(item => item.id).join(', ')}.</p>}
    </section>
    {task.children.length > 0 && <p>Nested tasks: {task.children.join(', ')}{task.activeChild ? `; waiting for ${task.activeChild}` : ''}.</p>}
    {task.relatedEntries.length > 0 && <p>Related entry work: {task.relatedEntries.map(item => `${item.entry} (${item.reason})`).join('; ')}. These are separate from task {task.id}.</p>}
    {task.deferredWorkItems.length > 0 && <p>Separate queued work items: {task.deferredWorkItems.map(item => <span key={item}><code>{item}</code> </span>)}. Handback does not complete them.</p>}
    <section><h4>Verification</h4><p className={task.verification.status === 'failed' ? 'failure' : ''}>{task.verification.status === 'pending' ? 'Real combined verification pending.' : `Combined verification ${task.verification.status}.`}</p>
      {task.verification.gates.length > 0 && <p>Checks: {task.verification.gates.map(gate => onOpenGate
        ? <button key={gate} type="button" onClick={() => onOpenGate(gate)}>{gate}</button> : <code key={gate}>{gate}</code>)}.</p>}
      {task.verification.findings.length > 0 && <ul>{task.verification.findings.map((finding, index) => <li key={index} className="failure">{finding}</li>)}</ul>}
    </section>
    {task.handback ? <section><h4>Accepted handback</h4>
      {outcome?.report != null && <p>Handed back on the architect's report: <code>{outcome.id}</code> {outcome.report.judgment} by <code>{outcome.report.invocation}</code>{outcome.report.where !== null ? `, where: ${outcome.report.where}` : ''}.</p>}
      <p>{task.handback.summary}</p>
      <p>Returned tree <code>{task.handback.returnedTree}</code>; changes since suspension: {task.handback.deltaFromSuspension.join(', ') || 'none'}.</p>
      <ul>{task.handback.interfaces.map(item => <li key={item.path}><code>{item.path}</code> ({item.symbols.join(', ')}): {item.use}</li>)}</ul>
      {task.handback.limitations.length > 0 && <p>Limitations: {task.handback.limitations.join('; ')}</p>}
      <p>Original assignment and separate entry work require their own completion.</p></section>
      : <p className="muted">No accepted handback is recorded.</p>}
  </article>;
}

function AtVersion({ client, planId, runId, version, onOpenWorkItem, onOpenGate }: { client: ProtocolClient;
  planId: string; runId: string; version: number; onOpenWorkItem?: (id: string) => void; onOpenGate?: (id: string) => void }) {
  const query = useQuery(`capability-tasks:${planId}:${runId}:${version}`,
    () => client.getCapabilityTasks(planId, runId, version));
  if (query.state.status === 'loading') return <p role="status">Loading capability tasks at version {version}…</p>;
  if (query.state.status === 'failed') return <p role="alert">Could not read capability tasks at version {version}: {query.state.error.message}</p>;
  const data = query.state.data;
  if (data.version !== version) return <p role="alert">Capability task response is stale.</p>;
  return <div className="capability-tasks" data-run-version={version}>
    {data.terminal.state !== 'running' && <p className={data.terminal.state === 'failed' ? 'failure' : 'warn'} role="status">
      Run {data.terminal.state}{data.terminal.reason ? `: ${data.terminal.reason}` : ''}{data.terminal.message ? ` · ${data.terminal.message}` : ''}.
      {data.tasks.some(task => task.handback === null) || data.requests.some(request => request.task === null && request.outcome !== 'satisfied')
        ? ' Unfinished capability work has no accepted handback.' : ''}
    </p>}
    {data.requests.length === 0 ? <p>No capability request is recorded for this run. Its contract work appears in the contract views.</p>
      : <><p>Coordination stack: {data.stack.length ? data.stack.join(' → ') : 'no active task'}.</p>
        {data.requests.filter(request => request.task === null).map(request => <p key={request.id} className="warn"><code>{request.id}</code> · {request.outcome}: {request.need}{request.evidence.length ? ` · ${request.evidence.join('; ')}` : ''}</p>)}
        {data.tasks.map(task => <Task key={task.id} task={task} onOpenWorkItem={onOpenWorkItem} onOpenGate={onOpenGate} />)}</>}
  </div>;
}

export function CapabilityTasksArea(props: { client: ProtocolClient; planId: string; runId: string;
  version: number | undefined; onOpenWorkItem?: (id: string) => void; onOpenGate?: (id: string) => void }) {
  return <section className="area area-wide" aria-label="Capability tasks">
    <h2>Capability tasks</h2>
    {props.version === undefined ? <p>Loading the run…</p> : <AtVersion {...props} version={props.version} />}
  </section>;
}
