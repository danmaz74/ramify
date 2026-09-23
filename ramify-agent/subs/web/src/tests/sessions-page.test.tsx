import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { sessionListResponseSchema, type SessionListEntry } from '../../../harness/src/interfaces/protocol/sessions.js';
import { App } from '../app.js';
import { parseRoute, routeHref } from '../routes.js';
import { SessionsPage } from '../sessions-page.js';
import { architect, at, liveEngineer, planId, runId } from './helpers/sessions.js';
import { StubClient } from './helpers/stub-client.js';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const standaloneId = '20260921T101500Z-a1b2c3';

function entry(extra: Partial<SessionListEntry> & Pick<SessionListEntry, 'ref' | 'state'>): SessionListEntry {
  return {
    finished: null, role: 'engineer', work: { workItem: 'wi-001', iteration: 'wi-001.i02' }, executor: 'scripted', model: null, invocations: 2,
    reaches: { kind: 'work-item', workItem: 'wi-001', capability: 'send-button', module: 'shop/reviews' }, startedAt: at(5), changedAt: at(14),
    ...extra,
  };
}

const list = sessionListResponseSchema.parse({
  sessions: [
    entry({ ref: { source: 'run', planId, runId, session: 'ses-0002' }, state: 'live' }),
    entry({ ref: { source: 'run', planId, runId, session: 'ses-0004' }, state: 'suspended', role: 'local-architect' }),
    entry({ ref: { source: 'standalone', session: standaloneId }, state: 'interrupted', work: {}, invocations: 1, reaches: { kind: 'module', module: 'shop/reviews' } }),
    entry({ ref: { source: 'run', planId, runId, session: 'ses-0001' }, state: 'finished', finished: 'work-closed', role: 'initial-architect', work: {}, reaches: { kind: 'run' } }),
  ],
  total: 4, offset: 0, next: null, unserved: [{ source: 'run', path: 'plans/old/runs/x', message: 'The run log is ramify-agent.job/2, which is not served' }],
});

test('ST09: the Sessions page lists live and suspended sessions first, across runs and standalone sessions, each opening its transcript', async () => {
  const client = new StubClient();
  client.sessionList = list;
  render(<SessionsPage client={client} interval={60_000} />);
  const open = (await screen.findByRole('heading', { name: 'Live and suspended' })).closest('section')!;
  const closed = screen.getByRole('heading', { name: 'Finished and interrupted' }).closest('section')!;
  expect(within(open).getAllByRole('listitem').map(item => item.querySelector('.session-state')!.textContent)).toEqual(['live', 'suspended']);
  expect(within(closed).getAllByRole('listitem').map(item => item.querySelector('.session-state')!.textContent)).toEqual(['interrupted', 'finished']);
  expect(within(open).getByRole('link', { name: 'ses-0002 engineer' }).getAttribute('href')).toBe(`#/plans/${planId}/runs/${runId}/sessions/ses-0002`);
  expect(within(closed).getByRole('link', { name: `${standaloneId} engineer` }).getAttribute('href')).toBe(`#/sessions/standalone/${standaloneId}`);
  expect(within(closed).getAllByRole('listitem')[0]!.textContent).toContain('Standalone session');
  expect(within(closed).getAllByRole('listitem')[1]!.textContent).toContain('work-closed');
  expect(within(open).getAllByRole('listitem')[0]!.textContent).toContain('work item wi-001, capability send-button, module shop/reviews');
  expect(screen.getByRole('alert').textContent).toContain('plans/old/runs/x');
});

test('the list is read again while a session is live, and pages follow the harness\'s offsets', async () => {
  const client = new StubClient();
  client.sessionList = { ...list, total: 250, next: 200 };
  render(<SessionsPage client={client} interval={10} />);
  await screen.findByRole('heading', { name: 'Live and suspended' });
  await waitFor(() => expect(client.calls.filter(call => call === 'listSessions:0').length).toBeGreaterThan(1));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(client.calls).toContain('listSessions:200'));

  cleanup();
  const quiet = new StubClient();
  quiet.sessionList = { ...list, sessions: list.sessions.slice(2), total: 2 };
  render(<SessionsPage client={quiet} interval={10} />);
  await screen.findByRole('heading', { name: 'Finished and interrupted' });
  await new Promise(resolve => setTimeout(resolve, 40));
  expect(quiet.calls.filter(call => call.startsWith('listSessions'))).toEqual(['listSessions:0']);
});

test('an empty project says that no session was recorded', async () => {
  render(<SessionsPage client={new StubClient()} interval={60_000} />);
  expect((await screen.findByText(/No session has been recorded in this project yet/)).textContent).toContain('ramify-agent session');
});

test('the header links to the Sessions page beside the plans, and the fragment selects a session', async () => {
  const client = new StubClient();
  client.runSessions.set(runId, { version: 20, sessions: [architect, liveEngineer()], total: 2 });
  client.transcripts.set('ses-0002@0', { session: { source: 'run', planId, runId, session: 'ses-0002' }, page: { file: 'missing', entries: [], cursor: 0, more: false, partial: false, unreadable: [] } });
  render(<App client={client} />);
  const pages = screen.getByRole('navigation', { name: 'Pages' });
  expect(within(pages).getByRole('link', { name: 'Plans' }).getAttribute('aria-current')).toBe('page');
  expect(within(pages).getByRole('link', { name: 'Sessions' }).getAttribute('href')).toBe('#/sessions');
  act(() => { window.location.hash = '#/sessions'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await screen.findByRole('heading', { name: 'Sessions', level: 1 });
  expect(within(pages).getByRole('link', { name: 'Sessions' }).getAttribute('aria-current')).toBe('page');
  expect(document.querySelector('main')?.className).toBe('route-sessions');
  act(() => {
    window.location.hash = `#/plans/${planId}/runs/${runId}/sessions/ses-0002/chapters/inv-0004`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await screen.findByRole('heading', { name: /Session ses-0002/ });
  expect(document.querySelector('main')?.className).toBe('route-session');
});

test('session routes read back as they are written', () => {
  const run = { source: 'run', planId: 'review notes', runId, session: 'ses-0002' } as const;
  const standalone = { source: 'standalone', session: standaloneId } as const;
  for (const anchor of [null, { kind: 'chapter', invocation: 'inv-0004' }, { kind: 'point', invocation: 'inv-0002' }, { kind: 'append', append: 12 }] as const) {
    for (const session of [run, standalone]) {
      const route = { page: 'session', session, anchor } as const;
      expect(parseRoute(routeHref(route))).toEqual(route);
    }
  }
  expect(routeHref({ page: 'session', session: run, anchor: { kind: 'chapter', invocation: 'inv-0004' } }))
    .toBe(`#/plans/review%20notes/runs/${runId}/sessions/ses-0002/chapters/inv-0004`);
  expect(parseRoute('#/sessions')).toEqual({ page: 'sessions' });
  expect(parseRoute(`#/plans/${planId}/runs/${runId}`)).toEqual({ page: 'run', planId, runId });
  expect(parseRoute(`#/plans/${planId}/runs/${runId}/sessions/ses-0002/appends/x`)).toEqual({ page: 'plans' });
});
