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
