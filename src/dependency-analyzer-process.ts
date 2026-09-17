import { spawn } from 'node:child_process';
import type { AnalysisReport, DependencyAnalyzerOutcome, DependencyDiagramRunner, ProjectRequest, RunControl } from '../subs/analysis/src/index.js';
import { reportCapacity } from './report-capacity.js';

/** Bounds of one dependency analyzer process (Plan 6D resource budgets). */
export const dependencyAnalyzerCapacity = Object.freeze({
  /** The encoded diagram limit; a larger diagram is refused. */
  maxResultBytes: 16 * 1024 ** 2,
  /** One job, including process exit. */
  deadlineMs: 120_000,
  /** The existing disposal limit for the analyzer and its compiler helper. */
  disposalMs: 5000,
  /** The analyzer's own deadline, leaving the disposal limit before the job deadline. */
  analysisDeadlineMs: 115_000,
  /** A request carries one report within the report capacity. */
  requestBytes: reportCapacity.responseBytes,
  responseBytes: reportCapacity.responseBytes,
});

export interface DependencyAnalyzerProcessOptions {
  readonly deadlineMs?: number;
  readonly responseBytes?: number;
}

const errorBytes = 64 * 1024;
const unavailableReasons = new Set(['invalid-report', 'analysis-failed', 'resource-limit']);
const strings = (value: unknown): boolean => Array.isArray(value) && value.every(item => typeof item === 'string');

function analyzerOutcome(value: unknown): value is DependencyAnalyzerOutcome {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const outcome = value as Record<string, unknown>;
  switch (outcome.status) {
    case 'ready': {
      const diagram = outcome.diagram as Record<string, unknown> | null;
      const timings = outcome.timings as Record<string, unknown> | null;
      return !!diagram && typeof diagram === 'object' && typeof diagram.inputId === 'string' && strings(diagram.modules)
        && Array.isArray(diagram.boundaries) && Number.isSafeInteger(outcome.behaviorRuns) && !!timings && typeof timings === 'object'
        && ['acquireMs', 'projectMs', 'classifyMs', 'totalMs'].every(key => typeof timings[key] === 'number');
    }
    case 'inputs-changed': return strings(outcome.paths) && (outcome.paths as unknown[]).length > 0;
    case 'cancelled': return true;
    case 'unavailable': return unavailableReasons.has(outcome.reason as string) && typeof outcome.message === 'string';
    default: return false;
  }
}

/**
 * Dependency diagram runner with one Node child per run: the request on standard input and one
 * JSON outcome on standard output within the response capacity. Cancellation, the deadline or an
 * oversized response terminate the child, which disposes its compiler helper; a child that has not
 * exited within the disposal limit is killed. Every run settles once the child has exited and never
 * returns a partial outcome.
 */
export function createProcessDependencyAnalyzer(runtime: string, entry: string, options: DependencyAnalyzerProcessOptions = {}): DependencyDiagramRunner {
  const deadlineMs = options.deadlineMs ?? dependencyAnalyzerCapacity.deadlineMs;
  const responseBytes = options.responseBytes ?? dependencyAnalyzerCapacity.responseBytes;
  return { run: (input: { readonly project: ProjectRequest; readonly report: AnalysisReport }, control: RunControl = {}) =>
    new Promise<DependencyAnalyzerOutcome>(accept => {
      if (control.signal?.aborted) { accept({ status: 'cancelled' }); return; }
      const child = spawn(runtime, [entry], { stdio: ['pipe', 'pipe', 'pipe'] });
      const output: Buffer[] = [], errors: Buffer[] = [];
      let outputBytes = 0, errorLength = 0, settled = false;
      let ending: 'cancelled' | 'deadline' | 'oversized' | undefined;
      let escalation: ReturnType<typeof setTimeout> | undefined;
      const terminate = (reason: NonNullable<typeof ending>): void => {
        if (ending || settled) return;
        ending = reason; output.length = 0;
        child.kill('SIGTERM');
        // The child disposes its helper on SIGTERM; kill it if it has not exited within the disposal limit.
        escalation = setTimeout(() => child.kill('SIGKILL'), dependencyAnalyzerCapacity.disposalMs - 500);
      };
      const cancel = (): void => terminate('cancelled');
      const deadline = setTimeout(() => terminate('deadline'), deadlineMs);
      const settle = (outcome: DependencyAnalyzerOutcome): void => {
        if (settled) return;
        settled = true; clearTimeout(deadline); clearTimeout(escalation);
        control.signal?.removeEventListener('abort', cancel);
        output.length = 0; errors.length = 0;
        accept(outcome);
      };
      control.signal?.addEventListener('abort', cancel, { once: true });
      child.stdout.on('data', (chunk: Buffer) => {
        if (ending) return;
        outputBytes += chunk.length;
        if (outputBytes > responseBytes) terminate('oversized'); else output.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => { if (errorLength < errorBytes) { errors.push(chunk); errorLength += chunk.length; } });
      // An early child exit closes standard input; its outcome comes from close.
      child.stdin.on('error', () => {});
      child.once('error', (error: NodeJS.ErrnoException) => settle({ status: 'unavailable', reason: 'analysis-failed',
        message: `Cannot start ${runtime} for dependency analysis (${error.code ?? error.message})` }));
      child.once('close', (code, signal) => {
        if (ending === 'cancelled') return settle({ status: 'cancelled' });
        if (ending === 'deadline') return settle({ status: 'unavailable', reason: 'resource-limit', message: `Dependency analysis exceeded its ${deadlineMs} ms deadline` });
        if (ending === 'oversized') return settle({ status: 'unavailable', reason: 'resource-limit', message: `The dependency analyzer response exceeds ${responseBytes} bytes` });
        if (code !== 0) {
          return settle({ status: 'unavailable', reason: 'analysis-failed',
            message: Buffer.concat(errors).toString('utf8').trim() || `Dependency analyzer process exited with ${code ?? signal}` });
        }
        let value: unknown;
        try { value = JSON.parse(Buffer.concat(output).toString('utf8')); }
        catch { return settle({ status: 'unavailable', reason: 'analysis-failed', message: 'The dependency analyzer returned malformed JSON' }); }
        settle(analyzerOutcome(value) ? value : { status: 'unavailable', reason: 'analysis-failed', message: 'The dependency analyzer returned an invalid outcome' });
      });
      if (control.signal?.aborted) cancel();
      child.stdin.end(JSON.stringify({ project: input.project, report: input.report }));
    }) };
}
