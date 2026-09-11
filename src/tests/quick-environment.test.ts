import { describe, expect, it } from 'vitest';
import { createQuickEnvironment } from './quick-environment.js';
import { createAnalysisDriverFromSessions } from '../resident-assembly.js';
import { fixture } from './fixture.js';
import type { ServiceConnection } from '../../subs/daemon/src/interfaces/daemon.js';
import type { QuickEnvironment } from './quick-environment.js';

async function connect(environment: QuickEnvironment): Promise<ServiceConnection> {
  const result = await environment.connect({ start: 'never' });
  if (result.status !== 'connected') throw new Error('Expected quick connection');
  return result.connection;
}
const params = { project: { cwd: '/fixture', root: '/fixture', scope: 'whole-project' as const,
  configuration: 'discover' as const }, setup: { registry: 'default' as const,
  capabilities: ['registry', 'layout', 'descriptions'] as const } };

describe('quick transport and cleanup boundaries', () => {
  it('suppresses a response when its connection closes before delivery', async () => {
    const environment = await createQuickEnvironment();
    try {
      const connection = await connect(environment);
      const pending = connection.daemonStatus();
      await connection.close();
      expect(await pending).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    } finally { await environment.dispose(); }
  });

  it('cancels only the request named by a cancel frame', async () => {
    const driver = createAnalysisDriverFromSessions();
    let entered!: () => void;
    const resolving = new Promise<void>(resolve => { entered = resolve; });
    driver.resolve = async (_request, control) => {
      entered();
      return new Promise((_resolve, reject) => {
        const abort = () => reject(control?.signal?.reason);
        if (control?.signal?.aborted) abort();
        else control?.signal?.addEventListener('abort', abort, { once: true });
      });
    };
    const environment = await createQuickEnvironment({}, { driver });
    try {
      const connection = await connect(environment), controller = new AbortController();
      const opening = connection.openContext(params, { signal: controller.signal });
      await resolving;
      const status = connection.daemonStatus();
      controller.abort();
      expect(await opening).toMatchObject({ ok: false, error: { code: 'cancelled' } });
      expect(await status).toMatchObject({ ok: true });
      expect(connection.state).toBe('connected');
    } finally { await environment.dispose(); }
  });

  it('routes stop through the dispatcher and preserves its request identity', async () => {
    const environment = await createQuickEnvironment();
    try {
      const connection = await connect(environment);
      expect(await connection.stopDaemon({ instanceId: environment.service.instance.instanceId }))
        .toMatchObject({ ok: true, value: { stopping: true } });
      const recovered = await connection.recover('automatic');
      expect(recovered).toMatchObject({ status: 'stopped', record: { stopped: {
        reason: 'explicit', requestId: expect.any(String) } } });
    } finally { await environment.dispose(); }
  });

  it('verifies service cleanup before destroying the controls', () => fixture(async root => {
    const environment = await createQuickEnvironment();
    try {
      const connection = await connect(environment);
      const opened = await connection.openContext({ ...params, project: { ...params.project, cwd: root, root } });
      if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected opened context');
      expect(await connection.check({ token: opened.value.token, requestId: 'cleanup-baseline',
        freshness: { mode: 'published', wait: true } })).toMatchObject({ ok: true, value: { status: 'reported' } });
      await connection.subscribe({ token: opened.value.token }, () => {});
      expect(environment.watcher.active).toBe(1);
      expect(environment.clock.pending).toBeGreaterThan(0);
      await environment.dispose();
      expect(connection.state).toBe('closed');
      expect(environment.watcher.active).toBe(0);
      expect(environment.clock.pending).toBe(0);
    } finally { await environment.dispose(); }
  }));

  it('reports leaked handles and still disposes both controls', async () => {
    const environment = await createQuickEnvironment();
    await environment.watcher.watch('/unreleased', () => {});
    environment.clock.schedule(1000, () => {});
    await expect(environment.dispose()).rejects.toThrow('leaked 0 connections, 1 watchers and 1 timers');
    expect(environment.watcher.active).toBe(0);
    expect(environment.clock.pending).toBe(0);
    await expect(environment.watcher.watch('/after', () => {})).rejects.toThrow('disposed');
    expect(() => environment.clock.schedule(1, () => {})).toThrow('disposed');
  });
});
