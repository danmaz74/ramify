import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import { plan2Instances } from './plan2-instances.js';
import { plan2Runtime } from './plan2-runtime.js';
import { plan1Instances, referenceCases } from './cases.js';
import { executionIdentity, persistGateReport } from './artifact.js';
import type { Observation } from './observations.js';
import { readReviewedPlan, repositoryRoot } from './plan.js';
import { referenceRuntime } from './runtime.js';
import { verifyInstances } from './runner.js';
import { formatVerification } from './verify.js';
import { regressionVariants, tierScripts } from './tiers.js';

export function checkerSummary(report: Pick<AnalysisReport, 'outcome' | 'summary' | 'diagnostics' | 'warnings' | 'coverage'> | undefined): string[] {
  if (!report) return ['Known import violations: not measured', 'Source coverage: not executed — no source checker ran'];
  return [`Known import violations: ${report.summary.denied} (checker-derived)`,
    `Source errors: ${report.summary.errors}; execution: ${report.outcome.execution}; check: ${report.outcome.check}`,
    `Source coverage: ${report.outcome.coverage}; ${report.summary.coverageNotes} analysis limits`,
    `Scope: ${report.summary.owners} owners, ${report.summary.sourceFiles} source files, ${report.summary.resources} resources, ${report.summary.accesses} accesses`,
    `Application decisions: ${report.summary.allowed} allowed, ${report.summary.denied} denied; proven external selections: ${report.summary.external}`,
    ...report.diagnostics.map(issue => `  Error [${issue.code}] ${issue.location?.file ?? '.'}:${issue.location?.line ?? 1}: ${issue.message}`),
    ...report.warnings.map(warning => `  Warning [${warning.code}] ${warning.entry}: ${warning.count}`),
    ...report.coverage.map(note => `  Coverage [${note.code}] ${note.location.file}:${note.location.line}: ${note.message}`)];
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length === 1 && args[0] !== '--dry-run') {
    console.error('Usage: reference:report [--dry-run]');
    return 2;
  }
  const dryRun = args.includes('--dry-run');
  const startedAt = new Date().toISOString(), started = performance.now();
  const identity = dryRun ? undefined : await executionIdentity();
  // Regression handlers run the same four real example commands as the gate.
  // Each tier executes once, in its own copy, alongside the real source instances.
  const execution = await verifyInstances({ plan: readReviewedPlan(), records: plan1Instances,
    runtime: dryRun ? { capabilities: new Set(), handlers: new Map() } : referenceRuntime,
    workRoot: resolve(repositoryRoot, 'examples/collection-review/.reference-work') });
  // This command reports supported execution; the explicit verification command
  // owns the matrix completion claim, with measured budgets reviewed separately.
  const report = { ...execution, planComplete: false };
  const observations = (id: string): readonly Observation[] => report.instances.find(item => item.id === id)?.observations ?? [];
  const baseline = observations('I1-01:baseline').find(item => item.kind === 'reference-baseline')?.data as AnalysisReport | undefined;
  const lines = ['Reference project: collection-review',
    `Run ${startedAt} on Node ${process.version}${dryRun ? ' (--dry-run: inventory only)' : ''}`, '',
    'Application/protocol/tools regression evidence:'];
  for (const variant of regressionVariants) {
    const instance = report.instances.find(item => item.id === `I1-30:reference-regression/${variant}`)!;
    lines.push(`  npm --prefix examples/collection-review run ${tierScripts[variant]}: ${instance.status} (${instance.durationMs} ms)`);
    for (const observation of instance.observations ?? []) {
      if (observation.kind === 'vitest') {
        const data = observation.data as { numPassedTests: number; numTotalTests: number };
        lines.push(`    Actual Vitest assertions: ${data.numPassedTests}/${data.numTotalTests} passed`);
      }
      if (observation.kind === 'cucumber') {
        const data = observation.data as Array<{ elements: Array<{ type: string }> }>;
        lines.push(`    Actual Cucumber scenarios: ${data.flatMap(feature => feature.elements).filter(item => item.type === 'scenario').length}`);
      }
      if (instance.status === 'failed' && observation.kind === 'regression-command') {
        const data = observation.data as { stdout: string; stderr: string };
        lines.push(data.stdout, data.stderr);
      }
    }
  }
  lines.push('', ...checkerSummary(baseline), '',
    `Family inventory: ${referenceCases.length}; matrix results establish only their named Plan 1 instances.`);
  for (const family of referenceCases) {
    const members = plan1Instances.filter(instance => instance.families.includes(family.id));
    const outcomes = report.instances.filter(instance => members.some(member => member.id === instance.id));
    lines.push(`  ${family.id} [${family.authority.join(',')}] ${family.intent}`,
      `    Plan 1 instances: ${outcomes.filter(item => item.status === 'passed').length}/${members.length} passed; ${outcomes.filter(item => item.status === 'failed').length} failed; ${outcomes.filter(item => item.status === 'not-executed').length} not executed`,
      `    Full family expectation (not claimed by a partial matrix slice): ${family.expected}`);
  }
  lines.push('', 'Plan 2 capability inventory (availability only; no Plan 2 instance executed by this command)');
  for (const capability of [...new Set(plan2Instances.flatMap(instance => instance.requiredCapabilities))].sort()) {
    const count = plan2Instances.filter(instance => instance.requiredCapabilities.includes(capability)).length;
    lines.push(`  ${capability}: ${plan2Runtime.capabilities.has(capability) ? 'available' : 'unavailable'}; ${count} instances not executed`);
  }
  lines.push('', 'Plan 1 instance execution (separate from family scope)', formatVerification(report));
  if (identity) {
    const after = await executionIdentity();
    if (identity.sourceSha256 !== after.sourceSha256 || identity.buildSha256 !== after.buildSha256) throw new Error('Source or build changed during report execution');
    const artifact = await persistGateReport(report, { identity, startedAt,
      command: ['npm', 'run', 'reference:report'], durationMs: Math.round(performance.now() - started) });
    lines.push(`Portable report: ${artifact.artifact}`);
  }
  console.log(lines.join('\n'));
  // This reports supported work; only reference:verify can claim plan completion.
  return report.inventoryIssues.length || !dryRun && !report.passed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }, (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
  });
}
