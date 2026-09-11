import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import { object } from './equivalence-process.js';
import type { SequenceProcess } from './equivalence-process.js';
import { parseAnalysisDocument } from './equivalence-comparison.js';
import { analysisEvidence, archiveObservation, recordObservation } from './observations.js';

// Reviewed scope: 100 ms debounce + the iteration-1 reference source target.
export const watchEditTargetMs = 100 + 4500;
// Completion guard only; the original performance target remains observable.
export const watchCompletionTimeoutMs = 120_000;
interface ArrivedLine { readonly value: Record<string, unknown>; readonly arrivedAt: number }

/** Actual CLI JSON-lines reader. It uses no fake watcher or service binding. */
export async function withLiveWatch<T>(processes: SequenceProcess, root: string,
  run: (next: (timeoutMs: number) => Promise<ArrivedLine>) => Promise<T>): Promise<T> {
  const child = spawn(processes.executable, ['watch', '--format', 'json'], {
    cwd: root, env: processes.environment, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  const queued: (ArrivedLine & { readonly bytes: number })[] = [];
  let pending = '', stderr = '', error: Error | undefined, wake: (() => void) | undefined;
  let closed = false, queuedBytes = 0;
  const fail = (cause: unknown): void => {
    error ??= cause instanceof Error ? cause : new Error(String(cause));
    child.kill('SIGKILL'); wake?.();
  };
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    try {
      pending += chunk;
      for (let index = pending.indexOf('\n'); index !== -1; index = pending.indexOf('\n')) {
        const line = pending.slice(0, index); pending = pending.slice(index + 1);
        // The limit belongs to each JSON line, excluding its delimiter. A
        // read may finish one line and also contain bytes from the next one.
        assert.ok(Buffer.byteLength(line) <= 32 * 1024 ** 2 + 65536, 'Watch line exceeds response bound');
        const value = object(JSON.parse(line));
        assert.equal(value.schemaVersion, 'ramify.watch/1', 'Watch must emit versioned JSON lines');
        queuedBytes += Buffer.byteLength(line);
        assert.ok(queued.length < 256 && queuedBytes <= 64 * 1024 ** 2, 'Watch evidence consumer fell behind');
        queued.push({ value, arrivedAt: performance.now(), bytes: Buffer.byteLength(line) });
      }
      assert.ok(Buffer.byteLength(pending) <= 32 * 1024 ** 2 + 65536, 'Watch line exceeds response bound');
      // Partial reads are not completed waits. Only a complete line, stream
      // failure, close or the actual deadline may release the consumer.
      if (queued.length) wake?.();
    } catch (cause) { fail(cause); }
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
    if (Buffer.byteLength(stderr) > 65536) fail(new Error('Watch stderr exceeded evidence bound'));
  });
  child.once('error', fail);
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.once('close', (code, signal) => { closed = true; wake?.(); resolve({ code, signal }); });
  });
  const next = async (timeoutMs: number): Promise<ArrivedLine> => {
    if (!queued.length && !closed && !error) await new Promise<void>(resolve => {
      const timer = setTimeout(() => { wake = undefined; resolve(); }, Math.max(0, timeoutMs));
      wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
    });
    if (error) throw error;
    const line = queued.shift();
    assert.ok(line, closed ? `Watch exited before its next line: ${stderr}` : `Watch event exceeded ${timeoutMs} ms`);
    queuedBytes -= line.bytes;
    const raw = await archiveObservation('watch-line', line);
    recordObservation('watch-line', { arrivedAt: line.arrivedAt, bytes: line.bytes, raw,
      value: { ...line.value, ...(line.value.event === 'revision'
        ? { report: analysisEvidence(line.value.report as AnalysisReport) } : {}) } });
    return line;
  };
  let failure: unknown, result: T | undefined;
  try { result = await run(next); }
  catch (cause) { failure = cause; }
  if (!closed) child.kill('SIGINT');
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 7000);
  const outcome = await exit;
  clearTimeout(killTimer);
  recordObservation('watch-exit', { ...outcome, stderr, pending });
  if (failure) throw failure;
  assert.equal(outcome.code, 130, 'Watch must release its subscription on SIGINT');
  assert.equal(stderr, '', 'Watch recovery is not equivalent to an uninterrupted live edit');
  assert.equal(pending, '', 'Watch left a partial JSON line');
  return result as T;
}

export function watchRevision(line: ArrivedLine, token: unknown, previousSequence: number, startedAt: number,
  expectedPaths: readonly string[]): { report: AnalysisReport; sequence: number; elapsedMs: number } {
  assert.equal(line.value.event, 'revision', 'Expected the first revision after the edit');
  const revision = object(line.value.revision);
  assert.deepEqual(revision.token, token, 'Watch unexpectedly changed generation');
  assert.ok(typeof revision.sequence === 'number' && revision.sequence > previousSequence, 'Revision sequence must advance');
  assert.ok(typeof revision.revision === 'string' && revision.revision.startsWith('rev/1:'), 'Missing revision token');
  assert.equal(revision.cause, 'watch', 'Edit must be published by the real watcher');
  assert.deepEqual(revision.changed, expectedPaths, 'Changed paths must describe the edit, not all rechecked consumers');
  const report = parseAnalysisDocument(JSON.stringify(line.value.report));
  assert.equal(object(revision.fingerprints).inputId, report.inputId, 'Watch header and report describe different inputs');
  assert.deepEqual(revision.summary, report.summary);
  assert.deepEqual(revision.outcome, report.outcome);
  const elapsedMs = line.arrivedAt - startedAt;
  assert.ok(Number.isFinite(elapsedMs) && elapsedMs >= 0, 'Watch elapsed time must be finite and nonnegative');
  return { report, sequence: revision.sequence, elapsedMs };
}
