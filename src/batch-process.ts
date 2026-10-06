import { spawn } from 'node:child_process';
import type { RunControl } from '../subs/analysis/src/interfaces/analysis.js';
import type { AffectedBatchOperation, AffectedBatchResult, BatchOperation, BatchResult } from './interfaces/batch.js';
import { reportCapacity } from './report-capacity.js';

const errorBytes = 64 * 1024;

function batchResult(value: unknown): value is BatchResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return result.status === 'cancelled' ? result.exitCode === 130
    : result.status === 'reported' && [0, 1, 2].includes(result.exitCode as number) && !!result.report && typeof result.report === 'object';
}

function affectedResult(value: unknown): value is AffectedBatchResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  if (result.status === 'cancelled') return result.exitCode === 130;
  if (result.status === 'unavailable') return typeof result.reason === 'string' && typeof result.message === 'string'
    && Array.isArray(result.unknownModules) && [1, 2].includes(result.exitCode as number);
  const selection = result.result as Record<string, unknown> | null | undefined;
  return result.status === 'answered' && typeof result.inputId === 'string' && !!selection && typeof selection === 'object'
    && selection.schemaVersion === 'ramify.affected/3' && selection.inputId === result.inputId;
}

/** One Node child per run of the named operation. A cancelled run resolves as cancelled once the child has exited. */
function runChild<T>(runtime: string, entry: string, operation: 'check' | 'affected', invocation: unknown,
  valid: (value: unknown) => value is T, cancelled: T, control: RunControl = {}): Promise<T> {
  return new Promise<T>((accept, reject) => {
    const args = operation === 'check' ? [entry, JSON.stringify(invocation)] : [entry, operation, JSON.stringify(invocation)];
    const child = spawn(runtime, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const output: Buffer[] = [], errors: Buffer[] = [];
    let outputBytes = 0, errorLength = 0, interrupted = false, oversized = false, settled = false;
    const cancel = (): void => { interrupted = true; child.kill('SIGTERM'); };
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
      if (interrupted) return accept(cancelled);
      if (oversized) return reject(new Error('Batch result exceeds the report capacity'));
      if (code !== 0) return reject(new Error(Buffer.concat(errors).toString('utf8').trim() || `Batch process exited with ${code ?? signal}`));
      let value: unknown;
      try { value = JSON.parse(Buffer.concat(output).toString('utf8')); } catch { return reject(new Error('Batch process returned malformed JSON')); }
      if (!valid(value)) return reject(new Error('Batch process returned an invalid result'));
      accept(value);
    }));
  });
}

/** Batch operation for a client that cannot load the engine: one Node child per run. */
export function createProcessBatch(runtime: string, entry: string): BatchOperation {
  return (invocation, control) => runChild(runtime, entry, 'check', invocation, batchResult, { status: 'cancelled', exitCode: 130 }, control);
}

/** The affected-module batch form in the same Node child seam as `check --batch`. */
export function createProcessAffectedBatch(runtime: string, entry: string): AffectedBatchOperation {
  return (invocation, control) => runChild(runtime, entry, 'affected', invocation, affectedResult, { status: 'cancelled', exitCode: 130 }, control);
}
