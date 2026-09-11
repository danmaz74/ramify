import { lifecycleProcessCases } from '../../src/tests/lifecycle-process-cases.js';

// Independent process-control feedback while resident providers are absent.
// Do not register this fixture smoke as a Plan 2 lifecycle capability.
const cases: { name: string; passed: boolean; durationMs: number; error?: string }[] = [];
for (const test of lifecycleProcessCases) {
  const started = performance.now();
  try {
    await test.run();
    cases.push({ name: test.name, passed: true, durationMs: performance.now() - started });
  } catch (error) {
    cases.push({ name: test.name, passed: false, durationMs: performance.now() - started,
      error: error instanceof AggregateError ? error.errors.map(cause => String(cause)).join('\n') : String(error) });
  }
}
console.log(JSON.stringify({ evidence: 'process-control-fixtures-only', platform: process.platform,
  node: process.version, at: new Date().toISOString(), cases }, null, 2));
if (cases.some(test => !test.passed)) process.exitCode = 1;
