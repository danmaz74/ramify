import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { plan2Instances } from './plan2-instances.js';
import { plan2Runtime } from './plan2-runtime.js';
import { plan1Instances } from './cases.js';
import { readReviewedPlan, readReviewedPlan2, repositoryRoot, validateInstancePointers } from './plan.js';
import { referenceRuntime } from './runtime.js';
import { verifyInstances } from './runner.js';
import type { VerificationReport } from './runner.js';
import { executionIdentity, persistGateReport } from './artifact.js';

export interface VerifyOptions {
  readonly planNumber?: 2;
  readonly iteration?: number;
  readonly preserveOnFailure: boolean;
  readonly format: 'human' | 'json';
}

export function parseVerifyArguments(args: readonly string[]): VerifyOptions {
  let plan: string | undefined;
  let iteration: number | undefined;
  let preserveOnFailure = false;
  let format: 'human' | 'json' = 'human';
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === '--preserve-on-failure') {
      preserveOnFailure = true;
      continue;
    }
    if (!['--plan', '--iteration', '--format'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--plan') plan = value;
    if (flag === '--iteration') {
      if (!/^(?:[1-9]|1[0-5])$/.test(value)) throw new Error('Iteration must be an integer from 1 to 15');
      iteration = Number(value);
    }
    if (flag === '--format') {
      if (value !== 'human' && value !== 'json') throw new Error('Format must be human or json');
      format = value;
    }
  }
  if (plan !== '1' && plan !== '2') throw new Error('Specify --plan 1 or --plan 2');
  if (plan === '2' && iteration === 15) throw new Error('Plan 2 iteration must be from 1 to 14');
  return { ...(plan === '2' ? { planNumber: 2 as const } : {}), ...(iteration === undefined ? {} : { iteration }), preserveOnFailure, format };
}

export function formatVerification(report: VerificationReport): string {
  const title = report.mode === 'iteration-verification'
    ? `Plan ${report.plan} iteration verification: ${report.iteration}` : `Plan ${report.plan} completion verification`;
  const lines = [title, `Result: ${report.passed ? 'passed' : 'failed'}`,
    `Plan complete: ${report.planComplete ? 'yes' : 'no'}`,
    `Required iterations: ${report.requiredIterations.join(', ')}`,
    `Available capabilities: ${report.availableCapabilities.join(', ') || 'none'}`,
    `Instances: ${report.instances.length}; required ${report.summary.required}; passed ${report.summary.passed}; failed ${report.summary.failed}; not executed ${report.summary.notExecuted}`,
    ...report.inventoryIssues.map((issue) => `Inventory error: ${issue}`), ''];
  for (const instance of report.instances) {
    lines.push(`${instance.id}  ${instance.status.replace('-', ' ')}${instance.reason ? ` (${instance.reason})` : ''}`);
    if (instance.missingCapabilities) lines.push(`  Missing capabilities: ${instance.missingCapabilities.join(', ')}`);
    if (instance.error) lines.push(`  ${instance.error}`);
    if (instance.preservedDirectory) lines.push(`  Preserved copy: ${instance.preservedDirectory}`);
  }
  return lines.join('\n');
}

async function main(): Promise<number> {
  let options: VerifyOptions;
  try {
    options = parseVerifyArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Usage: reference:verify -- --plan 1|2 [--iteration N] [--preserve-on-failure] [--format human|json]');
    return 2;
  }
  const records = options.planNumber === 2 ? plan2Instances : plan1Instances;
  const pointerIssues = validateInstancePointers(records);
  if (pointerIssues.length) throw new Error(pointerIssues.join('\n'));
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const identity = await executionIdentity();
  const report = await verifyInstances({
    ...options, plan: options.planNumber === 2 ? readReviewedPlan2() : readReviewedPlan(), records,
    runtime: options.planNumber === 2 ? plan2Runtime : referenceRuntime,
    workRoot: resolve(repositoryRoot, 'examples/collection-review/.reference-work'),
  });
  const after = await executionIdentity();
  if (identity.sourceSha256 !== after.sourceSha256 || identity.buildSha256 !== after.buildSha256) {
    throw new Error('Source or compiled build changed during verification; rerun on coherent inputs');
  }
  const artifact = await persistGateReport(report, { identity, startedAt,
    command: ['npm', 'run', 'reference:verify', '--', ...process.argv.slice(2)], durationMs: Math.round(performance.now() - started) });
  console.log(options.format === 'json' ? JSON.stringify(artifact) : `${formatVerification(artifact)}\nPortable report: ${artifact.artifact}`);
  return report.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }, (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
