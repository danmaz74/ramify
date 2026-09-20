import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
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
  client.documents.set('p', { id: 'p', title: 'Hostile plan', path: 'plans/p/plan.md', markdown, mapping: { state: 'not-mapped' } });
  return client;
}

test('renders the plan Markdown read-only', async () => {
  const client = clientWith('# Title\n\n## Request\n\n- one\n- two\n\n```ts\nconst x = 1;\n```\n');
  render(<PlanPage client={client} planId="p" view="plan" />);
  const body = await screen.findByRole('article', { name: 'Plan text' });
  expect(body.querySelector('h2')?.textContent).toBe('Request');
  expect([...body.querySelectorAll('li')].map(item => item.textContent)).toEqual(['one', 'two']);
  expect(body.querySelector('pre code')?.textContent).toBe('const x = 1;\n');
  expect(screen.getByText('plans/p/plan.md')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Plan' }).getAttribute('aria-current')).toBe('page');
});

test('embedded HTML is shown as text and never executed', async () => {
  page.executed = [];
  render(<PlanPage client={clientWith(hostile)} planId="p" view="plan" />);
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

test('the Map view is an empty state', async () => {
  render(<PlanPage client={clientWith('# T')} planId="p" view="map" />);
  expect(await screen.findByText('No implementation map yet.')).toBeTruthy();
  expect(screen.queryByRole('article', { name: 'Plan text' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Map' }).getAttribute('aria-current')).toBe('page');
});

test('a missing plan is reported', async () => {
  render(<PlanPage client={new StubClient()} planId="gone" view="plan" />);
  expect((await screen.findByRole('alert')).textContent).toContain('No plan with ID "gone"');
});
