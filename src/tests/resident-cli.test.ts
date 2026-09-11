import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { createQuickEnvironment } from './quick-environment.js';
import { fixture } from './fixture.js';
import { runCli } from '../../subs/cli/src/run-cli.js';
import type { WatchLine } from '../../subs/cli/src/interfaces/cli.js';
import type { ContextEvent } from '../../subs/daemon/src/context-types.js';

async function until(predicate: () => boolean): Promise<void> {
  const deadline = performance.now() + 15_000;
  while (!predicate()) { if (performance.now() >= deadline) throw new Error('Expected watch state did not arrive'); await delay(5); }
}
describe('resident CLI status and eviction stream', () => {
  it('prints real watcher failure status and an eviction before attempting a reopen', async () => {
    await fixture(async root => {
      const quick = await createQuickEnvironment();
      const lines: WatchLine[] = [];
      const controller = new AbortController();
      let deliver: ((event: ContextEvent) => void) | undefined;
      const running = runCli(['watch', '--format', 'json'], { cwd: root, version: '0.0.0', batch: quick.batch,
        stdout: line => { lines.push(JSON.parse(line) as WatchLine); }, stderr() {},
        connect: async options => {
          const result = await quick.connect(options);
          if (result.status !== 'connected') return result;
          return { ...result, connection: { ...result.connection, subscribe: (params, listener) => {
            deliver = listener; return result.connection.subscribe(params, listener);
          } } };
        } }, { signal: controller.signal });
      try {
        await until(() => lines.some(line => line.event === 'revision'));
        quick.watcher.emit(root, [{ path: '.', kind: 'error' }]);
        await until(() => lines.some(line => line.event === 'status' && line.current.watcher === 'unavailable'));
        const first = lines.find(line => line.event === 'status');
        if (first?.event !== 'status') throw new Error('No status');
        // Inject only an event at the CLI boundary; the real service still owns
        // opening, subscriptions, reports and cleanup on either side of it.
        deliver!({ type: 'context-evicted', token: { ...first.current.token, generation: `gen/1:${randomUUID()}` }, reason: 'pressure' });
        await until(() => lines.some(line => line.event === 'evicted'));
        const index = lines.findIndex(line => line.event === 'evicted');
        expect(lines[index]).toEqual({ schemaVersion: 'ramify.watch/1', event: 'evicted', reason: 'pressure' });
        await until(() => lines.slice(index + 1).some(line => line.event === 'status'));
        controller.abort(); expect(await running).toBe(130);
        const status = await quick.service.daemonStatus();
        expect(status.ok && status.value.subscriptions).toBe(0);
      } finally { controller.abort(); await running; await quick.dispose(); }
    });
  }, 30_000);
});
