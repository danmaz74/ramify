import { lifecycleFixtureCases } from './lifecycle-fixture-cases.js';

// The same fixture assertions as the Vitest wrapper; no resident matrix credit.
const cases: { name: string; passed: boolean; error?: string }[] = [];
for (const test of lifecycleFixtureCases) {
  try { await test.run(); cases.push({ name: test.name, passed: true }); }
  catch (error) { cases.push({ name: test.name, passed: false, error: String(error) }); }
}
console.log(JSON.stringify({ evidence: 'nine-project-fixture-qualification-only', platform: process.platform,
  node: process.version, at: new Date().toISOString(), cases }, null, 2));
if (cases.some(test => !test.passed)) process.exitCode = 1;
