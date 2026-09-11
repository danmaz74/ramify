import { createHash } from 'node:crypto';
import type { AnalysisDriver, ContextBudgets } from '../interfaces/contexts.js';
import type { IncrementRun, RetainedAnalysis } from '../../../../../analysis/src/interfaces/analysis.js';
import type { CapturedInput } from '../../../../../analysis/subs/project/src/interfaces/project.js';
import { historyReport } from './history-fixture.js';

export const testBudgets: ContextBudgets = { maxContexts: 8, maxHistoryRevisions: 8, maxHistoryBytes: 64 * 1024 ** 2,
  maxRetainedBytesPerContext: 96 * 1024 ** 2, maxRetainedBytesGlobal: 512 * 1024 ** 2, maxQueuedPaths: 10_000,
  maxConcurrentAnalyses: 1, warmIdleMs: 600_000, coldRetainMs: 1_800_000, debounceMs: 100, verificationIntervalMs: 60_000 };
export function hash(content: string): string { return createHash('sha256').update(content).digest('hex'); }
export function capture(version = 1, execution: 'completed' | 'invalid' | 'incomplete' = 'completed', inputs?: readonly CapturedInput[]): Extract<IncrementRun, { status: 'reported' }> {
  const report = historyReport(`run/1:${version}`);
  const observed = inputs ?? [{ path: 'src/index.ts', role: 'source' as const, sha256: hash(String(version)), bytes: 1 }];
  const inputId = `input/1:${hash(JSON.stringify(observed))}`;
  const retained: RetainedAnalysis = { schemaVersion: 'ramify.retained/1', inputId, engine: 'test-engine', inputs: observed,
    bytes: 100, stages: [], products: {} };
  return { status: 'reported', report: { ...report, inputId, outcome: { execution, check: execution === 'completed' ? 'passed' : 'not-run', coverage: execution === 'completed' ? 'complete' : 'not-run' },
    summary: { ...report.summary, complete: execution === 'completed', owners: version } },
    retained: execution === 'incomplete' ? null : retained, reused: [], changed: observed.map(input => input.path) };
}
export function createScriptedDriver() {
  const calls: { inputs: Parameters<AnalysisDriver['check']>[0]; signal: AbortSignal | undefined }[] = [];
  const pending: ((call: typeof calls[number]) => Promise<IncrementRun> | IncrementRun)[] = [];
  let version = 1;
  let disposed = false;
  const driver: AnalysisDriver = {
    async resolve(request) { return { status: 'resolved', root: request.root ?? '/fixture', selection: request.root ? 'given' : 'found', invokedFrom: request.cwd, configuration: 'tsconfig.json' }; },
    async check(inputs, control) {
      const call = { inputs, signal: control?.signal }; calls.push(call);
      const run = pending.shift();
      return run ? run(call) : capture(version);
    },
    async dispose() { disposed = true; },
  };
  return { driver, calls, pending, set version(value: number) { version = value; }, get disposed() { return disposed; } };
}
export async function flush(): Promise<void> { for (let index = 0; index < 30; index++) await Promise.resolve(); }
