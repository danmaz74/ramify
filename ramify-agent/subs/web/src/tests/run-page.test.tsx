import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  analysisResponseSchema, capabilityListResponseSchema, capabilityStateSchema, decisionListResponseSchema, gateViewSchema, metricsResponseSchema,
  moduleCapabilityComparisonResponseSchema, runSnapshotSchema, workItemListResponseSchema, workItemResponseSchema, type RunSnapshot, type WorkItemSummary,
} from '../../../harness/src/interfaces/protocol/runs.js';
import { ClientError } from '../client.js';
import { RunPage } from '../run-page.js';
import { StubClient, type StubRun } from './helpers/stub-client.js';

// Progress → By module draws the packaged React Flow canvas, which jsdom cannot measure.
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const runId = '20260921T080000Z-c0ffee';
const at = '2026-09-21T08:00:00.000Z';
const baseCommit = 'a'.repeat(40);
const failedCommit = 'b'.repeat(40);

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
      { sequence: 3, at, transition: 'gate-attempted', summary: 'Gate ga-0002 (iteration wi-002.i01): failed, next repair', refs: [{ kind: 'gate', id: 'ga-0002' }] },
      { sequence: 4, at, transition: 'gate-attempted', summary: 'Gate ga-0003 (iteration wi-002.i01): passed, next accept', refs: [{ kind: 'gate', id: 'ga-0003' }] },
    ],
    analysis: analysisResponseSchema.parse({
      plan: { markdown: '# Reviewer notes\n\nA plan.', hash: 'a'.repeat(64) },
      analysis: {
        status: 'accepted', view: { status: 'placeholder' },
        entries: [{ capability: 'review-note', description: 'd', owner: 'shop/notes', proposed: null, workItem: 'wi-001' }],
        hypotheses: [{
          id: 'note-search', capability: 'note-search', revision: 2, standing: 'superseded', change: 'reuse',
          changesExistingSymbols: false, suggestedOwner: 'shop/search',
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
        outcome: 'reuse', capability: 'note-search', changesExistingSymbols: false, owner: 'shop/search', proposed: null, rationale: 'Search exists.', revises: null,
        hypotheses: [{ id: 'note-search', revision: 2 }], registry: ['note-search'],
      }],
      total: 1,
    }),
    capabilities: capabilityListResponseSchema.parse({
      capabilities: [
        { capability: 'send-button', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'working', reason: 'Waiting for provider ob-ct-001 (rq-001)', dependsOn: [{ capability: 'send-email', tentative: false }], workItems: ['wi-001'], evidence: [] },
        { capability: 'send-email', owner: 'collection-review/workspace/reviews', entry: false, tentative: false, state: 'completed', reason: 'Provider work completed with current evidence', dependsOn: [], workItems: ['wi-002'], evidence: ['ga-0007', 'ga-0006'] },
        { capability: 'note-rendering', owner: 'collection-review', entry: false, tentative: true, state: 'todo', reason: 'Forecast by hypothesis note-rendering at revision 1 (tentative); no work derives from a hypothesis', dependsOn: [{ capability: 'note-storage', tentative: true }], workItems: [], evidence: [] },
        { capability: 'note-storage', owner: 'collection-review/workspace/reviews', entry: false, tentative: true, state: 'todo', reason: 'Forecast by hypothesis note-storage at revision 1 (tentative); no work derives from a hypothesis', dependsOn: [], workItems: [], evidence: [] },
      ],
      total: 4,
    }),
    moduleCapabilities: moduleCapabilityComparisonResponseSchema.parse({
      identityPolicy: 'exact-capability-slug/1',
      runVersion: 12,
      initialView: { status: 'placeholder' },
      tree: {
        status: 'available', revision: 'rev/1:tree:3', input: 'input/1:abc',
        modules: [{ module: 'shop', dir: '', parent: null }, { module: 'shop/notes', dir: 'subs/notes', parent: 'shop' }, { module: 'shop/search', dir: 'subs/search', parent: 'shop' }],
      },
      modules: [
        { module: 'shop', placement: 'declared', proposedAtStart: null, capabilities: [] },
        {
          module: 'shop/notes', placement: 'declared', proposedAtStart: null, capabilities: [
            { capability: 'review-note', initial: [{ role: 'entry-owner', hypothesis: null }], implementedHere: { reason: 'wi-001 passed its work-item gate ga-0003', evidence: ['ga-0003'] } },
            { capability: 'note-search', initial: [{ role: 'suggested-owner', hypothesis: 'note-search' }], implementedHere: null },
          ],
        },
        {
          module: 'shop/search', placement: 'declared', proposedAtStart: null, capabilities: [
            { capability: 'note-search', initial: [{ role: 'involved', hypothesis: 'note-search' }], implementedHere: null },
          ],
        },
      ],
      coverage: { state: 'complete', capabilities: 2, implemented: 1 },
    }),
    gates: {
      'ga-0001': gateViewSchema.parse({
        id: 'ga-0001', checkpoint: 'readiness', subject: {}, repairRound: 0, infrastructureAttempt: 0, head: baseCommit,
        commit: null, audited: null, evidence: null, verdict: 'passed', cause: null, next: 'accept', guardedChanges: [], rules: [], commands: [],
      }),
      'ga-0002': gateViewSchema.parse({
        id: 'ga-0002', checkpoint: 'iteration', subject: { workItem: 'wi-002', iteration: 'wi-002.i01' }, repairRound: 0, infrastructureAttempt: 0,
        head: baseCommit, commit: failedCommit, audited: failedCommit,
        evidence: { runRef: 'refs/audited/runs/failed', reportCommit: 'c'.repeat(40), treeRef: 'refs/audited/trees/failed' },
        verdict: 'failed', cause: 'in-scope', next: 'repair', guardedChanges: [], rules: [],
        commands: [{
          kind: 'tests', argv: ['npm', 'test'], cwd: '/p', startedAt: at, elapsedMs: 5, exitCode: 1, outcome: 'failed', notVerified: null,
          runnerError: null, selection: null, output: { path: 'gates/ga-0002/tests.log', bytes: 20000, truncated: false, tail: 'xxxx\none failed\n' },
        }],
      }),
      'ga-0003': gateViewSchema.parse({
        id: 'ga-0003', checkpoint: 'iteration', subject: { workItem: 'wi-002', iteration: 'wi-002.i01' }, repairRound: 1, infrastructureAttempt: 0,
        head: failedCommit, commit: null, audited: failedCommit,
        evidence: { runRef: 'refs/audited/runs/passed', reportCommit: 'd'.repeat(40), treeRef: 'refs/audited/trees/passed' },
        verdict: 'passed', cause: null, next: 'accept', guardedChanges: [], rules: [],
        commands: [{
          kind: 'tests', argv: ['npm', 'test'], cwd: '/p', startedAt: at, elapsedMs: 5, exitCode: 0, outcome: 'passed', notVerified: null,
          runnerError: null, selection: null, output: { path: 'gates/ga-0003/tests.log', bytes: 20000, truncated: false, tail: 'xxxx\nall passed\n' },
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

const workItemSummary: WorkItemSummary = {
  id: 'wi-001', module: 'collection-review/workspace/reviews', capability: 'send-button', origin: 'entry', goal: 'The send button',
  state: 'working', follows: null, startedFor: null, currentIteration: 'wi-001.i02', waitingFor: [], completedBy: null,
  counts: { outlineRevisions: 1, iterations: 2, gateAttempts: 4, invocations: 5 },
};

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

test('CM20: Progress offers By module and Dependencies, By module by default, and mounts only the selected view', async () => {
  const client = clientWith(stubRun());
  render(<RunPage client={client} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Progress' }));
  const progress = await screen.findByLabelText('Progress');
  const views = within(within(progress).getByLabelText('Progress views')).getAllByRole('tab');
  expect(views.map(view => [view.textContent, view.getAttribute('aria-selected')])).toEqual([['By module', 'true'], ['Dependencies', 'false']]);
  await within(progress).findByLabelText('Modules with their capability rows');
  expect(within(progress).queryByLabelText('Dependencies')).toBeNull();
  expect(client.calls.filter(call => call.startsWith('getCapabilities'))).toEqual([]);
  expect(client.calls.filter(call => call.startsWith('getModuleCapabilities'))).toHaveLength(1);

  fireEvent.click(within(progress).getByRole('tab', { name: 'Dependencies' }));
  await within(progress).findByLabelText('Scrollable capability dependency graph');
  expect(within(progress).queryByLabelText('By module')).toBeNull();
  expect(within(progress).queryByLabelText('Modules with their capability rows')).toBeNull();
  expect(document.querySelector('.module-tree__canvas')).toBeNull();

  fireEvent.click(within(progress).getByRole('tab', { name: 'By module' }));
  await within(progress).findByLabelText('Modules with their capability rows');
  expect(within(progress).queryByLabelText('Scrollable capability dependency graph')).toBeNull();
  expect(client.calls.filter(call => call.startsWith('getModuleCapabilities'))).toHaveLength(2);
});

test('By module: every row in its node on the packaged canvas; row selection is Run-page state, apart from the module', async () => {
  render(<RunPage client={clientWith(stubRun())} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Progress' }));
  const byModule = await screen.findByLabelText('By module');
  const canvas = await within(byModule).findByLabelText('Modules with their capability rows');
  const notes = canvas.querySelector<HTMLElement>('[data-module-id="shop/notes"]')!;
  expect(within(notes).getAllByRole('button', { name: /^(review-note|note-search),/ }).map(row => row.getAttribute('aria-label')))
    .toEqual(['review-note, Initial: entry owner, Implemented', 'note-search, Initial: suggested owner']);
  expect(canvas.querySelector<HTMLElement>('[data-module-id="shop"]')!.dataset.emphasis).toBe('muted');
  expect(within(byModule).getByLabelText('Coverage').textContent).toBe('Coverage complete: 1 of 2 capabilities implemented.');
  expect(within(byModule).getByLabelText('Compared states').textContent).toContain('Run version12');

  const search = canvas.querySelector<HTMLElement>('[data-module-id="shop/search"]')!;
  fireEvent.keyDown(within(search).getByRole('button', { name: 'note-search, Initial: involved' }), { key: 'Enter' });
  const detail = within(byModule).getByLabelText('Details for note-search in shop/search');
  expect(detail.textContent).toContain('involved: hypothesis note-search');
  expect(search.getAttribute('aria-selected')).toBe('false');
  // CM09 for the whole By module view with a row selected.
  expect(byModule.textContent).not.toMatch(/\b(activity|commits?|changed|lines|deployed)\b|%/i);

  // The selection is the Run page's: it survives leaving Progress and returning.
  fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Progress' }));
  expect((await screen.findByLabelText('Details for note-search in shop/search')).textContent).toContain('Not implemented in this module now.');

  fireEvent.click(document.querySelector<HTMLElement>('[data-module-id="shop/notes"]')!);
  expect(screen.getByLabelText('Details for module shop/notes').textContent).toContain('declared in the current module tree');
});

test('By module names its loading and unavailable conditions', async () => {
  class PendingClient extends StubClient {
    override getModuleCapabilities(): Promise<never> { return new Promise(() => undefined); }
  }
  const pending = new PendingClient();
  pending.runs.set(runId, stubRun());
  render(<RunPage client={pending} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Progress' }));
  expect(within(await screen.findByLabelText('By module')).getByRole('status').textContent).toBe('Loading the module comparison…');
  cleanup();

  const unavailable = clientWith({ ...stubRun(), moduleCapabilities: undefined });
  render(<RunPage client={unavailable} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Progress' }));
  const alert = await within(screen.getByLabelText('By module')).findByRole('alert');
  expect(alert.textContent).toContain('The module comparison is unavailable');
  expect(screen.getByLabelText('Progress views')).toBeTruthy();
});

test('CM20: Progress stays visible while loading, empty or unavailable, naming the condition and never showing todo', async () => {
  class PendingClient extends StubClient {
    override getCapabilities(): Promise<never> { return new Promise(() => undefined); }
  }
  const pending = new PendingClient();
  pending.runs.set(runId, stubRun());
  render(<RunPage client={pending} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Progress' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }));
  const loading = within(await screen.findByLabelText('Dependencies')).getByRole('status');
  expect(loading.textContent).toBe('Loading the capability progress…');
  expect(screen.getByLabelText('Progress').textContent).not.toContain('todo');
  cleanup();

  const empty = clientWith({ ...stubRun(), capabilities: capabilityListResponseSchema.parse({ capabilities: [], total: 0 }) });
  render(<RunPage client={empty} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Progress' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }));
  expect((await screen.findByText('The run has no registered or forecast capability yet.')).getAttribute('role')).toBe('status');
  expect(screen.getByLabelText('Progress').textContent).not.toContain('todo');
  cleanup();

  const unavailable = clientWith({ ...stubRun(), capabilities: undefined });
  render(<RunPage client={unavailable} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Progress' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }));
  const alert = await within(screen.getByLabelText('Progress')).findByRole('alert');
  expect(alert.textContent).toContain('The capability progress is unavailable');
  expect(screen.getByLabelText('Progress views')).toBeTruthy();
  expect(screen.getByLabelText('Progress').textContent).not.toContain('todo');
});

test('CM15–CM17: Dependencies lays out retained dependencies with literal states, owners and the selected evidence', async () => {
  render(<RunPage client={clientWith(stubRun())} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Progress' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }));
  const graph = await screen.findByLabelText('Scrollable capability dependency graph');
  const sendButton = within(graph).getByRole('button', { name: 'send-button, working, entry' });
  expect(sendButton.textContent).toContain('current owner');
  const forecast = within(graph).getByRole('button', { name: 'note-rendering, todo, forecast only' });
  expect(forecast.textContent).toContain('suggested owner');
  expect(screen.getByLabelText('State counts of the 4 returned capabilities').textContent).toContain('completed1');
  expect(screen.getByText('Dependency list').parentElement?.textContent).toContain('send-button depends on send-email');

  fireEvent.click(within(graph).getByRole('button', { name: 'send-email, completed' }));
  const details = screen.getByLabelText('Details for send-email');
  expect(details.textContent).toContain('ga-0007, ga-0006');
  expect(details.textContent).toContain('Provider work completed with current evidence');
  expect(details.textContent).toContain('Depended on bysend-button');
});

test('CM19: a failed run says failed at run level only; a capability keeps its literal state and links to its work-item history', async () => {
  expect(capabilityStateSchema.options).toEqual(['todo', 'working', 'completed']);
  const failed = stubRun({
    state: 'failed', phase: 'ended', endedAt: at, current: null, writer: { held: null, unsettled: null },
    failure: { reason: 'repair-exhausted', message: 'Repair rounds of wi-001 were spent without a passing gate', evidence: ['ga-0005'] },
  });
  const run: StubRun = {
    ...failed,
    capabilities: capabilityListResponseSchema.parse({
      capabilities: [
        { capability: 'send-button', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'working', reason: 'wi-001 is under way, iteration wi-001.i02', dependsOn: [], workItems: ['wi-001'], evidence: [] },
        { capability: 'send-email', owner: 'collection-review/workspace/reviews', entry: false, tentative: false, state: 'todo', reason: 'wi-002 not started', dependsOn: [], workItems: ['wi-002'], evidence: [] },
      ],
      total: 2,
    }),
    workItems: workItemListResponseSchema.parse({
      workItems: [workItemSummary],
      total: 1,
    }),
    workItem: {
      'wi-001': workItemResponseSchema.parse({
        workItem: workItemSummary,
        outlines: [],
        iterations: [{
          id: 'wi-001.i02', kind: 'implementation', stage: 0, goal: 'Send the note', approach: 'non-breaking',
          scope: { modules: ['collection-review/workspace/reviews'], includedChildren: [], broad: false, rationale: 'The owner.', extra: [], read: [] },
          checkpoint: 'iteration', completionEvidence: 'Its tests pass.', authorizations: [],
          result: { outcome: 'exhausted', gate: 'ga-0005', commit: null, findings: [], changedAssumptions: [], recommendation: null },
          gates: [{ id: 'ga-0005', checkpoint: 'iteration', verdict: 'failed', cause: 'in-scope', next: 'exhausted', repairRound: 3 }],
          invocations: [],
        }],
        gates: [], requirements: [], requests: [],
      }),
    },
  };
  render(<RunPage client={clientWith(run)} planId="review-notes" runId={runId} interval={60_000} />);
  await screen.findByText(/Read at version 12/);
  // The run's own status carries the failure.
  expect(document.querySelector('.run-page > .page-header .run-state')!.textContent).toBe('failed');

  fireEvent.click(screen.getByRole('tab', { name: 'Progress' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }));
  const progress = screen.getByLabelText('Progress');
  const graph = await within(progress).findByLabelText('Scrollable capability dependency graph');
  expect(within(graph).getByRole('button', { name: 'send-button, working, entry' })).toBeTruthy();
  expect(within(graph).getByRole('button', { name: 'send-email, todo' })).toBeTruthy();
  expect(progress.textContent).not.toMatch(/fail/i);

  fireEvent.click(within(graph).getByRole('button', { name: 'send-button, working, entry' }));
  expect(screen.getByLabelText('Details for send-button').textContent).not.toMatch(/fail/i);
  fireEvent.click(screen.getByRole('button', { name: 'Open the history of work item wi-001' }));
  expect(screen.getByRole('tab', { name: 'Work items' }).getAttribute('aria-selected')).toBe('true');
  const history = await screen.findByLabelText('Work item wi-001');
  expect(await within(history).findByText(/Result: exhausted/)).toBeTruthy();
  expect(history.textContent).toContain('ga-0005 failed');
});

test('one iteration shows its failed and passed audits, attempt-local commit, evidence refs and unpublished states', async () => {
  render(<RunPage client={clientWith(stubRun())} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Checks' }));

  fireEvent.click(await screen.findByRole('button', { name: 'ga-0002' }));
  let gate = await screen.findByLabelText('Gate ga-0002');
  expect(within(gate).getByRole('heading').textContent).toBe('ga-0002: iteration, failed');
  expect(within(gate).getByText('Attempt commit').nextElementSibling?.textContent).toBe(failedCommit);
  expect(within(gate).getByText('Audited commit').nextElementSibling?.textContent).toBe(failedCommit);
  expect(within(gate).getByText('Audit evidence').nextElementSibling?.textContent).toContain('refs/audited/runs/failed');

  fireEvent.click(screen.getByRole('button', { name: 'ga-0003' }));
  gate = await screen.findByLabelText('Gate ga-0003');
  expect(within(gate).getByRole('heading').textContent).toBe('ga-0003: iteration, passed');
  expect(within(gate).getByText('Attempt commit').nextElementSibling?.textContent).toBe('none (this attempt made no commit)');
  expect(within(gate).getByText('Audited commit').nextElementSibling?.textContent).toBe(failedCommit);
  expect(within(gate).getByText('Audit evidence').nextElementSibling?.textContent).toContain('refs/audited/trees/passed');
  const tail = within(gate).getByLabelText('Output tail of tests');
  expect(tail.textContent).toBe('xxxx\nall passed\n');
  expect(within(gate).getByText(/20000 bytes in/)).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'ga-0001' }));
  gate = await screen.findByLabelText('Gate ga-0001');
  expect(within(gate).getByText('Attempt commit').nextElementSibling?.textContent).toBe('none (this attempt made no commit)');
  expect(within(gate).getByText('Audited commit').nextElementSibling?.textContent).toBe('not audited');
  expect(within(gate).getByText('Audit evidence').nextElementSibling?.textContent).toBe('not published');
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
