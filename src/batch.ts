import { acquireInventory } from '../subs/analysis/src/inventory.js';
import { classifyProjectPath } from '../subs/analysis/subs/project/src/ownership.js';
import { projectPathProblem } from '../subs/analysis/subs/project/src/path-syntax.js';
import { reportCapacity } from './report-capacity.js';
import { analyzeProject } from '../subs/analysis/src/index.js';
import { openRetainedSession } from '../subs/analysis/src/retained-session.js';
import type { AnalysisLimits, AnalysisReport, RunControl } from '../subs/analysis/src/interfaces/analysis.js';
import type { RetainedSession } from '../subs/analysis/src/interfaces/session.js';
import { createDefaultTagRegistry } from '../subs/analysis/subs/model/src/registry.js';
import { capabilities } from '../subs/cli/src/command-support.js';
import { sessionLimits } from './resident-budgets.js';
import type { AffectedBatchInvocation, AffectedBatchResult, BatchInvocation, BatchResult, OwnershipBatchInvocation, OwnershipBatchResult } from './interfaces/batch.js';

/** Shared batch/resident dispatch limits, including the reviewed large-report capacity. */
export const limits: AnalysisLimits = {
  acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
    maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2,
    maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
  source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000,
    maxForwardingDepth: 256, deadlineMs: 90_000 },
  maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: reportCapacity.reportBytes,
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
  return { status: 'reported', report: invocation.snapshot === false ? { ...report, snapshot: null } : report, exitCode };
}

/** Report codes of a session that failed to start or compute rather than a project that cannot be opened. */
const failureCodes = new Set(['internal-error', 'resource-limit', 'session-disposed']);

/** A reported open: a session failure is `analysis-failed` and a project that cannot be found or read
 * (`execution: 'unavailable'`) is `project-unavailable`, both exit 2 as `check --batch` exits; only an
 * invalid project is `invalid-project`, exit 1. */
function refusal(report: AnalysisReport): AffectedBatchResult {
  const failed = report.outcome.execution === 'incomplete' || report.diagnostics.some(item => failureCodes.has(item.code));
  // A concise summary accompanies the complete bounded records; it is not their replacement.
  const message = report.diagnostics[0]?.message ?? `Project ${report.outcome.execution}`;
  const evidence = { diagnostics: report.diagnostics, stages: report.stages };
  if (failed) return { status: 'unavailable', reason: 'analysis-failed', message, unknownModules: [], exitCode: 2, ...evidence };
  return report.outcome.execution === 'invalid'
    ? { status: 'unavailable', reason: 'invalid-project', message, unknownModules: [], exitCode: 1, ...evidence }
    : { status: 'unavailable', reason: 'project-unavailable', message, unknownModules: [], exitCode: 2, ...evidence };
}

/** The affected-module batch form: a fresh retained session over the project `check --batch` would
 * select, with its capabilities, queried once at the opened revision and always disposed. */
export async function runAffectedBatch(invocation: AffectedBatchInvocation, control: RunControl = {}): Promise<AffectedBatchResult> {
  if (control.signal?.aborted) return { status: 'cancelled', exitCode: 130 };
  const opened = await openRetainedSession({
    project: { cwd: invocation.cwd, ...(invocation.root === undefined ? {} : { root: invocation.root }),
      configuration: 'discover', scope: 'whole-project' },
    registry: createDefaultTagRegistry(), capabilities, limits, session: sessionLimits,
  }, control);
  if (opened.status === 'cancelled') return { status: 'cancelled', exitCode: 130 };
  if (opened.status === 'reported') return control.signal?.aborted ? { status: 'cancelled', exitCode: 130 } : refusal(opened.report);
  const session: RetainedSession = opened.session;
  try {
    if (control.signal?.aborted) return { status: 'cancelled', exitCode: 130 };
    const outcome = await session.affected({ sequence: opened.revision.sequence,
      modules: invocation.modules, paths: invocation.paths, ...(invocation.fileFacts ? { fileFacts: true } : {}) }, control);
    if (outcome.status === 'cancelled' || control.signal?.aborted) return { status: 'cancelled', exitCode: 130 };
    if (outcome.status === 'answered') return { status: 'answered', inputId: outcome.result.inputId, result: outcome.result };
    // A fresh session has no earlier valid revision: an invalid first revision is an invalid project.
    if ((outcome.reason === 'invalid-current' || outcome.reason === 'missing-facts') && opened.revision.outcome.execution === 'invalid') {
      return { status: 'unavailable', reason: 'invalid-project', message: opened.revision.diagnostics[0]?.message ?? outcome.message,
        unknownModules: [], exitCode: 1, diagnostics: opened.revision.diagnostics, stages: opened.revision.stages };
    }
    return { ...outcome, status: 'unavailable',
      exitCode: outcome.reason === 'unknown-module' || outcome.reason === 'invalid-query' ? 1 : 2 };
  } finally { await session.dispose(); }
}

/** Answer only from a fresh coherent inventory; no compiler analysis or resident connection. */
export async function runOwnershipBatch(invocation: OwnershipBatchInvocation, control: RunControl = {}): Promise<OwnershipBatchResult> {
  if (control.signal?.aborted) return { status: 'cancelled', exitCode: 130 };
  const paths = [...new Set(invocation.paths.length ? invocation.paths : ['.'])];
  for (const path of paths) {
    const problem = projectPathProblem(path);
    if (problem !== null) throw new Error(problem);
  }
  const run = await acquireInventory({ project: { cwd: invocation.cwd,
    ...(invocation.root === undefined ? {} : { root: invocation.root }), scope: 'whole-project', configuration: 'discover' },
    registry: createDefaultTagRegistry(), limits: limits.acquisition }, control);
  if (run.status === 'cancelled' || control.signal?.aborted) return { status: 'cancelled', exitCode: 130 };
  if (run.status !== 'completed') return run.status === 'invalid'
    ? { ...run, status: 'invalid', exitCode: 1 } : { ...run, status: run.status, exitCode: 2 };
  const { inventory, inputId } = run.snapshot;
  return { status: 'answered', exitCode: 0, root: inventory.scope.root, inputId,
    scope: { configuration: inventory.scope.configuration, ownership: inventory.scope.ownership },
    paths: paths.map(path => ({ path, ownership: classifyProjectPath(inventory.scope, path) })), warnings: inventory.warnings };
}
