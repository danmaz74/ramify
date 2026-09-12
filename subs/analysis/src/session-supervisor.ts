import { execFile, fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { channel } from 'node:diagnostics_channel';
import { EventEmitter } from 'node:events';
import { MessagePort } from 'node:worker_threads';
import type { Transferable, WorkerOptions } from 'node:worker_threads';
import type { WorkerMessage } from './session-messages.js';
import type { SupervisorMessage, SupervisorRequest } from './session-supervisor-messages.js';
import { replacePorts } from './session-supervisor-messages.js';
import { processAlive } from './session-processes.js';

const live = new Set<SessionWorker>();
process.on('exit', () => { for (const worker of live) worker.killOwnedProcesses(); });

async function groupMembers(group: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    execFile('/bin/ps', ['-e', '-o', 'pid=,pgid='], { timeout: 1_000 }, (error, stdout) => {
      if (error) { reject(error); return; }
      resolve(stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number))
        .filter(([, pgid]) => pgid === group).map(([pid]) => pid));
    });
  });
}
function kill(pid: number): void {
  try { process.kill(pid, 'SIGKILL'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
}

/** A real bounded worker in a disposable process, with ownership in its caller.
 * Worker failure cannot destroy this process handle or its cleanup records. */
export class SessionWorker extends EventEmitter<{
  message: [WorkerMessage]; error: [Error]; exit: [number]; online: []; 'thread-created': [number];
}> {
  readonly #child: ChildProcess;
  readonly #children = new Set<number>();
  readonly #ports = new Map<number, MessagePort>();
  readonly #closed: Promise<number>;
  readonly #timeoutMs: number;
  #nextPort = 0;
  #threadId = -1;
  #exitCode = 1;
  #closing = false;
  #finished = false;
  #exitNotified = false;
  #timer?: ReturnType<typeof setTimeout>;

  constructor(entry: URL, options: WorkerOptions) {
    super();
    this.#timeoutMs = options.workerData.limits.disposeTimeoutMs;
    const supervisor = new URL('./session-supervisor-entry.js', import.meta.url);
    if (import.meta.url.endsWith('.ts')) supervisor.pathname = supervisor.pathname.replace(/\.js$/, '.ts');
    this.#child = fork(supervisor, [], { execArgv: options.execArgv, detached: true,
      serialization: 'advanced', stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    live.add(this);
    this.#child.on('message', (message: SupervisorMessage) => this.#receive(message));
    this.#child.on('error', error => this.emit('error', error));
    this.#closed = new Promise((resolve, reject) => {
      this.#child.once('close', () => {
        this.#notifyExit();
        const finish = (): void => {
          this.#finished = true;
          if (this.#timer) clearTimeout(this.#timer);
          for (const port of this.#ports.values()) port.close();
          this.#ports.clear();
          this.#child.removeAllListeners();
        };
        void this.#release().then(() => { finish(); resolve(this.#exitCode); }, error => { finish(); reject(error); });
      });
    });
    void this.#closed.catch(() => {});
    this.#send({ kind: 'start', entry: entry.href, options });
    channel('ramify:session-worker').publish({ worker: this });
  }

  /** Zero denotes an OS spawn failure before a process identity was assigned. */
  get pid(): number { return this.#child.pid ?? 0; }
  get threadId(): number { return this.#threadId; }

  postMessage(value: unknown, transfer: readonly Transferable[] = []): void {
    if (this.#finished) return;
    const ids = new Map<MessagePort, number>();
    for (const item of transfer) {
      if (!(item instanceof MessagePort)) throw new Error('The session supports only MessagePort transfers');
      const id = ++this.#nextPort;
      ids.set(item, id); this.#ports.set(id, item);
      item.on('message', message => this.#send({ kind: 'port', id, value: message }));
      item.on('close', () => { this.#ports.delete(id); this.#send({ kind: 'port-close', id }); });
    }
    const message = ids.size ? replacePorts(value, item => item instanceof MessagePort && ids.has(item)
      ? { __ramifySessionPort: ids.get(item) } : item) : value;
    this.#send({ kind: 'post', value: message, ports: [...ids.values()] });
  }

  terminate(): Promise<number> {
    if (!this.#closing && !this.#finished) {
      this.#closing = true;
      this.#send({ kind: 'terminate' });
      this.#timer = setTimeout(() => this.killOwnedProcesses(), this.#timeoutMs);
    }
    return this.#closed;
  }

  /** Also covers the compiler's synchronous spawn-to-PID-notification gap. */
  killOwnedProcesses(): void {
    // A rejected cleanup retains evidence, not indefinite authority to signal
    // numeric identities which the OS may subsequently recycle.
    if (this.#finished) return;
    if (this.pid) { try { kill(-this.pid); } catch { /* Cleanup below reports surviving ownership. */ } }
    for (const pid of this.#children) { try { kill(pid); } catch { /* Retain for verification/retry. */ } }
  }

  #send(message: SupervisorRequest): void {
    if (!this.#child.connected) return;
    this.#child.send(message, error => { if (error && !this.#finished) this.killOwnedProcesses(); });
  }
  #receive(message: SupervisorMessage): void {
    if (message.kind === 'created') { this.#threadId = message.threadId; this.emit('thread-created', message.threadId); }
    else if (message.kind === 'online') { this.#threadId = message.threadId; this.emit('online'); }
    else if (message.kind === 'error') this.emit('error', Object.assign(new Error(message.message), { code: message.code }));
    else if (message.kind === 'exit') { this.#exitCode = message.code; this.#notifyExit(); }
    else if (message.kind === 'message') {
      const value = message.value as WorkerMessage;
      if (value.kind === 'child') {
        if (value.active) this.#children.add(value.pid); else this.#children.delete(value.pid);
      }
      this.emit('message', value);
    } else if (message.kind === 'port') this.#ports.get(message.id)?.postMessage(message.value);
    else if (message.kind === 'port-close') { this.#ports.get(message.id)?.close(); this.#ports.delete(message.id); }
  }

  #notifyExit(): void {
    this.#threadId = -1;
    if (this.#exitNotified) return;
    this.#exitNotified = true;
    // Invalidate the public session immediately; terminate() independently
    // waits for the supervisor and every owned process to finish cleanup.
    this.emit('exit', this.#exitCode);
  }

  async #release(): Promise<void> {
    const until = Date.now() + this.#timeoutMs;
    this.killOwnedProcesses();
    for (;;) {
      let members: number[];
      try { members = this.pid ? await groupMembers(this.pid) : []; }
      catch (error) {
        if (Date.now() >= until) throw error;
        await new Promise(resolve => setTimeout(resolve, 10));
        continue;
      }
      for (const pid of members) this.#children.add(pid);
      for (const pid of this.#children) if (!processAlive(pid)) this.#children.delete(pid);
      if (!this.#children.size) break;
      if (Date.now() >= until) throw new Error('Session supervisor children were not reaped');
      this.killOwnedProcesses();
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    // Never discard ownership on a rejected cleanup.
    this.#children.clear(); live.delete(this);
  }
}
