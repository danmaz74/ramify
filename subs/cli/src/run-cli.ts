import type { AnalysisDiagnostic, AnalysisReport, Capability, RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { CliEnvironment, CliExitCode } from './interfaces/cli.js';
import { help, parseArguments } from './arguments.js';
import { formatHuman, serializeReport } from './format.js';

const capabilities: readonly Capability[] = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog',
  'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'];
const requiredStages = ['registry', 'acquisition', 'parse', 'catalog', 'link', 'access', 'decide', 'report'];

/** Defend the injected-operation boundary against an unrun or contradictory success. */
function checkedReport(report: AnalysisReport): AnalysisReport {
  if (report.outcome.execution !== 'completed') return report;
  const missing = requiredStages.filter(id => report.stages.filter(stage => stage.stage === id).length !== 1
    || report.stages.find(stage => stage.stage === id)?.status !== 'completed');
  const unavailable = capabilities.filter(id => !report.capabilities.some(item => item.capability === id && item.available && item.executed));
  if (!missing.length && !unavailable.length && report.summary.complete && report.outcome.check !== 'not-run') return report;
  const issue: AnalysisDiagnostic = { id: 'cli:missing-stage', category: 'execution', code: 'missing-stage',
    message: `Check did not complete required work: ${[...missing, ...unavailable, ...(!report.summary.complete || report.outcome.check === 'not-run' ? ['completion evidence'] : [])].join(', ')}`,
    location: null, related: [], importer: null, original: null, accessId: null };
  return { ...report, diagnostics: [...report.diagnostics, issue], outcome: { ...report.outcome, execution: 'incomplete', check: 'not-run' },
    summary: { ...report.summary, complete: false, errors: report.diagnostics.length + 1 } };
}

export async function runCli(argv: readonly string[], environment: CliEnvironment, control: RunControl = {}): Promise<CliExitCode> {
  const stderr = (text: string): void => { try { environment.stderr(text); } catch { /* Output failure already selects exit 2. */ } };
  const interrupted = (): CliExitCode => { stderr('Interrupted; no result claimed.\n'); return 130; };
  if (control.signal?.aborted) return interrupted();
  const json = argv.some((arg, index) => arg === '--format' && argv[index + 1] === 'json');
  let phase: 'invocation' | 'execution' | 'output' = 'invocation';
  try {
    const args = parseArguments(argv);
    if (args.command !== 'check') {
      phase = 'output'; environment.stdout(args.command === 'help' ? help : `${environment.version}\n`); return 0;
    }
    phase = 'execution';
    const result = await environment.batch({ cwd: environment.cwd, ...(args.root === undefined ? {} : { root: args.root }), capabilities }, control);
    if (result.status === 'cancelled' || control.signal?.aborted) return interrupted();
    phase = 'output';
    const { report, json: serialized } = serializeReport(checkedReport(result.report));
    const failed = report.outcome.execution === 'incomplete' || report.outcome.execution === 'unavailable'
      || result.exitCode === 2 || report.stages.some(stage => stage.status === 'failed' || stage.status === 'unavailable');
    const exitCode = failed ? 2 : report.outcome.execution === 'invalid' || report.outcome.check === 'failed'
      || report.diagnostics.length || report.summary.denied || result.exitCode === 1 ? 1 : 0;
    environment.stdout(args.format === 'json' ? serialized + '\n' : formatHuman(report));
    return exitCode;
  } catch (error) {
    if (phase !== 'output' && control.signal?.aborted) return interrupted();
    const code = phase === 'invocation' ? 'invalid-invocation' : phase === 'output' ? 'output-failure' : 'internal-error';
    const message = error instanceof Error ? error.message : String(error);
    if (json && phase !== 'output') {
      try { environment.stdout(JSON.stringify({ schemaVersion: 'ramify.cli/1', status: 'unavailable',
        diagnostics: [{ category: phase, code, message }], exitCode: 2 }) + '\n'); }
      catch { stderr('Error [output-failure]: Cannot write the invocation result.\n'); }
    } else stderr(`Error [${code}]: ${message}\n`);
    return 2;
  }
}
