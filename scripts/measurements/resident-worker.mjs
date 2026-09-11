import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { executeResidentWorkload } from './resident-workloads.mjs';
import { assertResidentWorkload } from './resident-assertions.mjs';
import { controls } from './resident-driver.mjs';
import { residentWorkloads } from './resident-plan.mjs';
import { failureText } from './resident-failure.mjs';

const [suffix, scratch, templates, executable, output] = process.argv.slice(2);
const definition = residentWorkloads.find(workload => workload.id === `I2-29:${suffix}`);
assert.ok(definition && scratch && templates && executable && output, 'Invalid workload worker arguments');
const report = { ...definition, status: 'running', passed: false, startedAt: new Date().toISOString(),
  measurements: {}, assertions: [], failures: [], interrupted: false };
const persist = () => writeFileSync(output, JSON.stringify(report) + '\n');
const checkpoint = (phase, cycle, count) => {
  if (report.interrupted) throw new Error('Resident measurement interrupted');
  if (!cycle || cycle % 5 === 0 || cycle === count) {
    persist();
    if (phase) process.stderr.write(JSON.stringify({ workload: definition.id, phase, cycle, count }) + '\n');
  }
};
const interrupt = () => {
  report.interrupted = true;
  void Promise.allSettled([...controls].map(host => host.close()));
};
process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
try {
  persist();
  await executeResidentWorkload(suffix, { scratch, templates, executable }, report.measurements, checkpoint);
  report.status = 'measured';
} catch (error) { report.status = 'failed'; report.failures.push(failureText(error)); }
finally {
  const closed = await Promise.allSettled([...controls].map(host => host.close()));
  for (const value of closed) if (value.status === 'rejected') report.failures.push(failureText(value.reason));
  report.assertions = assertResidentWorkload(report.id, report.measurements);
  report.passed = !report.interrupted && report.status === 'measured' && !report.failures.length && report.assertions.every(assertion => assertion.passed);
  report.completedAt = new Date().toISOString(); persist();
  process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
}
process.stdout.write(JSON.stringify({ id: report.id, status: report.status, passed: report.passed,
  failedAssertions: report.assertions.filter(assertion => !assertion.passed).map(assertion => assertion.name), failures: report.failures }) + '\n');
process.exitCode = report.passed ? 0 : 1;
