import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { connectDaemon } from '../../subs/daemon/src/connect-daemon.js';
import { readDaemonRecord, selectEndpoint } from '../../subs/daemon/src/discovery.js';
import { repositoryRoot } from './process.js';
import { waitForProcessCondition, withProcessScope } from './lifecycle-process.js';

describe('compiled daemon shutdown with a suspended client', () => {
  it('forces the released peer socket closed before the shutdown grace expires', async () => {
    await withProcessScope(async scope => {
      const endpoint = await selectEndpoint({ packageRoot: repositoryRoot, version: '0.0.0', endpointDirectory: scope.endpointDirectory });
      const daemon = scope.start({ cwd: repositoryRoot, timeoutMs: 10_000, args: [join(repositoryRoot, 'dist/src/daemon-entry.js'),
        '--endpoint-dir', endpoint.directory, '--build-key', endpoint.buildKey, '--version', '0.0.0',
        '--engine', 'ramify.ts@0.0.0+typescript@7.0.2', '--budgets', JSON.stringify({ shutdownGraceMs: 200 })] });
      await waitForProcessCondition('Daemon startup', 5000, async () => (await readDaemonRecord(endpoint))?.state === 'running');
      const child = scope.start({ cwd: repositoryRoot, timeoutMs: 10_000, args: ['--input-type=module', '-e',
        `import {createConnection} from 'node:net'; const socket=createConnection(${JSON.stringify(endpoint.socket)});socket.on('error',()=>{});socket.on('data',()=>{});socket.on('connect',()=>console.log('connected'));setInterval(()=>{},1000);`] });
      await child.waitForOutput('connected', 5000);
      child.signal('SIGSTOP');
      try {
        const connected = await connectDaemon({ endpointDirectory: endpoint.directory, client: { name: 'shutdown-test', version: '0.0.0' },
          engine: 'ramify.ts@0.0.0+typescript@7.0.2', daemonEntry: null, start: 'never' });
        if (connected.status !== 'connected') throw new Error('Stop connection failed');
        const started = performance.now();
        await connected.connection.stopDaemon({ instanceId: connected.connection.daemon.instance.instanceId });
        await connected.connection.close();
        expect((await daemon.waitForExit(1000)).code).toBe(0);
        expect(performance.now() - started).toBeLessThan(1000);
      } finally {
        child.signal('SIGCONT'); child.signal('SIGKILL'); await child.waitForExit(3000);
      }
    });
  });
});
