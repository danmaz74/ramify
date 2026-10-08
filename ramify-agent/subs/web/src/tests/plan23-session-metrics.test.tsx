import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { invocationEfficiencySchema, metricsResponseSchema, runSnapshotSchema, type InvocationEfficiency } from '../../../harness/src/interfaces/protocol/runs.js';
import { standaloneSessionResponseSchema } from '../../../harness/src/interfaces/protocol/sessions.js';
import { OperationFacts, SessionMetrics } from '../session-metrics.js';
import { SessionPage } from '../session-page.js';
import { SessionTimeline } from '../session-timeline.js';
import { RunPage } from '../run-page.js';
import { evaluation, at, page, sessionView, invocation, runId, planId } from './helpers/sessions.js';
import { StubClient } from './helpers/stub-client.js';

afterEach(cleanup);

// Independently stated accepted-11 plain projection fixture. No provider/KPI source is imported.
function fixture(extra: Partial<InvocationEfficiency> = {}): InvocationEfficiency {
  return invocationEfficiencySchema.parse({
    operation: { runId: 'run', operationId: 'inv-1', sessionId: 'original-session', turn: 2,
      sourcePoint: { sessionId: 'original-session', kind: 'checkpoint', turn: 1, checkpoint: 'brief-C1' },
      point: { sessionId: 'original-session', kind: 'turn', turn: 2, checkpoint: 'turn-C2' } },
    manifest: { schema: 'ramify-agent.delivered-inputs/1', hash: 'manifest-original', inheritedPoint: 'brief-C1',
      currentMessage: { hash: 'current-task', bytes: 5 }, entries: [{ key: 'role:engineer', kind: 'role-instructions', source: 'engineer.md', revision: 'role-r1', hash: 'role-hash', bytes: 20, delivery: 'inherited', sources: [{ path: 'engineer.md', hash: 'role-hash', bytes: 20 }] }] },
    declared: { policy: 'scope-size/2', snapshot: 'writer-snapshot', bytes: 90, subtotal: 90, coverage: 'complete', components: [
      { component: 'owned-source', detail: 'recorded source', bytes: 40, state: 'measured' },
      { component: 'api-views', detail: 'actual view', bytes: 10, state: 'measured' },
      { component: 'architect-view', detail: 'actual architect', bytes: 15, state: 'measured' },
      { component: 'support-documents', detail: 'delivered support and brief', bytes: 25, state: 'measured', buckets: { support: 20, brief: 5 } },
    ] },
    readScope: { policy: 'scope-size/2', snapshot: 'read-snapshot', bytes: 800, subtotal: 800, coverage: 'complete', components: [{ component: 'owned-source', detail: 'recorded separate read scope', bytes: 800, state: 'measured' }] },
    exploration: { metrics: { reads: 2, uniqueFilesRead: 1, repeatedReads: 1, returnedBytes: 12, searches: 1, broadSearches: 1, outsideScopeSearches: 1, toolElapsedMs: 30, coverage: [] }, zeroMatchSearches: 1,
      observations: [{ id: 'observation-s1', invocationId: 'inv-1', operationId: 'inv-1', role: 'engineer', sessionId: 'original-session', turn: 2, callId: 's1', kind: 'search', requestedScope: ['..', '**/*.ts'], resolvedScope: ['..'], files: [], returnedBytes: 0, startedAt: at(3), endedAt: at(4), elapsedMs: 10, outcome: 'completed', broad: true, outsideScope: true, coverage: ['Scanned bytes unavailable'] }] },
    timing: { startedAt: at(0), endedAt: at(5), milestone: 'first-engineering-action', milestoneAt: at(1), elapsedMs: 5000, toMilestoneMs: 1000, modelElapsedMs: 120, toolElapsedMs: 30, checkElapsedMs: null, modelSubtotalMs: 120, toolSubtotalMs: 30, checkSubtotalMs: 0, coverage: ['check duration not recorded'] },
    charges: [{ model: 'fixed/model', sourceRevision: 'captured-model-r1', currency: 'USD', source: 'estimated-from-recorded-rates', newInputTokens: 100, cachedInputTokens: 40, cacheWriteTokens: 10, outputTokens: 20,
      ratesPerMillion: { newInput: 2, cachedInput: 0.5, cacheWrite: 3, output: 4 }, newInput: 0.0002, cachedInput: 0.00002, cacheWrite: 0.00003, output: 0.00008, total: 0.00033, coverage: [] }], chargeTotal: 0.00033, chargeSubtotal: 0.00033, coverage: [],
    units: { scope: 'bytes', returned: 'UTF-8 output bytes', duration: 'ms', charge: 'USD' }, ...extra,
  });
}

function show(efficiency = fixture()) {
  return render(<SessionMetrics evaluation={evaluation('inv-1', { efficiency })} />);
}

test('V01: renders exact server scope components and separate read scope, provenance and observations', () => {
  show();
  const writer = screen.getByRole('region', { name: 'Declared writer scope' });
  expect(writer.textContent).toContain('90 bytes; known subtotal 90 bytes (complete)');
  expect(within(writer).getByRole('table', { name: 'Declared writer scope components' })).toBeTruthy();
  expect(writer.textContent).toContain('owned-source40measured');
  const read = screen.getByRole('region', { name: 'Recorded read scope' });
  expect(read.textContent).toContain('800 bytes');
  expect(writer.textContent).not.toContain('890');
  const exploration = screen.getByRole('region', { name: 'Observed exploration' });
  expect(exploration.textContent).toContain('2; unique files 1; repeated reads 1');
  expect(exploration.textContent).toContain('12 UTF-8 output bytes');
  expect(exploration.textContent).toContain('1; broad 1; outside declared scope 1; zero matches 1');
  fireEvent.click(screen.getByText('Recorded read and search calls'));
  expect(exploration.textContent).toContain('s1: search, completed; observation observation-s1');
  expect(exploration.textContent).toContain('Scanned bytes unavailable');
  expect(exploration.textContent).not.toContain('scanned 12');
  fireEvent.click(screen.getByText('Delivered input provenance'));
  expect(screen.getByText(/Manifest/).textContent).toContain('manifest-original');
  expect(screen.getByText(/role:engineer/).closest('li')!.textContent).toContain('role-r1');
});

test('V01: displays partial known scope/output/time/charge subtotals without fabricating complete totals', () => {
  const original = fixture();
  const charge = original.charges[0]!;
  show(fixture({ declared: { ...original.declared!, bytes: null, subtotal: 65, coverage: 'partial', components: [{ component: 'support-documents', bytes: null, state: 'unknown', detail: 'source missing', reason: 'unreadable support' }] },
    exploration: { ...original.exploration, metrics: { ...original.exploration.metrics, returnedBytes: 9, coverage: ['unreadable rows', 'files read unknown'] } },
    timing: { ...original.timing, toolElapsedMs: null, toolSubtotalMs: 10, milestone: null, milestoneAt: null, toMilestoneMs: null, coverage: ['duration missing'] },
    charges: [{ ...charge, output: null, total: null, ratesPerMillion: { ...charge.ratesPerMillion, output: null }, coverage: ['output rate absent'] }], chargeTotal: null, chargeSubtotal: 0.00025, coverage: ['observation log truncated'] }));
  expect(screen.getByRole('region', { name: 'Declared writer scope' }).textContent).toContain('unavailable bytes; known subtotal 65 bytes (partial)');
  expect(screen.getByRole('region', { name: 'Observed exploration' }).textContent).toContain('9 UTF-8 output bytes (known subtotal; coverage incomplete)');
  const timing = screen.getByRole('region', { name: 'Recorded timing' });
  expect(timing.textContent).toContain('unavailable ms; known subtotal 10 ms');
  expect(timing.textContent).toContain('milestone unavailable');
  expect(screen.getByRole('region', { name: 'Recorded charges' }).textContent).toContain('Total: unavailable USD; known subtotal 0.00025 USD');
  expect(screen.getByText('output rate absent')).toBeTruthy();
  expect(screen.getByText('observation log truncated')).toBeTruthy();
});

test('V01: recorded zero charge differs from missing usage, and provider amounts differ from recorded-rate estimates', () => {
  const source = fixture();
  show(fixture({ charges: [{ ...source.charges[0]!, newInputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, newInput: 0, cachedInput: 0, cacheWrite: 0, output: 0, total: 0 }], chargeTotal: 0, chargeSubtotal: 0 }));
  expect(screen.getByRole('region', { name: 'Recorded charges' }).textContent).toContain('Total: 0 USD; known subtotal 0 USD');
  cleanup();
  show(fixture({ charges: [], chargeTotal: null, chargeSubtotal: 0, coverage: ['usage not recorded'] }));
  expect(screen.getByRole('region', { name: 'Recorded charges' }).textContent).toContain('Total: unavailable USD; known subtotal 0 USD');
  expect(screen.getByText('usage not recorded')).toBeTruthy();
  cleanup();
  show(fixture({ charges: [{ ...source.charges[0]!, source: 'provider-recorded' }] }));
  expect(screen.getByText(/Provider-recorded charge/).textContent).toContain('provider-recorded');
});

test('V01: shows original timing and categorized charge identities and exact supplied amounts without recalculation', () => {
  show();
  const timing = screen.getByRole('region', { name: 'Recorded timing' });
  expect(timing.textContent).toContain('Elapsed wall time5000 ms');
  expect(timing.textContent).toContain('1000 ms; first-engineering-action');
  expect(timing.textContent).toContain('Tool duration sum30 ms');
  expect(timing.textContent).toContain('Model duration sum120 ms');
  expect(timing.textContent).toContain('Check duration sumunavailable ms');
  expect(screen.getByRole('region', { name: 'Recorded charges' }).textContent).toContain('0.00033 USD');
  const table = screen.getByRole('table', { name: 'Charge categories for fixed/model' });
  const rows = within(table).getAllByRole('row').slice(1).map(row => row.textContent);
  expect(rows).toEqual(['New input10020.0002', 'Cached input400.50.00002', 'Cache writes1030.00003', 'Output2040.00008']);
  expect(screen.getByText(/Estimate from recorded rates/).textContent).toContain('captured-model-r1');
  expect(document.body.textContent).not.toMatch(/savings|billed amount/);
  cleanup();
  // Deliberately unrelated recorded amount proves the renderer does not multiply token rates.
  const source = fixture();
  show(fixture({ charges: [{ ...source.charges[0]!, cachedInput: 0.777 }], chargeTotal: 0.999, chargeSubtotal: 0.999 }));
  expect(screen.getByRole('table', { name: 'Charge categories for fixed/model' }).textContent).toContain('0.777');
  expect(screen.getByRole('region', { name: 'Recorded charges' }).textContent).toContain('0.999 USD');
});

test('V02: same-number sibling turns and append checkpoints retain distinct generic session identity', () => {
  const left = fixture().operation!;
  render(<><OperationFacts invocation="left-inv" operation={{ ...left, sessionId: 'left', sourcePoint: { ...left.sourcePoint, sessionId: 'left', checkpoint: 'left-C1' }, point: { sessionId: 'left', kind: 'checkpoint', turn: 2, checkpoint: 'left-append-C3' } }} />
    <OperationFacts invocation="right-inv" operation={{ ...left, operationId: 'right-op', sessionId: 'right', sourcePoint: { ...left.sourcePoint, sessionId: 'right', checkpoint: 'right-C1' }, point: { sessionId: 'right', kind: 'turn', turn: 2, checkpoint: 'right-C2' } }} /></>);
  expect(screen.getByLabelText('Operation of left-inv').textContent).toContain('Turn 2 in left');
  expect(screen.getByLabelText('Operation of right-inv').textContent).toContain('Turn 2 in right');
  expect(screen.getByLabelText('Operation of left-inv').textContent).toContain('Checkpoint left-append-C3, turn 2 in left');
  expect(screen.getByLabelText('Operation of right-inv').textContent).toContain('right-C1');
});

test('V02: restored terminal facts are identical and null stopped points never become reusable links', () => {
  const original = fixture();
  const e = evaluation('inv-1', { efficiency: original });
  const view = render(<SessionMetrics evaluation={e} />);
  const first = screen.getByLabelText('Efficiency of inv-1').textContent;
  view.rerender(<SessionMetrics evaluation={evaluation('inv-1', { efficiency: JSON.parse(JSON.stringify(original)) })} />);
  expect(screen.getByLabelText('Efficiency of inv-1').textContent).toBe(first);
  expect(screen.queryByText(/retry attempt/i)).toBeNull();
  view.rerender(<SessionMetrics evaluation={evaluation('inv-1', { ended: 'stopped', efficiency: fixture({ operation: { ...original.operation!, point: null } }) })} />);
  expect(screen.getByLabelText('Operation of inv-1').textContent).toContain('No reusable completion point');
  expect(screen.getByText('Recorded result: stopped.')).toBeTruthy();
  expect(within(screen.getByLabelText('Operation of inv-1')).queryByRole('link')).toBeNull();
});

test('V02: old missing identity/manifest/scope stays explicit unavailable', () => {
  show(fixture({ operation: null, manifest: null, declared: null, readScope: null }));
  expect(screen.getByText('Operation identity unavailable for inv-1.')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Recorded read scope' }).textContent).toContain('Unavailable');
  fireEvent.click(screen.getByText('Delivered input provenance'));
  expect(screen.getByText('Manifest unavailable.')).toBeTruthy();
});

test('V02: actual standalone session page renders checkpoint/efficiency and retains transcript missing warning without polling', async () => {
  const client = new StubClient(); const id = 'standalone-original';
  const efficiency = fixture();
  client.standalone.set(id, standaloneSessionResponseSchema.parse({ session: {
    ref: { source: 'standalone', session: id }, state: 'finished', finished: 'work-closed', role: 'engineer', work: {}, executor: 'scripted', model: null, invocations: 1, degradedStarts: 0, reaches: { kind: 'module', module: 'shop' }, startedAt: at(0), changedAt: at(5),
  }, prompt: 'current goal', outcome: null, evaluation: evaluation(id, { efficiency }) }));
  client.transcripts.set(`${id}@0`, { session: { source: 'standalone', session: id }, page: page([], { file: 'missing' }) });
  render(<SessionPage client={client} session={{ source: 'standalone', session: id }} anchor={null} interval={1} />);
  const section = await screen.findByLabelText(`Efficiency of ${id}`);
  expect(section.textContent).toContain('Checkpoint brief-C1, turn 1 in original-session');
  expect(section.textContent).toContain('12 UTF-8 output bytes');
  expect(screen.getByText(/The transcript file of this session is missing/)).toBeTruthy();
  expect(client.calls.some(call => call.startsWith('pollSessions:'))).toBe(false);
});


test('V01: verified zero declared content and unknown read size stay distinct from absent legacy efficiency', () => {
  const original = fixture();
  show(fixture({ declared: { ...original.declared!, bytes: 0, subtotal: 0, components: [{ component: 'owned-source', detail: 'verified empty candidate', bytes: 0, state: 'measured' }] }, readScope: null }));
  expect(screen.getByRole('region', { name: 'Declared writer scope' }).textContent).toContain('0 bytes; known subtotal 0 bytes (complete)');
  expect(screen.getByRole('region', { name: 'Recorded read scope' }).textContent).toContain('Unavailable: no recorded scope size');
  cleanup();
  render(<SessionMetrics evaluation={evaluation('old')} />);
  expect(screen.getByText('Efficiency unavailable: no recorded observation projection.')).toBeTruthy();
});


test('V02: independently recorded operation survives null evaluation, while explicit null never falls back to metric identity', () => {
  render(<SessionMetrics evaluation={null} operation={fixture().operation} invocation="inv-1" />);
  expect(screen.getByLabelText('Operation of inv-1').textContent).toContain('Turn 2 in original-session');
  expect(screen.getByText('Efficiency unavailable: the invocation record cannot be read.')).toBeTruthy();
  cleanup();
  render(<SessionMetrics evaluation={evaluation('inv-1', { efficiency: fixture() })} operation={null} />);
  expect(screen.getByText('Operation identity unavailable for inv-1.')).toBeTruthy();
  expect(screen.queryByLabelText('Operation of inv-1')).toBeNull();
});


test('V02: timeline respects explicitly unavailable operation despite separate metric identity', () => {
  const metric = evaluation('inv-1', { efficiency: fixture() });
  const session = sessionView('ses-0002', { invocations: [invocation('inv-1', { operation: null, evaluation: metric })] });
  render(<SessionTimeline planId={planId} runId={runId} answer={{ version: 1, sessions: [session], total: 1 }} />);
  expect(screen.getByText('Operation identity unavailable for inv-1.')).toBeTruthy();
  expect(screen.queryByLabelText('Operation of inv-1')).toBeNull();
});

test('V01: actual Run Measurements renders immutable accepted projection facts through its query', async () => {
  const client = new StubClient();
  const e = evaluation('inv-1', { efficiency: fixture() });
  const snapshot = runSnapshotSchema.parse({ jobId: runId, planId, agent: 'scripted', version: 1, state: 'completed', phase: 'ended', stopRequested: false,
    startedAt: at(0), updatedAt: at(5), endedAt: at(5), failure: null, current: null, waits: [],
    counts: { workItems: 0, completedWorkItems: 0, openRequirements: 0, invocations: 1, readinessAttempts: 0, gateAttempts: 0, scenarios: { pending: 0, bound: 0, done: 0 }, degradedStarts: 0 },
    writer: { held: null, unsettled: null }, review: 'not-reviewed', decisionRequests: { open: 0, waiting: false, workItems: [] }, planDeviations: { recorded: 0, toReview: 0 }, environmentProblems: [], notices: [] });
  client.runs.set(runId, { snapshot, events: [], metrics: metricsResponseSchema.parse({ policyVersion: 'kpi/1', measurementPolicy: 'scope-size/2', baseline: { state: 'measured', bytes: 200, snapshot: 'baseline-original' }, metrics: [], lineage: { policyVersion: 'lineage/1', metrics: [] }, evaluation: { guarding: e.guarding, outsideScope: [], invocations: [e] } }) });
  render(<RunPage client={client} planId={planId} runId={runId} interval={60_000} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Measurements' }));
  fireEvent.click(await screen.findByText('inv-1 (engineer) · submitted'));
  const evidence = screen.getByLabelText('Efficiency of inv-1');
  expect(evidence.textContent).toContain('Turn 2 in original-session');
  expect(evidence.textContent).toContain('12 UTF-8 output bytes');
  expect(evidence.textContent).toContain('known subtotal 0.00033 USD');
  expect(client.calls).toContain(`getMetrics:${runId}`);
});
