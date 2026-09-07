import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { capabilityDescriptions, capabilityOrder, referenceCases } from './cases.js';
import type { ReferenceCase } from './cases.js';

/**
 * The reference report.
 *
 * It runs the example's application tier as child processes and prints what
 * this stage of the project has actually established, next to everything it
 * has not. The separation is the point: a passing application and protocol
 * tier is not a Ramify conformance result, and a family whose capability does
 * not exist is reported as **not executed**, never as passed and never as a
 * skip that quietly leaves the summary.
 *
 *     npm run reference:report
 *     npm run reference:report -- --dry-run   # inventory only, no tiers
 */

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const examplePrefix = 'examples/collection-review';

type ExecutionStatus = 'passed' | 'failed' | 'not executed';

/** The example's own scripts, in the order the application tier runs them. */
const tierScripts = ['type-check', 'test', 'build'] as const;
type TierScript = (typeof tierScripts)[number];

interface TierRun {
  readonly script: TierScript;
  readonly status: ExecutionStatus;
  readonly output: string;
}

function runTier(script: TierScript): TierRun {
  const result = spawnSync('npm', ['--prefix', examplePrefix, 'run', script], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  if (result.error) {
    return { script, status: 'failed', output: `${output}\n${result.error.message}` };
  }

  return { script, status: result.status === 0 ? 'passed' : 'failed', output };
}

/**
 * What a case's own execution status is in this run.
 *
 * Protocol assertions live in the example's test suite and in its type-check,
 * where the compiler negatives are; application-tier assertions need the build
 * as well. Everything else is not executed, because nothing can execute it.
 */
function executionOf(record: ReferenceCase, tiers: readonly TierRun[]): ExecutionStatus {
  if (record.implementation !== 'available' || tiers.length === 0) {
    return 'not executed';
  }

  const needed: readonly TierScript[] =
    record.capability === 'protocol' ? ['type-check', 'test'] : tierScripts;
  const relevant = tiers.filter((tier) => needed.includes(tier.script));

  if (relevant.length !== needed.length) {
    return 'not executed';
  }

  return relevant.every((tier) => tier.status === 'passed') ? 'passed' : 'failed';
}

function countBy<Key extends string>(
  records: readonly ReferenceCase[],
  key: (record: ReferenceCase) => Key,
): Map<Key, number> {
  const counts = new Map<Key, number>();

  for (const record of records) {
    counts.set(key(record), (counts.get(key(record)) ?? 0) + 1);
  }

  return counts;
}

function summarize(runs: readonly TierRun[]): ExecutionStatus {
  if (runs.length === 0) {
    return 'not executed';
  }

  return runs.every((run) => run.status === 'passed') ? 'passed' : 'failed';
}

function main(): number {
  const dryRun = process.argv.slice(2).includes('--dry-run');
  const tiers = dryRun ? [] : tierScripts.map(runTier);

  const application = summarize(tiers);
  const protocolTier = tiers.filter((tier) => tier.script !== 'build');
  const protocol = summarize(protocolTier);

  const lines: string[] = [];

  lines.push('Reference project: collection-review');
  lines.push(
    `Run ${new Date().toISOString()} on Node ${process.version}${dryRun ? ' (--dry-run: no tier executed)' : ''}`,
  );
  lines.push('');

  lines.push(`Application/tools: ${application}`);
  for (const tier of tiers) {
    lines.push(`  npm --prefix ${examplePrefix} run ${tier.script.padEnd(10)} ${tier.status}`);
  }
  if (dryRun) {
    lines.push('  type-check, test and build were not run');
  }

  lines.push(`Supported architectural assertions: ${protocol}`);
  lines.push(
    '  D01 exact tRPC composition and typing, D02 two feature-owned MCP tools behind one',
  );
  lines.push(
    '  surface, D03 per-request session re-resolution. They are part of the example’s own',
  );
  lines.push(
    '  suite: the runtime halves in `npm test`, the compiler negatives in `npm run type-check`,',
  );
  lines.push('  where an unused `@ts-expect-error` is itself an error.');

  lines.push('Known import violations: 0');
  lines.push(
    '  Hand-checked against the plan’s description review checklist, one owner at a time.',
  );
  lines.push('  No checker produced this number.');

  lines.push('Source coverage: none — no source checker ran');
  lines.push(
    '  Nothing has resolved an import specifier to an original, so no construct in the example',
  );
  lines.push('  is reported as allowed, external or covered.');
  lines.push('');

  const byStatus = countBy(referenceCases, (record) => record.implementation);
  lines.push(
    `Case inventory: ${referenceCases.length} families — available ${byStatus.get('available') ?? 0}, absent ${byStatus.get('absent') ?? 0}, deliberately unsupported ${byStatus.get('deliberately-unsupported') ?? 0}`,
  );
  lines.push('');

  for (const capability of capabilityOrder) {
    const group = referenceCases.filter((record) => record.capability === capability);

    lines.push(`${capability} — ${capabilityDescriptions[capability]} (${group.length})`);

    if (group.length === 0) {
      lines.push('  no case family rests on this tier alone');
      lines.push('');
      continue;
    }

    for (const record of group) {
      const execution = executionOf(record, tiers);
      const shape = `${record.mode.join('+')}/${record.authority.join('+')}`;

      lines.push(
        `  ${record.id}  ${execution.padEnd(12)} ${record.implementation.padEnd(24)} ${shape.padEnd(9)} ${record.intent}`,
      );
    }

    lines.push('');
  }

  const notImplemented = capabilityOrder.filter((capability) =>
    referenceCases.some(
      (record) => record.capability === capability && record.implementation === 'absent',
    ),
  );

  lines.push(`Target capabilities not yet implemented: ${notImplemented.length}`);
  for (const capability of notImplemented) {
    const group = referenceCases.filter(
      (record) => record.capability === capability && record.implementation === 'absent',
    );

    lines.push(
      `  ${capability.padEnd(24)} ${group.length} ${group.length === 1 ? 'family' : 'families'}: ${group.map((record) => record.id).join(', ')}`,
    );
  }
  lines.push('');

  const probes = referenceCases.filter((record) => record.capability === 'probe');

  lines.push(`Design probes awaiting decisions: ${probes.length}`);
  for (const probe of probes) {
    lines.push(`  ${probe.id}  ${probe.intent}`);
  }

  const unsupported = referenceCases.filter(
    (record) => record.implementation === 'deliberately-unsupported',
  );

  if (unsupported.length > 0) {
    lines.push('');
    lines.push(`Separate responsibilities, deliberately unsupported: ${unsupported.length}`);
    for (const record of unsupported) {
      lines.push(`  ${record.id}  ${record.intent}`);
    }
  }

  console.log(lines.join('\n'));

  const failed = tiers.filter((tier) => tier.status === 'failed');

  if (failed.length > 0) {
    for (const tier of failed) {
      console.error(`\n--- ${tier.script} failed ---\n${tier.output.trimEnd()}`);
    }

    return 1;
  }

  return 0;
}

process.exitCode = main();
