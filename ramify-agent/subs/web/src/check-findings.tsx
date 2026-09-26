import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type {
  CheckFindingActorView, CheckFindingDecisionView, CheckFindingDetail, CheckFindingListResponse, CheckFindingSettlement,
  CheckFindingSummaryView, PendingUserDecision, PlanDeviationView, ReviewCoverageView, ReviewRequestView, UnresolvedReasonView,
} from '../../harness/src/interfaces/protocol/check-findings.js';
import type { RunCommandInput, RunEnvironmentProblem } from '../../harness/src/interfaces/protocol/runs.js';
import { ClientError, newCommandId, type ProtocolClient } from './client.js';
import { useDecisionFocus } from './decision-waits.js';
import { chapterHref } from './routes.js';
import { useRunQuery } from './run-progress.js';

/*
 * A run's CheckFindings, as the harness projects them: beside their work
 * item, with the work item's review coverage and each CheckFinding's
 * history, attempts, candidate diffs and repair sessions. Nothing here
 * decides anything. Standing, a factual fix, a waiver, a material choice,
 * a decision request and review coverage are shown apart, each as the
 * harness states it, and never collapsed into "resolved". A decision
 * request is a question for the person; a risk level is a label and asks
 * nothing.
 *
 * The page shows what needs attention by default: open signals and the
 * material choices the system reported. Settled signals stay available
 * behind a toggle and raise no notice. The only actions are the typed
 * commands the harness names for each CheckFinding: answer, waive and
 * revoke.
 */

interface Scope {
  readonly client: ProtocolClient;
  readonly planId: string;
  readonly runId: string;
  readonly version: number | undefined;
}

// Words for what the harness states.

/** Recorded prose as one sentence: ends with the period it has, or gets one. */
function sentence(text: string): string {
  const trimmed = text.trim();
  return trimmed === '' || /[.!?…]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** A Git object ID shortened to 12 characters; any other identifier whole, such as a fixture's `revision-01`. */
function shortId(id: string): string {
  return /^[0-9a-f]{40}$|^[0-9a-f]{64}$/iu.test(id) ? id.slice(0, 12) : id;
}

const credibilityLabels: Record<CheckFindingSummaryView['credibility'], string> = {
  'objective-reproduced': 'objective, reproduced',
  objective: 'objective, observed once',
  'human-reviewed': 'grounded in human-reviewed material',
  'agent-generated': 'grounded in agent-generated material',
  ungrounded: 'ungrounded',
};

const openReasons: Partial<Record<CheckFindingSummaryView['reason'], string>> = {
  new: 'not yet assessed',
  'repair-planned': 'a repair is planned',
  'repair-claimed': 'a repair is claimed and awaits verification',
  'awaiting-user-decision': 'awaiting a person\'s decision',
  'user-decision-answered': 'answered; awaiting assessment',
  reopened: 'reopened',
  'waiver-revoked': 'its waiver was revoked',
  'obligation-revised': 'its obligation was revised',
};

const unresolvedLabels: Record<UnresolvedReasonView, string> = {
  'rounds-exhausted': 'its correction rounds were spent',
  'below-floor': 'below the last round\'s floor',
  'raised-after-last-round': 'raised after the last round',
};

/** Where a CheckFinding stands, in words. Closed always says how; it is never "resolved". */
export function standingText(summary: CheckFindingSummaryView): string {
  switch (summary.reason) {
    case 'fixed-by-check': return 'Fixed, verified by the same check';
    case 'fixed-by-assessment': return 'Fixed, by a fresh assessment';
    case 'superseded': return 'Superseded';
    case 'waived': return 'Waived';
    case 'deferred': return 'Deferred';
    default: return `Open: ${openReasons[summary.reason] ?? summary.reason}`;
  }
}

export function actorText(actor: CheckFindingActorView): string {
  switch (actor.kind) {
    case 'user': return actor.name;
    case 'agent': return `${actor.role} (${actor.invocation})`;
    case 'harness': return `the harness (${actor.reason})`;
  }
}

/**
 * The review coverage of a scope: complete, partial, pending, none requested
 * or unavailable. Unavailable is never clean: a run whose policy requested
 * no reviews has no coverage to report.
 */
export function coverageState(coverage: ReviewCoverageView): 'complete' | 'partial' | 'pending' | 'none' | 'unavailable' {
  if (coverage.state === 'unavailable') return 'unavailable';
  if (coverage.requested === 0) return 'none';
  if (coverage.partial > 0 || coverage.notVerified > 0) return 'partial';
  if (coverage.pending > 0) return 'pending';
  return 'complete';
}

export function coverageText(coverage: ReviewCoverageView): string {
  if (coverage.state === 'unavailable') {
    return coverage.reason === 'no-review-policy'
      ? 'Review coverage unavailable: this run\'s policy requested no reviews, so no CheckFinding here means nothing was reviewed, not a clean review.'
      : 'Review coverage unavailable: the run\'s review records could not be read.';
  }
  const counts = `${coverage.complete} complete, ${coverage.partial} partial, ${coverage.notVerified} not verified, ${coverage.pending} pending, of ${coverage.requested} requested`;
  switch (coverageState(coverage)) {
    case 'none': return 'Review coverage: no review requested yet.';
    case 'complete': return `Review coverage complete: ${counts}.`;
    case 'pending': return `Review coverage pending: ${counts}.`;
    default: return `Review coverage partial: ${counts}.`;
  }
}

/** A review request's result: clean, complete with concerns, partial, not verified or pending. */
export function reviewResultText(request: ReviewRequestView): string {
  const settling = request.attempts.find(attempt => attempt.id === request.settledBy);
  if (request.result === null || settling === undefined) return 'pending';
  if (request.result === 'complete') return settling.concerns === 0 ? 'clean' : `complete, ${settling.concerns} ${settling.concerns === 1 ? 'concern' : 'concerns'}`;
  if (request.result === 'partial') return `partial: ${settling.missing} ${settling.missing === 1 ? 'path' : 'paths'} not inspected, ${settling.concerns} ${settling.concerns === 1 ? 'concern' : 'concerns'}`;
  return `not verified (${settling.reason ?? 'no reason'})`;
}

function RiskBadge({ risk }: { readonly risk: CheckFindingSummaryView['risk'] }) {
  return <span className={`badge risk risk-${risk}`}>{risk} risk</span>;
}

// The work item's reviews and CheckFindings.

/**
 * A work item's review coverage and requests, and its CheckFindings. It is
 * read again whenever the run's version moves.
 */
export function WorkItemCheckFindings({ onOpenGate, ...scope }: Scope & { readonly workItem: string; readonly onOpenGate?: (gate: string) => void }) {
  const { client, planId, runId, version, workItem } = scope;
  const reviews = useRunQuery(`reviews:${runId}:${workItem}`, version, () => client.getReviews(planId, runId, workItem));
  return (
    <section className="work-item-check-findings" aria-label={`CheckFindings of ${workItem}`}>
      <h3>Reviews</h3>
      {reviews.status === 'loading' && <p className="muted">Loading the reviews…</p>}
      {reviews.status === 'failed' && <p className="failure" role="alert">Could not load the reviews: {reviews.error.message}</p>}
      {reviews.status === 'ready' && (
        <>
          <p className={`review-coverage review-coverage-${coverageState(reviews.data.coverage)}`} aria-label="Review coverage">{coverageText(reviews.data.coverage)}</p>
          {reviews.data.requests.length > 0 && (
            <table className="table reviews" aria-label="Review requests">
              <thead><tr><th>Request</th><th>Question</th><th>Iteration</th><th>Candidate diff</th><th>Result</th><th>Attempts</th></tr></thead>
              <tbody>
                {reviews.data.requests.map(request => (
                  <tr key={request.id} className={`review-result-${request.result ?? 'pending'}`}>
                    <td><code>{request.id}</code></td>
                    <td>{request.kind}</td>
                    <td>{request.iteration}</td>
                    <td><code>{shortId(request.base ?? '?')}</code> → <code>{shortId(request.candidate)}</code></td>
                    <td>{reviewResultText(request)}</td>
                    <td>{request.attempts.map(attempt => (
                      <span key={attempt.id} className="review-attempt">
                        {attempt.session !== null && attempt.invocation !== null
                          ? <a href={chapterHref({ source: 'run', planId, runId, session: attempt.session }, attempt.invocation)}>{attempt.id}</a>
                          : attempt.id}
                        {' '}{attempt.state}{attempt.actualStart ? `, ${attempt.actualStart}` : ''}
                      </span>
                    ))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {reviews.data.shown < reviews.data.total && <p className="muted">Showing {reviews.data.shown} of {reviews.data.total} review requests.</p>}
        </>
      )}
      <CheckFindingList {...scope} filter={{ workItem }} {...(onOpenGate ? { onOpenGate } : {})} />
    </section>
  );
}

/**
 * The CheckFindings of a work item or a module, ordered by risk, then
 * credibility, then recency. By default the open ones and the material
 * choices; the settled ones behind a toggle.
 */
export function CheckFindingList({ client, planId, runId, version, filter, onOpenGate }: Scope & {
  readonly filter: { readonly workItem: string } | { readonly module: string };
  readonly onOpenGate?: (gate: string) => void;
}) {
  const [settled, setSettled] = useState(false);
  const select = settled ? 'all' : 'reported';
  const name = 'workItem' in filter ? `work item ${filter.workItem}` : `module ${filter.module}`;
  const key = `check-findings:${runId}:${'workItem' in filter ? `wi:${filter.workItem}` : `module:${filter.module}`}:${select}`;
  const state = useRunQuery(key, version, () => client.getCheckFindings(planId, runId, { ...filter, select }));
  return (
    <div className="check-finding-list" aria-label={`CheckFindings of ${name}`}>
      <h3>CheckFindings</h3>
      <label className="toggle">
        <input type="checkbox" checked={settled} onChange={event => setSettled(event.target.checked)} /> Show settled signals
      </label>
      {state.status === 'loading' && <p className="muted">Loading the CheckFindings…</p>}
      {state.status === 'failed' && <p className="failure" role="alert">Could not load the CheckFindings: {state.error.message}</p>}
      {state.status === 'ready' && <ListBody client={client} planId={planId} runId={runId} list={state.data} settled={settled} onOpenGate={onOpenGate} />}
    </div>
  );
}

function ListBody({ client, planId, runId, list, settled, onOpenGate }: {
  readonly client: ProtocolClient; readonly planId: string; readonly runId: string;
  readonly list: CheckFindingListResponse; readonly settled: boolean; readonly onOpenGate: ((gate: string) => void) | undefined;
}) {
  const { counts } = list;
  return (
    <>
      <p className="check-finding-counts" aria-label="CheckFinding counts">
        {counts.open} open ({counts.unresolved} unresolved, {counts.awaitingUser} awaiting a decision), {counts.deferred} deferred;
        {' '}settled: {counts.fixed} fixed, {counts.waived} waived, {counts.superseded} superseded.
      </p>
      {list.query.workItem === null && <p className="muted" aria-label="Review coverage of the run">{coverageText(list.coverage)}</p>}
      {list.items.length === 0
        ? <p className="muted">{settled ? 'No CheckFinding.' : 'No open CheckFinding and no reported material choice.'}</p>
        : <ul className="cards check-finding-cards">{list.items.map(summary => (
          <CheckFindingCard key={summary.id} client={client} planId={planId} runId={runId} version={list.version} summary={summary} onOpenGate={onOpenGate} />
        ))}</ul>}
      {list.shown < list.total && <p className="muted">Showing {list.shown} of {list.total}.</p>}
    </>
  );
}

// One CheckFinding.

function CheckFindingCard({ client, planId, runId, version, summary, onOpenGate }: {
  readonly client: ProtocolClient; readonly planId: string; readonly runId: string; readonly version: number;
  readonly summary: CheckFindingSummaryView; readonly onOpenGate: ((gate: string) => void) | undefined;
}) {
  const [history, setHistory] = useState(false);
  const scope = { client, planId, runId, version, summary };
  return (
    <li className={`card check-finding check-finding-${summary.standing}${summary.planDeviation ? ' check-finding-deviation' : ''}`} aria-label={`CheckFinding ${summary.id}`}>
      <p className="check-finding-title">
        {summary.planDeviation && <span className="badge plan-deviation">Plan deviation</span>}{' '}
        <strong>{summary.title}</strong> <code>{summary.id}</code> <span className="muted">revision {summary.revision}</span>
      </p>
      {summary.planDeviation && <DeviationBody deviation={summary.planDeviation} />}
      <p className="check-finding-signal">
        <RiskBadge risk={summary.risk} />
        <span className="badge credibility">{credibilityLabels[summary.credibility]}</span>
        {summary.required && <span className="badge required">required check {summary.obligation}</span>}
        {summary.modules.map(module => <code key={module} className="module-name">{module}</code>)}
      </p>
      <p className={`standing standing-${summary.standing}`} aria-label="Standing">{standingText(summary)}{summary.group && summary.group.members.length > 1 ? `; same issue as ${summary.group.members.filter(id => id !== summary.id).join(', ')}` : ''}</p>
      {summary.unresolved !== null && (
        <p className={summary.latestReview ? 'unresolved unresolved-latest' : 'unresolved'} aria-label="Unresolved">
          {summary.latestReview
            ? <><strong>Unresolved from the latest review:</strong> a {summary.risk}-risk signal that surfaced in the work item&apos;s latest review and was left open ({unresolvedLabels[summary.unresolved]}).</>
            : <>Unresolved: {unresolvedLabels[summary.unresolved]}. The work item completed with it open.</>}
        </p>
      )}
      {summary.pendingUserDecision !== null && <DecisionRequest {...scope} request={summary.pendingUserDecision} />}
      {summary.materialChoice !== null && (
        <div className="material-choice" role="group" aria-label="Material choice">
          <p><strong>Material choice</strong> ({summary.materialChoice.action}): {summary.materialChoice.choice}</p>
          <p className="muted">Uncertainty: {sentence(summary.materialChoice.uncertainty)} Reported because {sentence(summary.materialChoice.reason)}</p>
        </div>
      )}
      {summary.settlement !== null && <Settlement settlement={summary.settlement} />}
      {summary.repair !== null && <p className="muted">Repair: {summary.repair.kind} <code>{summary.repair.ref}</code>.</p>}
      {summary.userCommands.includes('waive') && <ReasonCommand {...scope} kind="waive" />}
      {summary.userCommands.includes('revoke') && <ReasonCommand {...scope} kind="revoke" />}
      <button type="button" className="link" aria-expanded={history} onClick={() => setHistory(value => !value)}>{history ? 'Hide history' : 'History'}</button>
      {history && <History client={client} planId={planId} runId={runId} version={version} checkFinding={summary.id} onOpenGate={onOpenGate} />}
    </li>
  );
}

/**
 * A plan deviation: the elements it amends, as the catalog holds them, what the run does
 * instead, why, the alternatives rejected and what is lost, with each
 * reworded scenario before and after. Accepting it is a waiver or the answer
 * `accept`; rejecting it is the answer `reject`, whose note is the
 * requirement a follow-up run must meet.
 */
function DeviationBody({ deviation }: { readonly deviation: PlanDeviationView }) {
  if ('element' in deviation) return (
    <div className="plan-deviation-body" role="group" aria-label={`Non-functional deviation ${deviation.id}`}>
      <p className="muted">Assessment {deviation.origin.assessment} of candidate tree <code>{deviation.origin.candidate.tree}</code> found that {deviation.origin.nfr} remains unsatisfied or undetermined. The source plan is unchanged.</p>
      <p><strong>The requirement, {deviation.element.id}</strong></p>
      <blockquote>{deviation.element.text}</blockquote>
      <p className="muted">Captured document {deviation.element.document}{deviation.sourcePath && <> (<code>{deviation.sourcePath}</code>)</>}</p>
      <p><strong>Assessment evidence:</strong> {deviation.evidence.length === 0 ? 'None recorded.' : deviation.evidence.join('; ')}</p>
      <p><strong>Proposed alternative:</strong> {deviation.proposedAlternative || 'None proposed.'}</p>
      <p><strong>Remaining uncertainty:</strong> {deviation.uncertainty || 'None stated.'}</p>
      {deviation.followUp !== null && <p className="follow-up"><strong>Rejected.</strong> The requirement for a follow-up run: {deviation.followUp}</p>}
    </div>
  );
  return (
    <div className="plan-deviation-body" role="group" aria-label={`Plan deviation ${deviation.id}`}>
      <p className="muted">
        The run departs from its plan here, and holds nothing for it{deviation.held ? ', except that it was recorded past the run\'s limit and the run waited for your decision' : ''}.
        {' '}It answers {deviation.request} of {deviation.workItems.join(', ')}. The plan file is unchanged.
      </p>
      <p><strong>The elements it amends</strong></p>
      <ul className="conflicts" aria-label="Elements it amends">
        {deviation.amends.map(element => (
          <li key={element.id}>
            <blockquote>{element.text}</blockquote>
            <span className="muted">{element.id}, from <code>{element.path}</code></span>
          </li>
        ))}
      </ul>
      <p><strong>Instead:</strong> {deviation.instead}</p>
      <p><strong>Why:</strong> {deviation.why}</p>
      <p><strong>What you lose:</strong> {deviation.loss}</p>
      {deviation.rejected.length > 0 && (
        <>
          <p><strong>Alternatives rejected</strong></p>
          <ul>{deviation.rejected.map(entry => <li key={entry.alternative}>{entry.alternative}: <span className="muted">{entry.reason}</span></li>)}</ul>
        </>
      )}
      {deviation.scenarios.map(scenario => (
        <div key={scenario.scenario} className="reworded-scenario" aria-label={`Rewording of ${scenario.scenario}`}>
          <p><strong>{scenario.scenario} reworded</strong> in <code>{scenario.file}</code></p>
          <p className="muted">Before</p>
          <pre>{scenario.before.join('\n')}</pre>
          <p className="muted">After</p>
          <pre>{scenario.after.join('\n')}</pre>
        </div>
      ))}
      {deviation.followUp !== null && <p className="follow-up"><strong>Rejected.</strong> The requirement for a follow-up run: {deviation.followUp}</p>}
    </div>
  );
}

/** How a settled CheckFinding was settled: a factual fix, an assessment, a supersession, a waiver or a deferral. */
function Settlement({ settlement }: { readonly settlement: CheckFindingSettlement }) {
  switch (settlement.kind) {
    case 'fixed-by-check': {
      const { witness } = settlement;
      return (
        <p className="settlement factual" role="group" aria-label="Factual verification">
          Verified by check: <code>{witness.obligation}</code> ran {witness.coverage === 'complete' ? 'completely' : witness.coverage} and {witness.outcome} in <code>{witness.attempt}</code> on {witness.source.kind} <code>{shortId(witness.source.id)}</code>, recorded by {actorText(settlement.by)}.
        </p>
      );
    }
    case 'fixed-by-assessment':
      return <p className="settlement" role="group" aria-label="Assessment">Fixed by assessment of {actorText(settlement.by)}: {settlement.rationale}</p>;
    case 'superseded':
      return <p className="settlement" role="group" aria-label="Supersession">Superseded by {actorText(settlement.by)}: {settlement.replacement}</p>;
    case 'waived':
      return (
        <div className="settlement waiver" role="group" aria-label="Waiver">
          <p>Waived by {actorText(settlement.by)}: {settlement.reason}</p>
          <p className="muted">Accepted risk: {settlement.acceptedRisk}. Uncertainty: {sentence(settlement.uncertainty)}</p>
        </div>
      );
    case 'deferred':
      return <p className="settlement" role="group" aria-label="Deferral">Deferred by {actorText(settlement.by)}: {sentence(settlement.reason)} Revisit: {sentence(settlement.revisit)}</p>;
  }
}

// Commands.

interface CommandScope {
  readonly client: ProtocolClient;
  readonly planId: string;
  readonly runId: string;
  readonly version: number;
  readonly summary: CheckFindingSummaryView;
}

type Status = { readonly kind: 'idle' | 'sending' | 'sent' } | { readonly kind: 'failed'; readonly message: string };

/** How many times a command is sent again at the version a stale refusal names before it is given up. */
const staleResends = 5;

/**
 * Sends one typed command at the version the list was read at. A run that
 * moved on is refused at that version, and the command is sent again at the
 * version the refusal names, a bounded number of times, since a live run can
 * append several lines between the read and the send: the CheckFinding's
 * revision still guards what the person decided about.
 */
function useCommand(client: ProtocolClient, version: number, build: (expectedVersion: number) => RunCommandInput) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const send = async () => {
    setStatus({ kind: 'sending' });
    try {
      let expectedVersion = version;
      for (let resends = 0; ; resends += 1) {
        try {
          await client.sendCommand(build(expectedVersion));
          break;
        } catch (error) {
          if (!(error instanceof ClientError) || error.code !== 'stale-version' || error.currentVersion === undefined || resends >= staleResends) throw error;
          expectedVersion = error.currentVersion;
        }
      }
      setStatus({ kind: 'sent' });
    } catch (error) {
      setStatus({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };
  return { status, send };
}

function CommandStatus({ status, what }: { readonly status: Status; readonly what: string }) {
  if (status.kind === 'sent') return <p className="muted" role="status">The {what} was accepted; the list shows it once the run has recorded it.</p>;
  if (status.kind === 'failed') return <p className="failure" role="alert">The {what} was refused: {status.message}</p>;
  return null;
}

/**
 * A request for the person's decision: the exact conflicting text with its
 * document and revision, the options with their consequences, and the
 * answer form. The Run page's banner can ask for it, and it scrolls into
 * view and takes the focus once it is shown.
 */
function DecisionRequest({ client, planId, runId, version, summary, request }: CommandScope & { readonly request: PendingUserDecision }) {
  const focus = useDecisionFocus();
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus.request !== request.request || element.current === null) return;
    element.current.scrollIntoView?.({ block: 'center' });
    element.current.focus();
    focus.done();
  }, [focus, request.request]);
  const [option, setOption] = useState('');
  const [responder, setResponder] = useState('');
  const [note, setNote] = useState('');
  const { status, send } = useCommand(client, version, expectedVersion => ({
    commandId: newCommandId(), expectedVersion, type: 'respond-to-check-finding',
    payload: {
      planId, jobId: runId, checkFinding: summary.id, expectedRevision: summary.revision, request: request.request,
      option, responder: responder.trim(), ...(note.trim() === '' ? {} : { note: note.trim() }),
    },
  }));
  const busy = status.kind === 'sending' || status.kind === 'sent';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (option === '' || responder.trim() === '') return;
    void send();
  };
  return (
    <div className="decision-request" role="group" aria-label="Decision requested" id={`decision-${request.request}`} ref={element} tabIndex={-1}>
      <p><strong>Your decision is requested.</strong> {actorText(request.by)} could not choose responsibly under its authority: {request.rationale}</p>
      <ul className="conflicts" aria-label="Conflicting text">
        {request.conflicts.map((conflict, index) => (
          <li key={index}><blockquote>{conflict.text}</blockquote><span className="muted"><code>{conflict.document}</code> at <code>{conflict.revision}</code></span></li>
        ))}
      </ul>
      {summary.userCommands.includes('respond') && (
        <form onSubmit={submit} aria-label={`Answer ${request.request}`}>
          <fieldset disabled={busy}>
            <legend>Options</legend>
            {request.options.map(choice => (
              <label key={choice.id} className="option">
                <input type="radio" name={`option-${summary.id}`} value={choice.id} checked={option === choice.id} onChange={() => setOption(choice.id)} />
                {' '}<strong>{choice.summary}</strong> <span className="muted">Consequence: {choice.consequence}</span>
              </label>
            ))}
            <label><span>Your name</span><input type="text" name="responder" value={responder} maxLength={200} required onChange={event => setResponder(event.target.value)} /></label>
            <label><span>{summary.planDeviation ? 'Note (to reject: the requirement a follow-up run must meet)' : 'Note (optional)'}</span><textarea name="note" value={note} maxLength={4000} rows={2} onChange={event => setNote(event.target.value)} /></label>
            <button type="submit" disabled={option === '' || responder.trim() === ''}>{status.kind === 'sending' ? 'Answering…' : status.kind === 'sent' ? 'Answered' : 'Answer'}</button>
          </fieldset>
        </form>
      )}
      <CommandStatus status={status} what="answer" />
    </div>
  );
}

/** Waive a signal, or revoke its waiver: a name and a reason, against the revision shown. */
function ReasonCommand({ client, planId, runId, version, summary, kind }: CommandScope & { readonly kind: 'waive' | 'revoke' }) {
  const [open, setOpen] = useState(false);
  const [responder, setResponder] = useState('');
  const [reason, setReason] = useState('');
  const { status, send } = useCommand(client, version, expectedVersion => ({
    commandId: newCommandId(), expectedVersion, type: kind === 'waive' ? 'waive-check-finding' : 'revoke-check-finding-waiver',
    payload: { planId, jobId: runId, checkFinding: summary.id, expectedRevision: summary.revision, responder: responder.trim(), reason: reason.trim() },
  }));
  const label = kind === 'waive' ? 'Waive' : 'Revoke the waiver';
  const busy = status.kind === 'sending' || status.kind === 'sent';
  if (!open) return <button type="button" onClick={() => setOpen(true)}>{label}…</button>;
  return (
    <form className="reason-command" aria-label={`${label} of ${summary.id}`} onSubmit={event => { event.preventDefault(); if (responder.trim() !== '' && reason.trim() !== '') void send(); }}>
      <p className="muted">{kind === 'waive'
        ? `Waiving keeps the code as it is and accepts this signal at its ${summary.risk} risk. It passes no gate.`
        : 'Revoking opens the signal again; the waiver stays in its history.'}</p>
      <fieldset disabled={busy}>
        <label><span>Your name</span><input type="text" name="responder" value={responder} maxLength={200} required onChange={event => setResponder(event.target.value)} /></label>
        <label><span>Reason</span><textarea name="reason" value={reason} maxLength={4000} rows={2} required onChange={event => setReason(event.target.value)} /></label>
        <button type="submit" disabled={responder.trim() === '' || reason.trim() === ''}>{status.kind === 'sending' ? 'Sending…' : status.kind === 'sent' ? 'Sent' : label}</button>
      </fieldset>
      <CommandStatus status={status} what={kind === 'waive' ? 'waiver' : 'revocation'} />
    </form>
  );
}

// History: the detail, beside its attempts, candidate diffs and repairs.

function History({ client, planId, runId, version, checkFinding, onOpenGate }: {
  readonly client: ProtocolClient; readonly planId: string; readonly runId: string; readonly version: number;
  readonly checkFinding: string; readonly onOpenGate: ((gate: string) => void) | undefined;
}) {
  const state = useRunQuery(`check-finding:${runId}:${checkFinding}`, version, () => client.getCheckFinding(planId, runId, checkFinding));
  if (state.status === 'loading') return <p className="muted">Loading the history…</p>;
  if (state.status === 'failed') return <p className="failure" role="alert">Could not load the history: {state.error.message}</p>;
  return <HistoryBody planId={planId} runId={runId} detail={state.data} onOpenGate={onOpenGate} />;
}

function gateLink(gate: string, onOpenGate: ((gate: string) => void) | undefined): ReactNode {
  return onOpenGate ? <button type="button" className="link" onClick={() => onOpenGate(gate)}>{gate}</button> : <code>{gate}</code>;
}

function HistoryBody({ planId, runId, detail, onOpenGate }: {
  readonly planId: string; readonly runId: string; readonly detail: CheckFindingDetail; readonly onOpenGate: ((gate: string) => void) | undefined;
}) {
  const session = (id: string, invocation: string, text: ReactNode) => <a href={chapterHref({ source: 'run', planId, runId, session: id }, invocation)}>{text}</a>;
  return (
    <div className="check-finding-history" aria-label={`History of ${detail.summary.id}`}>
      <h4>Reports</h4>
      <ol>
        {detail.reports.items.map(report => {
          const attempt = detail.attempts.find(link => link.report === report.id);
          return (
            <li key={report.id}>
              <p><code>{report.id}</code> from {report.producer}, attempt <code>{report.attempt}</code>: {report.observation.summary}</p>
              {report.judgment && (
                <p className="muted">
                  {actorText(report.judgment.by)} judged it {report.judgment.risk} risk: {sentence(report.judgment.consequence)} Uncertainty: {sentence(report.judgment.uncertainty)}
                  {report.judgment.remedy ? ` Remedy: ${sentence(report.judgment.remedy)}` : ''} Ground: {report.judgment.ground === null ? 'none' : <code>{report.judgment.ground}</code>} ({credibilityLabels[report.credibility]}).
                </p>
              )}
              {report.observation.locations.length > 0 && <p className="muted">At {report.observation.locations.map(location => `${location.path}${location.startLine ? `:${location.startLine}` : ''}`).join(', ')}</p>}
              {attempt && (
                <p className="muted attempt-link">
                  {attempt.kind === 'review' ? 'Review' : attempt.kind === 'gate' ? 'Gate' : 'Check'} <code>{attempt.attempt}</code>
                  {attempt.request && <> of request <code>{attempt.request}</code></>}
                  {attempt.iteration && <> on iteration {attempt.iteration}</>}
                  {attempt.gate && <>, gate {gateLink(attempt.gate, onOpenGate)}</>}
                  {attempt.session && attempt.invocation && <>, session {session(attempt.session, attempt.invocation, attempt.session)}</>}
                  . Candidate diff: <code>{shortId(attempt.candidate.base ?? '?')}</code> → <code>{shortId(attempt.candidate.commit ?? '?')}</code>
                  {attempt.candidate.tree && <> (tree <code>{shortId(attempt.candidate.tree)}</code>)</>}.
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {detail.reports.total > detail.reports.items.length && <p className="muted">The latest {detail.reports.items.length} of {detail.reports.total} reports.</p>}
      <h4>Decisions</h4>
      {detail.decisions.items.length === 0 ? <p className="muted">No decision yet.</p> : (
        <ol>{detail.decisions.items.map(decision => <li key={decision.id}><code>{decision.id}</code> by {actorText(decision.by)}: {decisionText(decision)}. <span className="muted">{decision.rationale}</span></li>)}</ol>
      )}
      {detail.decisions.total > detail.decisions.items.length && <p className="muted">The latest {detail.decisions.items.length} of {detail.decisions.total} decisions.</p>}
      {detail.repairs.length > 0 && (
        <>
          <h4>Repairs</h4>
          <ul>{detail.repairs.map(repair => (
            <li key={repair.decision}>
              <code>{repair.decision}</code>: {repair.iteration === null ? 'no correction iteration assigned yet' : <>correction iteration {repair.iteration}</>}
              {repair.reconciliation && <> for {repair.reconciliation}</>}
              {repair.sessions.map(entry => <span key={entry.invocation}>, {session(entry.session, entry.invocation, `${entry.role} ${entry.session}`)}</span>)}
            </li>
          ))}</ul>
        </>
      )}
      {detail.relations.length > 0 && (
        <>
          <h4>Relations</h4>
          <ul>{detail.relations.map(relation => (
            <li key={relation.id}>{relation.from.checkFinding} and {relation.to.checkFinding}: {relation.relation}, by {actorText(relation.by)}. <span className="muted">{sentence(relation.shared)} {relation.rationale}</span></li>
          ))}</ul>
        </>
      )}
    </div>
  );
}

function decisionText(decision: CheckFindingDecisionView): string {
  const action = decision.action;
  const risk = decision.risk === null ? '' : `, correcting the risk to ${decision.risk}`;
  switch (action.action) {
    case 'plan-repair': return `planned a repair (${action.repair.kind} ${action.repair.ref})${risk}`;
    case 'claim-repair': return `claimed a repair by ${action.change} on ${action.candidate.kind} ${shortId(action.candidate.id)}${risk}`;
    case 'fix-by-check': return `fixed by check: ${action.witness.obligation} ${action.witness.outcome} in ${action.witness.attempt}${risk}`;
    case 'fix-by-assessment': return `fixed by assessment of ${action.reassessed.join(', ')}${risk}`;
    case 'supersede': return `superseded: ${action.replacement}${risk}`;
    case 'waive': return `waived, accepting ${action.acceptedRisk} risk under ${action.authority}${risk}`;
    case 'revoke-waiver': return `revoked the waiver: ${action.reason}`;
    case 'defer': return `deferred; revisit ${action.revisit}${risk}`;
    case 'request-user-decision': return `requested a person's decision among ${action.options.map(option => option.id).join(', ')}`;
    case 'answer-user-decision': return `answered ${action.request} with ${action.option}`;
    case 'reopen': return `reopened (${action.cause})`;
    case 'revise-obligation': return `revised the obligation from ${action.from} to ${action.to}`;
  }
}

// The run's plan deviations.

/**
 * Every plan deviation of the run, whatever module it concerns, for the
 * person to accept or reject. They lead the run's attention order, so the
 * first page holds them.
 */
export function PlanDeviations({ client, planId, runId, version, onOpenGate }: Scope & { readonly onOpenGate?: (gate: string) => void }) {
  const state = useRunQuery(`plan-deviations:${runId}`, version, () => client.getCheckFindings(planId, runId, { select: 'all', order: 'attention' }));
  return (
    <section className="panel" aria-labelledby="plan-deviations-heading">
      <h2 id="plan-deviations-heading">Plan deviations</h2>
      {state.status === 'loading' && <p className="muted">Loading the plan deviations…</p>}
      {state.status === 'failed' && <p className="failure" role="alert">Could not load the plan deviations: {state.error.message}</p>}
      {state.status === 'ready' && (() => {
        const deviations = state.data.items.filter(summary => summary.planDeviation !== null);
        return deviations.length === 0 ? <p className="muted">No plan deviation.</p> : (
          <>
            <p className="muted">Where a requirement could not be met as written, the run recorded a deviation for your review. Accept each one, by waiving it or answering accept, or reject it with the requirement a follow-up run must meet.</p>
            <ul className="cards check-finding-cards">{deviations.map(summary => (
              <CheckFindingCard key={summary.id} client={client} planId={planId} runId={runId} version={state.data.version} summary={summary} onOpenGate={onOpenGate} />
            ))}</ul>
          </>
        );
      })()}
    </section>
  );
}

// The run's environment problems.

/** What the operator's answer to an environment problem did, in words. */
const environmentAnswerText: Readonly<Record<RunEnvironmentProblem['answer'], string>> = {
  waiting: 'The run holds this work item until you answer: resume it once the environment is corrected, or end the run.',
  resumed: 'You resumed the run; the work item returned to its local architect with this diagnosis.',
  ended: 'You ended the run.',
};

/**
 * Every environment problem the global architect reported: the conflict
 * lies in how the gate or the harness runs, not in the plan or the
 * architecture. Each shows its work item, request, diagnosis and suggestion,
 * and one still waiting shows its CheckFinding's answer form.
 */
export function EnvironmentProblems({ client, planId, runId, version, problems, onOpenGate }: Scope & {
  readonly problems: readonly RunEnvironmentProblem[];
  readonly onOpenGate?: (gate: string) => void;
}) {
  const waiting = new Set(problems.filter(problem => problem.answer === 'waiting').map(problem => problem.checkFinding));
  const state = useRunQuery(`environment-problems:${runId}`, version, () => client.getCheckFindings(planId, runId, { select: 'all', order: 'attention' }));
  return (
    <section className="panel" aria-labelledby="environment-problems-heading">
      <h2 id="environment-problems-heading">Environment problems</h2>
      <ul className="cards">
        {problems.map(problem => (
          <li key={problem.problem} className={`card environment-problem environment-problem-${problem.answer}`} aria-label={`Environment problem ${problem.problem}`}>
            <p><strong>{problem.problem}</strong>: work item {problem.workItem}, request {problem.request}, CheckFinding <code>{problem.checkFinding}</code>.</p>
            <p><strong>Diagnosis:</strong> {problem.diagnosis}</p>
            <p><strong>Suggestion:</strong> {problem.suggestion}</p>
            <p className="muted">{environmentAnswerText[problem.answer]}</p>
          </li>
        ))}
      </ul>
      {waiting.size > 0 && state.status === 'failed' && <p className="failure" role="alert">Could not load the answer forms: {state.error.message}</p>}
      {waiting.size > 0 && state.status === 'ready' && (
        <ul className="cards check-finding-cards">
          {state.data.items.filter(summary => waiting.has(summary.id) && summary.pendingUserDecision !== null).map(summary => (
            <CheckFindingCard key={summary.id} client={client} planId={planId} runId={runId} version={state.data.version} summary={summary} onOpenGate={onOpenGate} />
          ))}
        </ul>
      )}
    </section>
  );
}

// The run's CheckFindings by module.

/**
 * The unsettled CheckFindings of every module they concern, and the
 * decisions awaiting a person. A CheckFinding of two modules counts in
 * both, so the rows do not add up to the run's count. Choosing a module
 * opens its list.
 */
export function ModuleCheckFindings({ client, planId, runId, version, onOpenGate }: Scope & { readonly onOpenGate?: (gate: string) => void }) {
  const state = useRunQuery(`check-finding-modules:${runId}`, version, () => client.getCheckFindingModules(planId, runId));
  const [module, setModule] = useState<string | undefined>(undefined);
  return (
    <section className="panel" aria-labelledby="check-findings-heading">
      <h2 id="check-findings-heading">CheckFindings</h2>
      {state.status === 'loading' && <p className="muted">Loading the CheckFindings…</p>}
      {state.status === 'failed' && <p className="failure" role="alert">Could not load the CheckFindings: {state.error.message}</p>}
      {state.status === 'ready' && (() => {
        const decisions = state.data.modules.some(row => row.pendingUserDecisions > 0);
        return (
          <>
            <p className={`review-coverage review-coverage-${coverageState(state.data.coverage)}`} aria-label="Review coverage">{coverageText(state.data.coverage)}</p>
            {decisions && <p className="warn" role="status">A decision is requested of you. Open the module or its work item to answer it.</p>}
            {state.data.modules.length === 0 ? <p className="muted">No CheckFinding has been recorded.</p> : (
              <table className="table" aria-label="CheckFindings by module">
                <thead><tr><th>Module</th><th>Open</th><th>Unresolved</th><th>Deferred</th><th>Highest open risk</th><th>Decisions requested</th></tr></thead>
                <tbody>{state.data.modules.map(row => (
                  <tr key={row.module}>
                    <td><button type="button" className="link" aria-pressed={module === row.module} onClick={() => setModule(row.module)}>{row.module}</button></td>
                    <td>{row.open}</td><td>{row.unresolved}</td><td>{row.deferred}</td>
                    <td>{row.highestOpenRisk ?? '—'}</td><td>{row.pendingUserDecisions}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {module && <CheckFindingList client={client} planId={planId} runId={runId} version={version} filter={{ module }} {...(onOpenGate ? { onOpenGate } : {})} />}
          </>
        );
      })()}
    </section>
  );
}
