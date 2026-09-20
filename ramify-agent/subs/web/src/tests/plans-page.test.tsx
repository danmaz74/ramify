import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { PlansPage } from '../plans-page.js';
import { project, StubClient } from './helpers/stub-client.js';

afterEach(cleanup);

test('lists readable plans with their path and mapping state, and unreadable ones as errors', async () => {
  const client = new StubClient();
  client.plans = [
    { status: 'unreadable', id: 'broken', path: 'plans/broken/plan.md', message: 'plan.md is a directory, not a file' },
    { status: 'readable', id: 'review-notes', title: 'Reviewer notes on a review run', path: 'plans/review-notes/plan.md', mapping: { state: 'not-mapped' } },
  ];
  render(<PlansPage client={client} project={project} />);
  const link = await screen.findByRole('link', { name: 'Reviewer notes on a review run' });
  expect(link.getAttribute('href')).toBe('#/plans/review-notes');
  const items = screen.getAllByRole('listitem');
  expect(within(items[1]!).getByText('plans/review-notes/plan.md')).toBeTruthy();
  expect(within(items[1]!).getByText('Not mapped')).toBeTruthy();
  expect(within(items[0]!).getByText('Unreadable: plan.md is a directory, not a file')).toBeTruthy();
  expect(within(items[0]!).queryByRole('link')).toBeNull();
});

test('the empty state says where a plan file belongs', async () => {
  render(<PlansPage client={new StubClient()} project={project} />);
  const empty = await screen.findByText('This project has no plans yet.');
  const text = empty.closest('.empty')!.textContent;
  expect(text).toContain('plans/<plan-id>/plan.md');
  expect(text).toContain('/work/collection-review');
});

test('refresh asks again and shows the new list', async () => {
  const client = new StubClient();
  render(<PlansPage client={client} project={project} />);
  await screen.findByText('This project has no plans yet.');
  client.plans = [{ status: 'readable', id: 'a', title: 'Added', path: 'plans/a/plan.md', mapping: { state: 'not-mapped' } }];
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByRole('link', { name: 'Added' })).toBeTruthy();
  expect(client.calls.filter(call => call === 'listPlans')).toHaveLength(2);
});
