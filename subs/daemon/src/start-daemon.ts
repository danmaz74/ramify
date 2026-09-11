import { chmod, unlink } from 'node:fs/promises';
import { createConnection } from 'node:net';
import type { DaemonRecord, DisconnectReason, StartDaemonOptions, StartDaemonOutcome, StopDisposition } from './interfaces/daemon.js';
import { processAlive, readRecord, verifyEndpoint, writeDaemonRecord } from './records.js';
import { createSocketHost } from './host.js';
import { coordinateStart } from './start-coordination.js';

async function accepts(path: string): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection(path);
    const finish = (value: boolean) => { clearTimeout(timer); socket.destroy(); resolve(value); };
    const timer = setTimeout(() => finish(false), 250);
    socket.once('connect', () => finish(true)); socket.on('error', () => finish(false));
  });
}

export async function startDaemon(options: StartDaemonOptions): Promise<StartDaemonOutcome> {
  try {
    await verifyEndpoint(options.endpoint);
    return await coordinateStart(options.endpoint, performance.now() + 10_000, undefined, () => startUnderGate(options));
  } catch (error) { return { status: 'failed', message: error instanceof Error ? error.message : String(error) }; }
}

async function startUnderGate(options: StartDaemonOptions): Promise<StartDaemonOutcome> {
  const { endpoint, service, clock, budgets } = options;
  let record: DaemonRecord;
  try {
    await verifyEndpoint(endpoint);
    for (const value of Object.values(budgets)) if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid daemon budget');
    const previous = await readRecord(endpoint);
    if (previous && processAlive(previous.pid)) {
      if (await accepts(endpoint.socket)) return { status: 'already-running', record: previous };
      return { status: 'failed', message: 'Daemon record names a live process without a listening socket' };
    }
    if (previous) await unlink(endpoint.socket).catch(error => { if (error.code !== 'ENOENT') throw error; });
    record = Object.freeze({ schemaVersion: 'ramify.daemon-record/1', ...service.instance,
      protocol: 'ramify.ipc/1', socket: endpoint.socket, startedAt: clock.now(), state: 'starting', stopped: null });
    if (service.instance.buildKey !== endpoint.buildKey) throw new Error('Daemon instance differs from its endpoint build');
    await writeDaemonRecord(endpoint, record);
  } catch (error) { return { status: 'failed', message: error instanceof Error ? error.message : String(error) }; }

  let stopping: Promise<StopDisposition> | undefined;
  let cancelIdle: (() => void) | undefined;
  let resolveStopped!: (value: StopDisposition) => void;
  const stopped = new Promise<StopDisposition>(resolve => { resolveStopped = resolve; });
  const host = createSocketHost(options, updateIdle);
  function updateIdle(): void {
    cancelIdle?.(); cancelIdle = undefined;
    if (!stopping && record.state === 'running' && host.activity === 0) {
      cancelIdle = clock.schedule(budgets.idleExitMs, () => { void stop('idle', null); });
    }
  }
  function fatal(value: unknown): void { void stop('failed', null, value instanceof Error ? value.message : String(value)); }
  let removeStopListener: () => void = () => {};
  async function stop(reason: 'idle' | 'explicit' | 'failed', requestId: string | null, message = 'Daemon failed'): Promise<StopDisposition> {
    if (stopping) return stopping;
    const disposition: StopDisposition = Object.freeze({ at: clock.now(), reason, requestId });
    stopping = (async () => {
      cancelIdle?.(); removeStopListener();
      process.off('uncaughtException', fatal); process.off('unhandledRejection', fatal);
      record = Object.freeze({ ...record, state: 'stopped', stopped: disposition });
      let recordError: unknown;
      try { await writeDaemonRecord(endpoint, record); }
      catch (error) { recordError = error; }
      const disconnect: DisconnectReason = reason === 'explicit' ? { kind: 'explicit-stop', requestId }
        : reason === 'idle' ? { kind: 'idle-exit' } : { kind: 'failure', message };
      await host.shutdown(disconnect);
      await service.dispose();
      await unlink(endpoint.socket).catch(error => { if (error.code !== 'ENOENT') throw error; });
      options.log({ at: clock.now(), level: reason === 'failed' ? 'error' : 'info', event: 'daemon-stopped', message: reason === 'failed' ? message : reason });
      resolveStopped(disposition);
      if (recordError) throw recordError;
      return disposition;
    })();
    return stopping;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      host.server.once('error', reject);
      host.server.listen(endpoint.socket, () => { host.server.off('error', reject); resolve(); });
    });
    await chmod(endpoint.socket, 0o600);
    record = Object.freeze({ ...record, state: 'running' });
    await writeDaemonRecord(endpoint, record);
    removeStopListener = service.onStop(disposition => {
      // A stop request's acknowledgement must enter its response queue first.
      setImmediate(() => { void stop('explicit', disposition.requestId); });
    });
    host.server.on('error', fatal);
    process.on('uncaughtException', fatal); process.on('unhandledRejection', fatal);
    updateIdle();
    options.log({ at: clock.now(), level: 'info', event: 'daemon-running', message: endpoint.socket });
    return { status: 'started', host: { get record() { return record; }, stop: (_reason, requestId) => stop('explicit', requestId), stopped } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await stop('failed', null, message);
    return { status: 'failed', message };
  }
}
