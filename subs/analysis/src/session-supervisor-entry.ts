import { MessageChannel, Worker } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import type { SupervisorMessage, SupervisorRequest } from './session-supervisor-messages.js';
import { replacePorts } from './session-supervisor-messages.js';

// This process outlives its bounded worker. Once that worker exits, ending
// this process releases its orphaned libuv child handles to the system reaper.
// The outer host retains the process group and waits for every PID to vanish.
let worker: Worker | undefined;
let ending = false;
const children = new Set<number>();
const ports = new Map<number, MessagePort>();
const send = (message: SupervisorMessage): void => {
  if (process.connected) process.send?.(message, () => {});
};
const killChildren = (): void => {
  for (const pid of children) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* Already exited. */ }
  }
};
async function terminate(): Promise<void> {
  if (ending) return;
  ending = true;
  killChildren(); // Unblock a compiler read before requesting thread termination.
  if (worker) await worker.terminate();
  else process.exit(0);
}
process.on('disconnect', () => { void terminate(); });
process.on('message', (message: SupervisorRequest) => {
  if (message.kind === 'start') {
    if (worker) return;
    try {
      worker = new Worker(new URL(message.entry), message.options);
      send({ kind: 'created', threadId: worker.threadId });
      worker.on('online', () => send({ kind: 'online', threadId: worker!.threadId }));
      worker.on('message', (value: unknown) => {
        if (value && typeof value === 'object' && 'kind' in value && value.kind === 'child'
          && 'pid' in value && typeof value.pid === 'number' && 'active' in value) {
          if (value.active) children.add(value.pid); else children.delete(value.pid);
        }
        send({ kind: 'message', value });
      });
      worker.on('error', (error: Error & { code?: string }) => send({ kind: 'error', message: error.message, code: error.code }));
      worker.on('exit', code => {
        ending = true;
        killChildren();
        for (const port of ports.values()) port.close();
        // Flush the exit acknowledgment before ending the supervisor.
        if (process.connected) process.send?.({ kind: 'exit', code }, () => process.exit(0));
        else process.exit(0);
      });
    } catch (error) {
      send({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      process.exitCode = 1;
      process.disconnect?.();
    }
  } else if (message.kind === 'terminate') {
    void terminate();
  } else if (message.kind === 'post' && worker && !ending) {
    const transferred = new Map<number, MessagePort>();
    for (const id of message.ports) {
      const channel = new MessageChannel();
      ports.set(id, channel.port1); transferred.set(id, channel.port2);
      channel.port1.on('message', value => send({ kind: 'port', id, value }));
      channel.port1.on('close', () => { ports.delete(id); send({ kind: 'port-close', id }); });
    }
    const value = message.ports.length ? replacePorts(message.value, item => {
      if (item && typeof item === 'object' && '__ramifySessionPort' in item) return transferred.get(Number(item.__ramifySessionPort)) ?? item;
      return item;
    }) : message.value;
    worker.postMessage(value, [...transferred.values()]);
  } else if (message.kind === 'port') ports.get(message.id)?.postMessage(message.value);
  else if (message.kind === 'port-close') { ports.get(message.id)?.close(); ports.delete(message.id); }
});
