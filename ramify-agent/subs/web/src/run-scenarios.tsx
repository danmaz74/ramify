import { useState, type FormEvent } from 'react';
import type {
  AnalysisScenario, RunReview, RunSnapshot, GateScenarioResultView, ScenarioGateResult, ScenarioOriginView, ScenarioView, ScenarioWarningView,
} from '../../harness/src/interfaces/protocol/runs.js';
import { ClientError, newCommandId, type ProtocolClient } from './client.js';

/*
 * The acceptance scenarios on the Run page: the review of the accepted
 * analysis's scenarios, the Approve action, the scenario list with each
 * scenario's state and gates, and a scenario check's summary in a gate.
 * Every scenario is shown by its literal ID and state; the text shown is the
 * text the analysis froze, and nothing here edits it.
 */

/** Whether a person may approve the run's analysis now, as the harness would accept it. */
export function canApprove(run: RunSnapshot): boolean {
  if (run.review !== 'not-reviewed' || run.stopRequested) return false;
  if (run.state === 'completed') return true;
  return run.state === 'running' && run.phase !== 'analysis' && run.phase !== 'final-verification';
}

/** The review status as a sentence. */
export function reviewText(review: RunReview): string {
  if (review === 'not-reviewed') return 'Not reviewed';
  return `Approved by ${review.reviewer} at ${review.at}${review.duringRun ? ', while the run was working' : ''}`;
}

/**
 * The Approve action: a reviewer's name and an optional note, sent as
 * `approve-analysis` at the run's version. A run that moved on since it was
 * read is refused at that version; the approval is sent once more at the
 * version the refusal names, since the analysis it approves is frozen.
 */
export function ApproveForm({ client, run, onApproved, label }: {
  readonly client: ProtocolClient;
  readonly run: RunSnapshot;
  readonly onApproved: () => void;
  readonly label: string;
}) {
  const [reviewer, setReviewer] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'sending' | 'sent' } | { kind: 'failed'; message: string }>({ kind: 'idle' });

  const send = async (expectedVersion: number) => client.sendCommand({
    commandId: newCommandId(),
    expectedVersion,
    type: 'approve-analysis',
    payload: { planId: run.planId, jobId: run.jobId, reviewer: reviewer.trim(), ...(note.trim() === '' ? {} : { note: note.trim() }) },
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (reviewer.trim() === '') return;
    setStatus({ kind: 'sending' });
    try {
      try {
        await send(run.version);
      } catch (error) {
        if (!(error instanceof ClientError) || error.code !== 'stale-version' || error.currentVersion === undefined) throw error;
        await send(error.currentVersion);
      }
      setStatus({ kind: 'sent' });
      onApproved();
    } catch (error) {
      setStatus({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const busy = status.kind === 'sending' || status.kind === 'sent';
  return (
    <form className="approve-form" aria-label={label} onSubmit={event => void submit(event)}>
      <label>
        <span>Reviewer</span>
        <input type="text" name="reviewer" value={reviewer} maxLength={200} required disabled={busy} onChange={event => setReviewer(event.target.value)} />
      </label>
      <label>
        <span>Note (optional)</span>
        <textarea name="note" value={note} maxLength={4000} rows={2} disabled={busy} onChange={event => setNote(event.target.value)} />
      </label>
      <button type="submit" disabled={busy || reviewer.trim() === ''}>{status.kind === 'sending' ? 'Approving…' : status.kind === 'sent' ? 'Approved' : 'Approve'}</button>
      {status.kind === 'failed' && <p className="failure" role="alert">The approval was refused: {status.message}</p>}
    </form>
  );
}

/** The review status, with the Approve action where the run takes one. */
export function ReviewPanel({ client, run, onApproved }: { readonly client: ProtocolClient; readonly run: RunSnapshot; readonly onApproved: () => void }) {
  return (
    <section className="panel review" aria-labelledby="review-heading">
      <h2 id="review-heading">Review</h2>
      <p className={run.review === 'not-reviewed' ? 'muted' : 'approved'}>{reviewText(run.review)}.</p>
      {run.phase === 'awaiting-review' && (
        <p className="warn">The run waits at its review stop: nothing is written to the project until the analysis is approved. Read its scenarios under Plan and entries, then approve it or stop the run.</p>
      )}
      {canApprove(run) && <ApproveForm client={client} run={run} onApproved={onApproved} label="Approve the analysis" />}
    </section>
  );
}

/** Where a scenario comes from, in words. */
export function originText(origin: ScenarioOriginView): string {
  if (origin.kind === 'plan') return `from the plan (${origin.planScenario}, lines ${origin.lines[0]}–${origin.lines[1]})`;
  return `written by the architect${origin.refs.length > 0 ? `, citing ${origin.refs.join(', ')}` : ''}`;
}

function ScenarioText({ scenario, warnings }: { readonly scenario: AnalysisScenario; readonly warnings: readonly ScenarioWarningView[] }) {
  const own = warnings.filter(warning => warning.scenarios.includes(scenario.id));
  return (
    <li className={`card scenario scenario-${scenario.origin.kind}`} aria-label={`Scenario ${scenario.id}`}>
      <p>
        <code>{scenario.id}</code> <strong>{scenario.name}</strong>{' '}
        <span className={`badge origin-${scenario.origin.kind}`}>{scenario.origin.kind === 'plan' ? 'plan' : 'architect'}</span>
      </p>
      <p className="muted">{originText(scenario.origin)}{scenario.partOf ? `; a sub-scenario of ${scenario.partOf}` : ''}. In <code>{scenario.file}</code>.</p>
      <pre className="gherkin">{scenario.source.join('\n')}</pre>
      {own.map(warning => <p key={`${warning.kind}-${warning.message}`} className="warn">Warning ({warning.kind}): {warning.message}</p>)}
    </li>
  );
}

/**
 * The review section of the analysis: each entry's scenarios with their
 * origin, then each integration scenario with the plan's text beside the
 * sub-scenarios derived from it, and the warnings the acceptance recorded.
 */
export function ScenarioReview({ entries, scenarios, warnings, total }: {
  readonly entries: readonly { readonly capability: string; readonly owner: string }[];
  readonly scenarios: readonly AnalysisScenario[];
  readonly warnings: readonly ScenarioWarningView[];
  readonly total: number;
}) {
  const byId = new Map(scenarios.map(scenario => [scenario.id, scenario]));
  const integrations = scenarios.filter(scenario => scenario.kind === 'integration');
  return (
    <div className="scenario-review">
      {total > scenarios.length && <p className="muted">Showing {scenarios.length} of {total} scenarios.</p>}
      {warnings.length > 0 && (
        <div className="review-warnings" aria-label="Warnings of the analysis">
          <h3>Warnings</h3>
          <p className="muted">Recorded when the analysis was accepted; they never rejected it.</p>
          <ul>{warnings.map(warning => <li key={`${warning.kind}-${warning.message}`} className="warn"><code>{warning.kind}</code> on {warning.scenarios.join(', ')}: {warning.message}</li>)}</ul>
        </div>
      )}
      {entries.map(entry => {
        const own = scenarios.filter(scenario => scenario.entry === entry.capability);
        return (
          <section key={entry.capability} className="review-entry" aria-label={`Scenarios of ${entry.capability}`}>
            <h3><code>{entry.capability}</code> <span className="muted">in <code>{entry.owner}</code></span></h3>
            {own.length === 0 ? <p className="muted">No scenario.</p> : <ul className="cards">{own.map(scenario => <ScenarioText key={scenario.id} scenario={scenario} warnings={warnings} />)}</ul>}
          </section>
        );
      })}
      {integrations.map(integration => (
        <section key={integration.id} className="review-integration" aria-label={`Integration scenario ${integration.id}`}>
          <h3>Integration scenario <code>{integration.id}</code>: {integration.name}</h3>
          <p className="muted">Owned by <code>{integration.owner}</code>, the common ancestor of its sub-scenarios' owners; {originText(integration.origin)}.</p>
          <div className="columns">
            <div aria-label="The plan's text">
              <h4>The plan's text</h4>
              <pre className="gherkin">{integration.source.join('\n')}</pre>
            </div>
            <div aria-label="Its sub-scenarios">
              <h4>Its sub-scenarios</h4>
              <ul className="cards">
                {integration.subScenarios.map(id => {
                  const sub = byId.get(id);
                  return sub === undefined
                    ? <li key={id} className="card muted"><code>{id}</code> is not in this answer.</li>
                    : <ScenarioText key={id} scenario={sub} warnings={warnings} />;
                })}
              </ul>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function gateLine(gate: ScenarioGateResult): string {
  const subject = gate.subject.iteration ?? gate.subject.workItem;
  return `${gate.checkpoint}${subject ? ` ${subject}` : ''}, ${gate.check}${gate.command === null ? '' : `.${gate.command}`}: ${gate.status}`;
}

/** Every tracked scenario with its state, what it belongs to, where it lives and the gates that ran it. */
export function ScenarioTable({ scenarios, total }: { readonly scenarios: readonly ScenarioView[]; readonly total: number }) {
  if (scenarios.length === 0) return <p className="muted">No scenario is tracked yet: the initial analysis has not been accepted.</p>;
  const states = ['pending', 'bound', 'done'] as const;
  return (
    <>
      <p className="muted" aria-label="Scenario states">
        {states.map(state => `${scenarios.filter(scenario => scenario.state === state).length} ${state}`).join(' · ')}
        {total > scenarios.length ? ` (showing ${scenarios.length} of ${total})` : ''}
      </p>
      <table className="table scenarios" aria-label="Tracked scenarios">
        <thead><tr><th>Scenario</th><th>State</th><th>Origin</th><th>Belongs to</th><th>Owner and file</th><th>Gates</th></tr></thead>
        <tbody>
          {scenarios.map(scenario => (
            <tr key={scenario.id} data-scenario={scenario.id}>
              <td><code>{scenario.id}</code><div>{scenario.name}</div></td>
              <td><span className={`badge scenario-state-${scenario.state}`}>{scenario.state}</span></td>
              <td>{originText(scenario.origin)}</td>
              <td>
                {scenario.kind === 'integration'
                  ? <>integration of {scenario.subScenarios.join(', ')}; {scenario.workItem ? <>work item {scenario.workItem}</> : 'no work item until its sub-scenarios are reported done'}</>
                  : <>entry <code>{scenario.entry}</code>{scenario.workItem ? <>, work item {scenario.workItem}</> : ''}{scenario.partOf ? <>; sub-scenario of {scenario.partOf}</> : ''}</>}
              </td>
              <td><code>{scenario.owner}</code><div className="muted"><code>{scenario.file}</code></div></td>
              <td>
                {scenario.gates.length === 0 ? <span className="muted">not run yet</span> : (
                  <ul className="scenario-gates" aria-label={`Gates of ${scenario.id}`}>
                    {scenario.gates.map(gate => (
                      <li key={gate.gate} className={`scenario-status-${gate.status}`}>
                        <code>{gate.gate}</code> {gateLine(gate)}
                        {gate.failure && <div className="failure">{gate.failure.step}: {gate.failure.message}</div>}
                        {gate.undefined.length > 0 && <div className="failure">Undefined: {gate.undefined.join('; ')}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** The tracked scenarios a gate's audit ran, read from its raw runner output; display only. */
export function GateScenarioResults({ scenarios }: { readonly scenarios: readonly GateScenarioResultView[] }) {
  if (scenarios.length === 0) return null;
  return (
    <div className="scenario-check" aria-label="Scenario results">
      <p className="muted">The tracked scenarios this gate's audit ran, by its configured Cucumber checks.</p>
      <ul aria-label="Scenario results">
        {scenarios.map(result => (
          <li key={`${result.check}:${result.command ?? ''}:${result.id}`} className={`scenario-status-${result.status}`}>
            <code>{result.id}</code> {result.status} in <code>{result.command === null ? result.check : `${result.check}.${result.command}`}</code>, <code>{result.file}:{result.line}</code>
            {result.failure && <div className="failure">{result.failure.step}: {result.failure.message}</div>}
            {result.undefined.length > 0 && <div className="failure">Undefined: {result.undefined.join('; ')}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
