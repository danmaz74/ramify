import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { App } from '../app.js';
import { ClientError } from '../client.js';
import { StubClient } from './helpers/stub-client.js';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

test('the connection is shown apart from the page content', async () => {
  const client = new StubClient();
  client.failure = new ClientError('connection', 'The harness did not answer: fetch failed');
  client.state = 'disconnected';
  render(<App client={client} />);
  expect((await screen.findByRole('alert')).textContent).toContain('fetch failed');
  expect(screen.getByRole('status', { name: 'Connection' }).textContent).toBe('The harness is not answering');
  act(() => client.setConnection('connected'));
  expect(screen.getByRole('status', { name: 'Connection' }).textContent).toBe('Connected to the harness');
});

// KI-8: `.run-page main` matched nothing, because <main> is the Run page's parent. The route
// class on <main> is what a route-specific width rule can name.
test('main carries the current route, so a route can widen the shell', async () => {
  const client = new StubClient();
  render(<App client={client} />);
  expect(document.querySelector('main')?.className).toBe('route-plans');
  act(() => {
    window.location.hash = '#/plans/review-notes/runs/20260921T080000Z-c0ffee';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(document.querySelector('main')?.className).toBe('route-run');
  await screen.findByRole('heading', { name: /^Run/ });
});

test('the fragment selects the page', async () => {
  const client = new StubClient();
  client.documents.set('review-notes', {
    id: 'review-notes', title: 'Reviewer notes', path: 'plans/review-notes/plan.md', markdown: '# Reviewer notes',
  });
  window.location.hash = '#/plans/review-notes';
  render(<App client={client} />);
  expect(await screen.findByRole('article', { name: 'Plan text' })).toBeTruthy();
  expect(await screen.findByText('collection-review')).toBeTruthy();
  act(() => { window.location.hash = '#/'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(await screen.findByText('This project has no plans yet.')).toBeTruthy();
});
