import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { runSnapshotSchema, type RunSnapshot } from '../../../harness/src/interfaces/protocol/runs.js';
import type { RunSessionView } from '../../../harness/src/interfaces/protocol/sessions.js';
import { App } from '../app.js';
import { RunPage } from '../run-page.js';
import { layoutSessionTimeline, SessionTimeline } from '../session-timeline.js';
import { lineageAnswer, lineageSessions } from './helpers/lineage.js';
import { at, planId, runId } from './helpers/sessions.js';
import { StubClient } from './helpers/stub-client.js';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const base = `#/plans/${planId}/runs/${runId}/sessions`;

function renderTimeline(sessions: RunSessionView[] = lineageSessions(), total = sessions.length) {
  const view = render(<SessionTimeline planId={planId} runId={runId} answer={{ version: 16, sessions, total }} />);
  const surface = screen.getByRole('group', { name: /one lane each/ });
  return { ...view, surface };
}

function lane(name: string): HTMLElement {
  return screen.getByRole('group', { name: new RegExp(`^${name} `) });
}

function snapshot(extra: Partial<RunSnapshot> = {}): RunSnapshot {
  return runSnapshotSchema.parse({
    jobId: runId, planId, agent: 'scripted', version: 16, state: 'running', phase: 'working', stopRequested: false,
    startedAt: at(0), updatedAt: at(16), endedAt: null, failure: null, current: null, waits: [],
    counts: { workItems: 1, completedWorkItems: 0, openRequirements: 0, invocations: 6, readinessAttempts: 1, gateAttempts: 0, scenarios: { pending: 0, bound: 0, declared: 0, implemented: 0 }, degradedStarts: 0 },
    writer: { held: null, unsettled: null }, review: 'not-reviewed', notices: [], decisionRequests: { open: 0, waiting: false, workItems: [] }, planDeviations: { recorded: 0, toReview: 0 }, environmentProblems: [],
    ...extra,
  });
}

test('each session is a lane of its invocations, one segment per chapter, with suspended time as gaps', () => {
  const layout = layoutSessionTimeline(lineageSessions());
  expect(layout.lanes.map(entry => entry.session.session)).toEqual(['ses-0001', 'ses-0002', 'ses-0003', 'ses-0004', 'ses-0005']);
  // Columns are the sequences where a session changed, then the latest edge.
  expect(layout.columns.map(column => column.sequence)).toEqual([2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, null]);
  const x = (sequence: number | null) => layout.columns.find(column => column.sequence === sequence)!.x;
  const [first, second] = layout.segments.filter(segment => segment.session === 'ses-0003');
  expect([first!.x, first!.x + first!.width, second!.x, second!.x + second!.width]).toEqual([x(9), x(10), x(13), x(14)]);
  const gaps = layout.gaps.filter(gap => gap.session === 'ses-0003');
  expect(gaps.map(gap => [gap.x, gap.x + gap.width, gap.open])).toEqual([[x(10), x(13), false], [x(14), x(15), false]]);
  // A suspension that lasts and an awaited invocation reach the latest edge.
  expect(layout.gaps.find(gap => gap.session === 'ses-0001')).toMatchObject({ x: x(4), width: x(null) - x(4), open: true });
  expect(layout.segments.find(segment => segment.session === 'ses-0005')).toMatchObject({ x: x(16), width: x(null) - x(16), open: true });

  const { container } = renderTimeline();
  const engineer = lane('ses-0003');
  const segments = within(engineer).getAllByRole('link', { name: /^Chapter/ });
  expect(segments.map(segment => segment.getAttribute('href'))).toEqual([`${base}/ses-0003/chapters/inv-0003`, `${base}/ses-0003/chapters/inv-0005`]);
  expect(segments[1]!.getAttribute('aria-label')).toBe(
    'Chapter 2 of ses-0003: inv-0005, continued from the end of inv-0003 (iteration-closed), submitted, kept, events 13 to 14');
  expect(container.querySelectorAll('.timeline-gap[data-session="ses-0003"]')).toHaveLength(2);
  expect(container.querySelectorAll('.timeline-gap-open[data-session="ses-0001"]')).toHaveLength(1);
  const awaited = within(lane('ses-0005')).getByRole('link', { name: /^Chapter 1 of ses-0005/ });
  expect(awaited.getAttribute('aria-label')).toContain('awaited, from event 16');
  expect(awaited.className).toContain('timeline-segment-open');
  expect(awaited.className).toContain('timeline-segment-awaited');
  expect([...container.querySelectorAll('.timeline-tick')].at(-1)!.textContent).toBe('now');
});

test('an appended brief is a mark on the gap that opens its point', () => {
  const layout = layoutSessionTimeline(lineageSessions());
  expect(layout.marks).toEqual([expect.objectContaining({ session: 'ses-0001', x: layout.columns.find(column => column.sequence === 6)!.x })]);
  renderTimeline();
  const mark = within(lane('ses-0001')).getByRole('link', { name: 'Brief dec-001 appended to ses-0001 at event 6, context generation 1' });
  expect(mark.getAttribute('href')).toBe(`${base}/ses-0001/appends/6`);
});

test('a fork branches from its source point: an append, or an invocation\'s end', () => {
  const sessions = lineageSessions();
  const layout = layoutSessionTimeline(sessions);
  const fork = layout.links.find(link => link.kind === 'fork')!;
  const source = layout.lanes[0]!;
  const target = layout.lanes[1]!;
  expect(fork).toEqual({ kind: 'fork', from: 'ses-0001', to: 'ses-0002', x1: layout.marks[0]!.x, y1: source.center, x2: target.start, y2: target.center });

  const fromEnd = sessions.map(session => session.session === 'ses-0002'
    ? { ...session, lineage: { ...session.lineage, fork: { ...session.lineage.fork!, from: { session: 'ses-0001', invocation: 'inv-0001' } } } }
    : session);
  const again = layoutSessionTimeline(fromEnd);
  const end = again.segments.find(segment => segment.invocation.invocation === 'inv-0001')!;
  expect(again.links.find(link => link.kind === 'fork')!.x1).toBe(end.x + end.width);

  const { container } = renderTimeline();
  const path = container.querySelector('.timeline-link-fork')!;
  expect([path.getAttribute('data-from'), path.getAttribute('data-to')]).toEqual(['ses-0001', 'ses-0002']);
  expect(path.getAttribute('d')).toMatch(new RegExp(`^M ${fork.x1} ${fork.y1} `));
  expect(within(lane('ses-0002')).getByRole('link', { name: /^Chapter 1/ }).getAttribute('aria-label'))
    .toContain('forked from the append at event 6 in ses-0001 (placement-request, context generation 1)');
});

test('a replacement is a dashed link from the end of the session it replaced', () => {
  const layout = layoutSessionTimeline(lineageSessions());
  const replaced = layout.lanes[2]!;
  expect(replaced.end).toBe(layout.columns.find(column => column.sequence === 15)!.x);
  expect(layout.links.find(link => link.kind === 'replace')).toMatchObject({ from: 'ses-0003', to: 'ses-0005', x1: replaced.end, y1: replaced.center });

  const { container } = renderTimeline();
  const path = container.querySelector('.timeline-link-replace')!;
  expect([path.getAttribute('data-from'), path.getAttribute('data-to')]).toEqual(['ses-0003', 'ses-0005']);
  expect(within(lane('ses-0005')).getByRole('link', { name: /^Chapter 1/ }).getAttribute('aria-label'))
    .toContain('opened in place of ses-0003 (reconstructed)');
});

test('a requested session is linked from the end of the invocation that asked for it', () => {
  const layout = layoutSessionTimeline(lineageSessions());
  const requester = layout.segments.find(segment => segment.invocation.invocation === 'inv-0003')!;
  expect(layout.links.find(link => link.kind === 'request')).toMatchObject({
    from: 'ses-0003', to: 'ses-0004', x1: requester.x + requester.width, x2: layout.lanes[3]!.start,
  });

  const { container } = renderTimeline();
  const path = container.querySelector('.timeline-link-request')!;
  expect([path.getAttribute('data-from'), path.getAttribute('data-to')]).toEqual(['ses-0003', 'ses-0004']);
  expect(within(lane('ses-0004')).getByRole('link', { name: /^Chapter 1/ }).getAttribute('aria-label'))
    .toContain('requested by inv-0003 in ses-0003 (contract-needed)');
});

test('a degraded start is marked on its segment and said in its name', () => {
  renderTimeline();
  const segment = within(lane('ses-0002')).getByRole('link', { name: /^Chapter 1/ });
  expect(segment.className).toContain('timeline-segment-degraded');
  expect(segment.querySelector('.timeline-degraded')!.textContent).toBe('!');
  expect(segment.getAttribute('aria-label')).toContain('degraded start: fork was requested and fresh was made (the source session file is gone)');
  const others = screen.getAllByRole('link', { name: /^Chapter/ }).filter(link => link !== segment);
  expect(others.every(link => !link.className.includes('degraded'))).toBe(true);
});

test('the text alternative says every relation, and each segment and mark is a link in lane order', () => {
  const { surface } = renderTimeline();
  const scroll = screen.getByLabelText('Scrollable session timeline');
  expect(scroll.tabIndex).toBe(0);
  expect(within(surface).getAllByRole('link').map(link => link.getAttribute('aria-label') ?? link.textContent).map(name => name!.split(',')[0])).toEqual([
    'ses-0001', 'Chapter 1 of ses-0001: inv-0001', 'Brief dec-001 appended to ses-0001 at event 6',
    'ses-0002', 'Chapter 1 of ses-0002: inv-0002',
    'ses-0003', 'Chapter 1 of ses-0003: inv-0003', 'Chapter 2 of ses-0003: inv-0005',
    'ses-0004', 'Chapter 1 of ses-0004: inv-0004',
    'ses-0005', 'Chapter 1 of ses-0005: inv-0006',
  ]);

  const list = screen.getByRole('list', { name: 'Sessions and their relations' });
  const item = (session: string) => within(list).getByRole('link', { name: new RegExp(`^${session} `) }).closest('li')!;
  expect(item('ses-0001').textContent).toContain('forked into ses-0002');
  expect(item('ses-0001').textContent).toContain('Suspended from event 4, and still is');
  expect(item('ses-0002').textContent).toContain('forked from the append at event 6 in ses-0001 (placement-request, context generation 1, holding briefs dec-001)');
  expect(item('ses-0002').textContent).toContain('degraded start: fork was requested and fresh was made');
  expect(item('ses-0003').textContent).toContain('replaced by ses-0005');
  expect(item('ses-0003').textContent).toContain('requested ses-0004');
  expect(item('ses-0003').textContent).toContain('Suspended from event 10 to event 13');
  expect(within(item('ses-0004')).getByRole('link', { name: 'inv-0003 in ses-0003' }).getAttribute('href')).toBe(`${base}/ses-0003/chapters/inv-0003`);
  expect(item('ses-0005').textContent).toContain('in place of ses-0003 (reconstructed)');
  expect(within(item('ses-0003')).getByRole('link', { name: 'Chapter 2: inv-0005' }).getAttribute('href')).toBe(`${base}/ses-0003/chapters/inv-0005`);
});

test('a bounded answer and a relation whose source it lacks are said, not drawn', () => {
  const { container } = renderTimeline(lineageSessions().slice(1), 5);
  const coverage = screen.getByRole('status', { name: 'Response coverage' });
  expect(coverage.textContent).toContain('Showing 4 / 5 sessions');
  expect(within(coverage).getByRole('list', { name: 'Relations not drawn' }).textContent).toBe('ses-0002 forked from ses-0001');
  expect(container.querySelector('.timeline-link-fork')).toBeNull();
  expect(container.querySelector('.timeline-link-replace')).not.toBeNull();
});

test('selecting a segment opens that chapter of the transcript', async () => {
  const client = new StubClient();
  client.runs.set(runId, { snapshot: snapshot(), events: [] });
  client.runSessions.set(runId, lineageAnswer());
  client.transcripts.set('ses-0003@0', { session: { source: 'run', planId, runId, session: 'ses-0003' }, page: { file: 'missing', entries: [], cursor: 0, more: false, partial: false, unreadable: [] } });
  window.location.hash = `#/plans/${planId}/runs/${runId}`;
  render(<App client={client} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Sessions' }));
  const segment = await within(await screen.findByRole('group', { name: /^ses-0003 / })).findByRole('link', { name: /^Chapter 2 of ses-0003/ });
  fireEvent.click(segment);
  // jsdom follows a fragment link as a browser does, and the App reads the new fragment.
  await waitFor(() => expect(window.location.hash).toBe(`${base}/ses-0003/chapters/inv-0005`));
  const heading = await screen.findByRole('heading', { name: /^Chapter 2: inv-0005/ });
  expect(heading.closest('section')!.className).toContain('chapter-selected');
  expect(document.activeElement).toBe(heading);
});

test('a live session\'s timeline grows as the run\'s version moves', async () => {
  const client = new StubClient();
  client.runs.set(runId, { snapshot: snapshot(), events: [] });
  client.runSessions.set(runId, lineageAnswer());
  render(<RunPage client={client} planId={planId} runId={runId} interval={10} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Sessions' }));
  const awaited = await within(await screen.findByRole('group', { name: /^ses-0005 / })).findByRole('link', { name: /^Chapter 1 of ses-0005/ });
  expect(awaited.getAttribute('aria-label')).toContain('awaited');

  const ended = lineageSessions().map(session => session.session !== 'ses-0005' ? session : {
    ...session, state: 'finished' as const, finished: 'work-closed' as const, awaiting: null, changed: { sequence: 17, at: at(17) },
    point: { session: 'ses-0005', invocation: 'inv-0006' },
    invocations: session.invocations.map(invocation => ({
      ...invocation, ended: { sequence: 17, at: at(17) }, outcome: 'submitted' as const, kept: false, point: { session: 'ses-0005', invocation: 'inv-0006' },
    })),
  });
  client.runSessions.set(runId, lineageAnswer(ended, 17));
  client.runs.set(runId, { snapshot: snapshot({ version: 17 }), events: [] });
  await screen.findByRole('link', { name: /^Chapter 1 of ses-0005: inv-0006, opened in place of ses-0003 \(reconstructed\), submitted/ });
  expect(screen.getByRole('group', { name: /^ses-0005 / }).getAttribute('aria-label')).toBe('ses-0005 engineer, finished');
});
