import { analyzeProject } from '../subs/analysis/src/index.js';
import type { AnalysisLimits, RunControl } from '../subs/analysis/src/interfaces/analysis.js';
import { createDefaultTagRegistry } from '../subs/analysis/subs/model/src/registry.js';
import type { BatchInvocation, BatchResult } from './interfaces/batch.js';

/** Reviewed Plan 1 defaults, chosen by dispatch rather than by a CLI flag. */
const limits: AnalysisLimits = {
  acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
    maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2,
    maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
  source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000,
    maxForwardingDepth: 256, deadlineMs: 90_000 },
  maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2,
  disposeTimeoutMs: 5000, deadlineMs: 120_000,
};

/** The public convenience binding disposes its fresh real session before returning. */
export async function runBatch(invocation: BatchInvocation, control: RunControl = {}): Promise<BatchResult> {
  const run = await analyzeProject({
    project: { cwd: invocation.cwd, ...(invocation.root === undefined ? {} : { root: invocation.root }),
      configuration: 'discover', scope: 'whole-project' },
    registry: createDefaultTagRegistry(), capabilities: invocation.capabilities, limits,
  }, control);
  if (run.status === 'cancelled' || control.signal?.aborted) return { status: 'cancelled', exitCode: 130 };
  const { report } = run;
  const stages = ['registry', 'acquisition', 'parse', 'catalog', 'link', 'access', 'decide', 'report'];
  const failed = report.outcome.execution === 'incomplete' || report.outcome.execution === 'unavailable'
    || report.stages.some(stage => stage.status === 'failed' || stage.status === 'unavailable');
  const complete = report.summary.complete && report.outcome.execution === 'completed'
    && report.outcome.check !== 'not-run'
    && report.stages.length === stages.length
    && stages.every(id => report.stages.filter(stage => stage.stage === id && stage.status === 'completed').length === 1)
    && invocation.capabilities.every(id => report.capabilities.some(item => item.capability === id && item.available && item.executed));
  const exitCode = failed ? 2 : report.outcome.execution === 'invalid' ? 1 : !complete ? 2
    : report.outcome.check === 'failed' || report.diagnostics.length > 0 || report.summary.denied > 0 ? 1 : 0;
  return { status: 'reported', report, exitCode };
}
