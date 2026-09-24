// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { SessionCursor, SessionUpdatesResponse } from '../../../harness/src/interfaces/protocol/sessions.js';
import type { ProtocolClient } from '../client.js';
import { useTranscriptCoordinator } from '../transcript-coordinator.js';
import { TranscriptWorkspace, clampWindowRect, defaultWindowRect, type TranscriptWindowState } from '../transcript-workspace.js';
import { page, planId, reply, runId, sessionView } from './helpers/sessions.js';
import { StubClient } from './helpers/stub-client.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function windowState(id: string, z: number): TranscriptWindowState {
  const rect = defaultWindowRect(z);
  return { id, rect, restore: rect, z, minimized: false, maximized: false, anchor: null, anchorNonce: 0, opener: null };
}

test('one coordinator batches more than 50 open cursors and targets a session outside the list census', async () => {
  const ids = Array.from({ length: 52 }, (_, i) => `ses-${String(i + 1).padStart(4, '0')}`);
  const batches: string[][] = [];
  const loads: string[] = [];
  const client = {
    getRunSession: async (_plan: string, _run: string, session: string) => {
      loads.push(session);
      return { version: 1, session: sessionView(session, { state: 'live', finished: null }) };
    },
    getTranscript: async (ref: { session: string }, after: number) => ({ session: ref, page: page([], { cursor: after }) }),
    pollSessions: async (_plan: string, _run: string, version: number, cursors: readonly { session: string; after: number }[]) => {
      batches.push(cursors.map(cursor => cursor.session));
      return { version, sessions: [], transcripts: cursors.map(cursor => ({ session: cursor.session, page: page([], { cursor: cursor.after }) })) };
    },
  } as unknown as ProtocolClient;
  function Probe({ sessions }: { sessions: string[] }) {
    const readings = useTranscriptCoordinator(client, planId, runId, sessions, 60000);
    return <span>{readings.get('ses-0052')?.detail?.source === 'run' ? 'last session loaded' : 'loading'}</span>;
  }
  const view = render(<Probe sessions={ids} />);
  expect(await screen.findByText('last session loaded')).toBeTruthy();
  await waitFor(() => expect(batches.length).toBe(2));
  expect(batches.map(batch => batch.length).sort((a, b) => a - b)).toEqual([2, 50]);
  expect(new Set(batches.flat())).toEqual(new Set(ids));
  view.rerender(<Probe sessions={[...ids, 'ses-0053']} />);
  await waitFor(() => expect(loads).toHaveLength(53));
  expect(loads.filter(id => id === 'ses-0001')).toHaveLength(1);
});

test('two windows retain separate chapters and controls; links raise the target window', async () => {
  const client = new StubClient();
  const first = sessionView('ses-0001', { state: 'live', finished: null,
    point: { session: 'ses-0002', invocation: 'inv-0004' } });
  const second = sessionView('ses-0002', { state: 'live', finished: null });
  client.runSessionDetails.set(`${runId}:ses-0001`, { version: 1, session: first });
  client.runSessionDetails.set(`${runId}:ses-0002`, { version: 1, session: second });
  client.transcripts.set('ses-0001@0', { session: { source: 'run', planId, runId, session: 'ses-0001' }, page: page([reply(1, 'First live transcript')]) });
  client.transcripts.set('ses-0002@0', { session: { source: 'run', planId, runId, session: 'ses-0002' }, page: page([reply(2, 'Second transcript scrolled back')]) });
  client.polls.push({ version: 1, sessions: [], transcripts: [
    { session: 'ses-0001', page: page([], { cursor: 1 }) }, { session: 'ses-0002', page: page([], { cursor: 2 }) },
  ] });
  const opened = vi.fn(); const changed = vi.fn(); const closed = vi.fn(); const focused = vi.fn();
  const windows = [windowState('ses-0001', 1), windowState('ses-0002', 2)];
  render(<TranscriptWorkspace client={client} planId={planId} runId={runId} nodes={[]} windows={windows}
    onOpen={opened} onChange={changed} onClose={closed} onFocusMap={focused} />);
  const one = await screen.findByLabelText('Transcript window ses-0001');
  const two = screen.getByLabelText('Transcript window ses-0002');
  expect(await within(one).findByText('First live transcript')).toBeTruthy();
  expect(await within(two).findByText('Second transcript scrolled back')).toBeTruthy();
  fireEvent.click(within(one).getByRole('link', { name: /the end of inv-0004 in ses-0002/ }));
  expect(opened).toHaveBeenCalledWith('ses-0002', { kind: 'point', invocation: 'inv-0004' }, expect.any(HTMLElement));
  fireEvent.click(within(one).getByRole('button', { name: 'Focus on map' }));
  expect(focused).toHaveBeenCalledWith('ses-0001');
  fireEvent.click(within(one).getByRole('button', { name: 'Close ses-0001' }));
  expect(closed).toHaveBeenCalledWith('ses-0001');
  expect(within(two).getByText('Second transcript scrolled back')).toBeTruthy();
  const header = within(two).getByLabelText('Move or resize transcript ses-0002');
  fireEvent.keyDown(header, { key: 'ArrowRight' });
  expect(changed).toHaveBeenCalledWith('ses-0002', expect.objectContaining({ rect: expect.objectContaining({ x: windows[1]!.rect.x + 20 }) }));
  fireEvent.keyDown(within(two).getByRole('button', { name: 'Close ses-0002' }), { key: 'ArrowRight' });
  expect(changed).toHaveBeenCalledTimes(1);
});

test('one live window follows while another is scrolled back, and final trailing entries arrive', async () => {
  class QuietClient extends StubClient {
    override async pollSessions(_plan: string, _run: string, version: number, cursors: readonly SessionCursor[]): Promise<SessionUpdatesResponse> {
      const queued = this.polls.shift();
      return queued ?? { version, sessions: [], transcripts: cursors.map(cursor => ({ session: cursor.session,
        page: page([], { cursor: cursor.after }) })) };
    }
  }
  const client = new QuietClient();
  for (const [id, number] of [['ses-0001', 1], ['ses-0002', 2]] as const) {
    client.runSessionDetails.set(`${runId}:${id}`, { version: 1, session: sessionView(id, { state: 'live', finished: null }) });
    client.transcripts.set(`${id}@0`, { session: { source: 'run', planId, runId, session: id },
      page: page([reply(number, `Initial ${id}`)]) });
  }
  render(<TranscriptWorkspace client={client} planId={planId} runId={runId} nodes={[]}
    windows={[windowState('ses-0001', 1), windowState('ses-0002', 2)]}
    onOpen={() => {}} onChange={() => {}} onClose={() => {}} onFocusMap={() => {}} interval={20} />);
  const first = await screen.findByLabelText('Transcript window ses-0001');
  const second = screen.getByLabelText('Transcript window ses-0002');
  await within(first).findByText('Initial ses-0001');
  await within(second).findByText('Initial ses-0002');
  const scrolled = within(second).getByRole('region', { name: 'Transcript of ses-0002' });
  let top = 100;
  Object.defineProperty(scrolled, 'scrollHeight', { configurable: true, get: () => 1000 });
  Object.defineProperty(scrolled, 'clientHeight', { configurable: true, get: () => 200 });
  Object.defineProperty(scrolled, 'scrollTop', { configurable: true, get: () => top, set: value => { top = value; } });
  fireEvent.scroll(scrolled);
  client.polls.push({ version: 2, sessions: [], transcripts: [
    { session: 'ses-0001', page: page([reply(3, 'First keeps following')]) },
    { session: 'ses-0002', page: page([reply(4, 'Second has unread text')]) },
  ] });
  expect(await within(first).findByText('First keeps following')).toBeTruthy();
  expect(await within(second).findByRole('button', { name: /1 new entry below · Jump to live/ })).toBeTruthy();
  expect(within(first).queryByRole('button', { name: /new entry below/ })).toBeNull();
  expect(top).toBe(100);
  client.polls.push({ version: 3, sessions: [sessionView('ses-0001', { state: 'finished', finished: 'work-closed' })], transcripts: [
    { session: 'ses-0001', page: page([reply(5, 'Trailing final entry')]) },
    { session: 'ses-0002', page: page([], { cursor: 4 }) },
  ] });
  expect(await within(first).findByText('Trailing final entry')).toBeTruthy();
  await waitFor(() => expect(within(first).getByRole('status', { name: 'Following' }).textContent).toContain('Its transcript is complete as read.'));
  fireEvent.click(within(second).getByRole('button', { name: /1 new entry below · Jump to live/ }));
  expect(top).toBe(1000);
});

test('geometry clamps all edges and restores usable dimensions after viewport shrink', () => {
  expect(clampWindowRect({ x: 600, y: 400, width: 650, height: 500 }, 460, 350))
    .toEqual({ x: 8, y: 8, width: 444, height: 334 });
  expect(clampWindowRect({ x: -90, y: -20, width: 120, height: 80 }, 900, 700))
    .toEqual({ x: 8, y: 8, width: 320, height: 220 });
});

test('windows are dragged and resized within the same 8px margin the geometry clamp keeps', () => {
  const client = new StubClient();
  render(<TranscriptWorkspace client={client} planId={planId} runId={runId} nodes={[]} windows={[windowState('ses-0001', 1)]}
    onOpen={() => {}} onChange={() => {}} onClose={() => {}} onFocusMap={() => {}} interval={60000} />);
  const bounds = screen.getByLabelText('Transcript windows').querySelector('.transcript-window-bounds');
  expect(bounds).toBeTruthy();
  expect(clampWindowRect({ x: 0, y: 0, width: 640, height: 560 }, 1440, 900)).toEqual({ x: 8, y: 8, width: 640, height: 560 });
});
