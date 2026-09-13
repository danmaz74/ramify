import { spawn } from 'node:child_process';
import type { BatchOperation, BatchResult } from './interfaces/batch.js';
import { reportCapacity } from './report-capacity.js';

const errorBytes = 64 * 1024;

function batchResult(value: unknown): value is BatchResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return result.status === 'cancelled' ? result.exitCode === 130
    : result.status === 'reported' && [0, 1, 2].includes(result.exitCode as number) && !!result.report && typeof result.report === 'object';
}

/** Batch operation for a client that cannot load the engine: one Node child per run.
 * A cancelled run resolves as cancelled once the child has exited. */
export function createProcessBatch(runtime: string, entry: string): BatchOperation {
  return (invocation, control = {}) => new Promise<BatchResult>((accept, reject) => {
    const child = spawn(runtime, [entry, JSON.stringify(invocation)], { stdio: ['ignore', 'pipe', 'pipe'] });
    const output: Buffer[] = [], errors: Buffer[] = [];
    let outputBytes = 0, errorLength = 0, cancelled = false, oversized = false, settled = false;
    const cancel = (): void => { cancelled = true; child.kill('SIGTERM'); };
    const settle = (finish: () => void): void => {
      if (settled) return;
      settled = true; control.signal?.removeEventListener('abort', cancel); finish();
    };
    control.signal?.addEventListener('abort', cancel, { once: true });
    if (control.signal?.aborted) cancel();
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > reportCapacity.responseBytes) { oversized = true; child.kill('SIGKILL'); } else output.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => { if (errorLength < errorBytes) { errors.push(chunk); errorLength += chunk.length; } });
    // A failed spawn emits error and then close; the first settles.
    child.once('error', (error: NodeJS.ErrnoException) => settle(() => reject(Object.assign(
      new Error(`Cannot start ${runtime} for batch analysis (${error.code ?? error.message})`), { code: error.code }))));
    child.once('close', (code, signal) => settle(() => {
      if (cancelled) return accept({ status: 'cancelled', exitCode: 130 });
      if (oversized) return reject(new Error('Batch result exceeds the report capacity'));
      if (code !== 0) return reject(new Error(Buffer.concat(errors).toString('utf8').trim() || `Batch process exited with ${code ?? signal}`));
      let value: unknown;
      try { value = JSON.parse(Buffer.concat(output).toString('utf8')); } catch { return reject(new Error('Batch process returned malformed JSON')); }
      if (!batchResult(value)) return reject(new Error('Batch process returned an invalid result'));
      accept(value);
    }));
  });
}
