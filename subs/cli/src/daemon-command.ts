import { setTimeout as delay } from 'node:timers/promises';
import type { RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { CliEnvironment, CliExitCode, DaemonStatusDocument } from './interfaces/cli.js';
import { CliFailure, disconnectFailure, serviceFailure } from './errors.js';

export async function daemonCommand(args: { readonly action: 'status' | 'stop'; readonly format: 'human' | 'json' },
  environment: CliEnvironment, control: RunControl): Promise<CliExitCode> {
  const connected = await environment.connect({ start: 'never', signal: control.signal });
  control.signal?.throwIfAborted();
  if (connected.status === 'unavailable') throw disconnectFailure(connected.reason);
  const publish = (document: DaemonStatusDocument, human: string) => environment.stdout(args.format === 'json'
    ? JSON.stringify(document) + '\n' : human + '\n');
  if (connected.status !== 'connected') {
    publish({ schemaVersion: 'ramify.daemon-status/1', running: false,
      record: connected.status === 'stopped' ? connected.record : null }, args.action === 'stop' ? 'no daemon running' : 'not running');
    return 0;
  }
  const connection = connected.connection;
  try {
    if (args.action === 'status') {
      const result = await connection.daemonStatus();
      if (!result.ok) throw serviceFailure(result.error);
      publish({ schemaVersion: 'ramify.daemon-status/1', running: true, status: result.value },
        `Daemon ${result.value.pid} (${result.value.instanceId}) running; ${result.value.contexts.length} contexts; ${result.value.subscriptions} subscriptions`);
    } else {
      const result = await connection.stopDaemon({ instanceId: connection.daemon.instance.instanceId });
      if (!result.ok) throw serviceFailure(result.error);
      const pid = connection.daemon.instance.pid, deadline = performance.now() + 7000;
      while (pid !== process.pid) {
        control.signal?.throwIfAborted();
        try { process.kill(pid, 0); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') break; throw error; }
        if (performance.now() >= deadline) throw new CliFailure('unavailable', 'Daemon stop timed out', result.value);
        await delay(20, undefined, { signal: control.signal });
      }
      const stopped = await environment.connect({ start: 'never', signal: control.signal });
      publish({ schemaVersion: 'ramify.daemon-status/1', running: false,
        record: stopped.status === 'stopped' ? stopped.record : null }, 'Stopped: daemon stopped explicitly');
      if (stopped.status === 'connected') await stopped.connection.close();
    }
    return 0;
  } finally { await connection.close(); }
}
