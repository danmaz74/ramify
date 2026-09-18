import { setImmediate } from 'node:timers/promises';
import { getHeapStatistics } from 'node:v8';
import { parentPort, resourceLimits, workerData } from 'node:worker_threads';
import type { RetainedSession, SessionInputs, SessionStatus } from './interfaces/session.js';
import type { WorkerMessage, WorkerRequest, WorkerResult } from './session-messages.js';
import { timedResult } from './session-messages.js';
import { deepFreeze } from './session-facts.js';
import { trackSessionChildren } from './session-processes.js';

if (!parentPort) throw new Error('The session worker requires a parent port');
const port = parentPort;
const inputs = deepFreeze(workerData as SessionInputs);
const post = (message: WorkerMessage): void => port.postMessage(deepFreeze(message));
const children = trackSessionChildren((pid, active) => post({ kind: 'child', pid, active }));
const controls = new Map<number, AbortController>();
let session: RetainedSession | null = null;
let queue: Promise<void> = Promise.resolve();
let closing = false;
const status = (): SessionStatus | null => {
  if (!session) return null;
  const value = session.status();
  return { ...value, compiler: { pid: value.level === 'hot' ? children.pids().at(-1) ?? null : null, rss: null } };
};

async function execute(request: Exclude<WorkerRequest, { operation: 'cancel' }>, control: AbortController): Promise<void> {
  const { id, operation } = request;
  try {
    let result: WorkerResult = null;
    if (operation === 'open') {
      // Preflight is acknowledged by the host before loading the engine or
      // observing a project. An ineffective limit cannot spawn a compiler.
      const { openSessionEngine } = await import('./session-engine.js');
      const opened = await openSessionEngine(inputs, { signal: control.signal });
      if (opened.status === 'opened') {
        session = opened.session;
        result = { status: 'opened', revision: opened.revision };
      } else result = opened;
    } else if (operation === 'dispose') {
      await session?.dispose();
      await children.release(inputs.limits.disposeTimeoutMs);
    } else {
      if (!session) throw new Error('The worker has no open session');
      switch (operation) {
        case 'update': result = await session.update(request.changes, { signal: control.signal }, request.invocation); break;
        case 'sweep': result = await session.sweep({ signal: control.signal }); break;
        case 'verify': result = await session.verify({ signal: control.signal }); break;
        case 'report': result = await session.report({ signal: control.signal }, request.sequence); break;
        case 'releaseRevision': await session.releaseRevision(request.sequence); break;
        case 'releaseCompiler': await session.releaseCompiler(); await children.release(inputs.limits.disposeTimeoutMs); break;
        case 'apiView': result = await session.apiView(request.query, { signal: control.signal }); break;
        case 'architectView': result = await session.architectView(request.query, { signal: control.signal }); break;
        case 'explorerDetails': result = await session.explorerDetails(request.sequence, request.requests, { signal: control.signal }); break;
      }
    }
    await setImmediate(); // Deliver native child exits before the status checkpoint.
    const checking = performance.now();
    const checkpoint = status();
    const workerStatus = performance.now() - checking;
    // Update results and every non-cancelled sweep result, including an unchanged one, carry operation timings.
    if (timedResult(operation, result)) result = { ...result, timings: { invocationCheck: 0, promotion: 0, ...result.timings, workerStatus } };
    post({ kind: 'reply', id, result, status: checkpoint });
  } catch (error) {
    post({ kind: 'error', id, message: error instanceof Error ? error.message : String(error), status: status() });
  } finally {
    controls.delete(id);
    if (operation === 'dispose') { children.dispose(); port.close(); }
  }
}

port.on('message', (raw: WorkerRequest) => {
  const request = deepFreeze(raw);
  if (request.operation === 'cancel') { controls.get(request.id)?.abort(); return; }
  if (closing) return;
  if (request.operation === 'dispose') {
    closing = true;
    for (const control of controls.values()) control.abort();
  }
  const control = new AbortController();
  controls.set(request.id, control);
  queue = queue.then(() => execute(request, control));
});
post({ kind: 'ready', heapLimit: getHeapStatistics().heap_size_limit,
  oldGenerationMiB: resourceLimits.maxOldGenerationSizeMb ?? 0 });
