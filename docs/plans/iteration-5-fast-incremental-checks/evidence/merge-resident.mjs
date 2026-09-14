// Merge per-workload resident measurement reports of one build into a single
// ramify.resident-measurements/1 report, so one Plan 2 gate run can read them
// all. Every executed workload row, measured or failed, is copied verbatim from
// the run that produced it; a workload no run executed keeps its not-executed
// placeholder. Nothing else is derived: the evidence verifier recomputes each
// predicate from the raw samples inside the copied rows.
//
//   node docs/plans/iteration-5-fast-incremental-checks/evidence/merge-resident.mjs \
//     OUT.json REPORT.json...
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [out, ...sources] = process.argv.slice(2);
assert.ok(out && sources.length, 'Usage: merge-resident.mjs OUT IN...');
const reports = sources.map(path => {
  const bytes = readFileSync(path);
  return { path, sha256: createHash('sha256').update(bytes).digest('hex'), report: JSON.parse(bytes.toString('utf8')) };
});
const base = structuredClone(reports[0].report);
for (const { path, report } of reports) {
  for (const key of ['schemaVersion', 'evidenceKind', 'inputs', 'dependencies', 'budgets', 'sampling', 'fixtures', 'client', 'prerequisites']) {
    assert.ok(JSON.stringify(report[key]) === JSON.stringify(base[key]), `${key} differs in ${path}`);
  }
  // The environment snapshot lists every host process at its own start, so only
  // the fields the evidence verifier checks have to agree.
  for (const key of ['node', 'platform', 'arch', 'cpuModel', 'logicalCpus', 'concurrentActivity']) {
    assert.ok(JSON.stringify(report.environment[key]) === JSON.stringify(base.environment[key]), `environment.${key} differs in ${path}`);
  }
  assert.equal(report.interrupted, false, `${path} was interrupted`);
  assert.deepEqual(report.failures, [], `${path} carries a parent failure`);
  assert.deepEqual(report.workloads.map(row => row.id), base.workloads.map(row => row.id));
}
const provenance = [];
base.workloads = base.workloads.map((row, index) => {
  const executed = reports.filter(item => item.report.workloads[index].status !== 'not-executed');
  if (!executed.length) return row;
  assert.equal(executed.length, 1, `${row.id} was run more than once`);
  provenance.push({ id: row.id, source: executed[0].path, sha256: executed[0].sha256,
    status: executed[0].report.workloads[index].status });
  return executed[0].report.workloads[index];
});
base.measuredAt = reports.map(item => item.report.measuredAt).sort()[0];
base.completedAt = reports.map(item => item.report.completedAt).sort().at(-1);
base.passed = base.workloads.every(row => row.passed);
base.status = base.passed ? 'passed' : base.workloads.some(row => row.status === 'not-executed') ? 'incomplete' : 'failed';
base.composition = { kind: 'per-workload-merge', createdAt: new Date().toISOString(), provenance,
  note: 'Each measured workload row is copied verbatim from its own npm run measure:resident -- --workload run on the same build, inputs, dependencies and fixtures; unmeasured rows keep their not-executed placeholder.' };
writeFileSync(out, JSON.stringify(base));
process.stdout.write(JSON.stringify({ out, executed: provenance.map(item => `${item.id} (${item.status})`),
  notExecuted: base.workloads.filter(row => row.status !== 'measured').map(row => row.id), status: base.status }, null, 1) + '\n');
