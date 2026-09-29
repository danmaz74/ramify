import type { CapabilityTaskView } from '../../harness/src/interfaces/protocol/capability-tasks.js';
import type { ProtocolClient } from './client.js';
import { useQuery } from './use-query.js';

function Task({ task, onOpenWorkItem, onOpenGate }: { task: CapabilityTaskView;
  onOpenWorkItem?: (id: string) => void; onOpenGate?: (id: string) => void }) {
  const pending = task.assignments.filter(item => item.status !== 'accepted');
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
      <h4>Examples</h4><ul>{task.original.examples.map(example => <li key={example.id}><strong>{example.title}</strong> · {example.designation}<pre>{example.code}</pre></li>)}</ul>
      {task.original.constraints.length > 0 && <><h4>Constraints</h4><ul>{task.original.constraints.map(item => <li key={item}>{item}</li>)}</ul></>}
      <p>Suspended source tree <code>{task.source.tree}</code>; accepted base <code>{task.source.acceptedBase}</code>.</p>
      <p>Provisional paths: {task.source.delta.length ? task.source.delta.map(change => change.path).join(', ') : 'none recorded'}.</p>
    </details>
    <details open={task.active}><summary>Current design and coverage · revision {task.plan.revision}</summary>
      <p>{task.plan.need}</p><p>{task.plan.proposedInterface}</p>
      {task.plan.outline.length > 0 && <><h4>Work outline</h4><ol>{task.plan.outline.map((item, index) => <li key={index}>{item}</li>)}</ol></>}
      {task.plan.useCases.length > 0 && <ul>{task.plan.useCases.map(item => <li key={item.id}><strong>{item.id}</strong>: {item.expectedBehavior} · {item.coverage.state}{item.coverage.state === 'unresolved' ? `: ${item.coverage.reason}` : ` (${item.coverage.tests.join(', ')})`}</li>)}</ul>}
      {task.plan.compatibility.length > 0 && <><h4>Compatibility</h4><ul>{task.plan.compatibility.map(item => <li key={item}>{item}</li>)}</ul></>}
      {task.plan.openQuestions.length > 0 && <><h4>Open questions</h4><ul>{task.plan.openQuestions.map(item => <li key={item}>{item}</li>)}</ul></>}
      {task.plan.decisions.length > 0 && <><h4>Decisions</h4><ul>{task.plan.decisions.map((item, index) => <li key={index}>{item.decision}: {item.reason}</li>)}</ul></>}
    </details>
    {task.consultations.length > 0 && <section><h4>Consultations</h4><ul>{task.consultations.map(item => <li key={item.id}><code>{item.id}</code>: {item.question} · {item.answer === null ? 'awaiting A engineer' : `answered: ${item.answer}`}{item.objections.length ? `; objections: ${item.objections.join('; ')}` : ''}</li>)}</ul></section>}
    <section><h4>Assignments</h4>{task.assignments.length === 0 ? <p>No owner assignment yet.</p>
      : <ul>{task.assignments.map(item => <li key={item.id}><code>{item.id}</code> · {item.owner} · {item.status}: {item.purpose}{item.failures.length > 0 && <ul>{item.failures.map((failure, index) => <li key={index} className="failure">{failure}</li>)}</ul>}</li>)}</ul>}
      {pending.length > 0 && <p className="warn">Pending or provisional: {pending.map(item => item.id).join(', ')}.</p>}
    </section>
    {task.children.length > 0 && <p>Nested tasks: {task.children.join(', ')}{task.activeChild ? `; waiting for ${task.activeChild}` : ''}.</p>}
    {task.relatedEntries.length > 0 && <p>Related entry work: {task.relatedEntries.map(item => `${item.entry} (${item.reason})`).join('; ')}. These are separate from task {task.id}.</p>}
    {task.deferredWorkItems.length > 0 && <p>Separate queued work items: {task.deferredWorkItems.map(item => <span key={item}><code>{item}</code> </span>)}. Handback does not complete them.</p>}
    <section><h4>Verification</h4><p className={task.verification.status === 'failed' ? 'failure' : ''}>{task.verification.status === 'pending' ? 'Real combined verification pending.' : `Combined verification ${task.verification.status}.`}</p>
      {task.verification.gates.length > 0 && <p>Checks: {task.verification.gates.map(gate => onOpenGate
        ? <button key={gate} type="button" onClick={() => onOpenGate(gate)}>{gate}</button> : <code key={gate}>{gate}</code>)}.</p>}
      {task.verification.reviews.length > 0 && <ul>{task.verification.reviews.map((review, index) => <li key={`${review.gate}:${index}`}>Review of {review.gate} against plan revision {review.planRevision}: {review.outcome}{review.findings.length ? ` · ${review.findings.join('; ')}` : ''}</li>)}</ul>}
      {task.verification.findings.length > 0 && <ul>{task.verification.findings.map((finding, index) => <li key={index} className="failure">{finding}</li>)}</ul>}
    </section>
    {task.handback ? <section><h4>Accepted handback</h4><p>{task.handback.summary}</p>
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
    {data.requests.length === 0 ? <p>No capability request is recorded for this run. Historical contract work remains in its original views.</p>
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
