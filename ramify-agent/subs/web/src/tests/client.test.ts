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

test('a command is resent unchanged when the harness does not answer, and a stale rejection carries the version', async () => {
  const bodies: string[] = [];
  let calls = 0;
  const receipt = { commandId: 'c1', jobId: 'j1', sequence: 4, acceptedAt: '2026-09-19T12:00:00.000Z' };
  const flaky = createProtocolClient('', async (_url, init) => {
    bodies.push(String(init?.body));
    if (++calls === 1) throw new TypeError('fetch failed');
    return new Response(JSON.stringify({ receipt }), { status: 202, headers: { 'content-type': 'application/json' } });
  }, 1);
  const command = { commandId: 'c1', expectedVersion: 3, type: 'stop-job', payload: { planId: 'p', jobId: 'j1' } } as const;
  expect(await flaky.sendCommand(command)).toEqual(receipt);
  expect(bodies).toEqual([JSON.stringify(command), JSON.stringify(command)]);

  const stale = createProtocolClient('', respond(409, { error: { code: 'stale-version', message: 'm', currentVersion: 7 } }));
  await expect(stale.sendCommand(command)).rejects.toMatchObject({ kind: 'protocol', code: 'stale-version', currentVersion: 7 });
});
