import assert from 'node:assert/strict';
import { writeJsonSync } from './json-stream.mjs';
import { fastWorkloads } from './fast-plan.mjs';
import { executeFastWorkload } from './fast-workloads.mjs';
import { assertFastWorkload } from './fast-assertions.mjs';
import { controls } from './resident-driver.mjs';

const [id, scratch, templates, executable, output] = process.argv.slice(2);
assert.ok(fastWorkloads.some(row => row.id === id) && scratch && templates && executable && output, 'Invalid fast worker arguments');
const report = { id, startedAt: new Date().toISOString(), status: 'running', passed: false,
  measurements: {}, assertions: [], failures: [], interrupted: false };
const persist = () => writeJsonSync(output, report, { indent: 0 });
const checkpoint = (phase, cycle, count) => {
  if (report.interrupted) throw new Error('Fast measurement interrupted');
  if (!cycle || cycle % 5 === 0 || cycle === count) {
    persist(); process.stderr.write(JSON.stringify({ id, phase, cycle, count }) + '\n');
  }
};
const interrupt = () => { report.interrupted = true; void Promise.allSettled([...controls].map(host => host.close())); };
process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
try {
  persist(); await executeFastWorkload(id, { scratch, templates, executable }, report.measurements, checkpoint);
  report.status = 'measured';
} catch (error) { report.failures.push(error.stack ?? String(error)); report.status = 'failed'; }
finally {
  for (const result of await Promise.allSettled([...controls].map(host => host.close()))) {
    if (result.status === 'rejected') report.failures.push(String(result.reason));
  }
  report.assertions = assertFastWorkload(id, report.measurements);
  report.passed = report.status === 'measured' && !report.interrupted && !report.failures.length && report.assertions.every(row => row.passed);
  report.completedAt = new Date().toISOString(); persist();
  process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
}
process.stdout.write(JSON.stringify({ id, passed: report.passed, status: report.status,
  failures: report.failures, failedAssertions: report.assertions.filter(row => !row.passed).map(row => row.name) }) + '\n');
process.exitCode = report.passed ? 0 : 1;
