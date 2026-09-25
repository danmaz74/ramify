import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  capabilityListResponseSchema, moduleCapabilityComparisonResponseSchema, runSnapshotSchema,
  type CapabilityProgress, type ModuleCapabilityComparisonResponse, type RunEventPage, type RunSnapshot,
} from '../../../harness/src/interfaces/protocol/runs.js';
import type { RunSessionView } from '../../../harness/src/interfaces/protocol/sessions.js';
import { CapabilityDependencyGraph, layoutCapabilityGraph, sessionMarksHeight } from '../capability-graph.js';
import { CapabilityModuleTree, comparisonNodes, type ModuleCapabilitySelection } from '../capability-module-tree.js';
import { RunPage } from '../run-page.js';
import { marksText, moduleOf, panelOrder, sessionsBy, type DiagramSessions } from '../session-marks.js';
import { architect, at, globalFork, liveEngineer, planId, runId, sessionView } from './helpers/sessions.js';
import { StubClient } from './helpers/stub-client.js';

/*
 * ST11: the progress diagrams show where agents are working. Capability
 * nodes and module bodies carry the number of their live sessions with the
 * roles, and their suspended and interrupted sessions apart; selecting one
 * lists its sessions, live and suspended first, each opening its transcript;
 * sessions without a drawn element are on the run-level strip; and the
 * marks change within one poll of the run.
 */

// By module draws the packaged React Flow canvas, which jsdom cannot measure.
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const reviews = 'shop/reviews';
const search = 'shop/search';
const href = (session: string) => `#/plans/${planId}/runs/${runId}/sessions/${session}`;

/** ses-0002, the live engineer of send-button in shop/reviews, awaiting inv-0004. */
const engineer = liveEngineer();
/** ses-0004, the local architect of send-button, suspended while its engineer works. */
const localArchitect = sessionView('ses-0004', {
  state: 'suspended', finished: null, role: 'local-architect', work: { workItem: 'wi-001' },
  opened: { sequence: 3, at: at(3) }, changed: { sequence: 8, at: at(8) },
});
/** ses-0005, a finished engineer of send-button. */
const earlierEngineer = sessionView('ses-0005', { opened: { sequence: 20, at: at(20) }, changed: { sequence: 22, at: at(22) } });
/** ses-0006 and ses-0007, two live engineers of note-search in shop/search, as parallel sessions would be. */
const searchEngineers = ['ses-0006', 'ses-0007'].map(session => sessionView(session, {
  state: 'live', finished: null, awaiting: 'inv-0009',
  reaches: { kind: 'work-item', workItem: 'wi-002', capability: 'note-search', module: search },
}));
/** ses-0008, interrupted on note-search when its run ended. */
const interrupted = sessionView('ses-0008', {
  state: 'interrupted', finished: null, awaiting: 'inv-0010',
  reaches: { kind: 'work-item', workItem: 'wi-002', capability: 'note-search', module: search },
});
/** ses-0009, suspended on a capability no diagram here draws. */
const elsewhere = sessionView('ses-0009', {
  state: 'suspended', finished: null, role: 'local-architect',
  reaches: { kind: 'work-item', workItem: 'wi-004', capability: 'not-drawn', module: 'shop/not-drawn' },
});

/** The run's sessions, in opening order as the harness answers them. The architect is finished; the global fork too. */
const all: RunSessionView[] = [architect, engineer, globalFork, localArchitect, earlierEngineer, ...searchEngineers, interrupted, elsewhere];
const diagram: DiagramSessions = { planId, runId, sessions: all };

const capability = (id: string, extra: Partial<CapabilityProgress> = {}): CapabilityProgress => ({
  capability: id, owner: reviews, entry: false, tentative: false, state: 'working', reason: `${id} reason`,
  dependsOn: [], workItems: [], evidence: [], scenarios: extra.entry === true ? { implemented: 0, total: 1 } : null, ...extra,
});
const capabilities = capabilityListResponseSchema.parse({
  capabilities: [
    capability('send-button', { entry: true, dependsOn: [{ capability: 'note-search', tentative: false }], workItems: ['wi-001'] }),
    capability('note-search', { owner: search, workItems: ['wi-002'] }),
    capability('quiet', { state: 'todo' }),
  ],
  total: 3,
});

const marksOf = (node: HTMLElement) => [...node.querySelectorAll('.session-mark, .role-chip')].map(mark => [mark.className.split(' ').at(-1), mark.textContent]);

describe('the capability graph', () => {
  test('a node shows its live sessions by role, and its suspended and interrupted ones apart; a node of finished sessions shows none', () => {
    render(<CapabilityDependencyGraph {...capabilities} sessions={diagram} />);
    const send = screen.getByRole('button', { name: 'send-button, working, entry, sessions: 1 live (engineer), 1 suspended' });
    expect(marksOf(send)).toEqual([['session-mark-live', '1 live'], ['role-chip', 'engineer'], ['session-mark-suspended', '1 suspended']]);
    const note = screen.getByRole('button', { name: 'note-search, working, sessions: 2 live (engineer ×2), 1 interrupted' });
    expect(marksOf(note)).toEqual([['session-mark-live', '2 live'], ['role-chip', 'engineer ×2'], ['session-mark-interrupted', '1 interrupted']]);
    const quiet = screen.getByRole('button', { name: 'quiet, todo' });
    expect(marksOf(quiet)).toEqual([]);
    // Every node keeps the line for its marks, so a mark never moves a node.
    expect(quiet.querySelector('.capability-node-sessions')).not.toBeNull();
    const plain = layoutCapabilityGraph(capabilities.capabilities);
    const marked = layoutCapabilityGraph(capabilities.capabilities, sessionMarksHeight);
    expect(marked.nodes.map(node => node.height)).toEqual(plain.nodes.map(node => node.height + sessionMarksHeight));
    // The legend names each mark.
    expect(screen.getByLabelText('Graph legend').textContent).toContain('N suspended kept to be continued');
  });

  test('without the run\'s sessions a node is drawn as before, with no line for marks', () => {
    render(<CapabilityDependencyGraph {...capabilities} />);
    expect(screen.getByRole('button', { name: 'send-button, working, entry' }).querySelector('.capability-node-sessions')).toBeNull();
    expect(screen.queryByLabelText('Sessions without an element here')).toBeNull();
  });

  test('selecting a node lists its sessions, live and suspended first, each opening its transcript', () => {
    render(<CapabilityDependencyGraph {...capabilities} sessions={diagram} />);
    fireEvent.click(screen.getByRole('button', { name: /^send-button,/ }));
    const list = within(screen.getByLabelText('Details for send-button')).getByLabelText('Sessions of send-button');
    const items = within(list).getAllByRole('listitem');
    // Live, then suspended, then the finished ones, the latest change first: the global fork reached send-button through its request.
    expect(items.map(item => item.querySelector('a')!.textContent)).toEqual(['ses-0002 engineer', 'ses-0004 local-architect', 'ses-0005 engineer', 'ses-0003 global-fork']);
    expect(items.map(item => item.querySelector('.session-state')!.textContent)).toEqual(['live', 'suspended', 'finished', 'finished']);
    expect(within(items[0]!).getByRole('link', { name: 'ses-0002 engineer' }).getAttribute('href')).toBe(href('ses-0002'));
    expect(within(items[0]!).getByRole('link', { name: 'inv-0004' }).getAttribute('href')).toBe(`${href('ses-0002')}/chapters/inv-0004`);
    expect(items[0]!.textContent).toContain('awaiting inv-0004');
    expect(items[3]!.textContent).toContain('work-closed');

    fireEvent.click(screen.getByRole('button', { name: /^quiet,/ }));
    expect(within(screen.getByLabelText('Sessions of quiet')).getByText('No session of this run has reached it.')).toBeTruthy();
  });

  test('the run-level strip holds the sessions no node is drawn for: the run itself, and elements this response lacks', () => {
    render(<CapabilityDependencyGraph {...capabilities} sessions={diagram} />);
    const strip = screen.getByLabelText('Sessions without an element here');
    expect(marksOf(strip.querySelector('.session-strip-label')!)).toEqual([['session-mark-suspended', '1 suspended']]);
    const open = strip.querySelector(':scope > .session-strip-list')!;
    expect([...open.querySelectorAll('li')].map(item => item.textContent)).toEqual([
      'ses-0009 local-architectsuspended · work item wi-004, capability not-drawn, module shop/not-drawn',
    ]);
    const finished = within(strip).getByText('1 finished').closest('details')!;
    expect(within(finished).getByRole('link', { name: 'ses-0001 initial-architect' }).getAttribute('href')).toBe(href('ses-0001'));
  });
});

const comparison: ModuleCapabilityComparisonResponse = moduleCapabilityComparisonResponseSchema.parse({
  identityPolicy: 'exact-capability-slug/1',
  runVersion: 12,
  initialView: { status: 'placeholder' },
  tree: {
    status: 'available', revision: 'rev/1:tree:3', input: 'input/1:abc',
    modules: [{ module: 'shop', dir: '', parent: null }, { module: reviews, dir: 'subs/reviews', parent: 'shop' }, { module: search, dir: 'subs/search', parent: 'shop' }],
  },
  modules: [
    { module: 'shop', placement: 'declared', proposedAtStart: null, capabilities: [] },
    { module: reviews, placement: 'declared', proposedAtStart: null, capabilities: [{ capability: 'send-button', initial: [{ role: 'entry-owner', hypothesis: null }], implementedHere: null }] },
    { module: search, placement: 'declared', proposedAtStart: null, capabilities: [{ capability: 'note-search', initial: [{ role: 'suggested-owner', hypothesis: 'note-search' }], implementedHere: null }] },
  ],
  coverage: { state: 'complete', capabilities: 2, implemented: 0 },
});

function Tree({ sessions }: { readonly sessions: DiagramSessions }) {
  const [selection, setSelection] = useState<ModuleCapabilitySelection | null>(null);
  return (
    <div style={{ width: 1200, height: 800 }}>
      <CapabilityModuleTree comparison={comparison} selection={selection} onSelect={setSelection} sessions={sessions} />
    </div>
  );
}

const shell = (module: string) => document.querySelector<HTMLElement>(`[data-module-id="${module}"]`)!;

describe('By module', () => {
  test('a module body shows its sessions\' marks beside its name, and its node widens to hold them', async () => {
    render(<Tree sessions={diagram} />);
    await screen.findByLabelText('Modules with their capability rows');
    expect(marksOf(shell(reviews).querySelector('.capability-module-heading')!)).toEqual([
      ['session-mark-live', '1 live'], ['role-chip', 'engineer'], ['session-mark-suspended', '1 suspended'],
    ]);
    expect(marksOf(shell(search))).toEqual([['session-mark-live', '2 live'], ['role-chip', 'engineer ×2'], ['session-mark-interrupted', '1 interrupted']]);
    expect(marksOf(shell('shop'))).toEqual([]);
    expect(shell(reviews).getAttribute('aria-label')).toContain('sessions: 1 live (engineer), 1 suspended');
    const plain = comparisonNodes(comparison).find(node => node.id === reviews)!;
    const marked = comparisonNodes(comparison, sessionsBy(all, moduleOf)).find(node => node.id === reviews)!;
    expect(marked.width).toBeGreaterThan(plain.width);
    expect(marked.height).toBe(plain.height);
  });

  test('selecting a module or a row lists its sessions, live and suspended first', async () => {
    render(<Tree sessions={diagram} />);
    await screen.findByLabelText('Modules with their capability rows');
    fireEvent.click(shell(search));
    const moduleSessions = within(screen.getByLabelText(`Details for module ${search}`)).getByLabelText(`Sessions of ${search}`);
    expect(within(moduleSessions).getAllByRole('link', { name: /^ses-/ }).map(link => [link.textContent, link.getAttribute('href')])).toEqual([
      ['ses-0006 engineer', href('ses-0006')], ['ses-0007 engineer', href('ses-0007')], ['ses-0008 engineer', href('ses-0008')],
    ]);

    fireEvent.click(within(shell(reviews)).getByRole('button', { name: /^send-button,/ }));
    const rowSessions = screen.getByLabelText('Sessions of send-button');
    expect(within(rowSessions).getAllByRole('link', { name: /^ses-/ }).map(link => link.textContent))
      .toEqual(['ses-0002 engineer', 'ses-0004 local-architect', 'ses-0005 engineer', 'ses-0003 global-fork']);
  });

  test('the strip holds the run itself, a request\'s fork, which reaches no module, and a module the tree does not draw', async () => {
    render(<Tree sessions={diagram} />);
    const strip = await screen.findByLabelText('Sessions without an element here');
    expect(within(strip).getByRole('link', { name: 'ses-0009 local-architect' })).toBeTruthy();
    const finished = within(strip).getByText('2 finished').closest('details')!;
    expect(within(finished).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'ses-0003 global-forkfinished work-closed · request pr-001, capability send-button, work item wi-001',
      'ses-0001 initial-architectfinished work-closed',
    ]);
  });
});

test('marks in words and the panel order', () => {
  expect(marksText(all)).toBe('3 live (engineer ×3), 2 suspended, 1 interrupted');
  expect(marksText([architect])).toBe('');
  expect(panelOrder(all).map(session => session.session)).toEqual([
    'ses-0002', 'ses-0006', 'ses-0007', 'ses-0004', 'ses-0009', 'ses-0008', 'ses-0005', 'ses-0003', 'ses-0001',
  ]);
});

/**
 * A client whose run is read by a poll the test releases: each release lets
 * exactly one more read of the run's events answer.
 */
class PacedClient extends StubClient {
  private releases: Array<() => void> = [];
  answeredPolls = 0;

  release(): void {
    this.releases.shift()?.();
  }

  override async getEvents(plan: string, run: string, after: number): Promise<RunEventPage> {
    if (this.answeredPolls > 0) await new Promise<void>(resolve => this.releases.push(resolve));
    const page = await super.getEvents(plan, run, after);
    this.answeredPolls += 1;
    return page;
  }

  waiting(): number {
    return this.releases.length;
  }
}

function snapshot(version: number): RunSnapshot {
  return runSnapshotSchema.parse({
    jobId: runId, planId, agent: 'scripted', version, state: 'running', phase: 'working', stopRequested: false,
    startedAt: at(0), updatedAt: at(0), endedAt: null, failure: null, current: null, waits: [],
    counts: { workItems: 2, completedWorkItems: 0, openRequirements: 0, invocations: 4, readinessAttempts: 1, gateAttempts: 0, scenarios: { pending: 0, bound: 0, declared: 0, implemented: 0 }, degradedStarts: 0 },
    writer: { held: null, unsettled: null }, review: 'not-reviewed', notices: [], decisionRequests: { open: 0, waiting: false, workItems: [] }, planDeviations: { recorded: 0, toReview: 0 },
  });
}

describe('following the run', () => {
  test('the marks change within one poll of a state change, on both diagrams', async () => {
    const client = new PacedClient();
    client.runs.set(runId, { snapshot: snapshot(14), events: [], capabilities, moduleCapabilities: comparison });
    client.runSessions.set(runId, { version: 14, sessions: [architect, engineer, localArchitect], total: 3 });
    render(<RunPage client={client} planId={planId} runId={runId} interval={5} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Progress' }));
    await screen.findByLabelText('Modules with their capability rows');
    await waitFor(() => expect(marksOf(shell(reviews))).toEqual([['session-mark-live', '1 live'], ['role-chip', 'engineer'], ['session-mark-suspended', '1 suspended']]));
    await waitFor(() => expect(client.waiting()).toBe(1));

    // The engineer's invocation ends and its session is finished; its architect is continued.
    const polls = client.answeredPolls;
    client.runs.get(runId)!.snapshot = snapshot(16);
    client.runSessions.set(runId, {
      version: 16,
      sessions: [architect, { ...engineer, state: 'finished', finished: 'work-closed', awaiting: null }, { ...localArchitect, state: 'live', awaiting: 'inv-0005' }],
      total: 3,
    });
    await act(async () => { client.release(); });
    await waitFor(() => expect(marksOf(shell(reviews))).toEqual([['session-mark-live', '1 live'], ['role-chip', 'local-architect']]));
    expect(client.answeredPolls).toBe(polls + 1);

    // The Dependencies view reads the same sessions at the same version.
    fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }));
    expect(marksOf(await screen.findByRole('button', { name: 'send-button, working, entry, sessions: 1 live (local-architect)' })))
      .toEqual([['session-mark-live', '1 live'], ['role-chip', 'local-architect']]);
    expect(client.answeredPolls).toBe(polls + 1);
  });

  test('sessions that cannot be read leave the diagrams unmarked and say so', async () => {
    const client = new StubClient();
    client.runs.set(runId, { snapshot: { ...snapshot(14), state: 'completed' }, events: [], capabilities, moduleCapabilities: comparison });
    render(<RunPage client={client} planId={planId} runId={runId} interval={60_000} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Progress' }));
    const progress = await screen.findByLabelText('Progress');
    expect((await within(progress).findByText(/^The sessions are not marked:/)).textContent).toContain('No sessions of run');
    await screen.findByLabelText('Modules with their capability rows');
    expect(document.querySelector('.session-marks')).toBeNull();
    expect(screen.queryByLabelText('Sessions without an element here')).toBeNull();
  });
});
