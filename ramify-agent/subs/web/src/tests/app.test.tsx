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

test('the fragment selects the page', async () => {
  const client = new StubClient();
  client.documents.set('review-notes', {
    id: 'review-notes', title: 'Reviewer notes', path: 'plans/review-notes/plan.md', markdown: '# Reviewer notes', mapping: { state: 'not-mapped' },
  });
  window.location.hash = '#/plans/review-notes/map';
  render(<App client={client} />);
  expect(await screen.findByText('No implementation map yet.')).toBeTruthy();
  expect(await screen.findByText('collection-review')).toBeTruthy();
  act(() => { window.location.hash = '#/'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(await screen.findByText('This project has no plans yet.')).toBeTruthy();
});
