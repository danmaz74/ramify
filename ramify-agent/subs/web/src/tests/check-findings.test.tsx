import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import {
  checkFindingDetailSchema, checkFindingListResponseSchema, checkFindingModuleCountsSchema, checkFindingSummarySchema, reviewListResponseSchema,
  reviewRequestViewSchema,
  type CheckFindingListResponse, type CheckFindingSummaryView, type ReviewCoverageView, type ReviewListResponse,
} from '../../../harness/src/interfaces/protocol/check-findings.js';
import { runSnapshotSchema } from '../../../harness/src/interfaces/protocol/runs.js';
import { CheckFindingList, ModuleCheckFindings, PlanDeviations, WorkItemCheckFindings } from '../check-findings.js';
import { ClientError } from '../client.js';
import { checkFindingKey, StubClient } from './helpers/stub-client.js';

afterEach(cleanup);

const planId = 'review-notes';
const runId = '20260924T120000Z-cf0007';
const version = 40;
const at = '2026-09-24T12:00:00.000Z';

function snapshot() {
  return runSnapshotSchema.parse({
    jobId: runId, planId, agent: 'scripted', version, state: 'running', phase: 'working', stopRequested: false,
    startedAt: at, updatedAt: at, endedAt: null, failure: null, current: null, waits: [],
    counts: { workItems: 1, completedWorkItems: 0, openRequirements: 0, invocations: 3, readinessAttempts: 1, gateAttempts: 2, scenarios: { pending: 0, bound: 0, declared: 0, implemented: 0 }, degradedStarts: 0 },
    writer: { held: null, unsettled: null }, review: 'not-reviewed', notices: [], decisionRequests: { open: 0, waiting: false, workItems: [] }, planDeviations: { recorded: 0, toReview: 0 },
  });
}

const reviewer = { kind: 'agent', role: 'reviewer', invocation: 'inv-0010' } as const;
const architect = { kind: 'agent', role: 'local-architect', invocation: 'inv-0020' } as const;

function summary(id: string, extra: Partial<CheckFindingSummaryView> = {}): CheckFindingSummaryView {
  return checkFindingSummarySchema.parse({
    id, revision: 1, workItem: 'wi-001', standing: 'open', reason: 'new', awaiting: 'assessment', verification: 'assessment',
    obligation: null, required: false, risk: 'medium', credibility: 'human-reviewed', modules: ['project/cart'], unresolved: null,
    latestReview: false, settlement: null, pendingUserDecision: null, materialChoice: null, repair: null, producers: ['review:code'],
    title: `Signal ${id}`, reports: 1, decisions: 0, group: null, userCommands: ['waive'], planDeviation: null, ...extra,
  });
}

const counts = { total: 0, open: 0, deferred: 0, closed: 0, fixed: 0, waived: 0, superseded: 0, unresolved: 0, awaitingUser: 0 };

function list(items: CheckFindingSummaryView[], select: 'reported' | 'all', extra: Partial<CheckFindingListResponse> = {}): CheckFindingListResponse {
  return checkFindingListResponseSchema.parse({
    protocol: 'check-findings/1', runId, version, coverage: { state: 'available', requested: 3, complete: 3, partial: 0, notVerified: 0, pending: 0 },
    query: { workItem: 'wi-001', module: null, select, order: 'attention' }, total: items.length, shown: items.length, next: null,
    counts: { ...counts, total: items.length }, items, ...extra,
  });
}

function reviews(coverage: ReviewCoverageView, requests: ReviewListResponse['requests'] = []): ReviewListResponse {
  return reviewListResponseSchema.parse({ protocol: 'check-findings/1', runId, version, coverage, workItem: 'wi-001', total: requests.length, shown: requests.length, next: null, requests });
}

function request(id: string, kind: 'code' | 'scope' | 'design', result: 'complete' | 'partial' | 'not-verified' | null, attempt: { concerns?: number; missing?: number; reason?: string } = {}) {
  return reviewRequestViewSchema.parse({
    id, workItem: 'wi-001', iteration: 'wi-001.i01', kind, gate: 'ga-0004', base: 'b'.repeat(40), candidate: 'c'.repeat(40), recordedAt: at,
    result, settledBy: result === null ? null : `${id}.a01`,
    attempts: result === null ? [] : [{
      id: `${id}.a01`, state: 'finished', invocation: 'inv-0011', session: 'ses-0005', requestedStart: 'fresh', actualStart: 'fresh',
      result, reason: attempt.reason ?? null, detail: null, inspected: 2, missing: attempt.missing ?? 0, concerns: attempt.concerns ?? 0, settles: true, checkFindings: [],
    }],
  });
}

function client(run: Partial<Parameters<StubClient['runs']['set']>[1]> = {}) {
  const stub = new StubClient();
  stub.runs.set(runId, { snapshot: snapshot(), events: [], ...run });
  return stub;
}

function renderWorkItem(stub: StubClient) {
  return render(<WorkItemCheckFindings client={stub} planId={planId} runId={runId} version={version} workItem="wi-001" />);
}

test('review coverage reads clean, complete with concerns, partial, not verified and pending per request, and unavailable is never clean', async () => {
  const complete = client({
    reviews: { 'wi-001': reviews({ state: 'available', requested: 2, complete: 2, partial: 0, notVerified: 0, pending: 0 }, [
      request('rq-0001', 'code', 'complete'), request('rq-0002', 'scope', 'complete', { concerns: 2 }),
    ]) },
    checkFindings: { [checkFindingKey({ workItem: 'wi-001', select: 'reported' })]: list([], 'reported') },
  });
  renderWorkItem(complete);
  expect(await screen.findByLabelText('Review coverage')).toHaveProperty('textContent', expect.stringMatching(/^Review coverage complete: 2 complete/));
  const rows = within(screen.getByRole('table', { name: 'Review requests' })).getAllByRole('row').slice(1);
  expect(rows.map(row => within(row).getAllByRole('cell')[4]!.textContent)).toEqual(['clean', 'complete, 2 concerns']);
  // A Git object ID is shortened to 12 characters; any other candidate identifier is shown whole.
  expect(within(rows[0]!).getAllByRole('cell')[3]!.textContent).toBe(`${'b'.repeat(12)} → ${'c'.repeat(12)}`);
  cleanup();

  const partial = client({
    reviews: { 'wi-001': reviews({ state: 'available', requested: 3, complete: 1, partial: 1, notVerified: 1, pending: 0 }, [
      request('rq-0001', 'code', 'complete'), request('rq-0002', 'scope', 'partial', { missing: 1 }),
      { ...request('rq-0003', 'design', 'not-verified', { reason: 'timed-out' }), base: 'revision-01', candidate: 'revision-02' },
    ]) },
  });
  renderWorkItem(partial);
  expect(await screen.findByLabelText('Review coverage')).toHaveProperty('textContent', expect.stringMatching(/^Review coverage partial: 1 complete, 1 partial, 1 not verified/));
  const partialRows = within(screen.getByRole('table', { name: 'Review requests' })).getAllByRole('row').slice(1);
  expect(partialRows.map(row => within(row).getAllByRole('cell')[4]!.textContent)).toEqual(['clean', 'partial: 1 path not inspected, 0 concerns', 'not verified (timed-out)']);
  expect(within(partialRows[2]!).getAllByRole('cell')[3]!.textContent).toBe('revision-01 → revision-02');
  cleanup();

  // A run whose policy requested no reviews: no CheckFinding, and still not clean.
  const old = client();
  renderWorkItem(old);
  const unavailable = await screen.findByLabelText('Review coverage');
  expect(unavailable.textContent).toMatch(/^Review coverage unavailable: this run's policy requested no reviews/);
  expect(unavailable.textContent).toMatch(/not a clean review/);
  expect(unavailable.className).toContain('review-coverage-unavailable');
  expect(screen.queryByText(/clean/, { selector: 'td' })).toBeNull();
});

test('fixed, superseded, waived, deferred, unresolved and open CheckFindings read apart, with the latest review marked and no generic resolve', async () => {
  const items = [
    summary('cf-0007', { standing: 'closed', reason: 'fixed-by-check', awaiting: null, verification: 'check', required: true, obligation: 'scenario:sc-004@1', risk: 'high',
      credibility: 'objective-reproduced', userCommands: [],
      settlement: { kind: 'fixed-by-check', decision: 'cfd-0007', by: { kind: 'harness', reason: 'the scenario adapter' },
        witness: { producer: 'check:scenario', attempt: 'ga-0012', obligation: 'scenario:sc-004@1', source: { kind: 'tree', id: 't-03' }, coverage: 'complete', outcome: 'passed' } } }),
    summary('cf-0004', { risk: 'high', unresolved: 'rounds-exhausted', latestReview: true }),
    summary('cf-0003', { standing: 'closed', reason: 'waived', awaiting: null, risk: 'high', userCommands: ['revoke'],
      settlement: { kind: 'waived', decision: 'cfd-0003', by: architect, reason: 'The cache is rebuilt on start', acceptedRisk: 'high', uncertainty: 'little' },
      materialChoice: { decision: 'cfd-0003', action: 'waive', choice: 'kept the cache', uncertainty: 'a later change may need invalidation', reason: 'a high risk was accepted' } }),
    summary('cf-0001', { standing: 'closed', reason: 'fixed-by-assessment', awaiting: null, userCommands: [],
      settlement: { kind: 'fixed-by-assessment', decision: 'cfd-0001', by: architect, rationale: 'The rounding now uses cents' } }),
    summary('cf-0008', { standing: 'deferred', reason: 'deferred', awaiting: null, risk: 'low',
      settlement: { kind: 'deferred', decision: 'cfd-0005', by: architect, reason: 'Logging is configured later.', revisit: 'when logging is configured' } }),
    summary('cf-0005', { risk: 'low', unresolved: 'below-floor' }),
    summary('cf-0002', { standing: 'closed', reason: 'superseded', awaiting: null, risk: 'low', userCommands: [],
      settlement: { kind: 'superseded', decision: 'cfd-0002', by: architect, replacement: 'The name follows the glossary' } }),
    summary('cf-0010', { risk: 'medium' }),
  ];
  const reported = items.filter(item => item.standing === 'open' || item.materialChoice !== null);
  const stub = client({ checkFindings: {
    [checkFindingKey({ workItem: 'wi-001', select: 'reported' })]: list(reported, 'reported', { counts: { total: 8, open: 3, deferred: 1, closed: 4, fixed: 2, waived: 1, superseded: 1, unresolved: 2, awaitingUser: 0 } }),
    [checkFindingKey({ workItem: 'wi-001', select: 'all' })]: list(items, 'all'),
  } });
  renderWorkItem(stub);

  // By default: the open signals and the reported material choice, nothing settled otherwise.
  await screen.findByRole('listitem', { name: 'CheckFinding cf-0004' });
  expect(screen.getAllByRole('listitem').filter(item => item.getAttribute('aria-label')?.startsWith('CheckFinding')).map(item => item.getAttribute('aria-label')))
    .toEqual(['CheckFinding cf-0004', 'CheckFinding cf-0003', 'CheckFinding cf-0005', 'CheckFinding cf-0010']);
  expect(screen.getByLabelText('CheckFinding counts').textContent).toMatch(/3 open \(2 unresolved, 0 awaiting a decision\), 1 deferred; settled: 2 fixed, 1 waived, 1 superseded\./);
  expect(stub.calls).toContain(`getCheckFindings:${runId}:wi-001||reported`);

  fireEvent.click(screen.getByRole('checkbox', { name: 'Show settled signals' }));
  await screen.findByRole('listitem', { name: 'CheckFinding cf-0007' });
  const card = (id: string) => screen.getByRole('listitem', { name: `CheckFinding ${id}` });
  const standing = (id: string) => within(card(id)).getByLabelText('Standing').textContent;
  expect(['cf-0007', 'cf-0001', 'cf-0002', 'cf-0003', 'cf-0008', 'cf-0004', 'cf-0010'].map(standing)).toEqual([
    'Fixed, verified by the same check', 'Fixed, by a fresh assessment', 'Superseded', 'Waived', 'Deferred', 'Open: not yet assessed', 'Open: not yet assessed',
  ]);
  // The factual fix is shown as a verification, apart from judgments.
  expect(within(card('cf-0007')).getByRole('group', { name: 'Factual verification' }).textContent)
    .toMatch(/scenario:sc-004@1 ran completely and passed in ga-0012 on tree t-03/);
  expect(within(card('cf-0001')).queryByRole('group', { name: 'Factual verification' })).toBeNull();
  // The waiver names its actor and the risk accepted; its material choice is shown apart.
  expect(within(card('cf-0003')).getByRole('group', { name: 'Waiver' }).textContent).toMatch(/Waived by local-architect \(inv-0020\): The cache is rebuilt on start.*Accepted risk: high/);
  expect(within(card('cf-0003')).getByRole('group', { name: 'Material choice' }).textContent).toMatch(/kept the cache/);
  // Recorded prose that already ends with a period gets no second one.
  expect(within(card('cf-0008')).getByRole('group', { name: 'Deferral' }).textContent)
    .toBe('Deferred by local-architect (inv-0020): Logging is configured later. Revisit: when logging is configured.');
  // Unresolved, and the distinct marker for a non-low signal from the latest review.
  expect(within(card('cf-0004')).getByLabelText('Unresolved').textContent).toMatch(/^Unresolved from the latest review: a high-risk signal/);
  expect(within(card('cf-0004')).getByLabelText('Unresolved').className).toContain('unresolved-latest');
  expect(within(card('cf-0005')).getByLabelText('Unresolved').textContent).toBe('Unresolved: below the last round\'s floor. The work item completed with it open.');
  expect(within(card('cf-0010')).queryByLabelText('Unresolved')).toBeNull();
  // The actions are only the typed commands the harness names; nothing marks a signal resolved.
  expect(within(card('cf-0007')).queryByRole('button', { name: /Waive|Revoke/ })).toBeNull();
  expect(within(card('cf-0003')).getByRole('button', { name: 'Revoke the waiver…' })).toBeTruthy();
  expect(within(card('cf-0010')).getByRole('button', { name: 'Waive…' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /resolve/i })).toBeNull();
  expect(screen.queryByText(/resolved/i, { selector: '[aria-label="Standing"]' })).toBeNull();
});

test('a decision request is a question with its exact text and options, apart from any risk level; the answer is a typed command', async () => {
  const items = [
    summary('cf-0009', { risk: 'high', reason: 'repair-planned', awaiting: 'repair', repair: { kind: 'intent', ref: 'wi-001.rc01' } }),
    summary('cf-0006', { revision: 2, reason: 'awaiting-user-decision', awaiting: 'user-decision', risk: 'medium', userCommands: ['respond'], pendingUserDecision: {
      request: 'cfd-0004', by: architect, rationale: 'The plan asks for a list and the code returns a page',
      conflicts: [{ text: 'The API returns a list.', document: 'plans/review-notes/plan.md', revision: 'sha256:plan' }],
      options: [{ id: 'keep', summary: 'Keep the page', consequence: 'The plan text is not met' }, { id: 'list', summary: 'Return a list', consequence: 'Callers change' }],
    } }),
  ];
  const stub = client({ checkFindings: { [checkFindingKey({ workItem: 'wi-001', select: 'reported' })]: list(items, 'reported') } });
  renderWorkItem(stub);
  const high = await screen.findByRole('listitem', { name: 'CheckFinding cf-0009' });
  // A high risk is a label: it asks nothing.
  expect(within(high).getByText('high risk')).toBeTruthy();
  expect(within(high).queryByRole('group', { name: 'Decision requested' })).toBeNull();
  const asking = screen.getByRole('listitem', { name: 'CheckFinding cf-0006' });
  const question = within(asking).getByRole('group', { name: 'Decision requested' });
  expect(within(question).getByRole('list', { name: 'Conflicting text' }).textContent).toMatch(/The API returns a list\.plans\/review-notes\/plan\.md at sha256:plan/);
  expect(within(asking).getByText('medium risk').closest('[role="group"]')).toBeNull();

  // The first send is at the list's version; each stale refusal is answered again at the version it
  // names, since a live run can append several lines between the read and the send.
  stub.commandRefusals.push(new ClientError('protocol', 'The job is at version 41, not 40', 'stale-version', 41));
  stub.commandRefusals.push(new ClientError('protocol', 'The job is at version 42, not 41', 'stale-version', 42));
  fireEvent.click(within(question).getByRole('radio', { name: /Return a list/ }));
  fireEvent.change(within(question).getByRole('textbox', { name: 'Your name' }), { target: { value: 'dan' } });
  fireEvent.change(within(question).getByRole('textbox', { name: 'Note (optional)' }), { target: { value: 'Callers can change' } });
  fireEvent.click(within(question).getByRole('button', { name: 'Answer' }));
  await within(question).findByRole('status');
  expect(stub.commands.map(command => [command.type, command.expectedVersion])).toEqual([['respond-to-check-finding', 40], ['respond-to-check-finding', 41], ['respond-to-check-finding', 42]]);
  expect(stub.commands[2]).toMatchObject({ payload: { planId, jobId: runId, checkFinding: 'cf-0006', expectedRevision: 2, request: 'cfd-0004', option: 'list', responder: 'dan', note: 'Callers can change' } });
  expect(new Set(stub.commands.map(command => command.commandId)).size).toBe(3);
});

test('waive and revoke send their typed commands against the revision shown, and a refusal says why', async () => {
  const items = [
    summary('cf-0010', { revision: 3 }),
    summary('cf-0003', { revision: 4, standing: 'closed', reason: 'waived', awaiting: null, userCommands: ['revoke'],
      settlement: { kind: 'waived', decision: 'cfd-0003', by: architect, reason: 'fine', acceptedRisk: 'medium', uncertainty: 'little' } }),
  ];
  const stub = client({ checkFindings: { [checkFindingKey({ workItem: 'wi-001', select: 'reported' })]: list(items, 'reported') } });
  renderWorkItem(stub);
  const open = await screen.findByRole('listitem', { name: 'CheckFinding cf-0010' });
  fireEvent.click(within(open).getByRole('button', { name: 'Waive…' }));
  const waive = within(open).getByRole('form', { name: 'Waive of cf-0010' });
  expect(waive.textContent).toMatch(/accepts this signal at its medium risk\. It passes no gate\./);
  fireEvent.change(within(waive).getByRole('textbox', { name: 'Your name' }), { target: { value: 'dan' } });
  fireEvent.change(within(waive).getByRole('textbox', { name: 'Reason' }), { target: { value: 'Logging is configured elsewhere' } });
  fireEvent.click(within(waive).getByRole('button', { name: 'Waive' }));
  await within(waive).findByRole('status');
  expect(stub.commands.at(-1)).toMatchObject({ type: 'waive-check-finding', expectedVersion: 40,
    payload: { checkFinding: 'cf-0010', expectedRevision: 3, responder: 'dan', reason: 'Logging is configured elsewhere' } });

  const waived = screen.getByRole('listitem', { name: 'CheckFinding cf-0003' });
  stub.commandRefusals.push(new ClientError('protocol', 'cf-0003 is at revision 5, not 4: it changed since it was read', 'conflict', undefined, ['cf-0003 is at revision 5']));
  fireEvent.click(within(waived).getByRole('button', { name: 'Revoke the waiver…' }));
  const revoke = within(waived).getByRole('form', { name: 'Revoke the waiver of cf-0003' });
  fireEvent.change(within(revoke).getByRole('textbox', { name: 'Your name' }), { target: { value: 'dan' } });
  fireEvent.change(within(revoke).getByRole('textbox', { name: 'Reason' }), { target: { value: 'The cache matters' } });
  fireEvent.click(within(revoke).getByRole('button', { name: 'Revoke the waiver' }));
  expect((await within(revoke).findByRole('alert')).textContent).toBe('The revocation was refused: cf-0003 is at revision 5, not 4: it changed since it was read');
  expect(stub.commands.at(-1)).toMatchObject({ type: 'revoke-check-finding-waiver', payload: { checkFinding: 'cf-0003', expectedRevision: 4 } });
});

test('the history sits beside its attempt, candidate diff and repair session', async () => {
  const stub = client({
    checkFindings: { [checkFindingKey({ workItem: 'wi-001', select: 'reported' })]: list([summary('cf-0009', { reason: 'repair-planned', awaiting: 'repair', decisions: 1 })], 'reported') },
    checkFindingDetails: { 'cf-0009': checkFindingDetailSchema.parse({
      protocol: 'check-findings/1', runId, version, summary: summary('cf-0009', { reason: 'repair-planned', awaiting: 'repair', decisions: 1 }),
      reports: { total: 1, items: [{ id: 'cfr-0009', producer: 'review:code', attempt: 'rq-0005.a01', source: { kind: 'tree', id: 'tree-03' },
        observation: { kind: 'review-concern', summary: 'The retry never stops', locations: [{ path: 'src/retry.ts', startLine: 12, endLine: 20 }], evidence: [] },
        judgment: { by: reviewer, consequence: 'A failing upstream spins forever', rationale: 'read the loop', uncertainty: 'low', remedy: 'bound the loop', risk: 'high', ground: 'docs/retry.principles.md' },
        credibility: 'human-reviewed', modules: ['project/cart'] }] },
      decisions: { total: 1, items: [{ id: 'cfd-0006', considered: 1, by: architect, rationale: 'bound the retries', risk: null, materialChoice: null,
        action: { action: 'plan-repair', repair: { kind: 'intent', ref: 'wi-001.rc01' } } }] },
      relations: [],
      attempts: [{ report: 'cfr-0009', kind: 'review', attempt: 'rq-0005.a01', request: 'rq-0005', iteration: 'wi-001.i01', gate: 'ga-0005',
        session: 'ses-0007', invocation: 'inv-0015', candidate: { base: 'b'.repeat(40), commit: 'c'.repeat(40), tree: 'tree-03' } }],
      repairs: [{ decision: 'cfd-0006', reconciliation: 'wi-001.rc01', iteration: 'wi-001.i02', sessions: [{ session: 'ses-0009', invocation: 'inv-0030', role: 'engineer' }] }],
    }) },
  });
  const opened: string[] = [];
  render(<CheckFindingList client={stub} planId={planId} runId={runId} version={version} filter={{ workItem: 'wi-001' }} onOpenGate={gate => opened.push(gate)} />);
  const card = await screen.findByRole('listitem', { name: 'CheckFinding cf-0009' });
  expect(stub.calls.some(call => call.startsWith('getCheckFinding:'))).toBe(false);
  fireEvent.click(within(card).getByRole('button', { name: 'History' }));
  const history = await within(card).findByLabelText('History of cf-0009');
  expect(history.textContent).toMatch(/reviewer \(inv-0010\) judged it high risk: A failing upstream spins forever/);
  expect(history.textContent).toMatch(/Candidate diff: bbbbbbbbbbbb → cccccccccccc \(tree tree-03\)/);
  expect(within(history).getByRole('link', { name: 'ses-0007' }).getAttribute('href')).toContain('ses-0007');
  expect(within(history).getByRole('link', { name: 'engineer ses-0009' }).getAttribute('href')).toContain('inv-0030');
  expect(history.textContent).toMatch(/cfd-0006 by local-architect \(inv-0020\): planned a repair \(intent wi-001\.rc01\)/);
  fireEvent.click(within(history).getByRole('button', { name: 'ga-0005' }));
  expect(opened).toEqual(['ga-0005']);
});

test('the run\'s modules show their unsettled counts, which do not sum to the run\'s, and one opens its list', async () => {
  const stub = client({
    checkFindingModules: checkFindingModuleCountsSchema.parse({ protocol: 'check-findings/1', runId, version,
      coverage: { state: 'available', requested: 5, complete: 3, partial: 1, notVerified: 0, pending: 1 },
      modules: [
        { module: 'project/cart', open: 3, deferred: 0, unresolved: 2, highestOpenRisk: 'high', pendingUserDecisions: 1 },
        { module: 'project/checkout', open: 2, deferred: 1, unresolved: 0, highestOpenRisk: 'medium', pendingUserDecisions: 1 },
      ] }),
    checkFindings: { [checkFindingKey({ module: 'project/checkout', select: 'reported' })]: list([summary('cf-0006', { modules: ['project/checkout', 'project/cart'] })], 'reported',
      { query: { workItem: null, module: 'project/checkout', select: 'reported', order: 'attention' } }) },
  });
  render(<ModuleCheckFindings client={stub} planId={planId} runId={runId} version={version} />);
  const table = await screen.findByRole('table', { name: 'CheckFindings by module' });
  expect(within(table).getAllByRole('row').slice(1).map(row => row.textContent)).toEqual(['project/cart320high1', 'project/checkout201medium1']);
  expect(screen.getByLabelText('Review coverage').textContent).toMatch(/^Review coverage partial/);
  expect(screen.getByRole('status').textContent).toMatch(/A decision is requested of you/);
  fireEvent.click(within(table).getByRole('button', { name: 'project/checkout' }));
  await screen.findByRole('listitem', { name: 'CheckFinding cf-0006' });
  expect(stub.calls).toContain(`getCheckFindings:${runId}:|project/checkout|reported`);
});

test('a plan deviation reads as a departure from the plan: its requirement as written, what the run does instead, and a reworded scenario before and after', async () => {
  const deviation = summary('cf-0004', {
    workItem: null, revision: 2, reason: 'awaiting-user-decision', awaiting: 'user-decision', risk: 'high', credibility: 'agent-generated',
    producers: ['plan:deviation'], title: 'Plan deviation pd-001: tRPC only', userCommands: ['respond', 'waive'],
    pendingUserDecision: {
      request: 'cfd-0005', by: { kind: 'harness', reason: 'a plan deviation is the person\'s to accept or reject' }, rationale: 'The global architect departs from the plan',
      conflicts: [{ text: 'Serve it over MCP too.', document: 'plans/review-notes/plan.md', revision: 'sha256:plan' }],
      options: [{ id: 'accept', summary: 'Accept the deviation', consequence: 'It stands.' }, { id: 'reject', summary: 'Reject the deviation', consequence: 'A follow-up run meets it.' }],
    },
    planDeviation: {
      id: 'pd-001', request: 'ur-001', workItems: ['wi-001'], plan: 'plans/review-notes/plan.md',
      requirements: [{ startLine: 11, endLine: 12, text: 'Serve it over MCP too.' }],
      instead: 'Serve it over tRPC only.', why: 'No module serves MCP.', rejected: [{ alternative: 'A new MCP module', reason: 'beyond the plan' }], loss: 'No MCP tool.',
      scenarios: [{ scenario: 'sc-002', file: 'src/tests/features/p/e.feature', before: ['Scenario: over MCP'], after: ['Scenario: over tRPC'] }],
      held: false, followUp: null,
    },
  });
  const stub = client({ checkFindings: { [checkFindingKey({ select: 'all' })]: list([deviation, summary('cf-0001', { risk: 'high' })], 'all', { query: { workItem: null, module: null, select: 'all', order: 'attention' } }) } });
  render(<PlanDeviations client={stub} planId={planId} runId={runId} version={version} />);
  const card = await screen.findByRole('listitem', { name: 'CheckFinding cf-0004' });
  // Only the deviation is listed here, labelled as one.
  expect(screen.queryByRole('listitem', { name: 'CheckFinding cf-0001' })).toBeNull();
  expect(within(card).getByText('Plan deviation')).toBeTruthy();
  const body = within(card).getByRole('group', { name: 'Plan deviation pd-001' });
  expect(within(body).getByRole('list', { name: 'Requirement as written' }).textContent).toMatch(/Serve it over MCP too\.plans\/review-notes\/plan\.md, lines 11–12/);
  expect(body.textContent).toMatch(/Instead: Serve it over tRPC only\./);
  expect(body.textContent).toMatch(/What you lose: No MCP tool\./);
  const reworded = within(body).getByLabelText('Rewording of sc-002');
  expect(reworded.textContent).toMatch(/BeforeScenario: over MCPAfterScenario: over tRPC/);
  // It asks the person: accept or reject, with the note a rejection needs; or waive it.
  const question = within(card).getByRole('group', { name: 'Decision requested' });
  expect(within(question).getByRole('textbox', { name: /Note \(to reject: the requirement a follow-up run must meet\)/ })).toBeTruthy();
  expect(within(card).getByRole('button', { name: 'Waive…' })).toBeTruthy();
});
