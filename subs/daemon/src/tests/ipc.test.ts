import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ipcFixture } from './ipc-fixture.js';
import { eventually } from './socket-fixture.js';
import { encodeJsonFrame } from '../codec.js';

 describe('IPC framing and shared service dispatch', () => {
  it('preserves validation errors and tokens while releasing subscription leases on close', async () => {
    const fixture = await ipcFixture();
    try {
      const client = await fixture.connect();
      const invalid = { nonsense: true } as never;
      expect(await client.openContext(invalid)).toEqual(await fixture.environment.service.openContext(invalid));
      const opened = await client.openContext(fixture.params);
      expect(opened).toMatchObject({ ok: true, value: { status: 'opened' } });
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const token = opened.value.token;
      const status = await client.contextStatus({ token });
      expect(status).toEqual(await fixture.environment.service.contextStatus({ token }));
      const subscribed = await client.subscribe({ token }, () => {});
      expect(subscribed).toMatchObject({ ok: true, value: { replay: 'not-available' } });
      expect(await fixture.environment.service.daemonStatus()).toMatchObject({ ok: true, value: { subscriptions: 1 } });
      await client.close();
      expect(await fixture.environment.service.daemonStatus()).toMatchObject({ ok: true, value: { subscriptions: 0 } });
    } finally { await fixture.dispose(); }
  });
  it('closes malformed and oversized requests without compromising another connection', async () => {
    const fixture = await ipcFixture({ maxRequestBytes: 1024 });
    try {
      for (const bytes of [Buffer.alloc(4), encodeJsonFrame(null, 1024), Buffer.from([0, 0, 4, 1]), Buffer.from([0, 0, 0, 1, 255])]) {
        const raw = await fixture.raw(false); raw.socket.write(bytes); await raw.closed;
        expect(raw.messages).toContainEqual(expect.objectContaining({ type: 'goodbye', reason: expect.objectContaining({ kind: 'failure' }) }));
      }
      const client = await fixture.connect();
      expect(await client.daemonStatus()).toMatchObject({ ok: true });
    } finally { await fixture.dispose(); }
  });
  it('rejects incompatibility and connection exhaustion before welcome', async () => {
    const fixture = await ipcFixture({ maxConnections: 1 });
    try {
      const incompatible = await fixture.raw(false);
      incompatible.socket.write(encodeJsonFrame({ type: 'hello', handshake: { protocol: 'ramify.ipc/0', buildKey: 'foreign', engine: 'foreign', client: { name: 'test', version: 'old' } } }, 1024));
      await incompatible.closed;
      expect(incompatible.messages).toMatchObject([{ type: 'reject', error: { code: 'incompatible' } }]);
      const client = await fixture.connect();
      const rejected = await fixture.raw(); await rejected.closed;
      expect(rejected.messages).toMatchObject([{ type: 'reject', error: { code: 'resource-unavailable' } }]);
      expect(await client.daemonStatus()).toMatchObject({ ok: true });
    } finally { await fixture.dispose(); }
  });
  it('rejects a response beyond the negotiated bound and keeps the connection usable', async () => {
    const fixture = await ipcFixture({ maxResponseBytes: 700 });
    try {
      const client = await fixture.connect();
      expect(await client.daemonStatus()).toMatchObject({ ok: false, error: { code: 'resource-unavailable' } });
      expect(await client.stopDaemon({ instanceId: 'wrong' })).toMatchObject({ ok: false, error: { code: 'wrong-instance' } });
    } finally { await fixture.dispose(); }
  });
  it('dispatches cancellation under the original request id', async () => {
    const fixture = await ipcFixture();
    try {
      const client = await fixture.connect();
      const opened = await client.openContext(fixture.params);
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const token = opened.value.token;
      const control = new AbortController();
      const result = client.check({ token, requestId: 'cancelled-check', freshness: { mode: 'synchronized', expect: [] } }, { signal: control.signal });
      control.abort();
      expect(await result).toMatchObject({ ok: true, value: { status: 'cancelled', requestId: 'cancelled-check' } });
    } finally { await fixture.dispose(); }
  });
  it('answers duplicate request ids and checks exact no-argument operation parameters', async () => {
    const fixture = await ipcFixture();
    try {
      const raw = await fixture.raw(); await eventually(() => raw.messages.length > 0);
      raw.send({ type: 'request', id: 'one', op: 'daemonStatus', params: { extra: true } });
      await eventually(() => raw.messages.length > 1);
      expect(raw.messages[1]).toMatchObject({ type: 'response', result: { ok: false, error: { code: 'invalid-request' } } });
      raw.send({ type: 'request', id: 'one', op: 'daemonStatus', params: {} });
      await eventually(() => raw.messages.length > 2);
      expect(raw.messages[2]).toMatchObject({ type: 'response', result: { ok: false, error: { code: 'invalid-request' } } });
    } finally { await fixture.dispose(); }
  });
  it('preserves a completed revision with partial source coverage in notifications', async () => {
    const fixture = await ipcFixture();
    try {
      const client = await fixture.connect();
      const opened = await client.openContext(fixture.params);
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      const events: unknown[] = [];
      await client.subscribe({ token: opened.value.token }, event => events.push(event));
      await writeFile(join(fixture.project, 'src/index.ts'), 'export async function load(path: string) { return import(path); }\n');
      const report = await client.check({ token: opened.value.token, requestId: 'partial-coverage', freshness: { mode: 'synchronized', expect: [] } });
      expect(report).toMatchObject({ ok: true, value: { status: 'reported', published: true, report: { outcome: { execution: 'completed', coverage: 'partial' } } } });
      await eventually(() => events.some(event => (event as { type: string }).type === 'revision-published'));
      expect(events).toContainEqual(expect.objectContaining({ type: 'revision-published', revision: expect.objectContaining({ outcome: expect.objectContaining({ coverage: 'partial' }) }) }));
    } finally { await fixture.dispose(); }
  });

});
