import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { command } from './processes.js';
import { recordObservation } from './observations.js';
import { filesBelow } from './reference-baseline.js';
import type { Assertions } from './runner.js';

export const regressionVariants = ['type-check', 'vitest', 'build', 'cucumber'] as const;
export type RegressionVariant = (typeof regressionVariants)[number];
export const tierScripts = { 'type-check': 'type-check', vitest: 'test', build: 'build', cucumber: 'test:cucumber' } as const;

export async function runTier(root: string, variant: RegressionVariant, assertions: Assertions): Promise<void> {
  await mkdir(join(root, '.reference-work'), { recursive: true });
  const scratch = await mkdtemp(join(root, '.reference-work/tier-'));
  try {
    const output = join(scratch, 'result.json');
    const extra = variant === 'vitest' ? ['--', '--reporter=json', '--outputFile', output]
      : variant === 'cucumber' ? ['--', '--format', `json:${relative(root, output)}`] : [];
    const result = await command(root, 'npm', ['run', tierScripts[variant], ...extra]);
    recordObservation('regression-command', { variant, ...result });
    assertions.equal(`${variant}: actual process completes successfully`, [result.code, result.signal, result.error], [0, null, null]);
    if (variant === 'vitest') {
      const report = JSON.parse(await readFile(output, 'utf8'));
      recordObservation('vitest', report);
      assertions.ok('real nonempty Vitest assertions passed', report.success && report.numTotalTests > 0 && report.numPassedTests === report.numTotalTests);
      assertions.equal('no skipped failed or pending tests', [report.numFailedTests, report.numPendingTests, report.numTodoTests], [0, 0, 0]);
      for (const file of report.testResults) {
        assertions.ok(`${file.name}: assertions actually ran`, file.assertionResults.length > 0 && file.assertionResults.every((item: { status: string }) => item.status === 'passed'));
      }
    } else if (variant === 'cucumber') {
      const report = JSON.parse(await readFile(output, 'utf8')) as Array<{ uri: string; elements: Array<{ type: string; name: string; steps: Array<{ result: { status: string } }> }> }>;
      recordObservation('cucumber', report);
      assertions.equal('standalone testing owner scenario discovered', report.map(feature => feature.uri), ['subs/integration-tests/src/features/collection-review.viz.feature']);
      const scenarios = report.flatMap(feature => feature.elements).filter(element => element.type === 'scenario');
      assertions.equal('one actual Cucumber scenario', scenarios.length, 1);
      assertions.ok('all registered steps and hooks ran', scenarios[0].steps.length > 0 && scenarios[0].steps.every(step => step.result.status === 'passed'));
    } else if (variant === 'build') {
      const files = await filesBelow(join(root, 'dist'));
      recordObservation('vite-artifacts', files);
      assertions.ok('actual HTML JS and CSS artifacts emitted', files.includes('index.html') && files.some(file => file.endsWith('.js')) && files.some(file => file.endsWith('.css')));
    }
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
