import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import type { JobEvent, JobSnapshot } from '../../../harness/src/interfaces/protocol/jobs.js';
import { ClientError } from '../client.js';
import { mappingLabel } from '../mapping.js';
import { PlanPage } from '../plan-page.js';
import { describeEvent, formatElapsed, Progress } from '../progress.js';
import { StubClient } from './helpers/stub-client.js';

afterEach(cleanup);

const at = (second: number) => `2026-09-19T12:00:${String(second).padStart(2, '0')}.000Z`;

function snapshot(overrides: Partial<JobSnapshot> = {}): JobSnapshot {
  return {
    jobId: 'j1', planId: 'p', agent: 'scripted', version: 3, state: 'running', stopRequested: false,
    startedAt: at(0), updatedAt: at(3), endedAt: null,
    inputs: { planHash: 'h', source: { commit: '0123456789abcdef', dirty: true }, architectView: 'placeholder' },
    revision: null, failure: null,
    totals: { filesRead: 1, searches: 1, rejectedSubmissions: 0, usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, total: 120 } },
    ...overrides,
  };
}

const started: JobEvent = {
  sequence: 1, jobId: 'j1', type: 'job-started', at: at(0),
  data: { command: { commandId: 'c', contentHash: 'x', receipt: { commandId: 'c', jobId: 'j1', sequence: 1, acceptedAt: at(0) } } },
};
const read: JobEvent = { sequence: 2, jobId: 'j1', type: 'activity', at: at(1), data: { activity: { kind: 'read', callId: 'a', path: 'module.ramify' } } };
const search: JobEvent = { sequence: 3, jobId: 'j1', type: 'activity', at: at(2), data: { activity: { kind: 'search', callId: 'b', tool: 'grep', query: 'expose-sub in subs' } } };

function clientWithJob(job: JobSnapshot, events: JobEvent[]): StubClient {
  const client = new StubClient();
  client.jobs.set('p/j1', { job, events });
  return client;
}

describe('the Progress view', () => {
  test('shows the state, current activity, elapsed time, totals, inputs and the feed', async () => {
    const client = clientWithJob(snapshot({ state: 'completed', endedAt: '2026-09-19T12:01:15.000Z', version: 3, revision: 1 }), [started, read, search]);
    render(<Progress client={client} planId="p" jobId="j1" />);
    expect((await screen.findByRole('status', { name: 'Job state' })).textContent).toBe('Mapped');
    expect(screen.getByLabelText('Elapsed time').textContent).toBe('1:15');
    expect(screen.getByLabelText('Current activity').textContent).toBe('Searched expose-sub in subs (grep)');
    expect(screen.getByText('100 in · 20 out')).toBeTruthy();
    expect(screen.getByText(/uncommitted changes/).textContent).toContain('0123456789ab');
    const feed = [...screen.getByRole('list', { name: 'Activity feed' }).querySelectorAll('li')].map(item => item.textContent);
    expect(feed).toHaveLength(3);
    expect(feed[0]).toContain('Searched expose-sub in subs');
    expect(feed[2]).toContain('Job started');
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  test('polls a running job after its cursor', async () => {
    const entry = { job: snapshot({ version: 2 }), events: [started, read] };
    const client = new StubClient();
    client.jobs.set('p/j1', entry);
    render(<Progress client={client} planId="p" jobId="j1" interval={20} />);
    expect((await screen.findByLabelText('Current activity')).textContent).toBe('Reading module.ramify');
    entry.events = [started, read, search];
    entry.job = snapshot({ version: 3 });
    await waitFor(() => expect(screen.getByLabelText('Current activity').textContent).toBe('Searching expose-sub in subs'));
    expect(client.calls).toContain('getEvents:p/j1@2');
  });

  test('Stop sends a stop command at the job version, and again at the current version when stale', async () => {
    const client = clientWithJob(snapshot({ version: 3 }), [started, read, search]);
    let stale = true;
    client.onCommand = command => {
      if (stale) {
        stale = false;
        throw new ClientError('protocol', 'The job is at version 5', 'stale-version', 5);
      }
      return { commandId: command.commandId, jobId: 'j1', sequence: 6, acceptedAt: at(6) };
    };
    render(<Progress client={client} planId="p" jobId="j1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stopping…' })).toBeTruthy());
    expect(client.commands.map(command => [command.type, command.expectedVersion, command.payload])).toEqual([
      ['stop-job', 3, { planId: 'p', jobId: 'j1' }],
      ['stop-job', 5, { planId: 'p', jobId: 'j1' }],
    ]);
    expect(client.commands[0]!.commandId).not.toBe(client.commands[1]!.commandId);
  });

  test('a refused stop is reported', async () => {
    const client = clientWithJob(snapshot(), [started]);
    client.onCommand = () => { throw new ClientError('protocol', 'The job is publishing its map', 'conflict'); };
    render(<Progress client={client} planId="p" jobId="j1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The job is publishing its map');
  });

  test('the connection is shown apart from the job state', async () => {
    const client = clientWithJob(snapshot(), [started, read]);
    render(<Progress client={client} planId="p" jobId="j1" />);
    await screen.findByRole('status', { name: 'Job state' });
    client.setConnection('disconnected');
    expect((await screen.findByRole('note')).textContent).toMatch(/the job continues without this page/);
    expect(screen.getByRole('status', { name: 'Job state' }).textContent).toBe('Mapping');
  });

  test('a failed or stopped job says why', async () => {
    const failed: JobEvent = { sequence: 2, jobId: 'j1', type: 'job-failed', at: at(4), data: { reason: 'no-submission', message: 'The agent ended without submitting a map', diagnostics: [] } };
    const client = clientWithJob(snapshot({ state: 'failed', endedAt: at(4), version: 2, failure: { reason: 'no-submission', message: 'The agent ended without submitting a map' } }), [started, failed]);
    render(<Progress client={client} planId="p" jobId="j1" />);
    expect((await screen.findByRole('alert')).textContent).toBe('The agent ended without submitting a map');
    expect(screen.getByRole('status', { name: 'Job state' }).textContent).toBe('Mapping failed');
  });
});

describe('the Map view', () => {
  test('Start mapping sends a start command expecting version 0', async () => {
    const client = new StubClient();
    client.documents.set('p', { id: 'p', title: 'P', path: 'plans/p/plan.md', markdown: '# P', mapping: { state: 'not-mapped' } });
    render(<PlanPage client={client} planId="p" view="map" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start mapping' }));
    await waitFor(() => expect(client.commands).toHaveLength(1));
    expect(client.commands[0]).toMatchObject({ type: 'start-mapping', expectedVersion: 0, payload: { planId: 'p' } });
    await waitFor(() => expect(client.calls.filter(call => call === 'getPlan:p')).toHaveLength(2));
  });

  test('a refused start is shown', async () => {
    const client = new StubClient();
    client.documents.set('p', { id: 'p', title: 'P', path: 'plans/p/plan.md', markdown: '# P', mapping: { state: 'not-mapped' } });
    client.onCommand = () => { throw new ClientError('protocol', 'Job x of plan "q" is still running; one job runs at a time', 'busy'); };
    render(<PlanPage client={client} planId="p" view="map" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start mapping' }));
    expect((await screen.findByRole('alert')).textContent).toContain('one job runs at a time');
  });

  test('the latest job is shown, with Start mapping again once it has ended', async () => {
    const client = clientWithJob(snapshot({ state: 'stopped', endedAt: at(9) }), [started]);
    client.documents.set('p', { id: 'p', title: 'P', path: 'plans/p/plan.md', markdown: '# P', mapping: { state: 'stopped', jobId: 'j1', latestRevision: 2 } });
    render(<PlanPage client={client} planId="p" view="map" />);
    expect((await screen.findByRole('status', { name: 'Job state' })).textContent).toBe('Mapping stopped');
    expect(screen.getByRole('button', { name: 'Start mapping again' })).toBeTruthy();
    expect(await screen.findByText('No map revision is saved for this plan.')).toBeTruthy();
  });
});

test('labels', () => {
  expect(formatElapsed(3_723_000)).toBe('1:02:03');
  expect(mappingLabel({ state: 'running', jobId: 'j', latestRevision: null })).toBe('Mapping…');
  expect(mappingLabel({ state: 'completed', jobId: 'j', latestRevision: 3 })).toBe('Mapped (revision 003)');
  expect(mappingLabel({ state: 'failed', jobId: 'j', latestRevision: 1 })).toBe('Mapping failed; revision 001 saved');
});

test('the feed describes the API views a job materialized and the evidence failure', () => {
  expect(describeEvent({
    sequence: 4, jobId: 'j1', type: 'api-view-materialized', at: at(4),
    data: { module: 'shop/orders', views: [
      { area: 'src', path: 'subs/orders/src/.ramify', revision: 'rev/1:x:1', coverage: null },
      { area: 'src/tests', path: 'subs/orders/src/tests/.ramify', revision: 'rev/1:x:1', coverage: 5 },
    ] },
  })).toBe('API views of shop/orders materialized: src complete, src/tests with coverage limits (5)');
  expect(describeEvent({ sequence: 4, jobId: 'j1', type: 'api-view-materialized', at: at(4), data: { module: 'shop', views: [] } }))
    .toBe('API views of shop materialized: it has no source area');
  expect(describeEvent({
    sequence: 5, jobId: 'j1', type: 'job-failed', at: at(5),
    data: { reason: 'evidence-unavailable', message: 'The architect view could not be materialized', diagnostics: [] },
  })).toBe('Failed: The architect view could not be materialized');
});
