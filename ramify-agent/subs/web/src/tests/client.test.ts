import { expect, test } from 'vitest';
import { ClientError, createProtocolClient, type ConnectionState } from '../client.js';

function respond(status: number, body: unknown): typeof fetch {
  return async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('validates answers against the protocol and reports the connection', async () => {
  const states: ConnectionState[] = [];
  const client = createProtocolClient('http://h', respond(200, { plans: [] }));
  client.onConnectionChange(state => states.push(state));
  expect(client.connection()).toBe('connecting');
  expect(await client.listPlans()).toEqual([]);
  expect(states).toEqual(['connected']);
});

test('a protocol error keeps the connection and carries its code', async () => {
  const client = createProtocolClient('', respond(404, { error: { code: 'not-found', message: 'No plan with ID "x"' } }));
  await expect(client.getPlan('x')).rejects.toMatchObject({ kind: 'protocol', code: 'not-found', message: 'No plan with ID "x"' });
  expect(client.connection()).toBe('connected');
});

test('no answer is a lost connection; an answer outside the protocol is rejected', async () => {
  const offline = createProtocolClient('', async () => { throw new TypeError('fetch failed'); });
  await expect(offline.listPlans()).rejects.toMatchObject({ kind: 'connection' });
  expect(offline.connection()).toBe('disconnected');
  const wrong = createProtocolClient('', respond(200, { plans: [{ id: 'x' }] }));
  await expect(wrong.listPlans()).rejects.toBeInstanceOf(ClientError);
  await expect(wrong.listPlans()).rejects.toMatchObject({ kind: 'invalid-response' });
});

test('requests the encoded plan path', async () => {
  const urls: string[] = [];
  const client = createProtocolClient('http://h', async input => {
    urls.push(String(input));
    return new Response('{}', { status: 500 });
  });
  await expect(client.getPlan('a b')).rejects.toMatchObject({ kind: 'invalid-response' });
  expect(urls).toEqual(['http://h/api/v1/plans/a%20b']);
});

test('a command the harness does not answer is sent again with the same ID', async () => {
  const bodies: string[] = [];
  let calls = 0;
  const client = createProtocolClient('', async (_input, init) => {
    calls += 1;
    bodies.push(String(init?.body));
    if (calls < 3) throw new TypeError('fetch failed');
    return new Response(JSON.stringify({ receipt: { commandId: 'c1', jobId: 'j1', sequence: 1, acceptedAt: '2026-09-21T08:00:00.000Z' } }), { status: 202 });
  }, 1);
  const receipt = await client.sendCommand({ commandId: 'c1', expectedVersion: 0, type: 'start-run', payload: { planId: 'p', agent: 'scripted' } });
  expect(receipt.jobId).toBe('j1');
  expect(bodies).toHaveLength(3);
  expect(new Set(bodies).size).toBe(1);
  expect(client.connection()).toBe('connected');
});

test('a refused command carries its code, its current version and its evidence', async () => {
  const client = createProtocolClient('', respond(409, { error: { code: 'stale-version', message: 'The job is at version 9, not 3', currentVersion: 9 } }));
  await expect(client.sendCommand({ commandId: 'c', expectedVersion: 3, type: 'stop-job', payload: { planId: 'p', jobId: 'j' } }))
    .rejects.toMatchObject({ kind: 'protocol', code: 'stale-version', currentVersion: 9 });
  const unsupported = createProtocolClient('', respond(422, { error: { code: 'unsupported-version', message: 'declares /3', evidence: ['job.json', 'declares ramify-agent.job/3'] } }));
  await expect(unsupported.getRun('p', 'j')).rejects.toMatchObject({ code: 'unsupported-version', evidence: ['job.json', 'declares ramify-agent.job/3'] });
});

test('reads the run\'s event page after a cursor', async () => {
  const urls: string[] = [];
  const client = createProtocolClient('http://h', async input => {
    urls.push(String(input));
    return new Response('{}', { status: 500 });
  });
  await expect(client.getEvents('p', 'r1', 42)).rejects.toMatchObject({ kind: 'invalid-response' });
  expect(urls).toEqual(['http://h/api/v1/plans/p/runs/r1/events?after=42']);
});

test('reads the scenario list at its path and validates it', async () => {
  const urls: string[] = [];
  const list = { scenarios: [], total: 0 };
  const client = createProtocolClient('http://h', async input => {
    urls.push(String(input));
    return new Response(JSON.stringify(urls.length === 1 ? list : { scenarios: [{ id: 'sc-001' }], total: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  expect(await client.getScenarios('p', 'r 1')).toEqual(list);
  await expect(client.getScenarios('p', 'r 1')).rejects.toMatchObject({ kind: 'invalid-response' });
  expect(urls).toEqual(['http://h/api/v1/plans/p/runs/r%201/scenarios', 'http://h/api/v1/plans/p/runs/r%201/scenarios']);
});

test('the session queries: each path, and a body fetched only when it is not inline', async () => {
  const urls: string[] = [];
  const answer = (url: string): unknown => {
    if (url.includes('/transcript')) return { session: { source: 'standalone', session: 's1' }, page: { file: 'missing', entries: [], cursor: 0, more: false, partial: false, unreadable: [] } };
    if (url.includes('/bodies/') || url.includes('/files?')) return { content: 'checking\n', bytes: 9, truncated: false };
    if (url.includes('/updates?')) return { version: 4, sessions: [], transcripts: [] };
    if (url.endsWith('/sessions')) return { version: 4, sessions: [], total: 0 };
    return { sessions: [], total: 0, offset: 0, next: null, unserved: [] };
  };
  const client = createProtocolClient('http://h', async input => {
    urls.push(String(input));
    return new Response(JSON.stringify(answer(String(input))), { status: 200 });
  });
  const run = { source: 'run', planId: 'p', runId: 'r', session: 'ses-0001' } as const;
  const standalone = { source: 'standalone', session: 's1' } as const;
  const hash = 'a'.repeat(64);

  expect((await client.listSessions()).total).toBe(0);
  expect((await client.getRunSessions('p', 'r')).version).toBe(4);
  expect((await client.getTranscript(standalone, 0)).page.file).toBe('missing');
  await client.getTranscript(run, 7);
  expect((await client.pollSessions('p', 'r', 4, [{ session: 'ses-0001', after: 7 }])).version).toBe(4);
  expect(await client.getBody(run, { stored: 'inline', text: 'short', bytes: 5 })).toEqual({ content: 'short', bytes: 5, truncated: false });
  expect((await client.getBody(run, { stored: 'blob', hash, bytes: 9, preview: 'checking' })).content).toBe('checking\n');
  await client.getBody(standalone, { stored: 'blob', hash, bytes: 9, preview: 'checking' });
  await client.getBody(run, { stored: 'file', path: 'invocations/inv-0001/shell/001.log', bytes: 9 });
  await client.getBody(standalone, { stored: 'file', path: 'shell/001.log', bytes: 9 });
  expect(urls).toEqual([
    'http://h/api/v1/sessions?offset=0',
    'http://h/api/v1/plans/p/runs/r/sessions',
    'http://h/api/v1/sessions/standalone/s1/transcript?after=0',
    'http://h/api/v1/plans/p/runs/r/sessions/ses-0001/transcript?after=7',
    'http://h/api/v1/plans/p/runs/r/sessions/updates?version=4&cursors=ses-0001%3A7',
    `http://h/api/v1/plans/p/runs/r/bodies/${hash}`,
    `http://h/api/v1/sessions/standalone/s1/bodies/${hash}`,
    'http://h/api/v1/plans/p/runs/r/sessions/ses-0001/files?path=invocations%2Finv-0001%2Fshell%2F001.log',
    'http://h/api/v1/sessions/standalone/s1/files?path=shell%2F001.log',
  ]);
});
