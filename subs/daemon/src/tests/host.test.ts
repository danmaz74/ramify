import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ipcFixture } from './ipc-fixture.js';
import { eventually } from './socket-fixture.js';
import { startDaemon } from '../start-daemon.js';

 describe('real resident socket host', () => {
  it('serves a real service lease and records explicit stop before closing clients', async () => {
    const fixture = await ipcFixture();
    try {
      const client = await fixture.connect();
      const status = await client.daemonStatus();
      expect(status).toMatchObject({ ok: true, value: { instanceId: fixture.environment.service.instance.instanceId } });
      const stopped = await client.stopDaemon({ instanceId: fixture.environment.service.instance.instanceId });
      expect(stopped).toMatchObject({ ok: true, value: { stopping: true } });
      await fixture.host.stopped;
      expect(JSON.parse(await readFile(fixture.endpoint.record, 'utf8'))).toMatchObject({ state: 'stopped', stopped: { reason: 'explicit' } });
      await eventually(() => client.reason !== null);
      expect(client.reason).toMatchObject({ kind: 'explicit-stop' });
    } finally { await fixture.dispose(); }
  });
  it('rejects duplicate hosts without changing the live record', async () => {
    const fixture = await ipcFixture();
    try {
      const before = await readFile(fixture.endpoint.record, 'utf8');
      const duplicate = await startDaemon({ endpoint: fixture.endpoint, service: fixture.environment.service,
        budgets: fixture.budgets, clock: fixture.environment.clock, log() {} });
      expect(duplicate.status).toBe('already-running');
      expect(await readFile(fixture.endpoint.record, 'utf8')).toBe(before);
    } finally { await fixture.dispose(); }
  });
  it('idle-exits an open connection that has no request or subscription lease', async () => {
    const fixture = await ipcFixture({ idleExitMs: 1000 });
    try {
      const client = await fixture.connect();
      fixture.environment.clock.advance(1000);
      expect(await fixture.host.stopped).toMatchObject({ reason: 'idle' });
      await eventually(() => client.reason?.kind === 'idle-exit');
    } finally { await fixture.dispose(); }
  });
  it('closing a subscribed context releases the host activity lease and permits idle exit', async () => {
    const fixture = await ipcFixture({ idleExitMs: 1000, leaseMs: 100 });
    try {
      const client = await fixture.connect();
      const opened = await client.openContext(fixture.params);
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Open failed');
      await client.subscribe({ token: opened.value.token }, () => {});
      await client.closeContext({ token: opened.value.token });
      // A bare connection does not require subscription pings, nor hold idle.
      fixture.environment.clock.advance(500);
      expect(client.reason).toBeNull();
      fixture.environment.clock.advance(500);
      expect(await fixture.host.stopped).toMatchObject({ reason: 'idle' });
    } finally { await fixture.dispose(); }
  });

});
