import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { runSnapshotSchema, type RunDecisionRequests, type RunSnapshot } from '../../../harness/src/interfaces/protocol/runs.js';
import { PlanPage } from '../plan-page.js';
import { StubClient } from './helpers/stub-client.js';

afterEach(cleanup);

// The hostile Markdown below would record here if any of it ran.
const page = window as Window & { executed?: string[] };

const hostile = [
  '# Hostile plan',
  '',
  'Intro with <b onclick="window.executed.push(\'inline\')">inline HTML</b> and a [link](javascript:window.executed.push(\'link\')).',
  '',
  '<script>window.executed.push("script")</script>',
  '',
  '<img src="x" onerror="window.executed.push(\'img\')">',
  '',
  '<div><iframe src="javascript:window.executed.push(\'iframe\')"></iframe></div>',
].join('\n');

function clientWith(markdown: string): StubClient {
  const client = new StubClient();
  client.documents.set('p', { id: 'p', title: 'Hostile plan', path: 'plans/p/plan.md', markdown });
  return client;
}

test('renders the plan Markdown read-only', async () => {
  const client = clientWith('# Title\n\n## Request\n\n- one\n- two\n\n```ts\nconst x = 1;\n```\n');
  render(<PlanPage client={client} planId="p" />);
  const body = await screen.findByRole('article', { name: 'Plan text' });
  expect(body.querySelector('h2')?.textContent).toBe('Request');
  expect([...body.querySelectorAll('li')].map(item => item.textContent)).toEqual(['one', 'two']);
  expect(body.querySelector('pre code')?.textContent).toBe('const x = 1;\n');
  expect(screen.getByText('plans/p/plan.md')).toBeTruthy();
});

test('embedded HTML is shown as text and never executed', async () => {
  page.executed = [];
  render(<PlanPage client={clientWith(hostile)} planId="p" />);
  const body = await screen.findByRole('article', { name: 'Plan text' });
  for (const tag of ['script', 'img', 'iframe', 'b', '.markdown div']) expect(body.querySelector(tag)).toBeNull();
  expect(body.querySelectorAll('[onclick], [onerror]')).toHaveLength(0);
  expect(body.textContent).toContain('<script>window.executed.push("script")</script>');
  expect(body.textContent).toContain('<b onclick=');
  const link = [...body.querySelectorAll('a')].find(anchor => anchor.textContent === 'link')!;
  expect(link).toBeTruthy();
  expect(link.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
  link.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(page.executed).toEqual([]);
});

test('a missing plan is reported', async () => {
  render(<PlanPage client={new StubClient()} planId="gone" />);
  expect((await screen.findByRole('alert')).textContent).toContain('No plan with ID "gone"');
});

test('the plan lists its runs, and Start sends start-run with the harness\'s agent and opens the Run page', async () => {
  const client = clientWith('# Plan');
  client.receipt = { commandId: 'x', jobId: '20260921T090000Z-beef00', sequence: 1, acceptedAt: '2026-09-21T09:00:00.000Z' };
  const opened: string[] = [];
  render(<PlanPage client={client} planId="p" navigate={hash => opened.push(hash)} />);
  expect(await screen.findByText('This plan has no run yet.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Start a run' }));
  await waitFor(() => expect(opened).toEqual(['#/plans/p/runs/20260921T090000Z-beef00']));
  expect(client.commands).toEqual([expect.objectContaining({ type: 'start-run', expectedVersion: 0, payload: { planId: 'p', agent: 'scripted', reviewStop: false } })]);
});

test('Start with the review stop checked sends reviewStop', async () => {
  const client = clientWith('# Plan');
  const opened: string[] = [];
  render(<PlanPage client={client} planId="p" navigate={hash => opened.push(hash)} />);
  await screen.findByText('This plan has no run yet.');
  const stop = screen.getByRole('checkbox', { name: /Stop for review after the analysis/ }) as HTMLInputElement;
  expect(stop.checked).toBe(false);
  fireEvent.click(stop);
  fireEvent.click(screen.getByRole('button', { name: 'Start a run' }));
  await waitFor(() => expect(opened).toHaveLength(1));
  expect(client.commands).toEqual([expect.objectContaining({ type: 'start-run', payload: { planId: 'p', agent: 'scripted', reviewStop: true } })]);
});

test('without an agent no run can start, and a run directory the harness does not read is reported', async () => {
  const client = clientWith('# Plan');
  client.runList = {
    runs: [], total: 0, agent: null,
    unserved: [{ jobId: '20990101T000000Z-abcdef', path: 'plans/p/.harness/jobs/20990101T000000Z-abcdef/job.json', code: 'unsupported-version', message: 'Run declares ramify-agent.job/3' }],
  };
  render(<PlanPage client={client} planId="p" />);
  expect(await screen.findByText(/No agent is configured/)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Start a run' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/unsupported-version: Run declares ramify-agent.job\/3/)).toBeTruthy();
});

function run(jobId: string, state: RunSnapshot['state'], decisionRequests: RunDecisionRequests): RunSnapshot {
  const at = '2026-09-24T12:00:00.000Z';
  return runSnapshotSchema.parse({
    jobId, planId: 'p', agent: 'scripted', version: 30, state, phase: state === 'running' ? 'working' : 'ended', stopRequested: false,
    startedAt: at, updatedAt: at, endedAt: state === 'running' ? null : at, failure: null, current: null, waits: [],
    counts: { workItems: 2, completedWorkItems: 1, openRequirements: 0, invocations: 5, readinessAttempts: 1, gateAttempts: 3, scenarios: { pending: 0, bound: 0, declared: 0, implemented: 0 }, degradedStarts: 0 },
    writer: { held: null, unsettled: null }, review: 'not-reviewed', notices: [], decisionRequests,
  });
}

test('a run that waits for the person\'s decision carries its own badge in the run list, apart from running and from an ended run\'s open request', async () => {
  const client = clientWith('# Plan');
  const held = { workItem: 'wi-002', requests: [{ checkFinding: 'cf-0006', request: 'cfd-0004' }] };
  client.runList = {
    runs: [
      run('20260924T120000Z-a00001', 'running', { open: 1, waiting: true, workItems: [held] }),
      run('20260924T110000Z-a00002', 'stopped', { open: 1, waiting: false, workItems: [held] }),
      run('20260924T100000Z-a00003', 'completed', { open: 0, waiting: false, workItems: [] }),
    ],
    total: 3, agent: 'scripted', unserved: [],
  };
  render(<PlanPage client={client} planId="p" />);
  const waiting = (await screen.findByRole('link', { name: '20260924T120000Z-a00001' })).closest('li')!;
  const badge = within(waiting).getByText('Waiting for your decision');
  expect(badge.className).toBe('badge awaiting-decision');
  expect(badge.getAttribute('title')).toBe('Held until you answer: work item wi-002');
  // Its run state stays what the log says: running, not failed.
  expect(within(waiting).getByText('running').className).toBe('badge run-state run-state-running');
  for (const other of ['20260924T110000Z-a00002', '20260924T100000Z-a00003']) {
    expect(within(screen.getByRole('link', { name: other }).closest('li')!).queryByText('Waiting for your decision')).toBeNull();
  }
});
