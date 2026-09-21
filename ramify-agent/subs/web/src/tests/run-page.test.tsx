import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import {
  analysisResponseSchema, capabilityListResponseSchema, decisionListResponseSchema, gateViewSchema, metricsResponseSchema,
  runSnapshotSchema, type RunSnapshot,
} from '../../../harness/src/interfaces/protocol/runs.js';
import { ClientError } from '../client.js';
import { RunPage } from '../run-page.js';
import { StubClient, type StubRun } from './helpers/stub-client.js';

afterEach(cleanup);

const runId = '20260921T080000Z-c0ffee';
const at = '2026-09-21T08:00:00.000Z';

function snapshot(extra: Partial<RunSnapshot> = {}): RunSnapshot {
  return runSnapshotSchema.parse({
    jobId: runId, planId: 'review-notes', agent: 'scripted', version: 12, state: 'running', phase: 'working', stopRequested: false,
    startedAt: at, updatedAt: at, endedAt: null, failure: null,
    current: { workItem: 'wi-002', iteration: 'wi-002.i01', role: 'engineer', invocation: 'inv-0006' },
    waits: [],
    counts: { workItems: 2, completedWorkItems: 1, openRequirements: 0, invocations: 6, readinessAttempts: 1, gateAttempts: 3 },
    writer: { held: 'inv-0006', unsettled: null },
    notices: [
      {
        kind: 'module-created', at, sequence: 9, summary: 'Module created: shop/notes/drafts (subs/drafts/module.ramify) in wi-002.i01, commit abc. No placement decision proposed it.',
        module: 'shop/notes/drafts', declaration: 'subs/drafts/module.ramify', commit: 'abcdef1234567890', iteration: 'wi-002.i01', decision: null,
      },
      { kind: 'dependency-cycle', at, sequence: 7, summary: 'A capability depends on itself: a → b → a. Closed by wi-001; the re-plan resolved it.', cycle: ['a', 'b'], closedBy: 'wi-001', resolved: true },
    ],
    ...extra,
  });
}

function stubRun(extra: Partial<RunSnapshot> = {}): StubRun {
  return {
    snapshot: snapshot(extra),
    events: [
      { sequence: 1, at, transition: 'job-started', summary: 'The run started', refs: [] },
      { sequence: 2, at, transition: 'readiness-passed', summary: 'Readiness passed at attempt 1', refs: [{ kind: 'gate', id: 'ga-0001' }] },
      { sequence: 3, at, transition: 'gate-attempted', summary: 'Gate ga-0002 (final): passed, next accept', refs: [{ kind: 'gate', id: 'ga-0002' }] },
    ],
    analysis: analysisResponseSchema.parse({
      plan: { markdown: '# Reviewer notes\n\nA plan.', hash: 'a'.repeat(64) },
      analysis: {
        status: 'accepted', view: { status: 'placeholder' },
        entries: [{ capability: 'review-note', description: 'd', owner: 'shop/notes', proposed: null, workItem: 'wi-001' }],
        hypotheses: [{
          id: 'note-search', capability: 'note-search', revision: 2, standing: 'superseded', change: 'reuse', suggestedOwner: 'shop/search',
          confidence: 'low', rationale: 'now', dependsOn: [], anticipatedConsumers: [],
          initial: { change: 'create', suggestedOwner: 'shop/notes', rationale: 'Notes may need to be searched later.' },
          decisions: ['gd-001'], supersededBy: null, confirmedBy: null,
        }],
        total: { entries: 1, hypotheses: 1 },
      },
    }),
    decisions: decisionListResponseSchema.parse({
      decisions: [{
        kind: 'placement', at, sequence: 5, workItem: 'wi-001', id: 'gd-001', authority: 'global', request: 'pr-001', question: 'Where is search?',
        outcome: 'reuse', capability: 'note-search', owner: 'shop/search', proposed: null, rationale: 'Search exists.', revises: null,
        hypotheses: [{ id: 'note-search', revision: 2 }], registry: ['note-search'],
      }],
      total: 1,
    }),
    capabilities: capabilityListResponseSchema.parse({
      capabilities: [
        { capability: 'review-note', owner: 'shop/notes', entry: true, tentative: false, state: 'working', reason: 'Waiting for provider ob-ct-001 (rq-001)', dependsOn: [], workItems: ['wi-001'], evidence: [] },
        { capability: 'note-export', owner: 'shop/notes', entry: false, tentative: true, state: 'todo', reason: 'Forecast by hypothesis h at revision 1 (tentative); no work derives from a hypothesis', dependsOn: [], workItems: [], evidence: [] },
      ],
      total: 2,
    }),
    gates: {
      'ga-0002': gateViewSchema.parse({
        id: 'ga-0002', checkpoint: 'final', subject: {}, repairRound: 0, infrastructureAttempt: 0, head: 'abc', commit: null,
        verdict: 'passed', cause: null, next: 'accept', guardedChanges: [], rules: [],
        commands: [{
          kind: 'tests', argv: ['npm', 'test'], cwd: '/p', startedAt: at, elapsedMs: 5, exitCode: 0, outcome: 'passed', notVerified: null,
          runnerError: null, selection: null, output: { path: 'gates/ga-0002/tests.log', bytes: 20000, truncated: false, tail: 'xxxx\nall passed\n' },
        }],
      }),
    },
    metrics: metricsResponseSchema.parse({
      policyVersion: 'kpi/1', measurementPolicy: 'scope-size/1',
      baseline: { state: 'unavailable', reason: 'ramify measure could not be run', subtotal: null },
      metrics: [
        { id: 'scope-bytes-per-changed-line', unit: 'bytes per changed line', policyVersion: 'kpi/1', measurementPolicy: 'scope-size/1', state: 'unavailable', value: null, numerator: null, denominator: 13, subtotal: 10000, coverage: { covered: 1, total: 2 }, evidence: ['inv-0006: owned-source unknown'], note: 'A size component is missing' },
        { id: 'session-count', unit: 'sessions', policyVersion: 'kpi/1', measurementPolicy: null, state: 'measured', value: 6, numerator: 6, denominator: null, subtotal: null, coverage: { covered: 6, total: 6 }, evidence: [], note: null },
      ],
      evaluation: {
        guarding: { guarded: ['edit'], unguarded: ['shell'], verdicts: { allowed: 1, 'blocked-scope': 0, 'blocked-unresolved': 0 }, complete: false, statement: 'Guarded: edit. Not guarded: shell. A count of blocked calls is not evidence that every write respected its scope; what an unguarded tool wrote is seen only in the tree afterwards.' },
        outsideScope: [{ invocation: 'inv-0004', role: 'engineer', workItem: 'wi-001', iteration: 'wi-001.i01', path: 'subs/reviews/src/outside.ts' }],
        invocations: [],
      },
    }),
  };
}

function clientWith(run: StubRun): StubClient {
  const client = new StubClient();
  client.runs.set(runId, run);
  return client;
}

test('the overview shows notices first: the module created, then every cycle, resolved or not', async () => {
  render(<RunPage client={clientWith(stubRun())} planId="review-notes" runId={runId} interval={60_000} />);
  const overview = await screen.findByLabelText('Overview');
  const headings = within(overview).getAllByRole('heading', { level: 2 }).map(heading => heading.textContent);
  expect(headings[0]).toBe('Notices');
  const notices = within(overview).getAllByRole('listitem').filter(item => item.className.startsWith('notice '));
  expect(notices.map(item => item.className)).toEqual(['notice notice-module-created', 'notice notice-cycle']);
  expect(notices[0]!.textContent).toContain('Module created: shop/notes/drafts');
  expect(notices[0]!.textContent).toContain('No placement decision proposed it.');
  expect(notices[1]!.textContent).toContain('resolved');
});

test('after the run ends the notices stay, and an empty list says that nothing was created', async () => {
  const ended = clientWith(stubRun({ state: 'completed', phase: 'ended', endedAt: at, current: null, writer: { held: null, unsettled: null } }));
  render(<RunPage client={ended} planId="review-notes" runId={runId} interval={60_000} />);
  const notice = (await screen.findByLabelText('Overview')).querySelector('.notice-module-created')!;
  expect(notice.textContent).toContain('Module created: shop/notes/drafts');
  expect(screen.getAllByText('completed').length).toBeGreaterThan(0);
  cleanup();

  const none = clientWith(stubRun({ state: 'completed', phase: 'ended', endedAt: at, current: null, notices: [] }));
  render(<RunPage client={none} planId="review-notes" runId={runId} interval={60_000} />);
  expect(await screen.findByText('No module was created or removed, and no dependency cycle was detected.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
});

test('Stop sends stop-job with the run\'s version, and is the only command on the page', async () => {
  const client = clientWith(stubRun());
  render(<RunPage client={client} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
  await screen.findByRole('button', { name: 'Stopping…' });
  expect(client.commands).toEqual([expect.objectContaining({ type: 'stop-job', expectedVersion: 12, payload: { planId: 'review-notes', jobId: runId } })]);
  // Nothing on the page is editable.
  expect(screen.queryAllByRole('textbox')).toEqual([]);
});

test('a lost connection is shown apart from the run\'s state, which stays as last read', async () => {
  const client = clientWith(stubRun());
  render(<RunPage client={client} planId="review-notes" runId={runId} interval={20} />);
  await screen.findByText(/Read at version 12/);
  client.failure = new ClientError('connection', 'The harness did not answer: fetch failed');
  act(() => client.setConnection('disconnected'));
  const line = await screen.findByLabelText('Connection to the harness');
  await screen.findByText(/The harness is not answering/);
  expect(line.textContent).toContain('at version 12');
  expect(line.textContent).toContain('the run does not depend on this page');
  // The run's own state is what was last read: still running, not failed.
  expect(within(screen.getByLabelText('Overview')).getAllByText('running').length).toBeGreaterThan(0);
  client.failure = undefined;
  act(() => client.setConnection('connected'));
  await screen.findByText(/Read at version 12/);
});

test('hypotheses are shown as forecasts with standing and revision, beside the decisions that revised them', async () => {
  render(<RunPage client={clientWith(stubRun())} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Hypotheses and decisions' }));
  const area = await screen.findByLabelText('Hypotheses and decisions');
  const hypothesis = (await within(area).findAllByText(/note-search/)).map(node => node.closest('li')!).find(item => item.className.includes('hypothesis'))!;
  expect(hypothesis.textContent).toContain('hypothesis');
  expect(hypothesis.textContent).toContain('superseded');
  expect(hypothesis.textContent).toContain('revision 2');
  expect(hypothesis.textContent).toContain('Initially forecast: create in shop/notes');
  expect(hypothesis.textContent).toContain('Revised by gd-001');
  const decision = within(area).getByText('gd-001').closest('li')!;
  expect(decision.className).toContain('decision');
  expect(decision.textContent).toContain('note-search@2');
});

test('progress shows todo, working on and completed with reasons, and marks a forecast', async () => {
  render(<RunPage client={clientWith(stubRun())} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Progress' }));
  const working = await screen.findByLabelText('Working on');
  expect(working.textContent).toContain('Waiting for provider ob-ct-001 (rq-001)');
  const todo = screen.getByLabelText('Todo');
  expect(within(todo).getByText('forecast')).toBeTruthy();
});

test('a gate shows its commands and its bounded output tail', async () => {
  render(<RunPage client={clientWith(stubRun())} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Checks' }));
  fireEvent.click(await screen.findByRole('button', { name: 'ga-0002' }));
  const tail = await screen.findByLabelText('Output tail of tests');
  expect(tail.textContent).toBe('xxxx\nall passed\n');
  expect(screen.getByText(/20000 bytes in/)).toBeTruthy();
});

test('an unavailable metric reads unavailable with its known subtotal, never zero; the guarding statement stays', async () => {
  render(<RunPage client={clientWith(stubRun())} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Measurements' }));
  const table = await screen.findByLabelText('Metrics');
  const row = table.querySelector('[data-metric="scope-bytes-per-changed-line"]')!;
  const cells = [...row.querySelectorAll('td')].map(cell => cell.textContent);
  expect(cells[1]).toBe('unavailable');
  expect(cells[2]).toContain('unavailable');
  expect(cells[2]).toContain('known subtotal 10000');
  expect(cells[2]).not.toMatch(/^0/);
  expect(cells[5]).toBe('1 of 2');
  expect(screen.getByText(/A count of blocked calls is not evidence/)).toBeTruthy();
  expect(within(screen.getByLabelText('Outside the write scope')).getByText('subs/reviews/src/outside.ts')).toBeTruthy();
});
