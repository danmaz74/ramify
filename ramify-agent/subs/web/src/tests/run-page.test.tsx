import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  analysisResponseSchema, capabilityListResponseSchema, capabilityStateSchema, decisionListResponseSchema, gateViewSchema, metricsResponseSchema,
  moduleCapabilityComparisonResponseSchema, runSnapshotSchema, scenarioListResponseSchema, workItemListResponseSchema, workItemResponseSchema,
  type RunSnapshot, type WorkItemSummary,
} from '../../../harness/src/interfaces/protocol/runs.js';
import { checkFindingListResponseSchema, checkFindingModuleCountsSchema } from '../../../harness/src/interfaces/protocol/check-findings.js';
import { ClientError } from '../client.js';
import { RunPage } from '../run-page.js';
import { architect, globalFork, liveEngineer } from './helpers/sessions.js';
import { checkFindingKey, StubClient, type StubRun } from './helpers/stub-client.js';

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
    counts: { workItems: 2, completedWorkItems: 1, openRequirements: 0, invocations: 6, readinessAttempts: 1, gateAttempts: 3, scenarios: { pending: 2, bound: 0, declared: 0, implemented: 0 }, degradedStarts: 0 },
    writer: { held: 'inv-0006', unsettled: null },
    review: 'not-reviewed',
    decisionRequests: { open: 0, waiting: false, workItems: [] },
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

const noteFailure = { step: 'Then the note is listed', message: 'expected one note, got none' };

function scenarioText(id: string, entry: string | null, owner: string, extra: Record<string, unknown> = {}) {
  return {
    id, kind: 'entry', entry, owner, origin: { kind: 'architect', refs: [{ anchor: 'Acceptance' }] }, partOf: null, subScenarios: [],
    name: `Scenario ${id}`, source: [`Scenario: Scenario ${id}`, '  When it is used', '  Then it works'],
    file: `subs/${owner.split('/').at(-1)}/src/tests/features/review-notes/${entry ?? 'integration'}.feature`, ...extra,
  };
}

function scenarioView(id: string, entry: string | null, state: string, extra: Record<string, unknown> = {}) {
  return {
    id, kind: 'entry', name: `Scenario ${id}`, state, origin: { kind: 'architect', refs: [{ anchor: 'Acceptance' }] }, entry, partOf: null, subScenarios: [],
    workItem: 'wi-001', owner: 'shop/notes', file: `subs/notes/src/tests/features/review-notes/${entry ?? 'integration'}.feature`, implementedBy: null, gates: [], ...extra,
  };
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
        entries: [
          { capability: 'review-note', description: 'd', owner: 'shop/notes', proposed: null, workItem: 'wi-001' },
          { capability: 'note-tags', description: 't', owner: 'shop/tags', proposed: null, workItem: 'wi-002' },
        ],
        hypotheses: [{
          id: 'note-search', capability: 'note-search', revision: 2, standing: 'superseded', change: 'reuse',
          changesExistingSymbols: false, suggestedOwner: 'shop/search',
          confidence: 'low', rationale: 'now', dependsOn: [], anticipatedConsumers: [],
          initial: { change: 'create', suggestedOwner: 'shop/notes', rationale: 'Notes may need to be searched later.' },
          decisions: ['gd-001'], supersededBy: null, confirmedBy: null,
        }],
        scenarios: [
          scenarioText('sc-001', 'review-note', 'shop/notes', { origin: { kind: 'plan', planScenario: 'ps-01', lines: [10, 14] }, name: 'A reviewer writes a note' }),
          scenarioText('sc-002', 'review-note', 'shop/notes', { partOf: 'sc-004', name: 'A note is written for tagging' }),
          scenarioText('sc-003', 'note-tags', 'shop/tags', { partOf: 'sc-004', name: 'A written note is tagged', source: ['Scenario: A written note is tagged', '  Given a note was written', '  When the person tags it', '  Then the tag is shown'] }),
          scenarioText('sc-004', null, 'shop', {
            kind: 'integration', origin: { kind: 'plan', planScenario: 'ps-02', lines: [20, 25] }, subScenarios: ['sc-002', 'sc-003'], name: 'A written note is shown with its tag',
            source: ['Scenario: A written note is shown with its tag', '  When the person writes a note', '  And the person tags it', '  Then the tag is shown'],
          }),
        ],
        warnings: [{ kind: 'sub-scenario-shares-no-step', scenarios: ['sc-003'], message: 'sc-003 picks no step of sc-004 verbatim' }],
        total: { entries: 2, hypotheses: 1, scenarios: 4 },
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
        { capability: 'send-button', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'working', reason: 'Waiting for provider ob-ct-001 (rq-001)', dependsOn: [{ capability: 'send-email', tentative: false }], workItems: ['wi-001'], evidence: [], scenarios: { implemented: 0, total: 1 } },
        { capability: 'send-email', owner: 'collection-review/workspace/reviews', entry: false, tentative: false, state: 'completed', reason: 'Provider work completed with current evidence', dependsOn: [], workItems: ['wi-002'], evidence: ['ga-0007', 'ga-0006'], scenarios: null },
        { capability: 'note-rendering', owner: 'collection-review', entry: false, tentative: true, state: 'todo', reason: 'Forecast by hypothesis note-rendering at revision 1 (tentative); no work derives from a hypothesis', dependsOn: [{ capability: 'note-storage', tentative: true }], workItems: [], evidence: [], scenarios: null },
        { capability: 'note-storage', owner: 'collection-review/workspace/reviews', entry: false, tentative: true, state: 'todo', reason: 'Forecast by hypothesis note-storage at revision 1 (tentative); no work derives from a hypothesis', dependsOn: [], workItems: [], evidence: [], scenarios: null },
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
          runnerError: null, selection: null, output: { path: 'gates/ga-0002/tests.log', bytes: 20000, truncated: false, tail: 'xxxx\none failed\n' }, scenarios: null,
        }, {
          kind: 'scenarios', argv: ['npm', 'run', 'acceptance'], cwd: '/p', startedAt: at, elapsedMs: 5, exitCode: 1, outcome: 'failed', notVerified: null,
          runnerError: null, selection: null, output: { path: 'gates/ga-0002/scenarios.log', bytes: 30, truncated: false, tail: 'sc-001 failed\n' },
          scenarios: {
            mode: 'quick', selection: { kind: 'identity', scenarios: ['sc-001'] }, dryRun: false, excluded: 3, runs: [{ module: 'shop/notes', exit: 1 }],
            scenarios: [{ id: 'sc-001', run: 'shop/notes', status: 'failed', file: 'subs/notes/src/tests/features/review-notes/review-note.feature', line: 4, failure: noteFailure, undefined: [] }],
            untracked: { passed: 2, skipped: 0, failed: 0 },
            failures: ['sc-001 failed at "Then the note is listed": expected one note, got none'],
          },
        }],
      }),
      'ga-0003': gateViewSchema.parse({
        id: 'ga-0003', checkpoint: 'iteration', subject: { workItem: 'wi-002', iteration: 'wi-002.i01' }, repairRound: 1, infrastructureAttempt: 0,
        head: failedCommit, commit: null, audited: failedCommit,
        evidence: { runRef: 'refs/audited/runs/passed', reportCommit: 'd'.repeat(40), treeRef: 'refs/audited/trees/passed' },
        verdict: 'passed', cause: null, next: 'accept', guardedChanges: [], rules: [],
        commands: [{
          kind: 'tests', argv: ['npm', 'test'], cwd: '/p', startedAt: at, elapsedMs: 5, exitCode: 0, outcome: 'passed', notVerified: null,
          runnerError: null, selection: null, output: { path: 'gates/ga-0003/tests.log', bytes: 20000, truncated: false, tail: 'xxxx\nall passed\n' }, scenarios: null,
        }],
      }),
    },
    scenarios: scenarioListResponseSchema.parse({
      scenarios: [
        scenarioView('sc-001', 'review-note', 'implemented', {
          origin: { kind: 'plan', planScenario: 'ps-01', lines: [10, 14] }, name: 'A reviewer writes a note', implementedBy: 'ga-0003',
          gates: [
            { gate: 'ga-0002', checkpoint: 'iteration', subject: { workItem: 'wi-002', iteration: 'wi-002.i01' }, verdict: 'failed', mode: 'quick', dryRun: false, status: 'failed', failure: noteFailure, undefined: [] },
            { gate: 'ga-0003', checkpoint: 'iteration', subject: { workItem: 'wi-002', iteration: 'wi-002.i01' }, verdict: 'passed', mode: 'quick', dryRun: false, status: 'passed', failure: null, undefined: [] },
          ],
        }),
        scenarioView('sc-002', 'review-note', 'bound', { partOf: 'sc-004' }),
        scenarioView('sc-003', 'note-tags', 'declared', { partOf: 'sc-004', owner: 'shop/tags', workItem: 'wi-002' }),
        scenarioView('sc-004', null, 'pending', { kind: 'integration', origin: { kind: 'plan', planScenario: 'ps-02', lines: [20, 25] }, subScenarios: ['sc-002', 'sc-003'], owner: 'shop', workItem: null }),
      ],
      total: 4,
    }),
    metrics: metricsResponseSchema.parse({
      policyVersion: 'kpi/1', measurementPolicy: 'scope-size/1',
      baseline: { state: 'unavailable', reason: 'ramify measure could not be run', subtotal: null },
      metrics: [
        { id: 'scope-bytes-per-changed-line', unit: 'bytes per changed line', policyVersion: 'kpi/1', measurementPolicy: 'scope-size/1', state: 'unavailable', value: null, numerator: null, denominator: 13, subtotal: 10000, coverage: { covered: 1, total: 2 }, evidence: ['inv-0006: owned-source unknown'], note: 'A size component is missing' },
        { id: 'session-count', unit: 'sessions', policyVersion: 'kpi/1', measurementPolicy: null, state: 'measured', value: 6, numerator: 6, denominator: null, subtotal: null, coverage: { covered: 6, total: 6 }, evidence: [], note: null },
      ],
      lineage: {
        policyVersion: 'lineage/1',
        metrics: [
          { id: 'fork.generation-1.start-context', unit: 'tokens per segment', policyVersion: 'lineage/1', measurementPolicy: null, state: 'measured', value: 25000, numerator: 50000, denominator: 2, subtotal: null, coverage: { covered: 2, total: 2 }, evidence: ['inv-0002 (ses-0002): 24000', 'inv-0003 (ses-0003): 26000'], note: null },
          { id: 'fresh-fork.start-context', unit: 'tokens per segment', policyVersion: 'lineage/1', measurementPolicy: null, state: 'not-applicable', value: null, numerator: null, denominator: null, subtotal: null, coverage: { covered: 0, total: 0 }, evidence: [], note: 'No global fork started fresh' },
          { id: 'continuation-growth', unit: 'tokens per continuation', policyVersion: 'lineage/1', measurementPolicy: null, state: 'unavailable', value: null, numerator: null, denominator: null, subtotal: 3000, coverage: { covered: 1, total: 2 }, evidence: ['inv-0006 (ses-0005): it recorded no context observation', 'inv-0005 (ses-0004): 3000'], note: 'A segment lacks this input, so the mean is unknown; the known subtotal is shown' },
          { id: 'degraded-starts', unit: 'degraded starts per requested start', policyVersion: 'lineage/1', measurementPolicy: null, state: 'partial', value: null, numerator: 1, denominator: 3, subtotal: null, coverage: { covered: 3, total: 4 }, evidence: ['continue made fresh: the session file is gone (inv-0006)'], note: 'Counted over 3 of 4 requested starts whose start is known' },
        ],
      },
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

test('a run with a degraded start notices it with its count and a link to its chapter; a run without one asks for no sessions', async () => {
  const counts = { ...snapshot().counts, degradedStarts: 1 };
  const client = clientWith(stubRun({ counts, notices: [] }));
  client.runSessions.set(runId, { version: 12, sessions: [architect, liveEngineer(), globalFork], total: 3 });
  render(<RunPage client={client} planId="review-notes" runId={runId} interval={60_000} />);
  const overview = await screen.findByLabelText('Overview');
  const link = await within(overview).findByRole('link', { name: 'ses-0003 global-fork, inv-0003' });
  expect(link.getAttribute('href')).toBe(`#/plans/review-notes/runs/${runId}/sessions/ses-0003/chapters/inv-0003`);
  const notice = link.closest('.notice')!;
  expect(notice.className).toBe('notice notice-degraded-start');
  expect(notice.textContent).toContain('A degraded start');
  expect(notice.textContent).toContain('fork was requested and fresh was made (the source session file is gone)');
  expect(within(overview).queryByText(/No module was created or removed/)).toBeNull();
  cleanup();

  const quiet = clientWith(stubRun());
  render(<RunPage client={quiet} planId="review-notes" runId={runId} interval={60_000} />);
  await screen.findByLabelText('Overview');
  expect(document.querySelector('.notice-degraded-start')).toBeNull();
  expect(quiet.calls.filter(call => call.startsWith('getRunSessions'))).toEqual([]);
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

test('Stop sends stop-job with the run\'s version; the only fields on the page are the approval\'s', async () => {
  const client = clientWith(stubRun());
  render(<RunPage client={client} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
  await screen.findByRole('button', { name: 'Stopping…' });
  expect(client.commands).toEqual([expect.objectContaining({ type: 'stop-job', expectedVersion: 12, payload: { planId: 'review-notes', jobId: runId } })]);
  // Nothing else on the page is editable: the reviewer and the note belong to Approve.
  const approval = screen.getByRole('form', { name: 'Approve the analysis' });
  expect(screen.queryAllByRole('textbox')).toEqual(within(approval).getAllByRole('textbox'));
  expect(within(approval).getAllByRole('textbox').map(field => field.getAttribute('name'))).toEqual(['reviewer', 'note']);
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
        { capability: 'send-button', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'working', reason: 'wi-001 is under way, iteration wi-001.i02', dependsOn: [], workItems: ['wi-001'], evidence: [], scenarios: { implemented: 0, total: 1 } },
        { capability: 'send-email', owner: 'collection-review/workspace/reviews', entry: false, tentative: false, state: 'todo', reason: 'wi-002 not started', dependsOn: [], workItems: ['wi-002'], evidence: [], scenarios: null },
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

// Acceptance scenarios: the review, Approve and the scenario list.

test('the Scenarios area lists every tracked scenario with its state, origin, work item, file and the gates that ran it', async () => {
  const client = clientWith(stubRun());
  render(<RunPage client={client} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Scenarios' }));
  const table = await screen.findByLabelText('Tracked scenarios');
  expect(client.calls.filter(call => call.startsWith('getScenarios'))).toEqual([`getScenarios:${runId}`]);
  const row = (id: string) => table.querySelector<HTMLElement>(`[data-scenario="${id}"]`)!;
  const cells = (id: string) => [...row(id).querySelectorAll('td')].map(cell => cell.textContent);
  expect([...table.querySelectorAll('tbody tr')].map(one => one.getAttribute('data-scenario'))).toEqual(['sc-001', 'sc-002', 'sc-003', 'sc-004']);
  expect(within(row('sc-001')).getByText('implemented').className).toContain('scenario-state-implemented');
  expect(cells('sc-001')[1]).toBe('implementedby ga-0003');
  expect(cells('sc-001')[2]).toBe('from the plan (ps-01, lines 10–14)');
  expect(cells('sc-002')[1]).toBe('bound');
  expect(cells('sc-002')[3]).toBe('entry review-note, work item wi-001; sub-scenario of sc-004');
  expect(cells('sc-003')[1]).toBe('declared');
  expect(cells('sc-004')[1]).toBe('pending');
  expect(cells('sc-004')[3]).toBe('integration of sc-002, sc-003; no work item until its sub-scenarios are implemented');
  expect(cells('sc-004')[4]).toContain('subs/notes/src/tests/features/review-notes/integration.feature');
  expect(cells('sc-004')[5]).toBe('not run yet');
  const gates = within(row('sc-001')).getByLabelText('Gates of sc-001');
  expect([...gates.querySelectorAll('li')].map(item => item.textContent)).toEqual([
    'ga-0002 iteration wi-002.i01, quick: failedThen the note is listed: expected one note, got none',
    'ga-0003 iteration wi-002.i01, quick: passed',
  ]);
  expect(screen.getByLabelText('Scenario states').textContent).toBe('1 pending · 1 bound · 1 declared · 1 implemented');
});

test('before the analysis is accepted the Scenarios area says nothing is tracked', async () => {
  render(<RunPage client={clientWith({ ...stubRun(), scenarios: { scenarios: [], total: 0 } })} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Scenarios' }));
  expect(await screen.findByText(/No scenario is tracked yet/)).toBeTruthy();
});

test('the review on the analysis page: each entry\'s scenarios with their origin, the integration scenario\'s plan text beside its sub-scenarios, and the warnings', async () => {
  render(<RunPage client={clientWith(stubRun())} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Plan and entries' }));
  const note = await screen.findByLabelText('Scenarios of review-note');
  expect(within(note).getAllByRole('listitem').map(item => item.getAttribute('aria-label'))).toEqual(['Scenario sc-001', 'Scenario sc-002']);
  const first = within(note).getByLabelText('Scenario sc-001');
  expect(first.textContent).toContain('A reviewer writes a note');
  expect(first.textContent).toContain('from the plan (ps-01, lines 10–14)');
  expect(first.querySelector('.badge')!.textContent).toBe('plan');
  const second = within(note).getByLabelText('Scenario sc-002');
  expect(second.textContent).toContain('written by the architect, citing Acceptance; a sub-scenario of sc-004');
  expect(second.querySelector('pre')!.textContent).toBe('Scenario: Scenario sc-002\n  When it is used\n  Then it works');

  const integration = screen.getByLabelText('Integration scenario sc-004');
  expect(within(integration).getByRole('heading', { level: 3 }).textContent).toBe('Integration scenario sc-004: A written note is shown with its tag');
  expect(within(integration).getByLabelText('The plan\'s text').querySelector('pre')!.textContent)
    .toBe('Scenario: A written note is shown with its tag\n  When the person writes a note\n  And the person tags it\n  Then the tag is shown');
  const subs = within(integration).getByLabelText('Its sub-scenarios');
  expect(within(subs).getAllByRole('listitem').map(item => item.getAttribute('aria-label'))).toEqual(['Scenario sc-002', 'Scenario sc-003']);
  // The warning is listed, and shown on the scenario it concerns.
  expect(screen.getByLabelText('Warnings of the analysis').textContent).toContain('sub-scenario-shares-no-step on sc-003: sc-003 picks no step of sc-004 verbatim');
  expect(within(subs).getByLabelText('Scenario sc-003').querySelector('.warn')!.textContent).toBe('Warning (sub-scenario-shares-no-step): sc-003 picks no step of sc-004 verbatim');
  expect(within(note).queryByText(/Warning/)).toBeNull();
});

test('at the review stop the run says it waits, and Approve sends approve-analysis with the reviewer and the note', async () => {
  const client = clientWith(stubRun({ phase: 'awaiting-review', current: null, writer: { held: null, unsettled: null } }));
  render(<RunPage client={client} planId="review-notes" runId={runId} interval={60_000} />);
  const review = (await screen.findByRole('heading', { name: 'Review' })).closest('section')!;
  expect(review.textContent).toContain('Not reviewed.');
  expect(review.textContent).toContain('The run waits at its review stop');
  const form = within(review).getByRole('form', { name: 'Approve the analysis' });
  const approve = within(form).getByRole('button', { name: 'Approve' }) as HTMLButtonElement;
  expect(approve.disabled).toBe(true);
  fireEvent.change(within(form).getByRole('textbox', { name: 'Reviewer' }), { target: { value: ' dana@example.com ' } });
  fireEvent.change(within(form).getByRole('textbox', { name: 'Note (optional)' }), { target: { value: 'The scenarios say what the plan asks.' } });
  const reads = client.calls.filter(call => call.startsWith('getEvents')).length;
  fireEvent.click(approve);
  await within(form).findByRole('button', { name: 'Approved' });
  expect(client.commands).toEqual([expect.objectContaining({
    type: 'approve-analysis', expectedVersion: 12,
    payload: { planId: 'review-notes', jobId: runId, reviewer: 'dana@example.com', note: 'The scenarios say what the plan asks.' },
  })]);
  // The page reads the run again at once, rather than at its next poll.
  await waitFor(() => expect(client.calls.filter(call => call.startsWith('getEvents')).length).toBeGreaterThan(reads));
});

test('Approve after the run completed, without a note, is sent again at the version a stale refusal names', async () => {
  class StaleOnce extends StubClient {
    override async sendCommand(command: Parameters<StubClient['sendCommand']>[0]) {
      if (this.commands.length === 0) {
        this.commands.push(command);
        throw new ClientError('protocol', 'The run is at version 15', 'stale-version', 15);
      }
      return super.sendCommand(command);
    }
  }
  const client = new StaleOnce();
  client.runs.set(runId, stubRun({ state: 'completed', phase: 'ended', endedAt: at, current: null, writer: { held: null, unsettled: null } }));
  render(<RunPage client={client} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Plan and entries' }));
  const form = await screen.findByRole('form', { name: 'Approve the reviewed analysis' });
  fireEvent.change(within(form).getByRole('textbox', { name: 'Reviewer' }), { target: { value: 'dana@example.com' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Approve' }));
  await within(form).findByRole('button', { name: 'Approved' });
  expect(client.commands.map(command => [command.type, command.expectedVersion, command.payload])).toEqual([
    ['approve-analysis', 12, { planId: 'review-notes', jobId: runId, reviewer: 'dana@example.com' }],
    ['approve-analysis', 15, { planId: 'review-notes', jobId: runId, reviewer: 'dana@example.com' }],
  ]);
});

test('a refused approval says why; a reviewed, failed, stopped or unanalysed run offers no Approve', async () => {
  const refusing = clientWith(stubRun());
  refusing.sendCommand = async command => { refusing.commands.push(command); throw new ClientError('protocol', 'The analysis was already approved', 'conflict'); };
  render(<RunPage client={refusing} planId="review-notes" runId={runId} interval={60_000} />);
  const form = await screen.findByRole('form', { name: 'Approve the analysis' });
  fireEvent.change(within(form).getByRole('textbox', { name: 'Reviewer' }), { target: { value: 'dana' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Approve' }));
  expect((await within(form).findByRole('alert')).textContent).toBe('The approval was refused: The analysis was already approved');
  cleanup();

  const reviewed = clientWith(stubRun({ review: { reviewer: 'dana@example.com', at, duringRun: true } }));
  render(<RunPage client={reviewed} planId="review-notes" runId={runId} interval={60_000} />);
  const review = (await screen.findByRole('heading', { name: 'Review' })).closest('section')!;
  expect(review.textContent).toContain(`Approved by dana@example.com at ${at}, while the run was working.`);
  expect(screen.getAllByText('Review').find(node => node.tagName === 'DT')!.nextElementSibling?.textContent).toBe(`Approved by dana@example.com at ${at}, while the run was working`);
  expect(screen.queryByRole('form', { name: 'Approve the analysis' })).toBeNull();
  cleanup();

  const ended = { current: null, endedAt: at, phase: 'ended' as const, writer: { held: null, unsettled: null } };
  for (const extra of [
    { state: 'failed' as const, ...ended, failure: { reason: 'repair-exhausted' as const, message: 'm', evidence: [] } },
    { state: 'stopped' as const, ...ended },
    { state: 'interrupted' as const, ...ended },
    { phase: 'analysis' as const },
    { phase: 'final-verification' as const },
    { stopRequested: true },
  ]) {
    render(<RunPage client={clientWith(stubRun(extra))} planId="review-notes" runId={runId} interval={60_000} />);
    await screen.findByRole('heading', { name: 'Review' });
    expect([extra, screen.queryByRole('form', { name: 'Approve the analysis' })]).toEqual([extra, null]);
    cleanup();
  }
});

test('a gate\'s scenario check shows each scenario\'s status and failure', async () => {
  render(<RunPage client={clientWith(stubRun())} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Checks' }));
  fireEvent.click(await screen.findByRole('button', { name: 'ga-0002' }));
  const gate = await screen.findByLabelText('Gate ga-0002');
  const check = within(gate).getByLabelText('Scenario check');
  expect(check.textContent).toContain('Mode quick, selection by identity: sc-001, 3 excluded.');
  expect(within(check).getByLabelText('Scenario results').textContent)
    .toBe('sc-001 failed in shop/notes, subs/notes/src/tests/features/review-notes/review-note.feature:4Then the note is listed: expected one note, got none');
  expect(within(check).getByLabelText('Why the scenario check did not pass').textContent).toBe('sc-001 failed at "Then the note is listed": expected one note, got none');
  expect(within(gate).getAllByLabelText('Scenario check')).toHaveLength(1);
});

test('the lineage measurements show their values, coverage and reasons; an unavailable one reads unavailable, never zero', async () => {
  render(<RunPage client={clientWith(stubRun())} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Measurements' }));
  const table = await screen.findByLabelText('Lineage measurements');
  const cells = (id: string) => [...table.querySelector(`[data-metric="${id}"]`)!.querySelectorAll('td')].map(cell => cell.textContent);
  expect(screen.getByText(/Lineage measurements lineage\/1/)).toBeTruthy();

  const fork = cells('fork.generation-1.start-context');
  expect(fork[0]).toContain('tokens per segment');
  expect(fork.slice(1, 6)).toEqual(['measured', '25000', '50000', '2', '2 of 2']);

  const growth = cells('continuation-growth');
  expect(growth[1]).toBe('unavailable');
  expect(growth[2]).toBe('unavailableknown subtotal 3000');
  expect(growth[5]).toBe('1 of 2');
  expect(growth[6]).toContain('the known subtotal is shown');
  expect(within(table.querySelector('[data-metric="continuation-growth"]')! as HTMLElement).getByText('inv-0006 (ses-0005): it recorded no context observation')).toBeTruthy();

  expect(cells('fresh-fork.start-context').slice(1, 3)).toEqual(['not-applicable', 'not-applicable']);
  expect(cells('fresh-fork.start-context')[6]).toBe('No global fork started fresh');
  const degraded = cells('degraded-starts');
  expect(degraded.slice(1, 6)).toEqual(['partial', 'partial', '1', '3', '3 of 4']);
});

test('Run → Sessions draws the timeline, each segment opening its chapter; Measurements no longer lists invocations', async () => {
  const client = clientWith(stubRun());
  client.runSessions.set(runId, { version: 12, sessions: [architect, liveEngineer()], total: 2 });
  render(<RunPage client={client} planId="review-notes" runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Sessions' }));
  const area = await screen.findByLabelText('Sessions');
  const engineer = await within(area).findByRole('group', { name: 'ses-0002 engineer, live' });
  expect(within(engineer).getByRole('link', { name: 'ses-0002' }).getAttribute('href')).toBe(`#/plans/review-notes/runs/${runId}/sessions/ses-0002`);
  expect(within(engineer).getByRole('link', { name: /^Chapter 2 of ses-0002: inv-0004/ }).getAttribute('href')).toBe(`#/plans/review-notes/runs/${runId}/sessions/ses-0002/chapters/inv-0004`);
  expect(engineer.querySelector('.session-state')!.textContent).toBe('live');
  expect(within(area).getByRole('group', { name: 'ses-0001 initial-architect, finished' })).toBeTruthy();

  fireEvent.click(screen.getByRole('tab', { name: 'Measurements' }));
  await screen.findByLabelText('Metrics');
  expect(screen.queryByRole('table', { name: 'Sessions' })).toBeNull();
});

test('a work item\'s CheckFindings sit in its history, and the overview shows the modules\' unsettled counts', async () => {
  const signal = {
    id: 'cf-0001', revision: 2, workItem: 'wi-001', standing: 'open', reason: 'awaiting-user-decision', awaiting: 'user-decision', verification: 'assessment',
    obligation: null, required: false, risk: 'medium', credibility: 'human-reviewed', modules: ['collection-review/workspace/reviews'], unresolved: null,
    latestReview: false, settlement: null, materialChoice: null, repair: null, producers: ['review:scope'], title: 'The API conflicts with the plan',
    reports: 1, decisions: 1, group: null, userCommands: ['respond'],
    pendingUserDecision: { request: 'cfd-0001', by: { kind: 'agent', role: 'local-architect', invocation: 'inv-0020' }, rationale: 'A strong conflict',
      conflicts: [{ text: 'The API returns a list.', document: 'plans/review-notes/plan.md', revision: 'sha256:plan' }],
      options: [{ id: 'keep', summary: 'Keep', consequence: 'Unmet' }, { id: 'list', summary: 'List', consequence: 'Callers change' }] },
  };
  const coverage = { state: 'available', requested: 3, complete: 3, partial: 0, notVerified: 0, pending: 0 } as const;
  const run: StubRun = {
    ...stubRun(),
    workItems: workItemListResponseSchema.parse({ workItems: [workItemSummary], total: 1 }),
    workItem: { 'wi-001': workItemResponseSchema.parse({ workItem: workItemSummary, outlines: [], iterations: [], gates: [], requirements: [], requests: [] }) },
    checkFindings: { [checkFindingKey({ workItem: 'wi-001', select: 'reported' })]: checkFindingListResponseSchema.parse({
      protocol: 'check-findings/1', runId, version: 12, coverage, query: { workItem: 'wi-001', module: null, select: 'reported', order: 'attention' },
      total: 1, shown: 1, next: null, counts: { total: 1, open: 1, deferred: 0, closed: 0, fixed: 0, waived: 0, superseded: 0, unresolved: 0, awaitingUser: 1 }, items: [signal],
    }) },
    checkFindingModules: checkFindingModuleCountsSchema.parse({ protocol: 'check-findings/1', runId, version: 12, coverage,
      modules: [{ module: 'collection-review/workspace/reviews', open: 1, deferred: 0, unresolved: 0, highestOpenRisk: 'medium', pendingUserDecisions: 1 }] }),
  };
  const client = clientWith(run);
  render(<RunPage client={client} planId="review-notes" runId={runId} interval={60_000} />);
  const modules = await screen.findByRole('table', { name: 'CheckFindings by module' });
  expect(within(modules).getByRole('button', { name: 'collection-review/workspace/reviews' })).toBeTruthy();
  expect(screen.getByText(/A decision is requested of you/)).toBeTruthy();

  fireEvent.click(screen.getByRole('tab', { name: 'Work items' }));
  fireEvent.click(await screen.findByRole('button', { name: 'wi-001' }));
  const history = await screen.findByLabelText('Work item wi-001');
  const findings = await within(history).findByLabelText('CheckFindings of wi-001');
  expect((await within(findings).findByLabelText('Review coverage')).textContent).toMatch(/^Review coverage/);
  const card = await within(findings).findByRole('listitem', { name: 'CheckFinding cf-0001' });
  expect(within(card).getByRole('group', { name: 'Decision requested' })).toBeTruthy();
  expect(client.calls.filter(call => call === `getReviews:${runId}:wi-001`)).toHaveLength(1);
});

test('a run that waits for the person\'s decision says so above every area and marks its work item; the banner opens the request; the answer clears it', async () => {
  const signal = {
    id: 'cf-0001', revision: 2, workItem: 'wi-001', standing: 'open', reason: 'awaiting-user-decision', awaiting: 'user-decision', verification: 'assessment',
    obligation: null, required: false, risk: 'high', credibility: 'human-reviewed', modules: ['collection-review/workspace/reviews'], unresolved: null,
    latestReview: false, settlement: null, materialChoice: null, repair: null, producers: ['review:scope'], title: 'The API conflicts with the plan',
    reports: 1, decisions: 1, group: null, userCommands: ['respond'],
    pendingUserDecision: { request: 'cfd-0001', by: { kind: 'agent', role: 'local-architect', invocation: 'inv-0020' }, rationale: 'A strong conflict',
      conflicts: [{ text: 'The API returns a list.', document: 'plans/review-notes/plan.md', revision: 'sha256:plan' }],
      options: [{ id: 'keep', summary: 'Keep', consequence: 'Unmet' }, { id: 'list', summary: 'List', consequence: 'Callers change' }] },
  };
  const coverage = { state: 'available', requested: 3, complete: 3, partial: 0, notVerified: 0, pending: 0 } as const;
  const other: WorkItemSummary = { ...workItemSummary, id: 'wi-002', capability: 'send-email' };
  const waiting = { open: 1, waiting: true, workItems: [{ workItem: 'wi-001', requests: [{ checkFinding: 'cf-0001', request: 'cfd-0001' }] }] };
  const run: StubRun = {
    ...stubRun({ current: null, writer: { held: null, unsettled: null }, decisionRequests: waiting }),
    workItems: workItemListResponseSchema.parse({ workItems: [workItemSummary, other], total: 2 }),
    workItem: { 'wi-001': workItemResponseSchema.parse({ workItem: workItemSummary, outlines: [], iterations: [], gates: [], requirements: [], requests: [] }) },
    checkFindings: { [checkFindingKey({ workItem: 'wi-001', select: 'reported' })]: checkFindingListResponseSchema.parse({
      protocol: 'check-findings/1', runId, version: 12, coverage, query: { workItem: 'wi-001', module: null, select: 'reported', order: 'attention' },
      total: 1, shown: 1, next: null, counts: { total: 1, open: 1, deferred: 0, closed: 0, fixed: 0, waived: 0, superseded: 0, unresolved: 0, awaitingUser: 1 }, items: [signal],
    }) },
    checkFindingModules: checkFindingModuleCountsSchema.parse({ protocol: 'check-findings/1', runId, version: 12, coverage,
      modules: [{ module: 'collection-review/workspace/reviews', open: 1, deferred: 0, unresolved: 0, highestOpenRisk: 'high', pendingUserDecisions: 1 }] }),
  };
  const client = clientWith(run);
  render(<RunPage client={client} planId="review-notes" runId={runId} interval={20} />);

  // Above every area: a banner, and a header badge beside the run's state, which stays running.
  const banner = await screen.findByRole('status', { name: 'Waiting for your decision' });
  expect(banner.closest('[aria-label="Overview"]')).toBeNull();
  expect(banner.textContent).toMatch(/^Waiting for your decision\. This run is held until you answer/);
  expect(banner.textContent).toContain('There is no time limit.');
  expect(banner.textContent).toContain('Work item wi-001: answer cfd-0001 (CheckFinding cf-0001)');
  const header = document.querySelector('.run-page > .page-header')!;
  expect(within(header as HTMLElement).getByText('Waiting for your decision').className).toBe('badge awaiting-decision');
  expect(header.querySelector('.run-state')!.textContent).toBe('running');
  // Apart from a failure and from a risk level: no alert, and the high risk is only the card's label.
  expect(screen.queryByRole('alert')).toBeNull();
  expect(banner.textContent).not.toMatch(/risk|fail/);

  // The banner opens the work item and brings its request into view with the focus.
  fireEvent.click(within(banner).getByRole('button', { name: 'answer cfd-0001' }));
  expect(screen.getByRole('tab', { name: 'Work items' }).getAttribute('aria-selected')).toBe('true');
  const list = await within(screen.getByLabelText('Work items')).findAllByRole('listitem');
  expect(within(list[0]!).getByText('Waiting for your decision')).toBeTruthy();
  expect(within(list[1]!).queryByText('Waiting for your decision')).toBeNull();
  const history = await screen.findByLabelText('Work item wi-001');
  const request = await within(history).findByRole('group', { name: 'Decision requested' });
  await waitFor(() => expect(document.activeElement).toBe(request));
  expect(request.id).toBe('decision-cfd-0001');
  // The banner stays while the work item is open.
  expect(screen.getByRole('status', { name: 'Waiting for your decision' })).toBe(banner);

  // Answered: the next read of the run no longer waits, and every mark goes.
  run.snapshot = snapshot({ version: 13, current: null, writer: { held: null, unsettled: null } });
  await waitFor(() => expect(screen.queryByRole('status', { name: 'Waiting for your decision' })).toBeNull());
  expect(header.querySelector('.awaiting-decision')).toBeNull();
  expect(within(screen.getByLabelText('Work items')).queryByText('Waiting for your decision')).toBeNull();
});
