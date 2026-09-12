import { channel } from 'node:diagnostics_channel';
import { MessageChannel, Worker } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import type { RetainedSession, SessionInputs, SessionRevision } from '../../subs/analysis/src/interfaces/session.js';
import { openWorkerSession } from '../../subs/analysis/src/session-host.js';
import type { Assertions } from './runner.js';

/** Test-only RPC through a separate port; production messages stay untouched. */
export class SessionInspection {
  readonly #worker: Worker;
  readonly #port: MessagePort;
  readonly #pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  #nextId = 0;
  #closed = false;
  constructor(worker: Worker, port: MessagePort) {
    this.#worker = worker; this.#port = port;
    port.on('message', (message: { id: number; result?: unknown; error?: string }) => {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error));
      else pending.resolve(message.result);
    });
    port.once('close', () => this.close());
  }
  get threadId(): number { return this.#worker.threadId; }
  decisions(): Promise<Readonly<Record<string, number>>> {
    return this.#request('decisions') as Promise<Readonly<Record<string, number>>>;
  }
  corruptAccess(): Promise<{ readonly path: string; readonly frozen: boolean }> {
    return this.#request('corrupt-access') as Promise<{ readonly path: string; readonly frozen: boolean }>;
  }
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) pending.reject(new Error('The session inspection channel closed'));
    this.#pending.clear(); this.#port.close();
  }
  #request(operation: 'decisions' | 'corrupt-access'): Promise<unknown> {
    if (this.#closed) return Promise.reject(new Error('The session inspection channel closed'));
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#port.postMessage({ id, operation });
    });
  }
}

/**
 * Run the production host and worker with a factory observation inside the
 * worker isolate. Only its test entry differs; no testing API is exposed by
 * production. The synchronous constructor diagnostic binds exactly this worker.
 */
export async function openInspectedSession(inputs: SessionInputs): Promise<{
  readonly session: RetainedSession; readonly revision: SessionRevision; readonly inspection: SessionInspection;
}> {
  const workers = channel('worker_threads');
  let inspection: SessionInspection | undefined;
  const capture = (message: unknown): void => {
    const worker = (message as { worker: Worker }).worker;
    if (!(worker instanceof Worker)) throw new Error('The worker diagnostic has no Worker');
    const ports = new MessageChannel();
    inspection = new SessionInspection(worker, ports.port1);
    worker.postMessage({ kind: 'plan5-inspection', port: ports.port2 }, [ports.port2]);
  };
  workers.subscribe(capture);
  let opening: ReturnType<typeof openWorkerSession>;
  try {
    opening = openWorkerSession(inputs, {}, new URL('./plan5-session-inspection-worker.ts', import.meta.url));
  } finally { workers.unsubscribe(capture); }
  try {
    const opened = await opening;
    if (opened.status !== 'opened') throw new Error(`The inspected session did not open: ${JSON.stringify(opened)}`);
    if (!inspection) { await opened.session.dispose(); throw new Error('The session worker was not observed'); }
    return { session: opened.session, revision: opened.revision, inspection };
  } catch (error) { inspection?.close(); throw error; }
}

export function compilerPid(session: RetainedSession): number | null { return session.status().compiler.pid; }

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}

/** Dispose on every exit and prove the worker, compiler and retained state end. */
export async function disposeInspectedSession(session: RetainedSession, inspection: SessionInspection, assertions: Assertions): Promise<void> {
  const pid = compilerPid(session);
  try { await session.dispose(); }
  finally { inspection.close(); }
  const until = Date.now() + 5_000;
  while (pid !== null && alive(pid) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
  assertions.equal('disposal releases the worker thread', inspection.threadId, -1);
  assertions.equal('disposal releases the observer and compiler handles',
    [session.status().observedInputs, session.status().compiler.pid], [0, null]);
  assertions.equal('disposal releases all historical versions', session.status().factBytes, 0);
  assertions.equal('disposed session cannot project a report', await session.report(), null);
  assertions.ok('the session compiler process is gone after disposal', pid === null || !alive(pid));
}
